import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { UINodeData } from '../../lib/reactFlowAdapter';
import { useArchitectureStore } from '../../store/architectureStore';
import type { Field } from '@zero-dollar/ir-core';

const TYPE_COLORS: Record<string, string> = {
  string: 'text-blue-400',
  number: 'text-emerald-400',
  boolean: 'text-amber-400',
  uuid: 'text-purple-400',
  datetime: 'text-rose-400',
  json: 'text-cyan-400',
};

export const EntityNode = memo(({ data, selected, id }: NodeProps<UINodeData>) => {
  const { entity } = data;
  const { dispatchManualAction, present } = useArchitectureStore();

  const [editingEntity, setEditingEntity] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [openTypeDropdown, setOpenTypeDropdown] = useState<string | null>(null);
  
  const entityInputRef = useRef<HTMLInputElement>(null);
  const fieldInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingEntity) entityInputRef.current?.focus();
    if (editingField) fieldInputRef.current?.focus();
  }, [editingEntity, editingField]);

  // Count active SQL snippets assigned to this exact entity
  const attachedSnippets = present.customSql?.filter(sql => sql.targetEntity === entity.name) || [];

  // --- ACTIONS ---

  const handleAddRow = () => {
    const randomSuffix = crypto.randomUUID().slice(0, 5);
    dispatchManualAction({
      action: "ADD_FIELD",
      targetEntity: entity.name,
      payload: { name: `newField_${randomSuffix}`, type: "string", nullable: false }
    });
  };

  const handleDeleteRow = (fieldName: string) => {
    dispatchManualAction({
      action: "REMOVE_FIELD",
      targetEntity: entity.name,
      targetField: fieldName
    });
  };

  const handleUpdateField = (fieldName: string, payload: Partial<Field>) => {
    dispatchManualAction({
      action: "UPDATE_FIELD",
      targetEntity: entity.name,
      targetField: fieldName,
      payload
    });
    setOpenTypeDropdown(null);
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === entity.fields.length - 1)) return;
    
    const newFields = [...entity.fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    
    dispatchManualAction({
      action: "UPDATE_ENTITY",
      targetEntity: entity.name,
      payload: { fields: newFields }
    });
  };

  const handleDuplicateEntity = () => {
    const randomSuffix = crypto.randomUUID().slice(0, 5);
    const copiedFields = entity.fields.map(f => ({ ...f }));
    dispatchManualAction({
      action: "ADD_ENTITY",
      payload: { name: `${entity.name}_copy_${randomSuffix}`, fields: copiedFields }
    });
  };

  const handleDeleteEntity = () => {
    dispatchManualAction({
      action: "REMOVE_ENTITY",
      targetEntity: entity.name
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, commitFn: () => void, cancelFn: () => void) => {
    if (e.key === 'Enter') commitFn();
    if (e.key === 'Escape') cancelFn();
  };

  const commitEntityName = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    const newName = e.currentTarget.value.trim();
    if (newName && newName !== entity.name) {
      dispatchManualAction({
        action: "UPDATE_ENTITY",
        targetEntity: entity.name,
        payload: { name: newName }
      });
    }
    setEditingEntity(false);
  };

  const commitFieldName = (oldName: string, e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    const newName = e.currentTarget.value.trim();
    if (newName && newName !== oldName) {
      dispatchManualAction({
        action: "UPDATE_FIELD",
        targetEntity: entity.name,
        targetField: oldName,
        payload: { name: newName }
      });
    }
    setEditingField(null);
  };

  return (
    <div 
      className={`
        relative min-w-[280px] rounded-lg shadow-xl transition-all duration-150
        bg-[#0A0A0A] border 
        ${selected ? 'border-indigo-500 shadow-[0_0_0_1px_rgba(99,102,241,1),0_10px_25px_-5px_rgba(0,0,0,0.5)]' : 'border-white/10 hover:border-white/20'}
      `}
    >
      {/* Header Panel with Context Menu */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#111111] rounded-t-lg group">
        <div 
          className="flex-1 cursor-text nodrag nopan"
          onDoubleClick={() => setEditingEntity(true)}
          onMouseDown={e => e.stopPropagation()}
        >
          {editingEntity ? (
            <input
              ref={entityInputRef}
              defaultValue={entity.name}
              onBlur={commitEntityName}
              onKeyDown={(e) => handleKeyDown(e, () => commitEntityName(e), () => setEditingEntity(false))}
              className="bg-transparent text-white text-base tracking-wide outline-none border-b border-indigo-500 w-full"
              style={{ fontFamily: '"Canva Fatimi", "Inter", sans-serif', fontWeight: 500 }}
            />
          ) : (
            <h3 
              className="text-white text-base tracking-wide" 
              style={{ fontFamily: '"Canva Fatimi", "Inter", sans-serif', fontWeight: 500 }}
            >
              {entity.name}
            </h3>
          )}
        </div>

        {/* Entity Context Menu */}
        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity nodrag nopan" onMouseDown={e => e.stopPropagation()}>
          <button onClick={handleDuplicateEntity} className="p-1.5 hover:bg-white/10 rounded-md text-white/50 hover:text-white transition-colors" title="Duplicate">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button onClick={handleDeleteEntity} className="p-1.5 hover:bg-rose-500/20 rounded-md text-rose-500/50 hover:text-rose-400 transition-colors" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>

      {/* Fields List */}
      <div className="flex flex-col py-1.5">
        {entity.fields.length === 0 ? (
          <div className="text-xs text-white/30 font-mono p-6 text-center">Empty Entity</div>
        ) : (
          entity.fields.map((field, index) => (
            <div 
              key={field.name} 
              className="relative flex items-center justify-between py-2 px-4 hover:bg-white/[0.04] transition-colors group/row"
            >
              <Handle type="target" position={Position.Left} id={`target-${field.name}`} className="w-2 h-2 rounded-sm bg-[#0A0A0A] border border-white/40 -ml-[5px] opacity-0 group-hover/row:opacity-100 transition-opacity" />

              {/* Field Reorder Handles */}
              <div className="flex flex-col mr-2 opacity-0 group-hover/row:opacity-100 transition-opacity nodrag nopan" onMouseDown={e => e.stopPropagation()}>
                <button onClick={() => handleMoveField(index, 'up')} disabled={index === 0} className="text-white/30 hover:text-white disabled:opacity-10"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
                <button onClick={() => handleMoveField(index, 'down')} disabled={index === entity.fields.length - 1} className="text-white/30 hover:text-white disabled:opacity-10"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
              </div>

              <div 
                className="flex items-center gap-2 flex-1 cursor-text nodrag nopan"
                onDoubleClick={() => setEditingField(field.name)}
                onMouseDown={e => e.stopPropagation()}
              >
                {editingField === field.name ? (
                  <input
                    ref={fieldInputRef}
                    defaultValue={field.name}
                    onBlur={(e) => commitFieldName(field.name, e)}
                    onKeyDown={(e) => handleKeyDown(e, () => commitFieldName(field.name, e), () => setEditingField(null))}
                    className="bg-transparent text-xs font-medium text-white outline-none border-b border-indigo-500 w-24"
                  />
                ) : (
                  <span className="text-xs font-medium text-white/80 select-none">{field.name}</span>
                )}
              </div>
              
              <div className="flex items-center gap-2 nodrag nopan" onMouseDown={e => e.stopPropagation()}>
                
                {/* Fully Custom Type Dropdown */}
                <div className="relative">
                  {openTypeDropdown === field.name && (
                    <div className="fixed inset-0 z-40" onClick={() => setOpenTypeDropdown(null)} />
                  )}
                  <button
                    onClick={() => setOpenTypeDropdown(openTypeDropdown === field.name ? null : field.name)}
                    className="relative z-10 flex items-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 rounded px-1.5 py-0.5 transition-all"
                  >
                    <span className={`text-[10px] font-mono tracking-wide ${TYPE_COLORS[field.type] || 'text-white/70'}`}>
                      {field.type}
                    </span>
                    <svg className="w-2.5 h-2.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {openTypeDropdown === field.name && (
                    <div className="absolute right-0 top-full mt-1 w-24 bg-[#111111] border border-white/10 rounded-md shadow-2xl z-50 overflow-hidden py-1">
                      {Object.entries(TYPE_COLORS).map(([type, colorClass]) => (
                        <button
                          key={type}
                          onClick={() => handleUpdateField(field.name, { type: type as Field['type'] })}
                          className={`w-full text-right px-3 py-1.5 text-[10px] font-mono tracking-wide hover:bg-white/5 transition-colors ${colorClass}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Constraint Toggles */}
                <div className="flex items-center gap-1 ml-1 border-l border-white/10 pl-2">
                  <button 
                    onClick={() => handleUpdateField(field.name, { isPrimaryKey: !field.isPrimaryKey })} 
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${field.isPrimaryKey ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/[0.02] text-white/20 hover:text-white/50 border border-white/5'}`} 
                    title="Primary Key"
                  >
                    PK
                  </button>
                  <button 
                    onClick={() => handleUpdateField(field.name, { unique: !field.unique })} 
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${field.unique ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-white/[0.02] text-white/20 hover:text-white/50 border border-white/5'}`} 
                    title="Unique"
                  >
                    UQ
                  </button>
                  <button 
                    onClick={() => handleUpdateField(field.name, { nullable: !field.nullable })} 
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${field.nullable ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.02] text-white/20 hover:text-white/50 border border-white/5'}`} 
                    title="Nullable"
                  >
                    ?
                  </button>
                </div>

                <button onClick={() => handleDeleteRow(field.name)} className="opacity-0 group-hover/row:opacity-100 text-rose-500/50 hover:text-rose-400 transition-all bg-[#0A0A0A] ml-1 p-0.5 rounded" title="Remove Field">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              <Handle type="source" position={Position.Right} id={`source-${field.name}`} className="w-2 h-2 rounded-sm bg-[#0A0A0A] border border-white/40 -mr-[5px] opacity-0 group-hover/row:opacity-100 transition-opacity" />
            </div>
          ))
        )}
      </div>

      {/* Footer Controls (Add Field + AI Trigger Assistant) */}
      <div className="border-t border-white/5 p-2 bg-[#0A0A0A] rounded-b-lg flex items-center justify-between gap-2 nodrag nopan" onMouseDown={e => e.stopPropagation()}>
        <button 
          onClick={handleAddRow}
          className="flex-1 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-mono text-white/40 hover:text-white hover:bg-white/[0.04] rounded transition-all border border-dashed border-white/10 hover:border-white/20 group/btn"
        >
          <svg className="w-3 h-3 transition-transform group-hover/btn:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          ADD FIELD
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-sql-assistant', { detail: { entityId: id, entityName: entity.name } }));
          }}
          className={`px-3 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-mono rounded transition-all border ${
            attachedSnippets.length > 0 
              ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.2)]' 
              : 'bg-transparent text-white/40 border-white/10 hover:text-white hover:bg-white/[0.04] hover:border-white/20'
          }`}
          title="Add AI Database Trigger or Procedure"
        >
          <span className={attachedSnippets.length > 0 ? "text-indigo-400" : "opacity-70"}>⚡</span>
          {attachedSnippets.length > 0 ? `${attachedSnippets.length} SQL` : 'SQL'}
        </button>
      </div>
    </div>
  );
});

EntityNode.displayName = 'EntityNode';