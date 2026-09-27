import { faker } from '@faker-js/faker';
import type { CanonicalIR, Entity, Field } from '@zero-dollar/ir-core';
import { ResolvedRelation, isFieldPk, resolveAllRelations } from './relationResolver';

const STATUS_FALLBACKS = ['pending', 'processing', 'completed', 'cancelled'];
const METHOD_FALLBACKS = ['card', 'ach', 'wire', 'apple_pay'];
const ROLE_FALLBACKS = ['admin', 'member', 'viewer', 'owner'];

export function evaluateDefaultValue(field: Field): any {
  const raw = field.defaultValue;
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim().toLowerCase();
  if (str === 'now()' || str === 'current_timestamp') return new Date().toISOString();
  if (str === 'uuid()' || str === 'gen_random_uuid()') return faker.string.uuid();
  if (field.type === 'number' && !Number.isNaN(Number(raw))) return Number(raw);
  if (field.type === 'boolean') return str === 'true';
  return String(raw).replace(/^['"]|['"]$/g, '');
}

export function coerceCellValue(field: Field | undefined, rawValue: any): any {
  if (!field) return rawValue;
  if (rawValue === '' && field.nullable) return null;
  if (field.type === 'number' && rawValue !== '' && !Number.isNaN(Number(rawValue))) {
    return Number(rawValue);
  }
  if (field.type === 'boolean') {
    return rawValue === 'true' || rawValue === true;
  }
  return rawValue;
}

export function createBlankRow(
  entity: Entity,
  initialData?: Record<string, any>,
  ir?: CanonicalIR
): Record<string, any> {
  const resolvedRels = ir ? resolveAllRelations(ir) : [];
  const newRow: Record<string, any> = {};

  for (const field of entity.fields) {
    if (initialData && initialData[field.name] !== undefined) {
      newRow[field.name] = initialData[field.name];
      continue;
    }

    const fkRel = resolvedRels.find(
      (r) => r.childEntity === entity.name && r.childFkField === field.name
    );
    const parentEnt = fkRel
      ? ir?.entities.find((e) => e.name === fkRel.parentEntity)
      : undefined;

    if (fkRel && parentEnt?.seedData && parentEnt.seedData.length > 0) {
      const sampleParent = faker.helpers.arrayElement(parentEnt.seedData);
      newRow[field.name] = sampleParent[fkRel.parentPkField] ?? sampleParent.id ?? '';
    } else if (!fkRel && isFieldPk(field)) {
      newRow[field.name] = field.type === 'number' ? Date.now() : faker.string.uuid();
    } else if (field.defaultValue !== undefined && field.defaultValue !== null) {
      newRow[field.name] = evaluateDefaultValue(field);
    } else {
      newRow[field.name] = '';
    }
  }
  if (newRow.id === undefined) {
    newRow.id = initialData?.id || faker.string.uuid();
  }
  return newRow;
}

export function generateUniqueFieldValue(
  ir: CanonicalIR,
  resolvedRelations: ResolvedRelation[],
  entity: Entity,
  field: Field,
  allAvailableRows: Record<string, any>[],
  partialRow: Record<string, any>,
  uSet: Set<any> | undefined,
  isOneToOneFk: boolean
): any {
  let val = generateFieldValue(
    ir,
    resolvedRelations,
    entity,
    field,
    allAvailableRows,
    partialRow
  );

  if (!uSet || val === null) return val;

  let retries = 0;
  while (uSet.has(val) && retries < 15) {
    val = generateFieldValue(
      ir,
      resolvedRelations,
      entity,
      field,
      allAvailableRows,
      partialRow
    );
    retries++;
  }

  const isFk = resolvedRelations.some(
    (r) => r.childEntity === entity.name && r.childFkField === field.name
  );

  if (uSet.has(val) && !isOneToOneFk && !isFk) {
    if (field.type === 'string') {
      const suffix = faker.string.alphanumeric(4).toLowerCase();
      val = String(val).includes('@')
        ? String(val).replace('@', `+${suffix}@`)
        : `${val}_${suffix}`;
    } else if (field.type === 'number') {
      val = Number(val) + uSet.size + 1;
    } else if (field.type === 'uuid') {
      val = faker.string.uuid();
    }
  }

  return val;
}

export function generateFieldValue(
  ir: CanonicalIR,
  resolvedRelations: ResolvedRelation[],
  entity: Entity,
  field: Field,
  currentEntityRows: Record<string, any>[],
  partialRow: Record<string, any>
): any {
  // 1. Foreign Key Resolution takes priority
  const incomingRel = resolvedRelations.find(
    (r) => r.childEntity === entity.name && r.childFkField === field.name
  );

  if (incomingRel) {
    const refField = incomingRel.parentPkField || 'id';

    if (incomingRel.parentEntity === entity.name) {
      if (currentEntityRows.length === 0) {
        return field.nullable ? null : partialRow[refField] ?? faker.string.uuid();
      }
      const parentRow = faker.helpers.arrayElement(currentEntityRows);
      return parentRow[refField] ?? parentRow.id;
    }

    const parentEntity = ir.entities.find((e) => e.name === incomingRel.parentEntity);
    const parentRows = parentEntity?.seedData || [];

    if (parentRows.length > 0) {
      if (incomingRel.type === 'ONE_TO_ONE') {
        const usedValues = new Set(currentEntityRows.map((r) => r[field.name]));
        const availableParents = parentRows.filter(
          (p) => !usedValues.has(p[refField] ?? p.id)
        );
        if (availableParents.length > 0) {
          const chosen = faker.helpers.arrayElement(availableParents);
          return chosen[refField] ?? chosen.id;
        }
      }
      const chosenParent = faker.helpers.arrayElement(parentRows);
      return chosenParent[refField] ?? chosenParent.id;
    }
  }

  const isPk = isFieldPk(field);

  // 2. Occasional null for nullable non-PK, non-FK fields (~12% probability)
  if (!isPk && field.nullable && Math.random() < 0.12) {
    return null;
  }

  // 3. Explicit SQL / Column Default Value
  if (
    !isPk &&
    field.defaultValue !== undefined &&
    field.defaultValue !== null &&
    field.defaultValue !== ''
  ) {
    return evaluateDefaultValue(field);
  }

  // 4. Custom Enums in CanonicalIR
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normField = normalize(field.name);
  const matchingEnum = ir.enums.find((en) => {
    const normEnum = normalize(en.name);
    return normEnum === normField || normField.endsWith(normEnum);
  });
  if (matchingEnum && matchingEnum.values.length > 0) {
    return faker.helpers.arrayElement(matchingEnum.values);
  }

  // 5. Context-Aware Faker Heuristics
  const tableLower = entity.name.toLowerCase();
  const fieldLower = field.name.toLowerCase();

  if (field.type === 'uuid' || isPk) return faker.string.uuid();
  if (field.type === 'boolean') return faker.datatype.boolean({ probability: 0.75 });
  if (field.type === 'datetime') return faker.date.recent({ days: 30 }).toISOString();
  if (field.type === 'json') {
    return JSON.stringify({ source: faker.internet.domainWord(), verified: true });
  }

  if (field.type === 'number') {
    if (/(inventory|stock|qty|quantity|count)/.test(fieldLower)) {
      return faker.number.int({ min: 1, max: 250 });
    }
    if (/(rating|stars)/.test(fieldLower)) return faker.number.int({ min: 1, max: 5 });
    if (fieldLower.includes('age')) return faker.number.int({ min: 18, max: 65 });
    return Number(faker.commerce.price({ min: 5, max: 500, dec: 2 }));
  }

  if (fieldLower.includes('email')) return faker.internet.email().toLowerCase();
  if (/(token|hash|secret)/.test(fieldLower)) return `tok_${faker.string.alphanumeric(20)}`;
  if (/(status|state)/.test(fieldLower)) return faker.helpers.arrayElement(STATUS_FALLBACKS);
  if (/(method|provider)/.test(fieldLower)) return faker.helpers.arrayElement(METHOD_FALLBACKS);
  if (fieldLower.includes('role')) return faker.helpers.arrayElement(ROLE_FALLBACKS);
  if (fieldLower.includes('slug')) {
    return faker.helpers.slugify(faker.commerce.productName()).toLowerCase();
  }
  if (/(url|avatar|image)/.test(fieldLower)) return faker.image.url();
  if (fieldLower.includes('phone')) return faker.phone.number();
  if (/(description|bio|text)/.test(fieldLower)) {
    return faker.commerce.productDescription().slice(0, 72);
  }

  if (fieldLower.includes('name') || fieldLower.includes('title')) {
    if (/(product|item|catalog)/.test(tableLower)) return faker.commerce.productName();
    if (/(store|company|org|vendor)/.test(tableLower)) return faker.company.name();
    if (/(tag|category)/.test(tableLower)) return faker.commerce.department();
    if (/(task|ticket)/.test(tableLower)) return faker.hacker.phrase().slice(0, 40);
    return faker.person.fullName();
  }

  return faker.commerce.productMaterial();
}