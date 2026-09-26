'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
  useReactFlow,
  useViewport,
  Connection,
  ReactFlowProvider,
} from 'reactflow';
// @ts-ignore
import 'reactflow/dist/style.css';
import { useArchitectureStore } from '../../store/architectureStore';
import { ReactFlowAdapter } from '../../lib/reactFlowAdapter';
import { ContextOrchestrator } from '../../lib/contextOrchestrator';
import { EntityNode } from './EntityNode';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';
import { EditorPanel } from '../editor/EditorPanel';
import { Toolbar, SchemaExplorer } from './Toolbar';
import { RelationEdge } from './RelationEdge';
import { ChatConsole } from './ChatConsole';
import type { CustomSqlSnippet } from '@zero-dollar/ir-core';

const nodeTypes = { entityNode: EntityNode };
const edgeTypes = { relationEdge: RelationEdge };

function highlightSQLToJSX(code: string) {
  const lines = code.split('\n');
  const keywords =
    /\b(CREATE OR REPLACE|CREATE|FUNCTION|PROCEDURE|TRIGGER|RETURNS|LANGUAGE|AS|BEGIN|END|RETURN|NEW|OLD|FOR EACH ROW|AFTER|BEFORE|INSERT|UPDATE|DELETE|ON|EXECUTE FUNCTION|SELECT|FROM|WHERE|INTO|VALUES)\b/g;

  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) {
      return (
        <div key={lineIdx} className="text-[#565766] italic">
          {line}
        </div>
      );
    }

    const parts = line.split(keywords);
    return (
      <div key={lineIdx}>
        {parts.map((part, i) =>
          keywords.test(part) ? (
            <span key={i} className="text-[#8b7ff0] font-semibold">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </div>
    );
  });
}

function ZoomHud() {
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();

  return (
    <div className="absolute bottom-5 right-5 z-25 flex items-center bg-[#14161d] border border-white/[0.09] rounded-full p-1 gap-0.5 shadow-xl">
      <button
        type="button"
        onClick={() => zoomOut({ duration: 200 })}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee] cursor-pointer"
      >
        −
      </button>
      <span className="font-mono text-[11px] text-[#8a8b9a] w-[42px] text-center select-none">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => zoomIn({ duration: 200 })}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee] cursor-pointer"
      >
        +
      </button>
    </div>
  );
}

