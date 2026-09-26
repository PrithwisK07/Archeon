import { memo, useState } from 'react';
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';
import { useArchitectureStore } from '../../store/architectureStore';
import type { UIEdgeData } from '../../lib/reactFlowAdapter';
import type { Relation } from '@zero-dollar/ir-core';

const CARDINALITY_OPTIONS = [
  { value: 'ONE_TO_ONE', label: '1:1' },
  { value: 'ONE_TO_MANY', label: '1:N' },
  { value: 'MANY_TO_MANY', label: 'M:N' },
] as const;

export const RelationEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
  }: EdgeProps<UIEdgeData>) => {
    const dispatchManualAction = useArchitectureStore((s) => s.dispatchManualAction);
    const showToast = useArchitectureStore((s) => s.showToast);
    const [hovered, setHovered] = useState(false);

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const relation = data?.relation;
    const strokeColor = data?.colorHex || '#8b7ff0';

    if (!relation) return null;

    const handleCardinalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      dispatchManualAction({
        action: 'UPDATE_RELATION',
        sourceEntity: relation.sourceEntity,
        targetEntity: relation.targetEntity,
        sourceField: relation.sourceField,
        targetField: relation.targetField,
        payload: { type: e.target.value as Relation['type'] },
      });
    };

    const handleOnDeleteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      dispatchManualAction({
        action: 'UPDATE_RELATION',
        sourceEntity: relation.sourceEntity,
        targetEntity: relation.targetEntity,
        sourceField: relation.sourceField,
        targetField: relation.targetField,
        payload: { onDelete: e.target.value as Relation['onDelete'] },
      });
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatchManualAction({
        action: 'REMOVE_RELATION',
        sourceEntity: relation.sourceEntity,
        targetEntity: relation.targetEntity,
        sourceField: relation.sourceField,
        targetField: relation.targetField,
      });
      showToast('Relationship removed');
    };

    const showControls = hovered || selected;

    return (
      <>
        <g
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="cursor-pointer"
        >
          {/* Invisible wider hit area for smooth hovering */}
          <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18} />

          {/* Outer Soft Glow */}
          <path
            d={edgePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={selected || hovered ? 7 : 5}
            style={{
              opacity: selected || hovered ? 0.2 : 0.09,
              filter: 'blur(1px)',
              transition: 'opacity 0.15s, stroke-width 0.15s',
            }}
          />

          {/* Main Crisp Bezier Path */}
          <path
            id={id}
            d={edgePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={selected || hovered ? 2.1 : 1.6}
            style={{
              opacity: selected || hovered ? 0.95 : 0.75,
              transition: 'opacity 0.15s, stroke-width 0.15s',
            }}
          />

          {/* Endpoint Dots */}
          <circle cx={sourceX} cy={sourceY} r={3} fill={strokeColor} />
          <circle cx={targetX} cy={targetY} r={3} fill={strokeColor} />
        </g>

        <EdgeLabelRenderer>
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: showControls ? 'all' : 'none',
            }}
            className={`nodrag nopan flex items-center gap-1 bg-[#14161d]/95 backdrop-blur-md border border-white/[0.12] rounded-full px-2 py-0.5 shadow-xl transition-opacity duration-150 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Cardinality Select */}
            <select
              value={relation.type}
              onChange={handleCardinalityChange}
              className="bg-transparent text-[10px] font-mono font-semibold text-[#8b7ff0] outline-none cursor-pointer"
              title="Relationship Cardinality"
            >
              {CARDINALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#14161d] text-[#e8e8ee]">
                  {opt.label}
                </option>
              ))}
            </select>

            <span className="text-white/15 text-[10px]">·</span>

            {/* OnDelete Cascade Rule Select */}
            <select
              value={relation.onDelete || 'RESTRICT'}
              onChange={handleOnDeleteChange}
              className="bg-transparent text-[9.5px] font-mono text-[#e08a3c] outline-none cursor-pointer"
              title="On Delete Behavior"
            >
              <option value="RESTRICT" className="bg-[#14161d] text-[#e8e8ee]">
                RESTRICT
              </option>
              <option value="CASCADE" className="bg-[#14161d] text-[#e8e8ee]">
                CASCADE
              </option>
              <option value="SET NULL" className="bg-[#14161d] text-[#e8e8ee]">
                SET NULL
              </option>
              <option value="SET DEFAULT" className="bg-[#14161d] text-[#e8e8ee]">
                SET DEFAULT
              </option>
            </select>

            {/* Delete Relation Button */}
            <button
              type="button"
              onClick={handleDelete}
              className="ml-0.5 w-3.5 h-3.5 rounded-full text-[#8a8b9a] hover:text-[#e0708f] hover:bg-[#e0708f]/15 flex items-center justify-center text-[11px] leading-none cursor-pointer"
              title="Delete relation"
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

RelationEdge.displayName = 'RelationEdge';