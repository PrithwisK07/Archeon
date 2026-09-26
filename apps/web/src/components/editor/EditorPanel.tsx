import { useState, useRef, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useArchitectureStore } from '../../store/architectureStore';
import type { CanonicalIR } from '@zero-dollar/ir-core';

interface EditorPanelProps {
  onClose: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

function buildStudioFileMap(
  ir: CanonicalIR,
  compiledFiles: Record<string, string> | null
): Record<string, string> {
  const files: Record<string, string> = {};

  // 1. Prisma Schema
  let prismaCode = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n`;
  for (const entity of ir.entities) {
    prismaCode += `model ${entity.name} {\n`;
    for (const f of entity.fields) {
      const pType =
        f.type === 'number'
          ? 'Int'
          : f.type === 'boolean'
          ? 'Boolean'
          : f.type === 'datetime'
          ? 'DateTime'
          : f.type === 'json'
          ? 'Json'
          : 'String';
      const pk = f.isPrimaryKey || f.name === 'id' ? ' @id @default(uuid())' : '';
      const uq = f.unique && !pk ? ' @unique' : '';
      const opt = f.nullable ? '?' : '';
      prismaCode += `  ${f.name} ${pType}${opt}${pk}${uq}\n`;
    }
    prismaCode += `}\n\n`;
  }
  files['prisma/schema.prisma'] = compiledFiles?.['prisma/schema.prisma'] || prismaCode.trimEnd();

  if (compiledFiles?.['prisma/migrations/0_custom_behavior_injections/migration.sql']) {
    files['prisma/migrations/migration.sql'] =
      compiledFiles['prisma/migrations/0_custom_behavior_injections/migration.sql'];
  }

  // 2. Server Entry & Prisma Client Lib
  const entityImports = ir.entities
    .map(
      (e) =>
        `import ${e.name.toLowerCase()}Routes from "./routes/${e.name.toLowerCase()}.routes";`
    )
    .join('\n');
  const entityMounts = ir.entities
    .map((e) => `app.use("/v1/${e.name.toLowerCase()}", ${e.name.toLowerCase()}Routes);`)
    .join('\n');

  files['src/server.ts'] =
    compiledFiles?.['src/index.ts'] ||
    `import express from "express";\n${entityImports}\n\nconst app = express();\napp.use(express.json());\n\n${entityMounts}\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(\`Nexus API running on port \${PORT}\`);\n});\n`;

  files['src/lib/prisma.ts'] = `import { PrismaClient } from "@prisma/client";\n\nexport const prisma = new PrismaClient();\n`;

  // 3. Routes, Controllers & Services per Entity
  for (const entity of ir.entities) {
    const slug = entity.name.toLowerCase();
    const pascal = entity.name.charAt(0).toUpperCase() + entity.name.slice(1);

    const extRouteKey = `src/routes/${entity.name}Routes.ts`;
    files[`src/routes/${slug}.routes.ts`] =
      compiledFiles?.[extRouteKey] ||
      `// Auto-generated Express router for ${entity.name}\nimport { Router } from "express";\nimport * as ${slug}Service from "../services/${slug}.service";\n\nconst router = Router();\n\nrouter.get("/", async (_req, res) => {\n  const items = await ${slug}Service.list${pascal}();\n  res.json(items);\n});\n\nrouter.get("/:id", async (req, res) => {\n  const item = await ${slug}Service.get${pascal}(req.params.id);\n  if (!item) return res.status(404).json({ error: "Not found" });\n  res.json(item);\n});\n\nrouter.post("/", async (req, res) => {\n  const created = await ${slug}Service.create${pascal}(req.body);\n  res.status(201).json(created);\n});\n\nrouter.put("/:id", async (req, res) => {\n  const updated = await ${slug}Service.update${pascal}(req.params.id, req.body);\n  res.json(updated);\n});\n\nrouter.delete("/:id", async (req, res) => {\n  await ${slug}Service.delete${pascal}(req.params.id);\n  res.status(204).send();\n});\n\nexport default router;\n`;

    files[`src/controllers/${slug}.controller.ts`] = `// Controller layer for ${entity.name}\nimport { Request, Response } from "express";\nimport * as ${slug}Service from "../services/${slug}.service";\n\nexport async function handleList(_req: Request, res: Response) {\n  const data = await ${slug}Service.list${pascal}();\n  return res.json(data);\n}\n`;

    files[`src/services/${slug}.service.ts`] = `// Auto-generated CRUD service for ${entity.name}\nimport { prisma } from "../lib/prisma";\n\nexport async function list${pascal}() {\n  return prisma.${slug}.findMany();\n}\n\nexport async function get${pascal}(id: string) {\n  return prisma.${slug}.findUnique({ where: { id } });\n}\n\nexport async function create${pascal}(data: any) {\n  return prisma.${slug}.create({ data });\n}\n\nexport async function update${pascal}(id: string, data: any) {\n  return prisma.${slug}.update({ where: { id }, data });\n}\n\nexport async function delete${pascal}(id: string) {\n  return prisma.${slug}.delete({ where: { id } });\n}\n`;
  }

  // 4. Root Config Files
  files['package.json'] =
    compiledFiles?.['package.json'] ||
    JSON.stringify(
      {
        name: 'nexus-generated-api',
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'ts-node src/server.ts',
          build: 'tsc',
          'db:generate': 'prisma generate',
          'db:push': 'prisma db push',
        },
        dependencies: {
          '@prisma/client': '^5.0.0',
          express: '^4.18.2',
        },
      },
      null,
      2
    );

  files['.env'] =
    compiledFiles?.['.env.example'] ||
    `DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"\nPORT=3000\n`;

  return files;
}

function buildFileTree(filePaths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const fullPath of filePaths) {
    const parts = fullPath.split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, idx) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFolder = idx < parts.length - 1;

