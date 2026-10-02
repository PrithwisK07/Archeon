import type { Node, Edge } from "reactflow";
import type { CanonicalIR, Relation, Entity } from "@zero-dollar/ir-core";
import { SeedEngine } from "./seedEngine";

export const NEXUS_COLORS = {
  violet: "#8b7ff0",
  cyan: "#3fc6d8",
  amber: "#e08a3c",
  rose: "#e0708f",
  lime: "#8fbf6b",
} as const;

export type ArcheonColorKey = keyof typeof NEXUS_COLORS;

const PALETTE_KEYS: ArcheonColorKey[] = [
  "violet",
  "cyan",
  "amber",
  "rose",
  "lime",
];

export interface UINodeData {
  entity: Entity;
  colorKey: ArcheonColorKey;
  colorHex: string;
  fkFields: string[];
}

export interface UIEdgeData {
  relation: Relation;
  colorHex: string;
}

export class ReactFlowAdapter {
  public static generateNodes(ir: CanonicalIR): Node<UINodeData>[] {
    const resolvedRels = SeedEngine.resolveAllRelations(ir);

    return ir.entities.map((entity, index) => {
      const colorKey = PALETTE_KEYS[index % PALETTE_KEYS.length];
      const colorHex = NEXUS_COLORS[colorKey];

      const fkSet = new Set<string>();
      resolvedRels.forEach((rel) => {
        if (rel.childEntity === entity.name) {
          fkSet.add(rel.childFkField);
        }
      });

      return {
        id: entity.name,
        type: "entityNode",
        position: {
          x: 60 + 290 * (index % 3),
          y: 60 + 260 * Math.floor(index / 3),
        },
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

    const resolvedRels = SeedEngine.resolveAllRelations(ir);

    return ir.relations.map((relation, index) => {
      const resolved = resolvedRels.find((r) => r.rawRelation === relation);
      const sourceEntity = ir.entities.find(
        (e) => e.name === relation.sourceEntity,
      );
      const targetEntity = ir.entities.find(
        (e) => e.name === relation.targetEntity,
      );

      const resolvedSourceField =
        relation.sourceField ||
        (resolved?.parentEntity === relation.sourceEntity
          ? resolved.parentPkField
          : resolved?.childFkField) ||
        sourceEntity?.fields.find((f) => f.isPrimaryKey || f.name === "id")
          ?.name ||
        sourceEntity?.fields[0]?.name;

      const resolvedTargetField =
        (relation.targetField && relation.targetField !== "id"
          ? relation.targetField
          : undefined) ||
        (resolved?.childEntity === relation.targetEntity
          ? resolved.childFkField
          : resolved?.parentPkField) ||
        relation.targetField ||
        targetEntity?.fields[0]?.name;

      const srcStr = resolvedSourceField || "id";
      const tgtStr = resolvedTargetField || "id";
      const edgeId = `rel_${relation.sourceEntity}_${srcStr}_${relation.targetEntity}_${tgtStr}_${index}`;
      const colorHex =
        entityColorMap.get(relation.sourceEntity) || NEXUS_COLORS.violet;

      return {
        id: edgeId,
        source: relation.sourceEntity,
        target: relation.targetEntity,
        sourceHandle: resolvedSourceField
          ? `source-${resolvedSourceField}`
          : undefined,
        targetHandle: resolvedTargetField
          ? `target-${resolvedTargetField}`
          : undefined,
        type: "relationEdge",
        data: { relation, colorHex },
      };
    });
  }
}
