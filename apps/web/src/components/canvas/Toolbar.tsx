import { useState, useRef, useEffect } from 'react';
import { useReactFlow } from 'reactflow';
import { useArchitectureStore } from '../../store/architectureStore';

export { SchemaExplorer } from './SchemaExplorer';

export function Toolbar() {
  const {
    present,
    nodes,
    dispatchManualAction,
    isExplorerOpen,
    setIsExplorerOpen,
    canvasMode,
    setCanvasMode,
    addNote,
    autoArrangeNodes,
    undo,
    redo,
    showToast,
  } = useArchitectureStore();

  const { fitView, setCenter, getNode } = useReactFlow();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleAddTable = () => {
    let idx = present.entities.length + 1;
    let tableName = `table_${idx}`;
    while (present.entities.some((e) => e.name === tableName)) {
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

  const handleDuplicate = () => {
    const selectedNode = nodes.find((n) => n.selected);
    if (!selectedNode) {
      showToast('Select a table first');
      return;
    }

    const srcEntity = selectedNode.data.entity;
    const base = srcEntity.name.replace(/_copy\d*$/, '');
    let i = 1;
    let newName = `${base}_copy`;
    while (present.entities.some((e) => e.name === newName)) {
      i++;
      newName = `${base}_copy${i}`;
    }

    dispatchManualAction({
      action: 'ADD_ENTITY',
      payload: {
        name: newName,
        fields: srcEntity.fields.map((f) => ({ ...f })),
      },
    });
    showToast('Table duplicated');
  };

  const handleDelete = () => {
    const selectedNode = nodes.find((n) => n.selected);
    if (!selectedNode) {
      showToast('Select a table first');
      return;
    }

    dispatchManualAction({
      action: 'REMOVE_ENTITY',
      targetEntity: selectedNode.id,
    });
    showToast('Table deleted');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return;
      const match = present.entities.find((ent) => ent.name.toLowerCase().includes(q));
      if (match) {
        const node = getNode(match.name);
        if (node) {
          setCenter(node.position.x + 120, node.position.y + 100, { zoom: 1.1, duration: 400 });
        }
        setSearchOpen(false);
        setSearchQuery('');
      } else {
        showToast(`No table matches "${searchQuery}"`);
      }
    }
    if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  const railBtnClass = (active = false) =>
    `w-[34px] h-[34px] rounded-[9px] flex items-center justify-center border border-transparent transition-all duration-100 active:scale-90 cursor-pointer ${
      active
        ? 'bg-[#e08a3c]/15 text-[#e08a3c]'
        : 'bg-transparent text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee]'
    }`;

  return (
    <>
      {/* 12-Button Floating Left Rail */}
      <div className="absolute left-4 top-4 z-30 bg-[#14161d] border border-white/[0.09] rounded-[14px] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.65)] flex flex-col items-center p-2 gap-[3px]">
        <button
          type="button"
          title="Select (V)"
          onClick={() => setCanvasMode('select')}
          className={railBtnClass(canvasMode === 'select')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M5 3l14 6-6 2-2 6z" />
          </svg>
        </button>

        <button
          type="button"
          title="Pan (H)"
          onClick={() => setCanvasMode('pan')}
          className={railBtnClass(canvasMode === 'pan')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11.5V6a1.5 1.5 0 0 1 3 0v7M17 10v2a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 12.5c-.5-.8-.2-1.7.6-2 .6-.2 1.3 0 1.7.6L7 13" />
          </svg>
        </button>

        <div className="w-5 h-px bg-white/[0.09] my-[3px]" />

        <button
          type="button"
          title="Toggle schema explorer"
          onClick={() => setIsExplorerOpen(!isExplorerOpen)}
          className={railBtnClass(isExplorerOpen)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
          </svg>
        </button>

        <button type="button" title="Add table" onClick={handleAddTable} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <rect x="4" y="4" width="16" height="16" rx="2.5" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </button>

        <button type="button" title="Add note" onClick={addNote} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M6 4h9l5 5v11H6z" />
            <path d="M15 4v5h5" />
          </svg>
        </button>

        <div className="w-5 h-px bg-white/[0.09] my-[3px]" />

        <button type="button" title="Auto-arrange" onClick={autoArrangeNodes} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>

        <button type="button" title="Duplicate table" onClick={handleDuplicate} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
          </svg>
        </button>

        <button type="button" title="Delete table" onClick={handleDelete} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
          </svg>
        </button>

        <div className="w-5 h-px bg-white/[0.09] my-[3px]" />

        <button type="button" title="Undo (Ctrl+Z)" onClick={undo} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" />
          </svg>
        </button>

        <button type="button" title="Redo (Ctrl+Shift+Z)" onClick={redo} className={railBtnClass()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h1" />
          </svg>
        </button>

        <div className="w-5 h-px bg-white/[0.09] my-[3px]" />

        <button
          type="button"
          title="Search tables"
          onClick={() => setSearchOpen(!searchOpen)}
          className={railBtnClass(searchOpen)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>

        <button
          type="button"
          title="Fit view"
          onClick={() => fitView({ padding: 0.2, duration: 400 })}
          className={railBtnClass()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
            <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
          </svg>
        </button>
      </div>

      {/* Search Overlay Box */}
      <div
        className={`absolute top-4 left-[76px] z-30 flex items-center gap-2 bg-[#14161d] border border-white/[0.09] rounded-[10px] px-3 py-[9px] shadow-[0_16px_34px_-16px_rgba(0,0,0,0.6)] transition-all duration-150 ${
          searchOpen
            ? 'opacity-100 pointer-events-auto translate-y-0'
            : 'opacity-0 pointer-events-none -translate-y-1.5'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="w-3.5 h-3.5 text-[#565766] flex-none"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Jump to table…"
          className="bg-transparent border-none text-[#e8e8ee] text-[12.5px] w-[180px] outline-none"
        />
      </div>
    </>
  );
}