'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  useReactFlow,
  Connection,
  ReactFlowProvider,
} from 'reactflow';
// @ts-ignore
import 'reactflow/dist/style.css';
import { useArchitectureStore } from '../../store/architectureStore';
import { ReactFlowAdapter } from '../../lib/reactFlowAdapter';
import { ContextOrchestrator } from '../../lib/contextOrchestrator';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';
import { EntityNode } from './EntityNode';
import { RelationEdge } from './RelationEdge';
import { StudioTopbar } from './StudioTopbar';
import { SchemaExplorer } from './SchemaExplorer';
import { Toolbar } from './Toolbar';
import { StickyNotesLayer } from './StickyNotesLayer';
import { ChatConsole } from './ChatConsole';
import { EditorPanel } from '../editor/EditorPanel';
import { TableDataView } from '../views/TableDataView';
import { ApiPlaygroundView } from '../views/ApiPlaygroundView';
import { SqlRoutineView } from '../views/SqlRoutineView';
import { SqlGeneratorModal, SqlModalState } from '../modals/SqlGeneratorModal';
import { GitHubExportModal } from '../modals/GitHubExportModal';

const nodeTypes = { entityNode: EntityNode };
const edgeTypes = { relationEdge: RelationEdge };

function CanvasInner() {
  const {
    present: currentIR,
    nodes,
    onNodesChange,
    applyAIPatch,
    undo,
    redo,
    compileArchitecture,
    dispatchManualAction,
    addChatMessage,
    compiledFiles,
    isCopilotOpen,
    setIsCopilotOpen,
    closeInspector,
    activeRoutineId,
    setActiveRoutineId,
    activeTableName,
    setActiveTableName,
    isApiPlaygroundOpen,
    canvasMode,
    setCanvasMode,
    toastMessage,
    showToast,
  } = useArchitectureStore();

  const { fitView, setCenter, getNode } = useReactFlow();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [sqlModal, setSqlModal] = useState<SqlModalState | null>(null);

  // Listen for custom event from EntityNode or SchemaExplorer to open the SQL Assistant
  useEffect(() => {
    const handleOpenSql = (e: any) => {
      setSqlModal({
        isOpen: true,
        entityName: e.detail?.entityName || currentIR.entities[0]?.name || '',
        routineType: e.detail?.defaultType || 'TRIGGER',
      });
    };
    window.addEventListener('open-sql-assistant', handleOpenSql);
    return () => window.removeEventListener('open-sql-assistant', handleOpenSql);
  }, [currentIR.entities]);

  // Global Keyboard Shortcuts (Ctrl+Z, Ctrl+Shift+Z, V, H)
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

      if (sourceFieldData && targetFieldData) {
        const isSourcePk = sourceFieldData.isPrimaryKey ?? sourceFieldData.name === 'id';
        const isTargetPk = targetFieldData.isPrimaryKey ?? targetFieldData.name === 'id';

        // Safety Net: If user wires PK -> PK, automatically convert target PK into a non-PK Foreign Key
        if (isSourcePk && isTargetPk) {
          dispatchManualAction({
            action: 'UPDATE_FIELD',
            targetEntity: params.target,
            targetField: targetField!,
            payload: {
              isPrimaryKey: false,
              unique: false,
              type: sourceFieldData.type,
            },
          });
        } else if (sourceFieldData.type !== targetFieldData.type) {
          dispatchManualAction({
            action: 'UPDATE_FIELD',
            targetEntity: params.target,
            targetField: targetField!,
            payload: { type: sourceFieldData.type },
          });
        }
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

  const handleJumpToGraphNode = (tableName: string) => {
    setActiveTableName(null);
    setActiveRoutineId(null);
    setTimeout(() => {
      const node = getNode(tableName);
      if (node) {
        setCenter(node.position.x + 120, node.position.y + 100, {
          zoom: 1.05,
          duration: 400,
        });
      }
    }, 60);
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
          body: JSON.stringify({ prompt: promptText, contextMap, isVisionTask: false }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Gateway Error: ${response.statusText}`);

        addChatMessage({ role: 'ai', content: data.reasoning });
        const newIR = ShadowGraph.simulateAndValidate(currentIR, data.actions);
        applyAIPatch(newIR);

        setTimeout(() => fitView({ padding: 0.2, duration: 600 }), 100);
      } catch (err: any) {
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
          safeMessage = 'The AI Gateway is experiencing heavy load. Please wait a moment and try again.';
        }
        addChatMessage({ role: 'warn', content: safeMessage });
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, nodes, currentIR, applyAIPatch, addChatMessage, fitView]
  );

  const activeRoutine = activeRoutineId
    ? currentIR.customSql?.find((r) => r.id === activeRoutineId) || null
    : null;

  const activeTableEntity = activeTableName
    ? currentIR.entities.find((e) => e.name === activeTableName) || null
    : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0c10] text-[#e8e8ee] overflow-hidden select-none">
      {/* Topbar */}
      <StudioTopbar
        isCodeOpen={isCodeOpen}
        onToggleCode={() => {
          const next = !isCodeOpen;
          setIsCodeOpen(next);
          if (next) {
            setIsCopilotOpen(false);
            closeInspector();
            compileArchitecture();
          }
        }}
        onToggleCopilot={() => {
          const next = !isCopilotOpen;
          setIsCopilotOpen(next);
          if (next) setIsCodeOpen(false);
        }}
        onExportGitHub={async () => {
          if (!compiledFiles || Object.keys(compiledFiles).length === 0) {
            await compileArchitecture();
          }
          setIsExportModalOpen(true);
        }}
        isExporting={isExporting}
      />

      {/* Main Studio Area */}
      <div className="relative flex-1 flex overflow-hidden w-full">
        <SchemaExplorer />

        <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#0b0c10]">
          {isApiPlaygroundOpen ? (
            <ApiPlaygroundView />
          ) : activeTableEntity ? (
            <TableDataView
              entity={activeTableEntity}
              onJumpToGraph={handleJumpToGraphNode}
            />
          ) : activeRoutine ? (
            <SqlRoutineView
              routine={activeRoutine}
              onJumpToTable={handleJumpToGraphNode}
            />
          ) : (
            <>
              <Toolbar />
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
              <StickyNotesLayer onAddTable={handleAddTable} />
            </>
          )}

          {/* Right Slide-Out Overlay Drawers */}
          <ChatConsole onSumbit={handleAISubmit} isThinking={isGenerating} />
          {isCodeOpen && <EditorPanel onClose={() => setIsCodeOpen(false)} />}
        </div>
      </div>

      {/* Modals & Toast */}
      <SqlGeneratorModal
        modalState={sqlModal}
        onClose={() => setSqlModal(null)}
        onChangeState={setSqlModal}
      />

      <GitHubExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        isExporting={isExporting}
        setIsExporting={setIsExporting}
      />

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