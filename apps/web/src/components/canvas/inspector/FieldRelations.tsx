import { useMemo } from 'react';
import type { Relation, Entity, Field } from '@zero-dollar/ir-core';
import { useArchitectureStore } from '../../../store/architectureStore';
import { SeedEngine } from '../../../lib/seedEngine';

export function FieldRelations({ entity, field }: { entity: Entity; field: Field }) {
  const { present, applyAIPatch, autoWireCompositeRelation, showToast } = useArchitectureStore();

  const fieldRelations = useMemo(() => {
    const resolved = SeedEngine.resolveAllRelations(present);
    return resolved.filter(
      (r) =>
        (r.childEntity === entity.name && r.childFkField === field.name) ||
        (r.parentEntity === entity.name && r.parentPkField === field.name)
    );
  }, [present, entity, field]);

  const handleUpdateRelation = (
    rawRel: Relation,
    patch: { type?: Relation['type']; onDelete?: NonNullable<Relation['onDelete']> }
  ) => {
    const nextType = patch.type ?? rawRel.type;
    const nextOnDelete = patch.onDelete ?? rawRel.onDelete ?? 'RESTRICT';

    if (nextOnDelete === 'SET NULL') {
      const resolved = fieldRelations.find((r) => r.rawRelation === rawRel);
      if (resolved) {
        const childEnt = present.entities.find((ent) => ent.name === resolved.childEntity);
        const fkField = childEnt?.fields.find((f) => f.name === resolved.childFkField);
        const childPks = childEnt ? SeedEngine.getEntityPkFields(childEnt) : [];
        if ((fkField && !fkField.nullable) || childPks.includes(resolved.childFkField)) {
          showToast(`Cannot use SET NULL: "${resolved.childEntity}.${resolved.childFkField}" is NOT NULL`);
          return;
        }
      }
    }

    const nextRelations = present.relations.map((r) =>
      r.sourceEntity === rawRel.sourceEntity &&
      r.targetEntity === rawRel.targetEntity &&
      r.sourceField === rawRel.sourceField &&
      r.targetField === rawRel.targetField
        ? { ...r, type: nextType, onDelete: nextOnDelete }
        : r
    );

    const syncedIR = SeedEngine.synchronizeSchemaAndData(present, { ...present, relations: nextRelations });
    applyAIPatch(syncedIR);
    showToast('Relation updated');
  };

  const handleRemoveRelation = (rawRel: Relation) => {
    const nextRelations = present.relations.filter(
      (r) =>
        !(
          r.sourceEntity === rawRel.sourceEntity &&
          r.targetEntity === rawRel.targetEntity &&
          r.sourceField === rawRel.sourceField &&
          r.targetField === rawRel.targetField
        )
    );
    applyAIPatch({ ...present, relations: nextRelations });
    showToast('Relation removed');
  };

  if (fieldRelations.length === 0) return null;

  return (
    <div className="pt-4 mt-5 border-t border-white/[0.08] space-y-3">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a]">
        Relationships ({fieldRelations.length})
      </span>

      {fieldRelations.map((rel, idx) => (
        <div key={idx} className="p-3 rounded-lg bg-[#101219] border border-white/[0.09] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-[#3fc6d8] truncate">
              {rel.parentEntity}.{rel.parentPkField} → {rel.childEntity}.{rel.childFkField}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveRelation(rel.rawRelation)}
              className="text-[11px] font-mono text-[#565766] hover:text-[#e0708f] cursor-pointer flex-none"
              title="Remove relation"
            >
              Unlink
            </button>
          </div>

          {!rel.isCompleteComposite && (
            <div className="p-2 rounded bg-[#e08a3c]/12 border border-dashed border-[#e08a3c]/40 text-[10.5px] font-mono text-[#e08a3c] space-y-1.5">
              <div>⚠️ Missing composite PK: {rel.missingParentPkFields.join(', ')}</div>
              <button
                type="button"
                onClick={() => autoWireCompositeRelation(rel.parentEntity, rel.childEntity)}
                className="w-full py-1 rounded bg-[#e08a3c] text-[#1a1206] font-semibold text-[10px] cursor-pointer"
              >
                + Auto-wire missing key
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div>
              <label className="block text-[10px] font-mono text-[#8a8b9a] mb-1">Cardinality</label>
              <select
                value={rel.rawRelation.type}
                onChange={(e) => handleUpdateRelation(rel.rawRelation, { type: e.target.value as Relation['type'] })}
                className="w-full bg-[#14161d] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded px-2 py-1.5 text-[11.5px] font-mono text-[#e8e8ee] outline-none cursor-pointer"
              >
                <option value="ONE_TO_ONE">1 : 1</option>
                <option value="ONE_TO_MANY">1 : N</option>
                <option value="MANY_TO_MANY">N : M</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#8a8b9a] mb-1">On Delete</label>
              <select
                value={rel.rawRelation.onDelete || 'RESTRICT'}
                onChange={(e) => handleUpdateRelation(rel.rawRelation, { onDelete: e.target.value as NonNullable<Relation['onDelete']> })}
                className="w-full bg-[#14161d] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded px-2 py-1.5 text-[11.5px] font-mono text-[#e8e8ee] outline-none cursor-pointer"
              >
                <option value="RESTRICT">RESTRICT</option>
                <option value="CASCADE">CASCADE</option>
                <option value="SET NULL">SET NULL</option>
                <option value="SET DEFAULT">SET DEFAULT</option>
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}