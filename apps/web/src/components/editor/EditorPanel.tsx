import { useState, useRef, useMemo, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useArchitectureStore } from '../../store/architectureStore';
import {
  buildStudioFileMap,
  buildFileTree,
  getFileLanguageLabel,
  TreeNode,
} from '../../lib/studioFileBuilder';
import { createClient } from '@supabase/supabase-js';

interface EditorPanelProps {
  onClose: () => void;
}

export function EditorPanel({ onClose }: EditorPanelProps) {
  const {
    compiledFiles,
    present,
    projectName,
    updateCompiledFile,
    showToast,
  } = useArchitectureStore();

  const studioFiles = useMemo(
    () => buildStudioFileMap(present, compiledFiles),
    [present, compiledFiles]
  );

  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! 
  ), []);

  const allPaths = useMemo(() => Object.keys(studioFiles), [studioFiles]);
  const treeNodes = useMemo(() => buildFileTree(allPaths), [allPaths]);

  const defaultServiceFile =
    allPaths.find((p) => p.includes('products.service.ts')) ||
    allPaths.find((p) => p.endsWith('.service.ts')) ||
    'src/server.ts';

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    const initial = ['prisma/schema.prisma', '.env'];
    if (defaultServiceFile && !initial.includes(defaultServiceFile)) {
      initial.push(defaultServiceFile);
    }
    return initial;
  });

  const [activeFile, setActiveFile] = useState<string>(defaultServiceFile);
  const [fileContent, setFileContent] = useState<string>('');

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    prisma: false,
    src: true,
    'src/lib': false,
    'src/routes': true,
    'src/controllers': false,
    'src/services': true,
  });

  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (activeFile && studioFiles[activeFile] !== undefined) {
      setFileContent(studioFiles[activeFile]);
      setShowAIPrompt(false);
    } else if (activeFile && studioFiles[activeFile] === undefined) {
      const fallback = Object.keys(studioFiles)[0];
      if (fallback) {
        setActiveFile(fallback);
        setOpenTabs((prev) => prev.filter((t) => t !== activeFile).concat(fallback));
      }
    }
  }, [activeFile, studioFiles]);

  const monaco = useMonaco();

  // 1. Inject Types and Compiler Options
  useEffect(() => {
    if (monaco) {
      const monacoTs = (monaco.languages as any).typescript;

      // FORCE the TS worker to analyze background files instantly
      monacoTs.typescriptDefaults.setEagerModelSync(true); 

      monacoTs.typescriptDefaults.setCompilerOptions({
        target: monacoTs.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: monacoTs.ModuleResolutionKind.NodeJs,
        module: monacoTs.ModuleKind.CommonJS,
        baseUrl: '.',
      });

      // Inject process.env, express, and @prisma/client types!
      monacoTs.typescriptDefaults.addExtraLib(
        `
        declare var process: { env: { PORT?: string; DATABASE_URL?: string; [key: string]: string | undefined; } };
        declare module 'express' {
          export interface Request { body: any; params: any; query: any; }
          export interface Response { json: (data: any) => void; status: (code: number) => Response; send: (data?: any) => void; }
          export interface Router { get: any; post: any; put: any; delete: any; use: any; }
          export function Router(): Router;
          const express: () => any;
          export default express;
        }
        declare module '@prisma/client' {
          export class PrismaClient { [key: string]: any; }
        }
        `,
        'file:///node_modules_mock.d.ts'
      );
    }
  }, [monaco]);

  // 2. Pre-load ALL files into Monaco's virtual file system so cross-file imports work instantly
  useEffect(() => {
    if (!monaco) return;
    
    const currentUris = new Set<string>();

    Object.entries(studioFiles).forEach(([filePath, content]) => {
      const uri = monaco.Uri.parse(`file:///${filePath}`);
      currentUris.add(uri.toString());
      
      const model = monaco.editor.getModel(uri);
      if (!model) {
        const { monacoLang } = getFileLanguageLabel(filePath);
        monaco.editor.createModel(content, monacoLang === 'typescript' ? 'typescript' : monacoLang, uri);
      } else if (model.getValue() !== content && filePath !== activeFile) {
        model.setValue(content);
      }
    });

    monaco.editor.getModels().forEach((model: any) => {
      if (model.uri.toString() !== 'file:///node_modules_mock.d.ts' && !currentUris.has(model.uri.toString())) {
        model.dispose();
      }
    });
  }, [monaco, studioFiles, activeFile]);

  const handleSelectFile = (path: string) => {
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path]);
    }
    setActiveFile(path);
  };

  const handleCloseTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const nextTabs = openTabs.filter((t) => t !== path);
    setOpenTabs(nextTabs);
    if (activeFile === path && nextTabs.length > 0) {
      setActiveFile(nextTabs[nextTabs.length - 1]);
    }
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderPath]: !prev[folderPath] }));
  };

  const handleEditorWillMount = (monaco: any) => {
    // 1. Configure TypeScript to resolve relative Node.js imports
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      baseUrl: '.',
    });

    // 2. Inject Node.js types (process.env)
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare var process: {
        env: {
          PORT?: string;
          DATABASE_URL?: string;
          [key: string]: string | undefined;
        }
      };`,
      'file:///node.d.ts'
    );

    // 3. Define syntax theme
    monaco.editor.defineTheme('nexus-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '565766', fontStyle: 'italic' },
        { token: 'keyword', foreground: '8b7ff0' },
        { token: 'string', foreground: '8fbf6b' },
        { token: 'number', foreground: 'e08a3c' },
        { token: 'type', foreground: '3fc6d8' },
      ],
      colors: {
        'editor.background': '#0b0c10',
        'editor.foreground': '#e8e8ee',
        'editorLineNumber.foreground': '#565766',
        'editorLineNumber.activeForeground': '#8a8b9a',
        'editor.lineHighlightBackground': '#14161d80',
        'editor.selectionBackground': '#8b7ff033',
        'editorGutter.background': '#0b0c10',
      },
    });
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monaco.editor.setTheme('nexus-dark');

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      setShowAIPrompt((prev) => !prev);
    });
  };

  const handleInlineGenerate = async () => {
    if (!aiPromptText.trim() || !editorRef.current || !activeFile) return;
    setIsGenerating(true);

    try {
      const { data: { session }} = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/v1/ai/inline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      const position = editor.getPosition() || { lineNumber: 1, column: 1 };

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

  const renderTreeNodes = (nodes: TreeNode[], depth = 0) =>
    nodes.map((node) => {
      if (node.isFolder) {
        const isOpen = !!expandedFolders[node.path];
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${12 + depth * 14}px` }}
              className="w-full flex items-center gap-1.5 py-[5px] pr-2.5 text-[12px] font-mono text-[#8a8b9a] hover:text-[#e8e8ee] hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`w-2.5 h-2.5 text-[#565766] transition-transform duration-150 flex-none ${
                  isOpen ? 'rotate-90' : 'rotate-0'
                }`}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="w-3.5 h-3.5 text-[#8a8b9a] flex-none"
              >
                <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
              </svg>
              <span className="truncate">{node.name}</span>
            </button>
            {isOpen && <div>{renderTreeNodes(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const isSelected = activeFile === node.path;
      const iconColor = isSelected
        ? 'text-[#e08a3c]'
        : node.name.endsWith('.ts')
        ? 'text-[#3fc6d8]'
        : node.name.endsWith('.json')
        ? 'text-[#8fbf6b]'
        : 'text-[#8b7ff0]';

      return (
        <button
          key={node.path}
          type="button"
          onClick={() => handleSelectFile(node.path)}
          style={{ paddingLeft: `${24 + depth * 14}px` }}
          className={`w-full flex items-center gap-2 py-[5px] pr-2.5 text-[12px] font-mono transition-colors cursor-pointer ${
            isSelected
              ? 'bg-[#e08a3c]/15 text-[#e08a3c] rounded-md'
              : 'text-[#e8e8ee]/85 hover:bg-white/[0.04] hover:text-[#e8e8ee]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className={`w-3.5 h-3.5 flex-none ${iconColor}`}
          >
            <path d="M6 4h9l5 5v11H6z" />
            <path d="M14 4v5h5" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
      );
    });

  const projectHeaderTitle = `${(projectName || 'acme-commerce')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')}-API`;

  const { monacoLang, statusLabel } = getFileLanguageLabel(activeFile || '');
  const lineCount = fileContent ? fileContent.split('\n').length : 1;

  return (
    <section className="absolute top-0 right-0 w-[min(880px,calc(100vw-56px))] h-full border-l border-white/[0.09] bg-[#0b0c10] flex z-35 shadow-[-24px_0_60px_rgba(0,0,0,0.8)] select-none">
      {/* Left File Tree Sidebar */}
      <div className="w-[224px] border-r border-white/[0.09] bg-[#101219] flex flex-col h-full flex-none">
        <div className="px-3.5 py-3 text-[10.5px] font-mono font-semibold text-[#565766] uppercase tracking-[0.6px] truncate">
          {projectHeaderTitle}
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 pb-4 space-y-0.5">
          {renderTreeNodes(treeNodes)}
        </div>
      </div>

      {/* Right Code Editor Pane */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0b0c10]">
        <div className="h-[38px] bg-[#101219] border-b border-white/[0.09] flex items-center min-w-0">
          <div
            onWheel={(e) => {
              if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
            }}
            className="flex-1 h-full flex items-center overflow-x-auto"
          >
            {openTabs.map((tabPath) => {
              const tabName = tabPath.split('/').pop() || tabPath;
              const isActive = activeFile === tabPath;
              return (
                <div
                  key={tabPath}
                  onClick={() => setActiveFile(tabPath)}
                  className={`group/tab h-full flex items-center gap-2 px-4 border-r border-white/[0.07] text-[12px] font-mono cursor-pointer transition-colors shrink-0 ${
                    isActive
                      ? 'bg-[#0b0c10] text-[#e8e8ee] font-medium'
                      : 'bg-transparent text-[#8a8b9a] hover:text-[#e8e8ee] hover:bg-white/[0.02]'
                  }`}
                >
                  <span>{tabName}</span>
                  {openTabs.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(e, tabPath)}
                      className="w-3.5 h-3.5 rounded hover:bg-white/10 text-[#565766] hover:text-[#e8e8ee] opacity-0 group-hover/tab:opacity-100 flex items-center justify-center text-[10px] cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-3 shrink-0 border-l border-white/[0.07] h-full bg-[#101219]">
            <button
              type="button"
              onClick={() => setShowAIPrompt((prev) => !prev)}
              title="Inline AI Code Generator (Cmd+K)"
              className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-[#8b7ff0]/15 border border-white/[0.08] hover:border-[#8b7ff0]/40 text-[10.5px] font-mono text-[#8a8b9a] hover:text-[#8b7ff0] transition-colors cursor-pointer"
            >
              <span>⌘ </span>
              <span className="font-semibold text-[12px]">K</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close Code Editor"
              className="w-6 h-6 rounded-full text-[#8a8b9a] hover:text-[#e8e8ee] hover:bg-white/[0.06] flex items-center justify-center text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden bg-[#0b0c10]">
          {showAIPrompt && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[88%] max-w-md bg-[#14161d] border border-[#8b7ff0]/50 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-2">
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
                placeholder="Ask AI to generate a function or query at cursor…"
                className="w-full bg-transparent text-[#e8e8ee] text-[12.5px] outline-none placeholder:text-[#565766]"
              />
              <div className="flex justify-between items-center pt-2 border-t border-white/[0.09]">
                <span className="text-[10px] font-mono text-[#565766]">Esc to close</span>
                <button
                  type="button"
                  onClick={handleInlineGenerate}
                  disabled={isGenerating || !aiPromptText.trim()}
                  className="px-3 py-1 rounded-[6px] bg-[#8b7ff0] text-[#0e0a1f] font-semibold text-[11.5px] disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? 'Generating…' : 'Insert ↵'}
                </button>
              </div>
            </div>
          )}

          <Editor
            height="100%"
            // THE CRITICAL FIX: Treat activeFile as a URI so relative paths connect!
            path={activeFile ? `file:///${activeFile}` : undefined}
            language={monacoLang}
            theme="nexus-dark"
            value={fileContent}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorDidMount}
            onChange={(val) => {
              const nextVal = val || '';
              setFileContent(nextVal);
              if (activeFile) updateCompiledFile(activeFile, nextVal);
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 12.5,
              lineHeight: 21,
              fontFamily: "'JetBrains Mono', monospace",
              padding: { top: 18, bottom: 18 },
              scrollBeyondLastLine: false,
              renderLineHighlight: 'none',
              overviewRulerLanes: 0,
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden',
                verticalScrollbarSize: 0,
                horizontalScrollbarSize: 0,
              },
            }}
          />
        </div>

        <div className="h-[28px] px-4 border-t border-white/[0.09] bg-[#0b0c10] flex items-center justify-between text-[11px] font-mono text-[#565766]">
          <span className="truncate">{activeFile}</span>
          <div className="flex items-center gap-3 shrink-0">
            <span>{statusLabel}</span>
            <span>UTF-8</span>
            <span>{lineCount} lines</span>
          </div>
        </div>
      </div>
    </section>
  );
}