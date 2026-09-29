import { useState, useRef, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import type { CustomSqlSnippet } from '@zero-dollar/ir-core';

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

export interface SqlRoutineViewProps {
  routine: CustomSqlSnippet;
  onJumpToTable: (tableName: string) => void;
}

export function SqlRoutineView({ routine, onJumpToTable }: SqlRoutineViewProps) {
  const { setActiveRoutineId, dispatchManualAction, showToast } =
    useArchitectureStore();
  
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Local state for edits before saving
  const [localName, setLocalName] = useState(routine.name);
  const [localSql, setLocalSql] = useState(routine.sql);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync local state if the routine changes externally
  useEffect(() => {
    setLocalName(routine.name);
    setLocalSql(routine.sql);
    setIsEditing(false);
  }, [routine.id, routine.name, routine.sql]);

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? localSql : routine.sql);
      setCopied(true);
      showToast('SQL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy SQL');
    }
  };

  const handleSave = () => {
    const cleanName = localName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!cleanName || !localSql.trim()) {
      showToast('Name and SQL code cannot be empty');
      return;
    }

    dispatchManualAction({
      action: 'UPDATE_CUSTOM_SQL',
      id: routine.id,
      payload: { 
        name: cleanName, 
        sql: localSql 
      },
    });
    
    setIsEditing(false);
    showToast('Saved changes');
  };

  const handleCancelEdit = () => {
    setLocalName(routine.name);
    setLocalSql(routine.sql);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${routine.name}"?`)) {
      dispatchManualAction({
        action: 'REMOVE_CUSTOM_SQL',
        id: routine.id,
      });
      setActiveRoutineId(null);
      showToast('Routine deleted');
    }
  };

  return (
    <div className="absolute inset-0 z-28 flex flex-col bg-[#0b0c10] px-[30px] py-[22px] select-none">
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
            routine.type === 'TRIGGER'
              ? 'text-[#8b7ff0] bg-[#8b7ff0]/14'
              : routine.type === 'STORED_PROCEDURE'
              ? 'text-[#e08a3c] bg-[#e08a3c]/14'
              : 'text-[#3fc6d8] bg-[#3fc6d8]/14'
          }`}
        >
          {routine.type === 'STORED_PROCEDURE'
            ? 'procedure'
            : routine.type.toLowerCase()}
        </span>

        {isEditing ? (
          <input
            ref={nameInputRef}
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="font-mono text-[15px] font-semibold bg-[#101219] border border-white/[0.2] focus:border-[#8b7ff0] rounded px-2 py-0.5 outline-none text-[#e8e8ee] min-w-[250px]"
            placeholder="Routine name..."
          />
        ) : (
          <span className="font-mono text-[15px] font-semibold">{routine.name}</span>
        )}

        <div className="flex-1" />

        {/* Edit / Save Controls */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] text-[#8a8b9a] hover:text-[#e8e8ee] hover:bg-white/[0.045] text-[13px] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-[13px] py-[7px] rounded-[7px] bg-[#8b7ff0] text-[#0b0c10] hover:brightness-110 font-semibold text-[13px] cursor-pointer transition-colors"
            >
              Save Changes
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[#8b7ff0] hover:text-[#b5adf2] text-[13px] flex items-center gap-2 cursor-pointer transition-colors"
          >
            Edit SQL
          </button>
        )}

        {/* Copy SQL Button */}
        <button
          type="button"
          onClick={handleCopy}
          className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[13px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          {copied ? (
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
              Copy
            </>
          )}
        </button>

        {/* Delete Routine Button */}
        <button
          type="button"
          onClick={handleDelete}
          className="px-[10px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-[#e0708f]/20 hover:border-[#e0708f]/40 text-[#e0708f] text-[13px] flex items-center justify-center cursor-pointer transition-colors"
          title="Delete custom routine"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
          </svg>
        </button>

        {routine.targetEntity && (
          <button
            type="button"
            onClick={() => onJumpToTable(routine.targetEntity!)}
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
        {routine.type === 'TRIGGER' && (
          <span className="text-[11px] font-mono text-[#8a8b9a] bg-white/[0.045] border border-white/[0.09] px-2.5 py-[5px] rounded-lg">
            Event: AFTER UPDATE
          </span>
        )}
        <span className="text-[11px] font-mono text-[#8a8b9a] bg-white/[0.045] border border-white/[0.09] px-2.5 py-[5px] rounded-lg">
          Table: {routine.targetEntity || '—'}
        </span>
      </div>

      {/* Saved Prompt Banner */}
      {routine.prompt && !isEditing && (
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
            <span className="text-[#e8e8ee]/90 italic">&ldquo;{routine.prompt}&rdquo;</span>
          </div>
        </div>
      )}

      {/* Code Editor / Highlighted Box */}
      <div className="flex-1 border border-white/[0.09] rounded-xl bg-[#101219] overflow-hidden relative">
        {isEditing ? (
          <textarea
            value={localSql}
            onChange={(e) => setLocalSql(e.target.value)}
            spellCheck={false}
            className="absolute inset-0 w-full h-full p-5 font-mono text-[12.5px] leading-[1.7] text-[#e8e8ee] bg-transparent outline-none resize-none"
          />
        ) : (
          <div className="absolute inset-0 overflow-auto">
            <pre className="m-0 p-5 font-mono text-[12.5px] leading-[1.7] text-[#e8e8ee] whitespace-pre-wrap select-text">
              {highlightSQLToJSX(routine.sql)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}