import { memo } from 'react';
import {
  EdgeProps,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from 'reactflow';
import { useArchitectureStore } from '../../store/architectureStore';
import { SeedEngine } from '../../lib/seedEngine';
import type { UIEdgeData } from '../../lib/reactFlowAdapter';
import type { Relation } from '@zero-dollar/ir-core';

const FALLBACK_COLORS = [
  '#e08a3c', // amber
  '#8b7ff0', // violet
  '#3fc6d8', // cyan
  '#e0708f', // rose
  '#8fbf6b', // lime
];

const CARDINALITY_SHORT: Record<Relation['type'], string> = {
  ONE_TO_ONE: '1:1',
  ONE_TO_MANY: '1:N',
  MANY_TO_MANY: 'N:M',
};

export const RelationEdge = memo(
  ({
    id,
    source,
    target,
    sourceHandleId,
    targetHandleId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps<UIEdgeData>) => {
    const {
      present,
      openInspector,
      autoWireCompositeRelation,
    } = useArchitectureStore();

    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetPosition,
      targetX,
      targetY,
      borderRadius: 12,
    });

    const handleSrcField = sourceHandleId?.replace(/^source-/, '');
    const handleTgtField = targetHandleId?.replace(/^target-/, '');

    const relIndex = present.relations.findIndex(
      (r) =>
        r.sourceEntity === source &&
        r.targetEntity === target &&
        (!handleSrcField || !r.sourceField || r.sourceField === handleSrcField) &&
        (!handleTgtField || !r.targetField || r.targetField === handleTgtField)
    );

    const relation: Relation | undefined =
      data?.relation ||
      (relIndex !== -1 ? present.relations[relIndex] : undefined) ||
      present.relations.find(
        (r) => r.sourceEntity === source && r.targetEntity === target
      );

    const resolvedAll = SeedEngine.resolveAllRelations(present);
    const resolvedRel = resolvedAll.find(
      (r) =>
        r.rawRelation.sourceEntity === (relation?.sourceEntity ?? source) &&
        r.rawRelation.targetEntity === (relation?.targetEntity ?? target) &&
        (r.rawRelation.sourceField === relation?.sourceField ||
          r.parentPkField === handleSrcField) &&
        (r.rawRelation.targetField === relation?.targetField ||
          r.childFkField === handleTgtField)
    );

    const isIncompleteComposite =
      resolvedRel !== undefined && !resolvedRel.isCompleteComposite;

    const baseColor =
      data?.colorHex ||
      FALLBACK_COLORS[
        Math.abs(relIndex !== -1 ? relIndex : id.length) % FALLBACK_COLORS.length
      ];

    const strokeColor = isIncompleteComposite ? '#e08a3c' : baseColor;

    // Clicking the wire or badge opens the right-hand Inspector for the child FK column
    const handleOpenInSidebar = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (resolvedRel) {
        openInspector(resolvedRel.childEntity, resolvedRel.childFkField);
        return;
      }
      const targetEnt = present.entities.find((ent) => ent.name === target);
      const fieldToInspect =
        relation?.targetField ||
        handleTgtField ||
        targetEnt?.fields[0]?.name;
      if (target && fieldToInspect) {
        openInspector(target, fieldToInspect);
      }
    };

    return (
      <>
        {/* Wider invisible click target */}
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          onClick={handleOpenInSidebar}
          className="react-flow__edge-interaction cursor-pointer"
        />

        {/* Clean Stepped Edge Path (No glow) */}
        <path
          id={id}
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={selected ? 2.2 : 1.65}
          strokeOpacity={selected ? 1 : 0.78}
          strokeDasharray={isIncompleteComposite ? '6 4' : undefined}
          onClick={handleOpenInSidebar}
          className="transition-colors duration-150 cursor-pointer"
        />

        {/* Endpoint Dots */}
        <circle cx={sourceX} cy={sourceY} r={3} fill={strokeColor} />
        <circle cx={targetX} cy={targetY} r={3} fill={strokeColor} />

        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              borderColor: selected
                ? strokeColor
                : 'rgba(255, 255, 255, 0.09)',
            }}
            onClick={handleOpenInSidebar}
            title="Click to configure relation in sidebar"
            className="nodrag nopan flex items-center gap-1.5 bg-[#14161d] hover:bg-[#1a1d26] border rounded-full px-2 py-0.5 text-[9.5px] font-mono text-[#e8e8ee] cursor-pointer transition-colors"
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-none"
              style={{ backgroundColor: strokeColor }}
            />

            {isIncompleteComposite && resolvedRel ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  autoWireCompositeRelation(
                    resolvedRel.parentEntity,
                    resolvedRel.childEntity
                  );
                }}
                title={`Missing composite key field(s): ${resolvedRel.missingParentPkFields.join(
                  ', '
                )}. Click to auto-wire.`}
                className="flex items-center gap-1 text-[#e08a3c] font-semibold cursor-pointer"
              >
                <span>⚠️ 1/{resolvedRel.missingParentPkFields.length + 1} PK</span>
                <span className="bg-[#e08a3c] text-[#1a1206] px-1 rounded-full text-[8.5px]">
                  Fix
                </span>
              </button>
            ) : (
              <span style={{ color: strokeColor }} className="font-semibold">
                {relation ? CARDINALITY_SHORT[relation.type] : '1:N'}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

RelationEdge.displayName = 'RelationEdge';