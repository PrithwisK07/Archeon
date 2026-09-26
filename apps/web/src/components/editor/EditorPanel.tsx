import { useState, useRef, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useArchitectureStore } from '../../store/architectureStore';
import { OpenApiGenerator } from '../../lib/openapiGenerator';

interface EditorPanelProps {
  mode: 'swagger' | 'code';
  onClose: () => void;
  onSwitchMode: (mode: 'swagger' | 'code') => void;
}

const VERB_STYLES: Record<string, string> = {
  get: 'text-[#8fbf6b] bg-[#8fbf6b]/12',
  post: 'text-[#e08a3c] bg-[#e08a3c]/12',
  put: 'text-[#3fc6d8] bg-[#3fc6d8]/12',
  patch: 'text-[#3fc6d8] bg-[#3fc6d8]/12',
  delete: 'text-[#e0708f] bg-[#e0708f]/12',
};

export function EditorPanel({ mode, onClose, onSwitchMode }: EditorPanelProps) {
  const {
    compiledFiles,
    isCompiling,
    compileError,
    present,
    compileArchitecture,
    updateCompiledFile,
    showToast,
  } = useArchitectureStore();

  const filePaths = compiledFiles ? Object.keys(compiledFiles).sort() : [];
  const [activeFile, setActiveFile] = useState<string | null>(filePaths[0] || null);
  const [fileContent, setFileContent] = useState<string>('');

  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const editorRef = useRef<any>(null);

  // Build dynamic Swagger routes from OpenApiGenerator
  const endpointsList = useMemo(() => {
    const spec = OpenApiGenerator.generateSpec(present);
    const list: { verb: string; path: string; summary: string }[] = [];

    Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
      Object.entries(methods).forEach(([verb, details]: [string, any]) => {
        list.push({
          verb: verb.toLowerCase(),
          path: `/v1${path}`,
          summary: details.summary || `${verb.toUpperCase()} ${path}`,
        });
      });
    });

    return list;
  }, [present]);

  useEffect(() => {
    if (!activeFile && filePaths.length > 0) {
      setActiveFile(filePaths[0]);
    }
  }, [filePaths, activeFile]);

  useEffect(() => {
    if (activeFile && compiledFiles) {
      setFileContent(compiledFiles[activeFile] || '');
      setShowAIPrompt(false);
    }
  }, [activeFile, compiledFiles]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const isReadOnly = activeFile?.includes('_Base') || activeFile?.endsWith('.json');
      if (!isReadOnly) {
        setShowAIPrompt(true);
      } else {
        showToast('Inline AI is only available in extension files, not _Base files');
      }
    });
  };

  const handleInlineGenerate = async () => {
    if (!aiPromptText.trim() || !editorRef.current || !activeFile) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/v1/ai/inline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer development-token',
        },
        body: JSON.stringify({
          prompt: aiPromptText,
          currentFileContent: fileContent,
          schemaContext: present.entities,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const editor = editorRef.current;
      const position = editor.getPosition();

      editor.executeEdits('ai-inline', [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: data.code,
          forceMoveMarkers: true,
        },
      ]);

      const updated = editor.getValue();
      setFileContent(updated);
      updateCompiledFile(activeFile, updated);
      setShowAIPrompt(false);
      setAiPromptText('');
      showToast('Inline code injected');
    } catch (err: any) {
      console.error('Inline generation failed:', err);
      showToast('Failed to generate inline code snippet');
    } finally {
      setIsGenerating(false);
    }
  };

  // ================= SWAGGER PLAYGROUND MODAL =================
  if (mode === 'swagger') {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-60 flex items-center justify-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-[min(580px,92vw)] max-h-[80vh] overflow-y-auto bg-[#14161d] border border-white/[0.09] rounded-2xl shadow-[0_30px_70px_-20px_rgba(0,0,0,0.7)] flex flex-col"
        >
          <div className="px-[18px] py-4 border-b border-white/[0.09] flex items-center sticky top-0 bg-[#14161d] z-10">
            <b className="text-[14px] font-semibold text-[#e8e8ee]">Swagger Playground</b>
            <span className="text-[11.5px] text-[#565766] ml-2 font-mono">
              /v1 · auto-generated
            </span>

            <button
              type="button"
              onClick={async () => {
                onSwitchMode('code');
                await compileArchitecture();
              }}
              className="ml-auto mr-2 px-2.5 py-1 rounded-[6px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.08] text-[11.5px] font-mono text-[#e08a3c] cursor-pointer transition-colors"
            >
              Inspect Compiled Code →
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] hover:border-white/20 flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-2">
            {endpointsList.length === 0 ? (
              <div className="p-8 text-center text-[12.5px] text-[#565766] font-mono">
                Add a table to your canvas to auto-generate REST endpoints.
              </div>
            ) : (
              endpointsList.map((ep, idx) => (
                <div
                  key={`${ep.verb}_${ep.path}_${idx}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] hover:bg-white/[0.045] font-mono text-[12px] transition-colors"
                >
                  <span
                    className={`w-[52px] flex-none text-center font-semibold text-[10.5px] rounded-[5px] py-[3px] tracking-[0.3px] uppercase ${
                      VERB_STYLES[ep.verb] || 'text-[#8a8b9a] bg-white/[0.05]'
                    }`}
                  >
                    {ep.verb === 'delete' ? 'DELETE' : ep.verb.toUpperCase()}
                  </span>
                  <span className="text-[#e8e8ee] flex-1 truncate">{ep.path}</span>
                  <span className="text-[#565766] text-[11px] font-sans">{ep.summary}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ================= MONACO CODE COMPILER DRAWER =================
  const isReadOnly = activeFile?.includes('_Base') || activeFile?.endsWith('.json');

  return (
    <div className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-60 flex justify-end">
      <div className="w-[min(920px,95vw)] h-full bg-[#0b0c10] border-l border-white/[0.09] flex flex-col shadow-2xl">
        {/* Drawer Topbar */}
        <div className="h-[52px] px-4 border-b border-white/[0.09] bg-[#14161d] flex items-center gap-3">
          <b className="text-[14px] font-semibold">Compiled Backend Output</b>
          <span className="text-[11.5px] text-[#565766] font-mono">ts-morph · Prisma + Express</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSwitchMode('swagger')}
              className="px-3 py-1.5 rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.08] text-[12px] cursor-pointer"
            >
              Swagger Routes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] hover:border-white/20 flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {isCompiling ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-[#e08a3c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[12px] text-[#8a8b9a] font-mono">Compiling AST in Web Worker…</p>
          </div>
        ) : compileError ? (
          <div className="flex-1 p-6">
            <div className="p-4 rounded-xl bg-[#e0708f]/10 border border-[#e0708f]/30 text-[#e0708f] font-mono text-xs">
              {compileError}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Virtual File Tree */}
            <div className="w-60 border-r border-white/[0.09] bg-[#14161d] flex flex-col h-full">
              <div className="px-3.5 py-2.5 border-b border-white/[0.09] text-[10.5px] font-mono text-[#565766] uppercase tracking-wider">
                Generated Files ({filePaths.length})
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                {filePaths.map((path) => (
                  <button
                    key={path}
                    onClick={() => setActiveFile(path)}
                    title={path}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[6px] text-[11.5px] font-mono truncate transition-colors cursor-pointer ${
                      activeFile === path
                        ? 'bg-[#e08a3c]/15 text-[#e08a3c]'
                        : 'text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee]'
                    }`}
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>

            {/* Monaco Editor Area */}
            <div className="flex-1 flex flex-col bg-[#101219] relative">
              <div className="px-4 py-2.5 border-b border-white/[0.09] bg-[#0b0c10] flex items-center justify-between">
                <span className="text-[12px] font-mono text-[#8a8b9a] truncate">{activeFile}</span>
                <div className="flex items-center gap-2">
                  {isReadOnly ? (
                    <span className="text-[10px] font-mono text-[#e08a3c] bg-[#e08a3c]/12 px-2 py-0.5 rounded-full">
                      Read-Only _Base
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAIPrompt(!showAIPrompt)}
                      className="px-2.5 py-1 rounded-[6px] bg-[#8b7ff0]/15 hover:bg-[#8b7ff0]/25 border border-[#8b7ff0]/30 text-[#8b7ff0] text-[11px] font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>⌘K</span> Inline AI
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 relative">
                {showAIPrompt && !isReadOnly && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-[#14161d] border border-[#8b7ff0]/50 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-2">
                    <input
                      autoFocus
                      value={aiPromptText}
                      onChange={(e) => setAiPromptText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleInlineGenerate();
                        }
                        if (e.key === 'Escape') setShowAIPrompt(false);
                      }}
                      placeholder="Ask AI to write an Express handler or Prisma query at cursor…"
                      className="w-full bg-transparent text-[#e8e8ee] text-[12.5px] outline-none placeholder:text-[#565766]"
                    />
                    <div className="flex justify-between items-center pt-2 border-t border-white/[0.09]">
                      <span className="text-[10px] font-mono text-[#565766]">Esc to cancel</span>
                      <button
                        type="button"
                        onClick={handleInlineGenerate}
                        disabled={isGenerating || !aiPromptText.trim()}
                        className="px-3 py-1 rounded-[6px] bg-[#8b7ff0] text-[#0e0a1f] font-semibold text-[11.5px] disabled:opacity-50 cursor-pointer"
                      >
                        {isGenerating ? 'Generating…' : 'Insert Code ↵'}
                      </button>
                    </div>
                  </div>
                )}

                <Editor
                  height="100%"
                  language={
                    activeFile?.endsWith('.json')
                      ? 'json'
                      : activeFile?.endsWith('.sql')
                      ? 'sql'
                      : 'typescript'
                  }
                  theme="vs-dark"
                  value={fileContent}
                  onChange={(val) => {
                    const nextVal = val || '';
                    setFileContent(nextVal);
                    if (activeFile) updateCompiledFile(activeFile, nextVal);
                  }}
                  onMount={handleEditorDidMount}
                  options={{
                    readOnly: isReadOnly,
                    minimap: { enabled: false },
                    fontSize: 12.5,
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}