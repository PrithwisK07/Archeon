import type { CanonicalIR, Entity, Relation } from '@zero-dollar/ir-core';

export interface OrchestratedContext {
  globalSkeleton: string;
  localMuscle: {
    targetEntity: Entity | null;
    neighbors: Entity[];
    relevantRelations: Relation[];
  };
}

export class ContextOrchestrator {
  /**
   * Tier 1: The Global Skeleton
   * Compresses a 50,000-token IR into a <100 token text map.
   * Gives the LLM global awareness without bloating the context window.
   */
  public static generateGlobalSkeleton(ir: CanonicalIR): string {
    let skeleton = "SYSTEM ARCHITECTURE SKELETON:\n";
    
    for (const entity of ir.entities) {
      // Find all relations connected to this entity
      const relations = ir.relations.filter(
        r => r.sourceEntity === entity.name || r.targetEntity === entity.name
      );

      const relationStrings = relations.map(r => {
        const direction = r.sourceEntity === entity.name ? "OUT" : "IN";
        const otherEntity = r.sourceEntity === entity.name ? r.targetEntity : r.sourceEntity;
        return `[${direction}: ${r.type} with ${otherEntity}]`;
      });

      skeleton += `- ${entity.name} ${relationStrings.join(", ")}\n`;
    }

    return skeleton;
  }

  /**
   * Tier 2: The Local Muscle (1-Degree Radius Traversal)
   * Extracts deep JSON only for the target entity and its immediate neighbors.
   */
  public static extractLocalMuscle(ir: CanonicalIR, targetEntityName: string) {
    const targetEntity = ir.entities.find(e => e.name === targetEntityName) || null;
    
    if (!targetEntity) {
      return { targetEntity: null, neighbors: [], relevantRelations: [] };
    }

    // Find all relations involving the target
    const relevantRelations = ir.relations.filter(
      r => r.sourceEntity === targetEntityName || r.targetEntity === targetEntityName
    );

    // Extract exactly 1-degree of separation neighbors
    const neighborNames = new Set<string>();
    relevantRelations.forEach(r => {
      if (r.sourceEntity !== targetEntityName) neighborNames.add(r.sourceEntity);
      if (r.targetEntity !== targetEntityName) neighborNames.add(r.targetEntity);
    });

    const neighbors = ir.entities.filter(e => neighborNames.has(e.name));

    return {
      targetEntity,
      neighbors,
      relevantRelations
    };
  }

  /**
   * The Main Middleware function.
   * Analyzes the user's prompt, extracts the inferred target, and builds the payload.
   */
  public static buildAIPayload(ir: CanonicalIR, userPrompt: string, activeEntityName?: string): OrchestratedContext {
    // 1. Generate the Global Skeleton (always included)
    const globalSkeleton = this.generateGlobalSkeleton(ir);

    // 2. Identify Target Entity. 
    // Fallback to basic keyword extraction if the user isn't clicking a specific node on the canvas.
    let target = activeEntityName;
    if (!target) {
      const possibleTargets = ir.entities.filter(e => userPrompt.includes(e.name));
      if (possibleTargets.length > 0) {
        target = possibleTargets[0].name; // Best-effort keyword extraction
      }
    }

    // 3. Extract the 1-Degree Local Muscle
    const localMuscle = target 
      ? this.extractLocalMuscle(ir, target)
      : { targetEntity: null, neighbors: [], relevantRelations: [] };

    return { globalSkeleton, localMuscle };
  }
}