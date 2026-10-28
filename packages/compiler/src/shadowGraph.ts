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

    // 2. Pre-validate specific dangerous actions before applying them
    for (const action of actions) {
      if (action.action === 'UPDATE_FIELD' || action.action === 'ADD_FIELD') {
        const payload = action.payload as any;
        
        const entity = shadowIR.entities.find((e) => e.name === action.targetEntity);
        const field = action.action === 'UPDATE_FIELD'
          ? entity?.fields.find((f) => f.name === action.targetField)
          : undefined;
        
        const isCurrentlyPk = field?.isPrimaryKey;
        const isBecomingPk = payload.isPrimaryKey === true;
        const isPk = isCurrentlyPk || isBecomingPk;

        const nextType = payload.type || field?.type;

        if (isPk && nextType) {
          const invalidPkTypes = ['boolean', 'json', 'datetime', 'text'];
          if (invalidPkTypes.includes(nextType.toLowerCase())) {
            throw new Error(
              `Schema Error: Primary keys cannot be of type '${nextType}'. They must be 'uuid', 'string', or 'number'.`
            );
          }
        }
      }
      
      if (action.action === 'ADD_ENTITY') {
        const payload = action.payload as any;
        const fields = payload.fields || [];
        for (const f of fields) {
          if (f.isPrimaryKey) {
             const invalidPkTypes = ['boolean', 'json', 'datetime', 'text'];
             if (invalidPkTypes.includes(f.type?.toLowerCase())) {
               throw new Error(
                 `Schema Error: Primary key '${f.name}' in new table cannot be of type '${f.type}'.`
               );
             }
          }
        }
      }
    }

    // 3. Apply AI Actions to the Candidate IR
    for (const action of actions) {
      this.applyAction(shadowIR, action);
    }

    // 4. Post-Patch Validation: Semantic Integrity
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
    const RESERVED_KEYWORDS = new Set([
      "select", "table", "update", "delete", "insert", "where", "user", "group", "order", "by", "prismaclient", "model", "view", "index", "unique", "primary", "key"
    ]);
    const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;

    const entityNames = new Set<string>();

    // 1. Entity and Field Level Constraints
    for (const entity of ir.entities) {
      // 1a. Naming and Reserved Keywords
      if (!NAME_REGEX.test(entity.name)) throw new Error(`Schema Violation: Invalid entity name '${entity.name}'. Must start with a letter and contain only alphanumeric characters or underscores (max 63 chars).`);
      if (RESERVED_KEYWORDS.has(entity.name.toLowerCase())) throw new Error(`Schema Violation: '${entity.name}' is a reserved SQL/ORM keyword and cannot be used as a table name.`);
      if (entityNames.has(entity.name.toLowerCase())) throw new Error(`Schema Violation: Duplicate entity name '${entity.name}' detected.`);
      entityNames.add(entity.name.toLowerCase());

      const fieldNames = new Set<string>();
      let hasPrimaryKey = false;

      for (const field of entity.fields) {
        if (!NAME_REGEX.test(field.name)) throw new Error(`Schema Violation: Invalid field name '${entity.name}.${field.name}'.`);
        if (RESERVED_KEYWORDS.has(field.name.toLowerCase())) throw new Error(`Schema Violation: '${field.name}' is a reserved keyword.`);
        if (fieldNames.has(field.name.toLowerCase())) throw new Error(`Schema Violation: Duplicate field name '${field.name}' in entity '${entity.name}'.`);
        fieldNames.add(field.name.toLowerCase());

        // 1b. Primary Key Integrity
        if (field.isPrimaryKey) {
          hasPrimaryKey = true;
          if (field.nullable) throw new Error(`Schema Violation: Primary Key '${entity.name}.${field.name}' cannot be nullable.`);
          if (['boolean', 'json', 'datetime'].includes(field.type)) throw new Error(`Schema Violation: Primary Key '${entity.name}.${field.name}' cannot be of type '${field.type}'.`);
        }

        // 1c. Uniqueness Constraints
        if (field.unique && field.type === 'boolean') {
          throw new Error(`Schema Violation: Boolean field '${entity.name}.${field.name}' cannot be marked unique, as it would limit the table to exactly two rows.`);
        }
      }

      // 1d. Mandatory PK Check
      if (!hasPrimaryKey && (!entity.primaryKey || entity.primaryKey.length === 0)) {
        throw new Error(`Schema Violation: Entity '${entity.name}' must have at least one Primary Key field or a composite Primary Key.`);
      }

      // 1e. Composite Index Validation
      if (entity.indexes) {
        for (const idx of entity.indexes) {
          for (const f of idx.fields) {
            if (!fieldNames.has(f.toLowerCase())) throw new Error(`Schema Violation: Index on '${entity.name}' references non-existent field '${f}'.`);
          }
        }
      }
    }

    // 2. Relational Physics (Foreign Keys)
    for (const relation of ir.relations) {
      const srcEnt = ir.entities.find(e => e.name.toLowerCase() === relation.sourceEntity.toLowerCase());
      const tgtEnt = ir.entities.find(e => e.name.toLowerCase() === relation.targetEntity.toLowerCase());

      if (!srcEnt || !tgtEnt) {
        throw new Error(`Referential Violation: Relation connects missing entities ('${relation.sourceEntity}' -> '${relation.targetEntity}').`);
      }

      // 2a. Strict Type Equivalence & Arity
      if (relation.sourceField && relation.targetField) {
        const srcF = srcEnt.fields.find(f => f.name === relation.sourceField);
        const tgtF = tgtEnt.fields.find(f => f.name === relation.targetField);

        if (!srcF) throw new Error(`Referential Violation: Source field '${relation.sourceField}' missing on '${srcEnt.name}'.`);
        if (!tgtF) throw new Error(`Referential Violation: Target field '${relation.targetField}' missing on '${tgtEnt.name}'.`);

        if (srcF.type !== tgtF.type) {
          throw new Error(`Type Mismatch: Foreign key '${srcEnt.name}.${srcF.name}' (${srcF.type}) must exactly match target '${tgtEnt.name}.${tgtF.name}' (${tgtF.type}).`);
        }

        if (relation.type === 'ONE_TO_ONE' && !srcF.unique && !srcF.isPrimaryKey) {
          throw new Error(`Cardinality Violation: ONE_TO_ONE relation requires the foreign key '${srcEnt.name}.${srcF.name}' to be marked as @unique.`);
        }
      }
    }

    // 3. Endpoint Integrity
    for (const endpoint of ir.endpoints) {
      if (endpoint.targetEntity && !entityNames.has(endpoint.targetEntity.toLowerCase())) {
        throw new Error(`Referential Violation: Endpoint targets missing entity '${endpoint.targetEntity}'.`);
      }
    }
  }
}