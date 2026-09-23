import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useArchitectureStore } from '../../store/architectureStore';

export function EditorPanel({ onClose }: { onClose: () => void }) {
  const { compiledFiles, isCompiling, compileError } = useArchitectureStore();
  
  // Track which file is currently being viewed
  const filePaths = compiledFiles ? Object.keys(compiledFiles).sort() : [];
  const [activeFile, setActiveFile] = useState<string | null>(filePaths[0] || null);

  if (isCompiling) {
    return (
      <div className="absolute top-0 right-0 w-[600px] h-full bg-[#0A0A0A] border-l border-white/10 flex flex-col items-center justify-center z-50">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-white/50 font-mono uppercase tracking-widest">Running AST Compiler...</p>
      </div>
    );
  }

  if (compileError) {
    return (
      <div className="absolute top-0 right-0 w-[600px] h-full bg-[#0A0A0A] border-l border-white/10 p-6 z-50 flex flex-col">
        <h2 className="text-rose-400 font-mono mb-4 text-sm">Compilation Error</h2>
        <p className="text-white/70 text-sm">{compileError}</p>
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-md text-sm w-fit transition-colors">Close</button>
      </div>
    );
  }

  if (!compiledFiles || filePaths.length === 0) return null;

  return (
    <div className="absolute top-0 right-0 w-[700px] h-full bg-[#0A0A0A] border-l border-white/10 flex z-50 shadow-2xl">
      
      {/* File Explorer (memfs representation) */}
      <div className="w-64 border-r border-white/10 flex flex-col h-full bg-[#0A0A0A]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xs font-mono text-white/50 uppercase tracking-widest">Generated Files</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {filePaths.map(path => (
            <button
              key={path}
              onClick={() => setActiveFile(path)}
              className={`w-full text-left px-4 py-1.5 text-xs font-mono transition-colors truncate
                ${activeFile === path ? 'bg-indigo-500/10 text-indigo-400 border-l-2 border-indigo-500' : 'text-white/60 hover:bg-white/5 hover:text-white border-l-2 border-transparent'}
              `}
            >
              {path}
            </button>
          ))}
        </div>
      </div>

      {/* Monaco Code Editor */}
      <div className="flex-1 h-full bg-[#111111] flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 bg-[#0A0A0A]">
          <span className="text-xs font-mono text-white/80">{activeFile}</span>
        </div>
        <div className="flex-1 relative">
          <Editor
            height="100%"
            language={activeFile?.endsWith('.json') ? 'json' : 'typescript'}
            theme="vs-dark"
            value={activeFile ? compiledFiles[activeFile] : '// Select a file'}
            options={{
              readOnly: true, // Generated code is immutable in the viewer
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
    </div>
  );
}