import type { Node, Edge } from 'reactflow';
import { MarkerType as RFMarkerType } from 'reactflow';
import type { CanonicalIR, Relation, Entity } from '@zero-dollar/ir-core';

// Formal boundary separating Domain Data from UI Data
export interface UINodeData {
  entity: Entity;
  // Future UI-only state (e.g., validation warnings, glowing outlines) can live here
}

export class ReactFlowAdapter {
  
  public static generateNodes(ir: CanonicalIR): Node<UINodeData>[] {
    return ir.entities.map((entity, index) => ({
      id: entity.name, 
      type: 'entityNode', 
      position: { x: 250 * (index % 4), y: 300 * Math.floor(index / 4) },
      data: { entity }, // Encapsulated in UI data type
      deletable: false, 
    }));
  }

  public static generateEdges(ir: CanonicalIR): Edge[] {
    return ir.relations.map((relation, index) => {
      // FIX: Include fields in edge ID to prevent React Flow key collisions
      const srcStr = relation.sourceField || 'table';
      const tgtStr = relation.targetField || 'table';
      const edgeId = `rel_${relation.sourceEntity}_${srcStr}_${relation.targetEntity}_${tgtStr}_${index}`;

      return {
        id: edgeId,
        source: relation.sourceEntity,
        target: relation.targetEntity,
        sourceHandle: relation.sourceField ? `source-${relation.sourceField}` : undefined,
        targetHandle: relation.targetField ? `target-${relation.targetField}` : undefined,
        type: 'relationEdge', 
        data: { relation },
        animated: true,
        style: { stroke: '#4f46e5', strokeWidth: 2 },
        markerEnd: {
          type: RFMarkerType.ArrowClosed,
          color: '#4f46e5',
        },
      };
    });
  }

  private static formatRelationLabel(type: Relation['type']): string {
    switch (type) {
      case 'ONE_TO_ONE': return '1 : 1';
      case 'ONE_TO_MANY': return '1 : N';
      case 'MANY_TO_MANY': return 'M : N';
      default: return '';
    }
  }
}