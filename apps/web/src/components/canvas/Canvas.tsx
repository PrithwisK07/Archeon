"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useReactFlow,
  Connection,
  ReactFlowProvider,
} from "reactflow";
// @ts-ignore
import "reactflow/dist/style.css";
import { jsonrepair } from 'jsonrepair';
import { useArchitectureStore } from "../../store/architectureStore";
import { ReactFlowAdapter } from "../../lib/reactFlowAdapter";
import { ContextOrchestrator } from "../../lib/contextOrchestrator";
import { EntityNode } from "./EntityNode";
import { ShadowGraph } from "@zero-dollar/compiler/src/shadowGraph";
import { LLMResponseSchema } from "@zero-dollar/ir-core";
import { EditorPanel } from "../editor/EditorPanel";
import { Toolbar } from "./Toolbar";
import { RelationEdge } from "./RelationEdge";
import { ChatConsole } from "./ChatConsole";

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
    past,
    future,
    compileArchitecture,
    isCompiling,
    dispatchManualAction,
    addChatMessage,
    chatHistory,
    isDirty,
    compiledFiles,
    syncStatus,
    exportedRepoUrl,
    setExportedRepoUrl,
    projectName
  } = useArchitectureStore();

  const { getNode, fitView } = useReactFlow();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // --- Layout State ---
  const [isChatOpen, setIsChatOpen] = useState(true);

  // --- Modal States ---
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: "" });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [commitMessage, setCommitMessage] = useState("");

  // --- SQL Assistant States ---
  const [sqlModal, setSqlModal] = useState<{ isOpen: boolean; entityId: string; entityName: string } | null>(null);
  const [sqlPrompt, setSqlPrompt] = useState("");
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);

  // Listen for the custom event from EntityNode to open the SQL Assistant
  useEffect(() => {
    const handleOpenSql = (e: any) => {
      setSqlModal({ isOpen: true, entityId: e.detail.entityId, entityName: e.detail.entityName });
    };
    window.addEventListener('open-sql-assistant', handleOpenSql);
    return () => window.removeEventListener('open-sql-assistant', handleOpenSql);
  }, []);

  const edges = useMemo(
    () => ReactFlowAdapter.generateEdges(currentIR),
    [currentIR],
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;

      // Prevent self-loops on the exact same field
      if (
        connection.source === connection.target &&
        connection.sourceHandle === connection.targetHandle
      ) {
        return false;
      }

      // Prevent duplicate edges
      return !edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle &&
          e.targetHandle === connection.targetHandle,
      );
    },
    [edges],
  );

  // Extracts field-level handle IDs to track exact column connections
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceField = params.sourceHandle?.replace("source-", "");
      const targetField = params.targetHandle?.replace("target-", "");

      // AUTO-FK SYNCHRONIZATION
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      const sourceFieldData = sourceNode?.data.entity.fields.find(
        (f: any) => f.name === sourceField,
      );
      const targetFieldData = targetNode?.data.entity.fields.find(
        (f: any) => f.name === targetField,
      );

      // If types mismatch, mutate the target field to match the source's data type
      if (
        sourceFieldData &&
        targetFieldData &&
        sourceFieldData.type !== targetFieldData.type
      ) {
        dispatchManualAction({
          action: "UPDATE_FIELD",
          targetEntity: params.target,
          targetField: targetField!,
          payload: { type: sourceFieldData.type },
        });
      }

      dispatchManualAction({
        action: "ADD_RELATION",
        payload: {
          sourceEntity: params.source,
          targetEntity: params.target,
          sourceField,
          targetField,
          type: "ONE_TO_MANY",
        },
      });
    },
    [nodes, dispatchManualAction],
  );

  const handleAISubmit = useCallback(
    async (promptText: string) => {
      if (!promptText.trim() || isGenerating) return;

      setIsGenerating(true);
      addChatMessage({ role: "user", content: promptText });

      try {
        const selectedNode = nodes.find((n) => n.selected);
        const contextMap = ContextOrchestrator.buildAIPayload(currentIR, promptText, selectedNode?.id);

        const response = await fetch("/api/v1/ai/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer development-token",
          },
          body: JSON.stringify({ prompt: promptText, contextMap, isVisionTask: false }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Gateway Error: ${response.statusText}`);
        }

        // The backend guarantees this data is clean, validated, and ready to apply
        addChatMessage({ role: "ai", content: data.reasoning });
        const newIR = ShadowGraph.simulateAndValidate(currentIR, data.actions);
        applyAIPatch(newIR);

        setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);

      } catch (err: any) {
        // --- SECURE UI ERROR BOUNDARY ---
        console.error("[Architect Error]:", err);

        let safeMessage = "I encountered an internal conflict while processing that architecture. Could you try rephrasing?";

        if (err.message.includes("Failed to generate a valid architecture")) {
           safeMessage = "I had trouble mapping that exact request to the strict database schema, even after self-correcting. Let's try adding those entities one at a time.";
        } else if (err.message.includes("fetch") || err.message.includes("Network") || err.message.includes("429")) {
           safeMessage = "The AI Gateway is experiencing heavy load. Please wait a moment and try again.";
        }

        addChatMessage({ role: "ai", content: safeMessage });
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, nodes, currentIR, applyAIPatch, addChatMessage, fitView],
  );

  const handleGenerateSql = async () => {
    if (!sqlPrompt.trim() || !sqlModal) return;
    setIsGeneratingSql(true);

    try {
      // Find the exact schema of the target entity to feed to the LLM
      const targetEntity = currentIR.entities.find(e => e.name === sqlModal.entityName);

      const response = await fetch("/api/v1/ai/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer development-token" },
        body: JSON.stringify({ 
          prompt: sqlPrompt, 
          targetEntitySchema: targetEntity 
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate SQL");

      // Save the generated SQL to the AST
      dispatchManualAction({
        action: 'ADD_CUSTOM_SQL' as any,
        payload: {
          id: crypto.randomUUID(),
          name: `trigger_${sqlModal.entityName.toLowerCase()}_${Date.now()}`,
          targetEntity: sqlModal.entityName,
          type: "TRIGGER",
          sql: data.sql,
          prompt: sqlPrompt 
        }
      });

      addChatMessage({ role: "ai", content: `Successfully generated and attached a custom SQL trigger for ${sqlModal.entityName}.` });
      setSqlModal(null);
      setSqlPrompt("");

    } catch (err: any) {
      console.error("SQL Generation Failed:", err);
      addChatMessage({ role: "ai", content: `Failed to generate SQL: ${err.message}` });
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleCompile = async () => {
    setIsEditorOpen(true);
    await compileArchitecture();
  };

  const handleGitHubExportClick = () => {
    if (!compiledFiles || Object.keys(compiledFiles).length === 0) {
      setAlertModal({ isOpen: true, message: "Please generate code first before exporting." });
      return;
    }

    if (exportedRepoUrl) {
      // Extract repo name from URL
      const urlParts = exportedRepoUrl.split('/');
      setRepoName(urlParts[urlParts.length - 1]);
      
      const recentPrompt = chatHistory.filter(m => m.role === 'user').pop()?.content || '';
      if (recentPrompt) setCommitMessage(`feat: ${recentPrompt.slice(0, 50)}...`);
    } else {
      // Slugify projectName
      const slugifiedName = (projectName || "untitled-architecture")
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
    addChatMessage({ 
      role: 'user', 
      content: exportedRepoUrl 
        ? `Committing changes to ${repoName}...` 
        : `Initiating parallel export to github.com/.../${repoName}` 
    });

    try {
      const response = await fetch('/api/v1/export/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repoName, 
          files: compiledFiles, 
          token: githubToken, 
          commitMessage: commitMessage || (exportedRepoUrl ? "feat: update architecture schema" : "feat: initial architecture generation") 
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Export failed');

      setExportedRepoUrl(data.url);

      addChatMessage({ 
        role: 'ai', 
        content: exportedRepoUrl 
          ? `Success! Changes committed to repository. View it here: ${data.url}` 
          : `Success! Repository created and populated atomically. View it here: ${data.url}` 
      });
      window.open(data.url, '_blank');

    } catch (error: any) {
      addChatMessage({ role: 'ai', content: `Export Error: ${error.message}` });
    } finally {
      setIsExporting(false);
      setGithubToken(""); // Clear token after use for security
      setCommitMessage(""); // Reset commit message
    }
  };

  // Pre-calculate active triggers for the modal
  const activeTriggers = sqlModal 
    ? (currentIR.customSql?.filter(sql => sql.targetEntity === sqlModal.entityName) || [])
    : [];

  return (
    <div className="w-screen h-screen bg-[#0A0A0A] font-sans selection:bg-indigo-500/30 overflow-hidden flex relative">
      
      {/* --- Main Canvas Area --- */}
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={2}
          className="bg-[#0A0A0A]"
        >
          <Background gap={24} size={1} color="#ffffff05" />

          <Panel position="top-left" className="m-6">
            <div className="flex gap-2 bg-[#111111] p-1 rounded-md border border-white/10 shadow-2xl">
              <button
                onClick={undo}
                disabled={past.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white disabled:opacity-30 transition-colors"
              >
                Undo (Ctrl+Z)
              </button>
              <div className="w-px bg-white/10" />
              <button
                onClick={redo}
                disabled={future.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white disabled:opacity-30 transition-colors"
              >
                Redo
              </button>
            </div>
          </Panel>

          <Controls
            className="bg-[#111111] border-white/10 fill-white/70"
            showInteractive={false}
          />

          <Panel position="top-right" className="m-6 flex flex-col items-end gap-3 z-50">
            {isDirty && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-mono tracking-widest uppercase shadow-lg backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Uncompiled Changes
              </div>
            )}

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="px-3 py-2 bg-[#111111] border border-white/20 text-white hover:bg-white/10 rounded-md shadow-2xl text-xs font-medium transition-colors"
              >
                {isChatOpen ? 'Close Chat' : 'Open Chat'}
              </button>

              <button 
                onClick={handleGitHubExportClick}
                disabled={isCompiling || isExporting || !compiledFiles || Object.keys(compiledFiles).length === 0}
                className={`
                  px-4 py-2 text-xs font-medium rounded-md shadow-2xl transition-all border
                  ${(!compiledFiles || Object.keys(compiledFiles).length === 0)
                    ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                    : isExporting
                      ? 'bg-[#111111] border-white/10 text-white/40 cursor-wait'
                      : 'bg-[#111111] border-white/20 text-white hover:bg-white/10'}
                `}
              >
                {isExporting ? 'Pushing to Git...' : exportedRepoUrl ? 'Commit Changes' : 'Export to GitHub'}
              </button>

              <button
                onClick={handleCompile}
                disabled={isCompiling}
                className={`
                  px-4 py-2 text-xs font-medium rounded-md shadow-2xl transition-all border
                  ${
                    isCompiling
                      ? "bg-[#111111] border-white/10 text-white/40 cursor-wait"
                      : "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 hover:shadow-indigo-500/20"
                  }
                `}
              >
                {isCompiling ? "Compiling AST..." : "Generate Code"}
              </button>
            </div>
          </Panel>

          <Panel position="top-left" className="m-6 mt-24">
            <Toolbar />
          </Panel>

          {/* --- Sync Status Indicator --- */}
          <Panel position="bottom-left" className="m-6 z-50">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111111]/80 backdrop-blur-md border border-white/5 rounded-full shadow-lg">
              {syncStatus === 'synced' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">Cloud Synced</span>
                </>
              )}
              {syncStatus === 'syncing' && (
                <>
                  <div className="w-2 h-2 rounded-full border border-indigo-400 border-t-transparent animate-spin" />
                  <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider">Saving...</span>
                </>
              )}
              {syncStatus === 'error' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider">Sync Failed</span>
                </>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* --- Collapsible Sidebar Area --- */}
      <div 
        className={`h-full border-l border-white/10 bg-[#0A0A0A] transition-all duration-300 ease-in-out relative z-40 ${
          isChatOpen ? 'w-[400px] opacity-100' : 'w-0 opacity-0 overflow-hidden border-none'
        }`}
      >
        <div className="w-[400px] h-full flex flex-col">
          <ChatConsole onSumbit={handleAISubmit} isThinking={isGenerating} />
        </div>
      </div>

      {isEditorOpen && <EditorPanel onClose={() => setIsEditorOpen(false)} />}

      {/* --- AI Trigger Assistant Modal --- */}
      {sqlModal?.isOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111111] border border-white/10 p-6 rounded-lg shadow-2xl max-w-lg w-full mx-4 flex flex-col gap-4">
            <div>
              <h3 className="text-white text-lg font-medium flex items-center gap-2">
                <span className="text-indigo-400">⚡</span> AI Trigger Assistant
              </h3>
              <p className="text-white/50 text-xs mt-1">
                Targeting: <span className="font-mono text-white/70">{sqlModal.entityName}</span>
              </p>
            </div>

            {/* List existing triggers and their prompts */}
            {activeTriggers.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-3 mb-2 pr-2 custom-scrollbar">
                {activeTriggers.map(snippet => (
                  <div key={snippet.id} className="bg-white/5 border border-white/10 p-3 rounded-md">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-emerald-400 text-xs">✓ Active</span>
                      <span className="text-white/40 text-[10px] font-mono">{snippet.name}</span>
                    </div>
                    <p className="text-white/80 text-sm italic">"{snippet.prompt}"</p>
                  </div>
                ))}
              </div>
            )}
            
            <textarea
              value={sqlPrompt}
              onChange={(e) => setSqlPrompt(e.target.value)}
              placeholder="e.g., Audit every soft-delete to an audit_logs table before update..."
              className="w-full bg-[#0A0A0A] border border-white/10 rounded-md px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors h-32 resize-none"
            />
            
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => { setSqlModal(null); setSqlPrompt(""); }}
                className="px-4 py-2 bg-transparent border border-white/10 hover:bg-white/5 text-white rounded-md text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateSql}
                disabled={!sqlPrompt.trim() || isGeneratingSql}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm transition-colors flex items-center gap-2"
              >
                {isGeneratingSql ? (
                  <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Generating...</>
                ) : (
                  "Generate PL/pgSQL"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Alert Modal --- */}
      {alertModal.isOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111111] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full mx-4">
            <h3 className="text-white text-lg font-medium mb-2">Notice</h3>
            <p className="text-white/70 text-sm mb-6">{alertModal.message}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertModal({ isOpen: false, message: "" })}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md text-sm transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Export Form Modal --- */}
      {isExportModalOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111111] border border-white/10 p-6 rounded-lg shadow-2xl max-w-md w-full mx-4">
            <h3 className="text-white text-lg font-medium mb-4">
              {exportedRepoUrl ? "Commit to GitHub" : "Export to GitHub"}
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-white/70 text-xs mb-1.5 font-medium">Repository Name</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={e => setRepoName(e.target.value)}
                  disabled={!!exportedRepoUrl}
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-md px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                  placeholder="e.g. zero-dollar-generated-api"
                />
              </div>
              
              <div>
                <label className="block text-white/70 text-xs mb-1.5 font-medium">Commit Message</label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder={exportedRepoUrl ? "feat: update architecture schema" : "feat: initial architecture generation"}
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-md px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-white/70 text-xs mb-1.5 font-medium">GitHub Personal Access Token</label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  placeholder="Requires 'repo' scope"
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-md px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 bg-transparent border border-white/10 hover:bg-white/5 text-white rounded-md text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGitHubExportConfirm}
                disabled={!repoName || !githubToken}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm transition-colors"
              >
                {exportedRepoUrl ? "Confirm Commit" : "Confirm Export"}
              </button>
            </div>
          </div>
        </div>
      )}
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