import type { Node, Edge } from 'reactflow';
import type { CanonicalIR, Relation, Entity } from '@zero-dollar/ir-core';

export const NEXUS_COLORS = {
  violet: '#8b7ff0',
  cyan: '#3fc6d8',
  amber: '#e08a3c',
  rose: '#e0708f',
  lime: '#8fbf6b',
} as const;

export type NexusColorKey = keyof typeof NEXUS_COLORS;

const PALETTE_KEYS: NexusColorKey[] = ['violet', 'cyan', 'amber', 'rose', 'lime'];

export interface UINodeData {
  entity: Entity;
  colorKey: NexusColorKey;
  colorHex: string;
  fkFields: string[];
}

export interface UIEdgeData {
  relation: Relation;
  colorHex: string;
}

export class ReactFlowAdapter {
  public static generateNodes(ir: CanonicalIR): Node<UINodeData>[] {
    return ir.entities.map((entity, index) => {
      const colorKey = PALETTE_KEYS[index % PALETTE_KEYS.length];
      const colorHex = NEXUS_COLORS[colorKey];

      // Identify Foreign Key fields on this entity from incoming or outgoing relations
      const fkSet = new Set<string>();
      ir.relations.forEach((rel) => {
        if (rel.targetEntity === entity.name) {
          if (rel.targetField) {
            fkSet.add(rel.targetField);
          } else {
            const conventional = `${rel.sourceEntity.toLowerCase()}Id`;
            const snakeConventional = `${rel.sourceEntity.toLowerCase()}_id`;
            if (entity.fields.some((f) => f.name === conventional)) fkSet.add(conventional);
            if (entity.fields.some((f) => f.name === snakeConventional)) fkSet.add(snakeConventional);
          }
        }
        if (rel.sourceEntity === entity.name && rel.sourceField && rel.sourceField !== 'id') {
          fkSet.add(rel.sourceField);
        }
      });

      return {
        id: entity.name,
        type: 'entityNode',
        position: { x: 60 + 290 * (index % 3), y: 60 + 260 * Math.floor(index / 3) },
        data: {
          entity,
          colorKey,
          colorHex,
          fkFields: Array.from(fkSet),
        },
        deletable: false,
      };
    });
  }

  public static generateEdges(ir: CanonicalIR): Edge<UIEdgeData>[] {
    const entityColorMap = new Map<string, string>();
    ir.entities.forEach((e, idx) => {
      const key = PALETTE_KEYS[idx % PALETTE_KEYS.length];
      entityColorMap.set(e.name, NEXUS_COLORS[key]);
    });

    return ir.relations.map((relation, index) => {
      const srcStr = relation.sourceField || 'id';
      const tgtStr = relation.targetField || 'id';
      const edgeId = `rel_${relation.sourceEntity}_${srcStr}_${relation.targetEntity}_${tgtStr}_${index}`;
      const colorHex = entityColorMap.get(relation.sourceEntity) || NEXUS_COLORS.violet;

      // Resolve handles to existing fields if possible
      const sourceEntity = ir.entities.find((e) => e.name === relation.sourceEntity);
      const targetEntity = ir.entities.find((e) => e.name === relation.targetEntity);

      const resolvedSourceField =
        relation.sourceField ||
        sourceEntity?.fields.find((f) => f.isPrimaryKey || f.name === 'id')?.name ||
        sourceEntity?.fields[0]?.name;

      const resolvedTargetField =
        relation.targetField ||
        targetEntity?.fields.find(
          (f) =>
            f.name === `${relation.sourceEntity.toLowerCase()}_id` ||
            f.name === `${relation.sourceEntity.toLowerCase()}Id` ||
            f.isPrimaryKey ||
            f.name === 'id'
        )?.name ||
        targetEntity?.fields[0]?.name;

      return {
        id: edgeId,
        source: relation.sourceEntity,
        target: relation.targetEntity,
        sourceHandle: resolvedSourceField ? `source-${resolvedSourceField}` : undefined,
        targetHandle: resolvedTargetField ? `target-${resolvedTargetField}` : undefined,
        type: 'relationEdge',
        data: { relation, colorHex },
      };
    });
  }
}