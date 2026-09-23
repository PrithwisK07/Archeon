import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from 'reactflow';
import { useArchitectureStore } from '../../store/architectureStore';
import type { Relation } from '@zero-dollar/ir-core';

const CARDINALITY_OPTIONS = [
  { value: 'ONE_TO_ONE', label: '1 : 1' },
  { value: 'ONE_TO_MANY', label: '1 : N' },
  { value: 'MANY_TO_MANY', label: 'M : N' },
] as const;

export const RelationEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<{ relation: Relation }>) => {
  const dispatchManualAction = useArchitectureStore(s => s.dispatchManualAction);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const relation = data?.relation;
  if (!relation) return null;

  const handleCardinalityChange = (type: Relation['type']) => {
    dispatchManualAction({
      action: "UPDATE_RELATION",
      sourceEntity: relation.sourceEntity,
      targetEntity: relation.targetEntity,
      sourceField: relation.sourceField, 
      targetField: relation.targetField, 
      payload: { type }
    });
    setDropdownOpen(false);
  };

  const handleOnDeleteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatchManualAction({
      action: "UPDATE_RELATION",
      sourceEntity: relation.sourceEntity,
      targetEntity: relation.targetEntity,
      sourceField: relation.sourceField,
      targetField: relation.targetField,
      payload: { onDelete: e.target.value as Relation['onDelete'] }
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchManualAction({
      action: "REMOVE_RELATION",
      sourceEntity: relation.sourceEntity,
      targetEntity: relation.targetEntity,
      sourceField: relation.sourceField, 
      targetField: relation.targetField  
    });
  };

  const currentLabel = CARDINALITY_OPTIONS.find(o => o.value === relation.type)?.label || '1 : 1';

  return (
    <>
      {/* Explicitly adding Tailwind stroke classes ensures the line is always visible */}
      <BaseEdge 
        id={id}
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          stroke: style?.stroke ?? 'rgba(255, 255, 255, 0.2)',
          strokeWidth: style?.strokeWidth ?? 2,
        }}
      />
      
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex items-center gap-1.5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Fully Custom Dropdown for Cardinality */}
          <div className="relative flex items-center">
            {dropdownOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            )}
            
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="relative z-10 flex items-center gap-2 bg-[#111111] hover:bg-[#18181b] text-indigo-300 font-mono text-[10px] font-bold px-2.5 py-1 rounded-md border border-indigo-500/30 shadow-lg outline-none cursor-pointer transition-all"
            >
              <span>{currentLabel}</span>
              <svg className="w-2.5 h-2.5 text-indigo-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute top-full mt-1 left-0 bg-[#111111] border border-indigo-500/30 rounded-md shadow-2xl z-50 overflow-hidden py-1 w-full min-w-[70px]">
                {CARDINALITY_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleCardinalityChange(option.value as Relation['type'])}
                    className="w-full text-center px-2 py-1.5 text-[10px] font-mono font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Native Styled Dropdown for OnDelete Cascade Rules */}
          <div className="relative flex items-center bg-[#111111] hover:bg-[#18181b] rounded-md border border-amber-500/30 shadow-lg transition-all overflow-hidden">
            <select
              value={relation.onDelete || 'RESTRICT'}
              onChange={handleOnDeleteChange}
              title="On Delete Action"
              className="bg-transparent text-amber-300 font-mono text-[9px] font-bold px-2 py-1 pr-6 outline-none cursor-pointer appearance-none text-center"
            >
              <option value="RESTRICT" className="bg-[#111111] text-amber-300">RESTRICT</option>
              <option value="CASCADE" className="bg-[#111111] text-amber-300">CASCADE</option>
              <option value="SET NULL" className="bg-[#111111] text-amber-300">SET NULL</option>
              <option value="SET DEFAULT" className="bg-[#111111] text-amber-300">SET DEFAULT</option>
            </select>
            <div className="absolute right-1.5 pointer-events-none">
              <svg className="w-2.5 h-2.5 text-amber-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <button 
            onClick={handleDelete} 
            className="text-rose-400 bg-[#111111] hover:bg-rose-500/20 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md border border-rose-500/30 transition-all hover:scale-105 ml-0.5"
            title="Delete Relation"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

RelationEdge.displayName = 'RelationEdge';