function CanvasInner() {
  const router = useRouter();
  const {
    present: currentIR,
    nodes,
    onNodesChange,
    applyAIPatch,
    undo,
    redo,
    compileArchitecture,
    isCompiling,
    dispatchManualAction,
    addChatMessage,
    chatHistory,
    compiledFiles,
    syncStatus,
    exportedRepoUrl,
    setExportedRepoUrl,
    projectName,
    isCopilotOpen,
    setIsCopilotOpen,
    closeInspector,
    activeRoutineId,
    setActiveRoutineId,
    canvasMode,
    setCanvasMode,
    notes,
    updateNote,
    deleteNote,
    toastMessage,
    showToast,
  } = useArchitectureStore();

  const { fitView, setCenter, getNode } = useReactFlow();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedRoutineId, setCopiedRoutineId] = useState<string | null>(null);

  // GitHub Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  // SQL Assistant Modal State
  const [sqlModal, setSqlModal] = useState<{
    isOpen: boolean;
    entityName: string;
    routineType: CustomSqlSnippet['type'];
  } | null>(null);
  const [sqlPrompt, setSqlPrompt] = useState('');
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);

  useEffect(() => {
    const handleOpenSql = (e: any) => {
      const defaultEntity = e.detail?.entityName || currentIR.entities[0]?.name || '';
      const defaultType = e.detail?.defaultType || 'TRIGGER';
      setSqlModal({
        isOpen: true,
        entityName: defaultEntity,
        routineType: defaultType,
      });
    };
    window.addEventListener('open-sql-assistant', handleOpenSql);
    return () => window.removeEventListener('open-sql-assistant', handleOpenSql);
  }, [currentIR.entities]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'SELECT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'v') {
        setCanvasMode('select');
      } else if (e.key === 'h') {
        setCanvasMode('pan');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setCanvasMode]);

  const edges = useMemo(() => ReactFlowAdapter.generateEdges(currentIR), [currentIR]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (
        connection.source === connection.target &&
        connection.sourceHandle === connection.targetHandle
      ) {
        return false;
      }
      return !edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle &&
          e.targetHandle === connection.targetHandle
      );
    },
    [edges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceField = params.sourceHandle?.replace('source-', '');
      const targetField = params.targetHandle?.replace('target-', '');

      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      const sourceFieldData = sourceNode?.data.entity.fields.find(
        (f: any) => f.name === sourceField
      );
      const targetFieldData = targetNode?.data.entity.fields.find(
        (f: any) => f.name === targetField
      );

      if (
        sourceFieldData &&
        targetFieldData &&
        sourceFieldData.type !== targetFieldData.type
      ) {
        dispatchManualAction({
          action: 'UPDATE_FIELD',
          targetEntity: params.target,
          targetField: targetField!,
          payload: { type: sourceFieldData.type },
        });
      }

      dispatchManualAction({
        action: 'ADD_RELATION',
        payload: {
          sourceEntity: params.source,
          targetEntity: params.target,
          sourceField,
          targetField,
          type: 'ONE_TO_MANY',
        },
      });
      showToast('Relationship connected');
    },
    [nodes, dispatchManualAction, showToast]
  );

  const handleAddTable = () => {
    let idx = currentIR.entities.length + 1;
    let tableName = `table_${idx}`;
    while (currentIR.entities.some((e) => e.name === tableName)) {
      idx++;
      tableName = `table_${idx}`;
    }

    dispatchManualAction({
      action: 'ADD_ENTITY',
      payload: {
        name: tableName,
        fields: [
          { name: 'id', type: 'uuid', nullable: false, unique: true, isPrimaryKey: true },
          { name: 'created_at', type: 'datetime', nullable: false, unique: false },
        ],
      },
    });
    showToast('New table added — describe its fields to Copilot to fill it in');
  };

  const handleToggleCode = async () => {
    const nextState = !isCodeOpen;
    setIsCodeOpen(nextState);
    if (nextState) {
      setIsCopilotOpen(false);
      closeInspector();
      compileArchitecture();
    }
  };

  const handleToggleCopilot = () => {
    const nextState = !isCopilotOpen;
    setIsCopilotOpen(nextState);
    if (nextState) {
      setIsCodeOpen(false);
    }
  };

  const handleCopyRoutineSql = async (routine: CustomSqlSnippet) => {
    try {
      await navigator.clipboard.writeText(routine.sql);
      setCopiedRoutineId(routine.id);
      showToast('SQL copied to clipboard');
      setTimeout(() => {
        setCopiedRoutineId((prev) => (prev === routine.id ? null : prev));
      }, 2000);
    } catch {
      showToast('Failed to copy SQL');
    }
  };

  const handleAISubmit = useCallback(
    async (promptText: string) => {
      if (!promptText.trim() || isGenerating) return;

      setIsGenerating(true);
      addChatMessage({ role: 'user', content: promptText });

      try {
        const selectedNode = nodes.find((n) => n.selected);
        const contextMap = ContextOrchestrator.buildAIPayload(
          currentIR,
          promptText,
          selectedNode?.id
        );

        const response = await fetch('/api/v1/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer development-token',
          },
          body: JSON.stringify({
            prompt: promptText,
            contextMap,
            isVisionTask: false,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Gateway Error: ${response.statusText}`);
        }

        addChatMessage({ role: 'ai', content: data.reasoning });
        const newIR = ShadowGraph.simulateAndValidate(currentIR, data.actions);
        applyAIPatch(newIR);

        setTimeout(() => fitView({ padding: 0.2, duration: 600 }), 100);
      } catch (err: any) {
        console.error('[Architect Error]:', err);
        let safeMessage =
          'I encountered an internal conflict while processing that architecture. Could you try rephrasing?';

        if (err.message.includes('Failed to generate a valid architecture')) {
          safeMessage =
            "I had trouble mapping that exact request to the strict database schema. Let's try adding those entities one at a time.";
        } else if (
          err.message.includes('fetch') ||
          err.message.includes('Network') ||
          err.message.includes('429')
        ) {
          safeMessage =
            'The AI Gateway is experiencing heavy load. Please wait a moment and try again.';
        }

        addChatMessage({ role: 'warn', content: safeMessage });
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, nodes, currentIR, applyAIPatch, addChatMessage, fitView]
  );

  const handleGenerateSql = async () => {
    if (!sqlPrompt.trim() || !sqlModal) return;
    setIsGeneratingSql(true);

    try {
      const targetEntity = currentIR.entities.find((e) => e.name === sqlModal.entityName);

      const response = await fetch('/api/v1/ai/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer development-token',
        },
        body: JSON.stringify({
          prompt: `[${sqlModal.routineType}] ${sqlPrompt}`,
          targetEntitySchema: targetEntity,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate SQL');

      const prefix =
        sqlModal.routineType === 'TRIGGER'
          ? 'trg'
          : sqlModal.routineType === 'STORED_PROCEDURE'
          ? 'sp'
          : 'fn';
      const baseSlug = (sqlModal.entityName || 'schema').toLowerCase();
      const newId = crypto.randomUUID();

      dispatchManualAction({
        action: 'ADD_CUSTOM_SQL',
        payload: {
          id: newId,
          name: `${prefix}_${baseSlug}_${(currentIR.customSql?.length || 0) + 1}`,
          targetEntity: sqlModal.entityName || undefined,
          type: sqlModal.routineType,
          sql: data.sql,
          prompt: sqlPrompt,
        },
      });

      addChatMessage({
        role: 'ai',
        content: `Generated ${sqlModal.routineType.toLowerCase()} on ${
          sqlModal.entityName || 'database'
        }.`,
      });
      setSqlModal(null);
      setSqlPrompt('');
      setActiveRoutineId(newId);
      showToast('SQL routine generated');
    } catch (err: any) {
      console.error('SQL Generation Failed:', err);
      showToast(`Failed to generate SQL: ${err.message}`);
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleGitHubExportClick = async () => {
    if (!compiledFiles || Object.keys(compiledFiles).length === 0) {
      await compileArchitecture();
    }

    if (exportedRepoUrl) {
      const urlParts = exportedRepoUrl.split('/');
      setRepoName(urlParts[urlParts.length - 1]);
      const recentPrompt = chatHistory.filter((m) => m.role === 'user').pop()?.content || '';
      if (recentPrompt) setCommitMessage(`feat: ${recentPrompt.slice(0, 50)}`);
    } else {
      const slugifiedName = (projectName || 'acme-commerce')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setRepoName(`${slugifiedName}-api`);
    }

    setIsExportModalOpen(true);
  };

  const handleGitHubExportConfirm = async () => {
    if (!repoName || !githubToken) return;
    setIsExportModalOpen(false);
    setIsExporting(true);

    try {
      const latestFiles = useArchitectureStore.getState().compiledFiles;
      const response = await fetch('/api/v1/export/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName,
          files: latestFiles,
          token: githubToken,
          commitMessage:
            commitMessage ||
            (exportedRepoUrl
              ? 'feat: update architecture schema'
              : 'feat: initial architecture generation'),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Export failed');

      setExportedRepoUrl(data.url);
      showToast(
        `Exported ${currentIR.entities.length} tables to ${data.url.replace('https://', '')}`
      );
      window.open(data.url, '_blank');
    } catch (error: any) {
      showToast(`Export Error: ${error.message}`);
    } finally {
      setIsExporting(false);
      setGithubToken('');
      setCommitMessage('');
    }
  };

  const activeRoutine = activeRoutineId
    ? currentIR.customSql?.find((r) => r.id === activeRoutineId) || null
    : null;

  const modalExistingRoutines = sqlModal
    ? (currentIR.customSql || []).filter((r) => r.targetEntity === sqlModal.entityName)
    : [];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0c10] text-[#e8e8ee] overflow-hidden select-none">
      {/* ================= TOPBAR ================= */}
      <header className="relative z-40 h-[52px] flex items-center px-3.5 gap-4 bg-[#14161d] border-b border-white/[0.09] shrink-0">
        <div
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 font-semibold text-[15px] tracking-[0.2px] cursor-pointer"
        >
          <span className="w-5 h-5 flex-none">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              <path d="M4 12 L12 4 L20 12 L12 20 Z" stroke="#e08a3c" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.3" fill="#e08a3c" />
            </svg>
          </span>
          Nexus
        </div>

        {/* Breadcrumbs & Live Cloud Sync Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 text-[12.5px] text-[#8a8b9a] font-mono">
          <span
            onClick={() => router.push('/dashboard')}
            className="hover:text-[#e8e8ee] cursor-pointer transition-colors"
          >
            Workspaces
          </span>
          <span className="text-[#565766]">/</span>
          <span className="text-[#e8e8ee]">{projectName}</span>
          <span className="text-[#565766]">/</span>
          <span>schema.graph</span>
          <span className="text-[#565766]">/</span>

          {syncStatus === 'synced' && (
            <span className="text-[#8fbf6b] flex items-center gap-[5px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8fbf6b] shadow-[0_0_0_3px_rgba(143,191,107,0.15)]" />
              synced
            </span>
          )}
          {syncStatus === 'syncing' && (
            <span className="text-[#e08a3c] flex items-center gap-[5px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e08a3c] animate-pulse" />
              saving…
            </span>
          )}
          {syncStatus === 'error' && (
            <span className="text-[#e0708f] flex items-center gap-[5px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e0708f]" />
              sync error
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* <> Code Overlay Toggle Button */}
        <button
          type="button"
          onClick={handleToggleCode}
          className={`px-[13px] py-[7px] rounded-[7px] border text-[13px] flex items-center gap-[7px] transition-all cursor-pointer ${
            isCodeOpen
              ? 'border-white/[0.28] bg-white/[0.09] text-[#e8e8ee]'
              : 'border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] hover:border-white/[0.22]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="w-3.5 h-3.5 scale-130"
          >
            <path d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
          </svg>
          Code
        </button>

        {/* Copilot Overlay Toggle Button */}
        <button
          type="button"
          onClick={handleToggleCopilot}
          className={`px-[13px] py-[7px] rounded-[7px] border text-[13px] flex items-center gap-[7px] transition-all cursor-pointer ${
            isCopilotOpen
              ? 'border-[#8b7ff0]/50 bg-[#8b7ff0]/15 text-[#e8e8ee]'
              : 'border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] hover:border-white/[0.22]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="w-3.5 h-3.5"
          >
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
          Copilot
        </button>

        {/* Export to GitHub Primary Button */}
        <button
          type="button"
          onClick={handleGitHubExportClick}
          disabled={isExporting || isCompiling}
          className="px-[13px] py-[7px] rounded-[7px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 disabled:opacity-50 flex items-center gap-[7px] transition-all cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.68-4.58 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
          {isExporting
            ? 'Pushing…'
            : exportedRepoUrl
            ? 'Commit to GitHub'
            : 'Export to GitHub'}
        </button>
      </header>

      {/* ================= STUDIO BODY ================= */}
      <div className="relative flex-1 flex overflow-hidden w-full">
        {/* Left Collapsible Schema Explorer */}
        <SchemaExplorer />

        {/* Center Canvas / SQL Routine Code View (All Right Panels Overlay Here) */}
        <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#0b0c10]">
          {!activeRoutine ? (
            <>
              {/* 12-Button Floating Left Rail & Search Overlay */}
              <Toolbar />

              {/* React Flow Graph */}
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onPaneClick={() => closeInspector()}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                panOnDrag={canvasMode === 'pan' ? true : [1, 2]}
                nodesDraggable={canvasMode === 'select'}
                elementsSelectable={canvasMode === 'select'}
                fitView
                proOptions={{ hideAttribution: true }}
                minZoom={0.35}
                maxZoom={1.8}
                className="bg-[#0b0c10]"
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={26}
                  size={1.4}
                  color="rgba(255, 255, 255, 0.09)"
                />
              </ReactFlow>

              {/* Draggable Sticky Notes Layer */}
              {notes.map((note) => (
                <div
                  key={note.id}
                  style={{ left: note.x, top: note.y }}
                  className="group/note absolute w-[180px] min-h-[104px] bg-[#e0d199] text-[#3a3320] rounded-lg shadow-[0_14px_28px_-14px_rgba(0,0,0,0.5)] text-[12.5px] leading-[1.45] z-20"
                >
                  <div
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      e.stopPropagation();
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const origX = note.x;
                      const origY = note.y;
                      const move = (ev: PointerEvent) => {
                        updateNote(note.id, {
                          x: origX + (ev.clientX - startX),
                          y: origY + (ev.clientY - startY),
                        });
                      };
                      const up = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                      };
                      window.addEventListener('pointermove', move);
                      window.addEventListener('pointerup', up);
                    }}
                    className="h-[18px] cursor-grab active:cursor-grabbing flex items-center relative"
                  >
                    <span className="flex-1 flex items-center justify-center gap-[3px]">
                      <span className="w-[3px] h-[3px] rounded-full bg-[#3a3320]/40" />
                      <span className="w-[3px] h-[3px] rounded-full bg-[#3a3320]/40" />
                      <span className="w-[3px] h-[3px] rounded-full bg-[#3a3320]/40" />
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteNote(note.id)}
                      className="absolute right-1.5 top-[1px] w-4 h-4 rounded-[5px] text-[#3a3320] opacity-0 group-hover/note:opacity-60 hover:!opacity-100 hover:bg-[#3a3320]/12 flex items-center justify-center transition-opacity cursor-pointer"
                      title="Delete note"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-[11px] h-[11px]"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    onBlur={(e) =>
                      updateNote(note.id, { text: e.currentTarget.textContent || '' })
                    }
                    className="px-3 pb-3 outline-none break-words select-text"
                  >
                    {note.text}
                  </div>
                </div>
              ))}

              {/* Bottom-Center "+ Add table" Pill */}
              <button
                type="button"
                onClick={handleAddTable}
                className="absolute bottom-5 left-1/2 -translate-x-1/2 z-25 flex items-center gap-2 pl-3.5 pr-4 py-[9px] rounded-full bg-[#14161d] border border-white/[0.09] hover:border-[#e08a3c]/40 shadow-[0_10px_26px_-10px_rgba(0,0,0,0.6)] text-[13px] transition-colors cursor-pointer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#e08a3c"
                  strokeWidth="1.8"
                  className="w-[15px] h-[15px]"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add table
              </button>

              {/* Bottom-Right Zoom HUD */}
              <ZoomHud />
            </>
          ) : (
            /* ================= SQL ROUTINE CODE VIEW ================= */
            <div className="absolute inset-0 z-28 flex flex-col bg-[#0b0c10] px-[30px] py-[22px]">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveRoutineId(null)}
                  className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[13px] flex items-center gap-2 cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Schema Visualizer
                </button>

                <span
                  className={`text-[10px] font-mono px-[9px] py-[3px] rounded-full uppercase tracking-[0.4px] ${
                    activeRoutine.type === 'TRIGGER'
                      ? 'text-[#8b7ff0] bg-[#8b7ff0]/14'
                      : activeRoutine.type === 'STORED_PROCEDURE'
                      ? 'text-[#e08a3c] bg-[#e08a3c]/14'
                      : 'text-[#3fc6d8] bg-[#3fc6d8]/14'
                  }`}
                >
                  {activeRoutine.type === 'STORED_PROCEDURE'
                    ? 'procedure'
                    : activeRoutine.type.toLowerCase()}
                </span>

                <span className="font-mono text-[15px] font-semibold">
                  {activeRoutine.name}
                </span>

                <div className="flex-1" />

                {/* Copy SQL Button */}
                <button
                  type="button"
                  onClick={() => handleCopyRoutineSql(activeRoutine)}
                  className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[13px] flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {copiedRoutineId === activeRoutine.id ? (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#8fbf6b"
                        strokeWidth="2"
                        className="w-3.5 h-3.5"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span className="text-[#8fbf6b]">Copied</span>
                    </>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="w-3.5 h-3.5"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy SQL
                    </>
                  )}
                </button>

                {activeRoutine.targetEntity && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeRoutine.targetEntity!;
                      setActiveRoutineId(null);
                      setTimeout(() => {
                        const node = getNode(target);
                        if (node) {
                          setCenter(node.position.x + 120, node.position.y + 100, {
                            zoom: 1.05,
                            duration: 400,
                          });
                        }
                      }, 60);
                    }}
                    className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[13px] flex items-center gap-2 cursor-pointer"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-3.5 h-3.5"
                    >
                      <rect x="4" y="4" width="16" height="16" rx="2.5" />
                      <path d="M4 10h16" />
                    </svg>
                    View table
                  </button>
                )}
              </div>

              {/* Metadata Chips */}
              <div className="flex gap-2 mb-3 flex-wrap">
                <span className="text-[11px] font-mono text-[#8a8b9a] bg-white/[0.045] border border-white/[0.09] px-2.5 py-[5px] rounded-lg">
                  Language: plpgsql
                </span>
                {activeRoutine.type === 'TRIGGER' && (
                  <span className="text-[11px] font-mono text-[#8a8b9a] bg-white/[0.045] border border-white/[0.09] px-2.5 py-[5px] rounded-lg">
                    Event: AFTER UPDATE
                  </span>
                )}
                <span className="text-[11px] font-mono text-[#8a8b9a] bg-white/[0.045] border border-white/[0.09] px-2.5 py-[5px] rounded-lg">
                  Table: {activeRoutine.targetEntity || '—'}
                </span>
              </div>

              {/* Saved Prompt Banner */}
              {activeRoutine.prompt && (
                <div className="mb-3.5 px-3.5 py-2.5 rounded-xl bg-[#8b7ff0]/[0.08] border border-[#8b7ff0]/25 flex items-start gap-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-3.5 h-3.5 text-[#8b7ff0] mt-0.5 shrink-0"
                  >
                    <path d="M13 2 3 14h7l-1 8 11-14h-7z" />
                  </svg>
                  <div className="text-[12px] leading-[1.45]">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#8b7ff0] font-semibold mr-2">
                      Prompt:
                    </span>
                    <span className="text-[#e8e8ee]/90 italic">
                      &ldquo;{activeRoutine.prompt}&rdquo;
                    </span>
                  </div>
                </div>
              )}

              {/* Highlighted SQL Code Box */}
              <div className="flex-1 overflow-auto border border-white/[0.09] rounded-xl bg-[#101219]">
                <pre className="m-0 p-5 font-mono text-[12.5px] leading-[1.7] text-[#e8e8ee] whitespace-pre-wrap select-text">
                  {highlightSQLToJSX(activeRoutine.sql)}
                </pre>
              </div>
            </div>
          )}

          {/* ================= OVERLAY PANELS (COPILOT, INSPECTOR, CODE IDE) ================= */}
          <ChatConsole onSumbit={handleAISubmit} isThinking={isGenerating} />

          {isCodeOpen && <EditorPanel onClose={() => setIsCodeOpen(false)} />}
        </div>
      </div>

      {/* ================= AI SQL ROUTINE GENERATOR MODAL ================= */}
      {sqlModal?.isOpen && (
        <div
          onClick={() => setSqlModal(null)}
          className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-60 flex items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[min(500px,92vw)] bg-[#14161d] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-[18px] py-4 border-b border-white/[0.09] flex items-center">
              <b className="text-[14px]">AI PL/pgSQL Generator</b>
              <span className="text-[11.5px] text-[#565766] ml-2 font-mono">
                {sqlModal.entityName || 'global'}
              </span>
              <button
                type="button"
                onClick={() => setSqlModal(null)}
                className="ml-auto w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-[18px] space-y-4">
              {/* Existing Routines & Saved Prompts for this Table */}
              {modalExistingRoutines.length > 0 && (
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  <label className="block text-[10.5px] font-mono uppercase tracking-wider text-[#8a8b9a]">
                    Active Routines on {sqlModal.entityName} ({modalExistingRoutines.length})
                  </label>
                  {modalExistingRoutines.map((snippet) => (
                    <div
                      key={snippet.id}
                      onClick={() => {
                        setSqlModal(null);
                        setActiveRoutineId(snippet.id);
                      }}
                      className="p-2.5 rounded-lg bg-[#101219] border border-white/[0.08] hover:border-[#8b7ff0]/40 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-mono text-[#8b7ff0] font-semibold">
                          ⚡ {snippet.name}
                        </span>
                        <span className="text-[10px] font-mono text-[#565766]">
                          View SQL →
                        </span>
                      </div>
                      <p className="text-[12px] text-[#e8e8ee]/85 italic">
                        &ldquo;{snippet.prompt}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Routine Type</label>
                  <select
                    value={sqlModal.routineType}
                    onChange={(e) =>
                      setSqlModal({
                        ...sqlModal,
                        routineType: e.target.value as CustomSqlSnippet['type'],
                      })
                    }
                    className="w-full bg-[#101219] border border-white/[0.09] rounded-lg px-2.5 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
                  >
                    <option value="TRIGGER">Trigger</option>
                    <option value="FUNCTION">Function</option>
                    <option value="STORED_PROCEDURE">Procedure</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Target Table</label>
                  <select
                    value={sqlModal.entityName}
                    onChange={(e) =>
                      setSqlModal({ ...sqlModal, entityName: e.target.value })
                    }
                    className="w-full bg-[#101219] border border-white/[0.09] rounded-lg px-2.5 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
                  >
                    {currentIR.entities.map((ent) => (
                      <option key={ent.name} value={ent.name}>
                        {ent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#8a8b9a] mb-1.5">
                  Behavioral Description
                </label>
                <textarea
                  value={sqlPrompt}
                  onChange={(e) => setSqlPrompt(e.target.value)}
                  placeholder="e.g. Log every order status change to an audit table after update…"
                  className="w-full h-28 bg-[#101219] border border-white/[0.09] focus:border-[#8b7ff0]/50 rounded-lg p-3 text-[12.5px] text-[#e8e8ee] outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSqlModal(null)}
                  className="px-3.5 py-2 rounded-[7px] border border-white/[0.09] bg-white/[0.045] text-[12.5px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateSql}
                  disabled={!sqlPrompt.trim() || isGeneratingSql}
                  className="px-4 py-2 rounded-[7px] text-[12.5px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingSql ? 'Generating PL/pgSQL…' : 'Generate Routine'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= GITHUB EXPORT MODAL ================= */}
      {isExportModalOpen && (
        <div
          onClick={() => setIsExportModalOpen(false)}
          className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-60 flex items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[min(440px,92vw)] bg-[#14161d] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-[18px] py-4 border-b border-white/[0.09] flex items-center">
              <b className="text-[14px]">
                {exportedRepoUrl ? 'Commit to GitHub' : 'Export to GitHub'}
              </b>
              <span className="text-[11.5px] text-[#565766] ml-2 font-mono">git tree push</span>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="ml-auto w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-[18px] space-y-3.5">
              <div>
                <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Repository Name</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  disabled={!!exportedRepoUrl}
                  className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Commit Message</label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="feat: initial architecture generation"
                  className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#8a8b9a] mb-1.5">
                  GitHub Personal Access Token (repo scope)
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_••••••••••••••••••••"
                  className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-3.5 py-2 rounded-[7px] border border-white/[0.09] bg-white/[0.045] text-[12.5px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGitHubExportConfirm}
                  disabled={!repoName || !githubToken}
                  className="px-4 py-2 rounded-[7px] text-[12.5px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] disabled:opacity-50 cursor-pointer"
                >
                  {exportedRepoUrl ? 'Confirm Commit' : 'Confirm Export'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= NEXUS TOAST NOTIFICATION ================= */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-80 bg-[#14161d] border border-[#e08a3c]/35 rounded-[10px] px-4 py-[11px] text-[12.5px] flex items-center gap-[9px] shadow-[0_20px_45px_-15px_rgba(0,0,0,0.6)] transition-all duration-200 pointer-events-none ${
          toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-[15px] h-[15px] text-[#8fbf6b] flex-none"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}