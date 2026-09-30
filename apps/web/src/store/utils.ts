import { Node } from 'reactflow';
import { db } from '../lib/db';
import type { CanonicalIR } from '@zero-dollar/ir-core';
import { ReactFlowAdapter, UINodeData } from '../lib/reactFlowAdapter';
import { SeedEngine } from '../lib/seedEngine';
import type { StickyNote, StickyNoteColor } from './types';

export const DEFAULT_IR: CanonicalIR = {
  config: { framework: 'nestjs', database: 'postgresql', authProviders: [] },
  entities: [],
  relations: [],
  enums: [],
  endpoints: [],
  customSql: [],
  notes: [],
};

export const generateHash = (data: any): string => {
  const str = JSON.stringify(data);
  let h1 = 0xdeadbeef ^ str.length,
    h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

export const persistToDB = (id: string, ir: CanonicalIR) => {
  db.projects.put({
    id,
    canonical_ir: ir,
    version_hash: generateHash(ir),
    updated_at: Date.now(),
  });
};

export const normalizeNotes = (rawNotes?: any[]): StickyNote[] =>
  (rawNotes || []).map((n, i) => ({
    id: String(n?.id || `note_${Date.now()}_${i}`),
    x: typeof n?.x === 'number' ? n.x : 220,
    y: typeof n?.y === 'number' ? n.y : 160,
    text: String(n?.text ?? ''),
    color: (n?.color as StickyNoteColor) || 'yellow',
  }));

export const syncUINodes = (newIR: CanonicalIR, currentNodes: Node<UINodeData>[]): Node<UINodeData>[] => {
  const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));
  const generatedNodes = ReactFlowAdapter.generateNodes(newIR);

  return generatedNodes.map((newNode, idx) => {
    const existingNode = nodeMap.get(newNode.id) || currentNodes[idx];
    return existingNode
      ? {
          ...newNode,
          position: existingNode.position,
          selected: existingNode.selected,
        }
      : newNode;
  });
};

export const normalizeAIRelations = (ir: CanonicalIR): CanonicalIR => {
  const expandedRelations: CanonicalIR['relations'] = [];
  const seen = new Set<string>();

  const pushUniqueRel = (rel: CanonicalIR['relations'][number]) => {
    const key = `${rel.sourceEntity}.${rel.sourceField || ''}->${rel.targetEntity}.${rel.targetField || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      expandedRelations.push(rel);
    }
  };

  for (const rel of ir.relations || []) {
    const srcEnt = ir.entities.find((e) => e.name === rel.sourceEntity);
    const tgtEnt = ir.entities.find((e) => e.name === rel.targetEntity);
    if (!srcEnt || !tgtEnt) continue;

    if (rel.sourceField && rel.targetField) {
      pushUniqueRel(rel);
      continue;
    }

    const srcPkFields = SeedEngine.getEntityPkFields(srcEnt);
    let matchedCount = 0;

    for (const pkField of srcPkFields) {
      const prefix = srcEnt.name.toLowerCase().replace(/s$/, '');
      const matchedFk = tgtEnt.fields.find((f) => {
        const fLow = f.name.toLowerCase();
        const pkLow = pkField.toLowerCase();
        if (pkLow !== 'id' && fLow === pkLow) return true;
        if (fLow === `${prefix}_${pkLow}` || fLow === `${prefix}${pkLow}`) return true;
        if (pkLow === 'id' && fLow === `${prefix}_id`) return true;
        return false;
      });

      if (matchedFk) {
        matchedCount++;
        pushUniqueRel({ ...rel, sourceField: pkField, targetField: matchedFk.name });
      }
    }

    if (matchedCount === 0 && srcPkFields[0]) {
      const fallbackFk =
        tgtEnt.fields.find((f) => !(f.isPrimaryKey ?? f.name === 'id')) || tgtEnt.fields[0];
      if (fallbackFk) {
        pushUniqueRel({ ...rel, sourceField: srcPkFields[0], targetField: fallbackFk.name });
      } else {
        pushUniqueRel(rel);
      }
    }
  }

  return { ...ir, relations: expandedRelations };
};