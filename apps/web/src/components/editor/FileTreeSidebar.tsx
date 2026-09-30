import { TreeNode, getFileLanguageLabel } from '../../lib/studioFileBuilder';

interface FileTreeSidebarProps {
  projectHeaderTitle: string;
  treeNodes: TreeNode[];
  activeFile: string;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}

export function FileTreeSidebar({
  projectHeaderTitle,
  treeNodes,
  activeFile,
  expandedFolders,
  toggleFolder,
  onSelectFile,
}: FileTreeSidebarProps) {
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-2.5 h-2.5 text-[#565766] transition-transform duration-150 flex-none ${isOpen ? 'rotate-90' : 'rotate-0'}`}>
                <path d="M9 6l6 6-6 6" />
              </svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-3.5 h-3.5 text-[#8a8b9a] flex-none">
                <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
              </svg>
              <span className="truncate">{node.name}</span>
            </button>
            {isOpen && <div>{renderTreeNodes(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const isSelected = activeFile === node.path;
      const iconColor = isSelected ? 'text-[#e08a3c]' : node.name.endsWith('.ts') ? 'text-[#3fc6d8]' : node.name.endsWith('.json') ? 'text-[#8fbf6b]' : 'text-[#8b7ff0]';

      return (
        <button
          key={node.path}
          type="button"
          onClick={() => onSelectFile(node.path)}
          style={{ paddingLeft: `${24 + depth * 14}px` }}
          className={`w-full flex items-center gap-2 py-[5px] pr-2.5 text-[12px] font-mono transition-colors cursor-pointer ${
            isSelected ? 'bg-[#e08a3c]/15 text-[#e08a3c] rounded-md' : 'text-[#e8e8ee]/85 hover:bg-white/[0.04] hover:text-[#e8e8ee]'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={`w-3.5 h-3.5 flex-none ${iconColor}`}>
            <path d="M6 4h9l5 5v11H6z" />
            <path d="M14 4v5h5" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
      );
    });

  return (
    <div className="w-[224px] border-r border-white/[0.09] bg-[#101219] flex flex-col h-full flex-none">
      <div className="px-3.5 py-3 text-[10.5px] font-mono font-semibold text-[#565766] uppercase tracking-[0.6px] truncate">
        {projectHeaderTitle}
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-4 space-y-0.5">
        {renderTreeNodes(treeNodes)}
      </div>
    </div>
  );
}