import type { CanonicalIR } from '@zero-dollar/ir-core';
import {
  ResolvedRelation,
  SeedResult,
  isFieldPk,
  resolveAllRelations,
} from './seeder/relationResolver';
import { coerceCellValue, createBlankRow } from './seeder/valueGenerator';
import { generateRowsForEntity } from './seeder/rowGenerator';
import {
  clearTableWithIntegrity,
  deleteRowWithIntegrity,
  reconcileAllForeignKeys,
  synchronizeSchemaAndData,
  updateCellWithIntegrity,
  validateRowConstraints,
} from './seeder/integrityManager';

export { isFieldPk };
export type { SeedResult, ResolvedRelation };

export class SeedEngine {
  public static resolveAllRelations = resolveAllRelations;
  public static createBlankRow = createBlankRow;
  public static coerceCellValue = coerceCellValue;
  public static reconcileAllForeignKeys = reconcileAllForeignKeys;
  public static synchronizeSchemaAndData = synchronizeSchemaAndData;
  public static updateCellWithIntegrity = updateCellWithIntegrity;
  public static validateRowConstraints = validateRowConstraints;
  public static deleteRowWithIntegrity = deleteRowWithIntegrity;
  public static clearTableWithIntegrity = clearTableWithIntegrity;

  public static validateForeignKeys(
    ir: CanonicalIR,
    entityName: string,
    payload: Record<string, any>
  ): void {
    validateRowConstraints(ir, entityName, payload, -1);
  }

  /**
   * Seeds `count` rows into `entityName`, automatically seeding any empty parent
   * tables first (post-order DFS) to guarantee 100% foreign key referential integrity.
   */
  public static seedEntityWithDependencies(
    ir: CanonicalIR,
    entityName: string,
    count = 5
  ): SeedResult {
    const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
    const resolvedRelations = resolveAllRelations(workingIR);
    const autoSeededParents: string[] = [];
    const visiting = new Set<string>();

    const seedRecursive = (targetName: string, neededCount: number) => {
      if (visiting.has(targetName)) return;
      visiting.add(targetName);

      const entity = workingIR.entities.find((e) => e.name === targetName);
      if (!entity) {
        visiting.delete(targetName);
        return;
      }

      const parentDeps = resolvedRelations.filter(
        (r) => r.childEntity === targetName && r.parentEntity !== targetName
      );

      for (const dep of parentDeps) {
        const parentEntity = workingIR.entities.find((e) => e.name === dep.parentEntity);
        if (!parentEntity) continue;

        const existingParentRows = parentEntity.seedData?.length || 0;
        const existingChildRows = entity.seedData?.length || 0;

        if (dep.type === 'ONE_TO_ONE') {
          const requiredParentTotal = existingChildRows + neededCount;
          if (existingParentRows < requiredParentTotal) {
            seedRecursive(parentEntity.name, requiredParentTotal - existingParentRows);
            autoSeededParents.push(parentEntity.name);
          }
        } else if (existingParentRows === 0) {
          seedRecursive(parentEntity.name, Math.max(5, neededCount));
          autoSeededParents.push(parentEntity.name);
        }
      }

      const targetEntity = workingIR.entities.find((e) => e.name === targetName)!;
      const existingRows = targetEntity.seedData || [];
      const generatedRows = generateRowsForEntity(
        workingIR,
        resolvedRelations,
        targetEntity,
        existingRows,
        neededCount
      );

      targetEntity.seedData = [...existingRows, ...generatedRows];
      visiting.delete(targetName);
    };

    seedRecursive(entityName, count);
    reconcileAllForeignKeys(workingIR, resolvedRelations);

    const targetAfter = workingIR.entities.find((e) => e.name === entityName);
    const beforeCount = ir.entities.find((e) => e.name === entityName)?.seedData?.length || 0;
    const actualAdded = (targetAfter?.seedData?.length || 0) - beforeCount;

    const parentNotice =
      autoSeededParents.length > 0
        ? ` (auto-seeded ${Array.from(new Set(autoSeededParents)).join(', ')})`
        : '';

    return {
      ir: workingIR,
      message: `Seeded ${actualAdded} rows into ${entityName}${parentNotice}`,
    };
  }
}