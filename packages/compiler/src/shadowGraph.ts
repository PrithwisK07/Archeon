import type { CanonicalIR, MasterAction } from "@zero-dollar/ir-core";

export class ShadowGraph {
  /**
   * Applies actions to a cloned IR and validates semantic constraints.
   * Throws detailed errors if the AI hallucinates invalid connections.
   */
  public static simulateAndValidate(
    currentIR: CanonicalIR,
    actions: MasterAction[],
  ): CanonicalIR {
    // 1. Deep clone ensures the live Zustand state is NEVER mutated
    const shadowIR: CanonicalIR = JSON.parse(JSON.stringify(currentIR));

    // 2. Apply AI Actions to the Candidate IR
    for (const action of actions) {
      this.applyAction(shadowIR, action);
    }

    // 3. Post-Patch Validation: Semantic Integrity
    this.validateSemanticInvariants(shadowIR);

    return shadowIR;
  }

  private static applyAction(ir: CanonicalIR, action: MasterAction) {
    const entityExists = (name: string) =>
      ir.entities.some((e) => e.name === name);

    switch (action.action) {
      // --- ENTITIES ---
      case "ADD_ENTITY":
        ir.entities.push(action.payload);
        break;
      case "REMOVE_ENTITY":
        if (!entityExists(action.targetEntity))
          throw new Error(
            `Cannot remove entity: ${action.targetEntity} does not exist.`,
          );
        ir.entities = ir.entities.filter((e) => e.name !== action.targetEntity);
        ir.relations = ir.relations.filter(
          (r) =>
            r.sourceEntity !== action.targetEntity &&
            r.targetEntity !== action.targetEntity,
        );
        ir.endpoints = ir.endpoints.filter(
          (e) => e.targetEntity !== action.targetEntity,
        );
        break;
      case "UPDATE_ENTITY": {
        // FIX: Verify existence BEFORE applying cascade updates
        if (!entityExists(action.targetEntity)) {
          throw new Error(`Cannot update entity: ${action.targetEntity} does not exist.`);
        }
        
        const oldName = action.targetEntity;
        const newName = action.payload.name;
        
        if (newName && newName !== oldName) {
          // Cascade renames
          ir.relations.forEach(r => {
            if (r.sourceEntity === oldName) r.sourceEntity = newName;
            if (r.targetEntity === oldName) r.targetEntity = newName;
          });
          ir.endpoints.forEach(e => {
            if (e.targetEntity === oldName) e.targetEntity = newName;
          });
        }  
        
        const entityIndex = ir.entities.findIndex(
          (e) => e.name === action.targetEntity,
        );
        ir.entities[entityIndex] = {
          ...ir.entities[entityIndex],
          ...action.payload,
        };
        break;
      }

      // --- FIELDS ---
      case "ADD_FIELD":
        if (!entityExists(action.targetEntity))
          throw new Error(`Cannot add field to ${action.targetEntity}.`);
        ir.entities
          .find((e) => e.name === action.targetEntity)
          ?.fields.push(action.payload);
        break;
      case "REMOVE_FIELD":
        ir.relations = ir.relations.filter(r => 
          !(r.sourceEntity === action.targetEntity && r.sourceField === action.targetField) &&
          !(r.targetEntity === action.targetEntity && r.targetField === action.targetField)
        );
        
        const targetForRemove = ir.entities.find(
          (e) => e.name === action.targetEntity,
        );
        if (targetForRemove) {
          targetForRemove.fields = targetForRemove.fields.filter(
            (f) => f.name !== action.targetField,
          );
        }
        break;
      case "UPDATE_FIELD":
        const targetForUpdate = ir.entities.find(
          (e) => e.name === action.targetEntity,
        );
        if (targetForUpdate) {
          const fieldIdx = targetForUpdate.fields.findIndex(
            (f) => f.name === action.targetField,
          );
          if (fieldIdx > -1) {
            targetForUpdate.fields[fieldIdx] = {
              ...targetForUpdate.fields[fieldIdx],
              ...action.payload,
            };
          }
        }
        break;

      // --- RELATIONS ---
      case "ADD_RELATION":
        ir.relations.push(action.payload);
        break;
      case "REMOVE_RELATION":
        ir.relations = ir.relations.filter(
          (r) =>
            !(
              // FIX: Include all 4 composite keys to prevent accidental deletion
              r.sourceEntity === action.sourceEntity &&
              r.targetEntity === action.targetEntity &&
              r.sourceField === action.sourceField &&
              r.targetField === action.targetField
            ),
        );
        break;
      case "UPDATE_RELATION":
        const relIdx = ir.relations.findIndex(
          (r) =>
            // FIX: Include all 4 composite keys to target the exact relation
            r.sourceEntity === action.sourceEntity &&
            r.targetEntity === action.targetEntity &&
            r.sourceField === action.sourceField &&
            r.targetField === action.targetField
        );
        if (relIdx > -1) {
          ir.relations[relIdx] = { ...ir.relations[relIdx], ...action.payload };
        }
        break;

      // --- ENDPOINTS & CONFIG (Basic Push/Merge) ---
      case "ADD_ENDPOINT":
        ir.endpoints.push(action.payload);
        break;
      case "REMOVE_ENDPOINT":
        ir.endpoints = ir.endpoints.filter(
          (e) =>
            !(e.path === action.targetPath && e.method === action.targetMethod),
        );
        break;
      case "UPDATE_PROJECT_CONFIG":
        ir.config = { ...ir.config, ...action.payload };
        break;
    }
  }

  private static validateSemanticInvariants(ir: CanonicalIR) {
    const entityNames = new Set(ir.entities.map((e) => e.name));

    // Invariant 1: Uniqueness
    if (entityNames.size !== ir.entities.length) {
      throw new Error("Semantic Violation: Duplicate entity names detected.");
    }

    // Invariant 2: Referential Integrity for Relations
    for (const relation of ir.relations) {
      if (!entityNames.has(relation.sourceEntity)) {
        throw new Error(
          `Referential Integrity Violation: Source entity '${relation.sourceEntity}' does not exist.`,
        );
      }
      if (!entityNames.has(relation.targetEntity)) {
        throw new Error(
          `Referential Integrity Violation: Target entity '${relation.targetEntity}' does not exist.`,
        );
      }
    }

    // Invariant 3: Referential Integrity for Endpoints
    for (const endpoint of ir.endpoints) {
      if (endpoint.targetEntity && !entityNames.has(endpoint.targetEntity)) {
        throw new Error(
          `Referential Integrity Violation: Endpoint targets entity '${endpoint.targetEntity}', which does not exist.`,
        );
      }
    }
  }
}