      let existing = currentLevel.find((n) => n.name === part && n.isFolder === isFolder);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder,
          children: [],
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    });
  }

  const folderPriority: Record<string, number> = {
    prisma: 1,
    src: 2,
    'server.ts': 1,
    lib: 2,
    routes: 3,
    controllers: 4,
    services: 5,
    'package.json': 90,
    '.env': 91,
  };

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      const pA = folderPriority[a.name] ?? (a.isFolder ? 10 : 50);
      const pB = folderPriority[b.name] ?? (b.isFolder ? 10 : 50);
      if (pA !== pB) return pA - pB;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => {
      if (n.isFolder) sortNodes(n.children);
    });
  };

  sortNodes(root);
  return root;
}

function getFileLanguageLabel(path: string): { monacoLang: string; statusLabel: string } {
  if (path.endsWith('.prisma')) return { monacoLang: 'graphql', statusLabel: 'Prisma' };
  if (path.endsWith('.json')) return { monacoLang: 'json', statusLabel: 'JSON' };
  if (path.endsWith('.sql')) return { monacoLang: 'sql', statusLabel: 'PostgreSQL' };
  if (path.endsWith('.env') || path.endsWith('.env.example'))
    return { monacoLang: 'ini', statusLabel: 'ENV' };
  return { monacoLang: 'typescript', statusLabel: 'TypeScript' };
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
    }
  }, [activeFile, studioFiles]);

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

  const renderTreeNodes = (nodes: TreeNode[], depth = 0) => {
    return nodes.map((node) => {
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
  };

  const projectHeaderTitle = `${(projectName || 'acme-commerce')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')}-API`;

  const { monacoLang, statusLabel } = getFileLanguageLabel(activeFile || '');
  const lineCount = fileContent ? fileContent.split('\n').length : 1;

  return (
    <section className="absolute top-0 right-0 w-[min(880px,calc(100vw-56px))] h-full border-l border-white/[0.09] bg-[#0b0c10] flex z-35 shadow-[-24px_0_60px_rgba(0,0,0,0)] select-none">
      {/* ================= LEFT FILE TREE SIDEBAR ================= */}
      <div className="w-[224px] border-r border-white/[0.09] bg-[#101219] flex flex-col h-full flex-none">
        <div className="px-3.5 py-3 text-[10.5px] font-mono font-semibold text-[#565766] uppercase tracking-[0.6px] truncate">
          {projectHeaderTitle}
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 pb-4 space-y-0.5">
          {renderTreeNodes(treeNodes)}
        </div>
      </div>

      {/* ================= RIGHT CODE EDITOR PANE ================= */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0b0c10]">
        {/* Top File Tabs Bar */}
        <div className="h-[38px] bg-[#101219] border-b border-white/[0.09] flex items-center min-w-0">
          <div
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
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
                      className="w-3.5 h-3.5 rounded hover:bg-white/10 text-[#565766] hover:text-[#e8e8ee] opacity-0 group-hover/tab:opacity-100 flex items-center justify-center text-[18px] cursor-pointer"
                    >
                      ×
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

        {/* Monaco Code Surface */}
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

        {/* Bottom IDE Status Bar */}
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