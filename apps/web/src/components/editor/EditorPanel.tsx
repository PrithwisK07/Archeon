import { useState, useRef, useMemo , useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import { useArchitectureStore } from '../../store/architectureStore';
import { OpenApiGenerator } from '../../lib/openapiGenerator';
// @ts-ignore
import "swagger-ui-react/swagger-ui.css";
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-white/50 text-sm font-mono">
      Loading API Playground...
    </div>
  )
});

export function EditorPanel({ onClose }: { onClose: () => void }) {
  const { compiledFiles, isCompiling, compileError, present } = useArchitectureStore();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'code' | 'api'>('code');

  // Track which file is currently being viewed
  const filePaths = compiledFiles ? Object.keys(compiledFiles).sort() : [];
  const [activeFile, setActiveFile] = useState<string | null>(filePaths[0] || null);
  
  // Local state for the editor to allow inline AI injections
  const [fileContent, setFileContent] = useState<string>("");

  // Inline AI States
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPromptText, setAiPromptText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const editorRef = useRef<any>(null);

  // Generate OpenAPI spec dynamically when AST changes
  const openApiSpec = useMemo(() => OpenApiGenerator.generateSpec(present), [present]);

  // Sync the local editor state when the active file changes
  useEffect(() => {
    if (activeFile && compiledFiles) {
      setFileContent(compiledFiles[activeFile] || "");
      setShowAIPrompt(false);
    }
  }, [activeFile, compiledFiles]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Add hotkey Ctrl+K / Cmd+K to trigger the AI prompt
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      // Only allow AI edits in non-base Extension files
      const isReadOnly = activeFile?.includes('_Base') || activeFile?.endsWith('.json');
      if (!isReadOnly) {
        setShowAIPrompt(true);
      } else {
        alert("Inline AI is only available in developer Extension files, not generated _Base files.");
      }
    });
  };

  const handleInlineGenerate = async () => {
    if (!aiPromptText.trim() || !editorRef.current || !activeFile) return;
    setIsGenerating(true);

    try {
      const response = await fetch("/api/v1/ai/inline", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": "Bearer development-token" 
        },
        body: JSON.stringify({
          prompt: aiPromptText,
          currentFileContent: fileContent,
          schemaContext: present.entities // Provide the AST layout so it knows table/column names exactly
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Inject the code into the editor at the current cursor position
      const editor = editorRef.current;
      const position = editor.getPosition();
      
      // Perform an atomic edit so Ctrl+Z works properly
      editor.executeEdits("ai-inline", [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: data.code,
        forceMoveMarkers: true
      }]);

      setFileContent(editor.getValue());
      setShowAIPrompt(false);
      setAiPromptText("");
      
    } catch (err) {
      console.error("Inline generation failed:", err);
      alert("Failed to generate code snippet. Check console.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (isCompiling) {
    return (
      <div className="absolute top-0 right-0 w-[900px] h-full bg-[#0A0A0A] border-l border-white/10 flex flex-col items-center justify-center z-50">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-white/50 font-mono uppercase tracking-widest">Running AST Compiler...</p>
      </div>
    );
  }

  if (compileError) {
    return (
      <div className="absolute top-0 right-0 w-[900px] h-full bg-[#0A0A0A] border-l border-white/10 p-6 z-50 flex flex-col">
        <h2 className="text-rose-400 font-mono mb-4 text-sm">Compilation Error</h2>
        <p className="text-white/70 text-sm">{compileError}</p>
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-md text-sm w-fit transition-colors">Close</button>
      </div>
    );
  }

  if (!compiledFiles || filePaths.length === 0) return null;

  // Determine if the current file is an immutable boilerplate file
  const isReadOnly = activeFile?.includes('_Base') || activeFile?.endsWith('.json');

  return (
    <div className="absolute top-0 right-0 w-[900px] h-full bg-[#0A0A0A] border-l border-white/10 flex flex-col z-50 shadow-2xl">
      
      {/* Header & Tabs */}
      <div className="flex flex-col border-b border-white/10 bg-[#111111]">
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-white font-medium" style={{ fontFamily: '"Canva Fatimi", sans-serif' }}>
            Architecture Output
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">✕</button>
        </div>
        
        <div className="flex px-4 gap-6">
          <button 
            onClick={() => setActiveTab('code')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'code' ? 'text-indigo-400 border-indigo-400' : 'text-white/40 border-transparent hover:text-white/80'
            }`}
          >
            Code Explorer
          </button>
          <button 
            onClick={() => setActiveTab('api')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'api' ? 'text-emerald-400 border-emerald-400' : 'text-white/40 border-transparent hover:text-white/80'
            }`}
          >
            API Playground
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex">
        {activeTab === 'code' ? (
          <>
            {/* File Explorer (memfs representation) */}
            <div className="w-64 border-r border-white/10 flex flex-col h-full bg-[#0A0A0A]">
              <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#111111]">
                <h3 className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Generated Files</h3>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {filePaths.map(path => (
                  <button
                    key={path}
                    onClick={() => setActiveFile(path)}
                    className={`w-full text-left px-4 py-1.5 text-xs font-mono transition-colors truncate
                      ${activeFile === path ? 'bg-indigo-500/10 text-indigo-400 border-l-2 border-indigo-500' : 'text-white/60 hover:bg-white/5 hover:text-white border-l-2 border-transparent'}
                    `}
                    title={path}
                  >
                    {path.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>

            {/* Monaco Code Editor */}
            <div className="flex-1 h-full bg-[#111111] flex flex-col relative">
              <div className="px-4 py-3 border-b border-white/10 bg-[#0A0A0A] flex justify-between items-center">
                <span className="text-xs font-mono text-white/80 truncate pr-4">{activeFile}</span>
                <div className="flex gap-3 items-center shrink-0">
                  {isReadOnly && (
                    <span className="text-[10px] text-amber-500/70 border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 rounded">
                      Read-Only _Base File
                    </span>
                  )}
                  {!isReadOnly && (
                    <button 
                      onClick={() => setShowAIPrompt(!showAIPrompt)}
                      className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded text-xs font-mono hover:bg-indigo-500/30 transition-colors flex items-center gap-2"
                      title="Cmd+K to open AI inline prompt"
                    >
                      <span className="text-[10px] bg-indigo-500/30 px-1 rounded text-indigo-200">⌘K</span> AI Edit
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden">
                {/* Floating AI Prompt Overlay */}
                {showAIPrompt && !isReadOnly && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-[#111111]/95 backdrop-blur-xl border border-indigo-500/50 rounded-lg p-3 shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-10 flex flex-col gap-2">
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
                      placeholder="e.g. Write a Prisma $queryRaw CTE to fetch all nested comments..."
                      className="w-full bg-transparent border-none text-white text-sm outline-none placeholder:text-white/30"
                    />
                    <div className="flex justify-between items-center mt-2 border-t border-white/10 pt-2">
                      <span className="text-[10px] text-white/30 font-mono">Press Esc to cancel</span>
                      <button 
                        onClick={handleInlineGenerate}
                        disabled={isGenerating || !aiPromptText.trim()}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors disabled:opacity-50"
                      >
                        {isGenerating ? 'Generating...' : 'Generate ↵'}
                      </button>
                    </div>
                  </div>
                )}

                <Editor
                  height="100%"
                  language={activeFile?.endsWith('.json') ? 'json' : 'typescript'}
                  theme="vs-dark"
                  value={fileContent}
                  onChange={(val) => setFileContent(val || "")}
                  onMount={handleEditorDidMount}
                  options={{
                    readOnly: isReadOnly,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          /* Swagger API Playground Tab */
          <div className="flex-1 h-full overflow-y-auto bg-white p-4">
            <div className="max-w-4xl mx-auto">
              <SwaggerUI spec={openApiSpec} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}