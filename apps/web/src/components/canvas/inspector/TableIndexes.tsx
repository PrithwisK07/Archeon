import { useState } from 'react';
import type { Entity } from '@zero-dollar/ir-core';
import { useArchitectureStore } from '../../../store/architectureStore';
import { SeedEngine } from '../../../lib/seedEngine';

export function TableIndexes({ entity }: { entity: Entity }) {
  const { updateEntityIndexes, showToast } = useArchitectureStore();
  const [selectedIdxFields, setSelectedIdxFields] = useState<string[]>([]);
  const [newIdxUnique, setNewIdxUnique] = useState(false);

  const entityPkFields = SeedEngine.getEntityPkFields(entity);

  const handleAddIndex = () => {
    if (selectedIdxFields.length === 0) return;
    const currentIndexes = entity.indexes || [];
    const key = selectedIdxFields.join('|');

    if (currentIndexes.some((idx) => idx.fields.join('|') === key)) {
      showToast('An index on those exact columns already exists');
      return;
    }

    const nextIndexes = [
      ...currentIndexes,
      {
        name: `idx_${entity.name.toLowerCase()}_${selectedIdxFields.join('_')}`,
        fields: selectedIdxFields,
        unique: newIdxUnique,
      },
    ];
    updateEntityIndexes(entity.name, nextIndexes);
    setSelectedIdxFields([]);
    setNewIdxUnique(false);
  };

  const handleRemoveIndex = (idxToRemove: number) => {
    const nextIndexes = (entity.indexes || []).filter((_, i) => i !== idxToRemove);
    updateEntityIndexes(entity.name, nextIndexes);
  };

  return (
    <div className="pt-4 mt-5 border-t border-white/[0.08] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a]">
          Table Indexes ({entity.indexes?.length || 0})
        </span>
        {entityPkFields.length > 1 && (
          <span className="text-[10px] font-mono text-[#e08a3c]">@@id([{entityPkFields.join(', ')}])</span>
        )}
      </div>

      {(entity.indexes || []).length > 0 ? (
        <div className="space-y-1.5">
          {(entity.indexes || []).map((idx, i) => (
            <div key={i} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#101219] border border-white/[0.08] font-mono text-[11.5px]">
              <div className="flex items-center gap-2 truncate">
                <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-semibold ${idx.unique ? 'bg-[#e08a3c]/15 text-[#e08a3c]' : 'bg-[#8b7ff0]/15 text-[#b5adf2]'}`}>
                  {idx.unique ? '@@unique' : '@@index'}
                </span>
                <span className="text-[#e8e8ee] truncate">[{idx.fields.join(', ')}]</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveIndex(i)}
                className="text-[#565766] hover:text-[#e0708f] ml-2 cursor-pointer"
                title="Remove index"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-[#565766] font-mono">No secondary indexes on {entity.name}.</div>
      )}

      <div className="p-2.5 rounded-lg bg-[#101219] border border-white/[0.08] space-y-2.5">
        <div className="text-[11px] text-[#8a8b9a]">Select column(s) for index:</div>
        <div className="flex flex-wrap gap-1.5">
          {entity.fields.map((f) => {
            const active = selectedIdxFields.includes(f.name);
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => setSelectedIdxFields((prev) => prev.includes(f.name) ? prev.filter((x) => x !== f.name) : [...prev, f.name])}
                className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer transition-colors ${
                  active ? 'bg-[#e08a3c]/20 border-[#e08a3c] text-[#e08a3c]' : 'bg-[#14161d] border-white/[0.08] text-[#8a8b9a] hover:text-[#e8e8ee]'
                }`}
              >
                {f.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-1.5 text-[11.5px] text-[#8a8b9a] cursor-pointer">
            <input
              type="checkbox"
              checked={newIdxUnique}
              onChange={(e) => setNewIdxUnique(e.target.checked)}
              className="accent-[#e08a3c] cursor-pointer"
            />
            Unique (@@unique)
          </label>
          <button
            type="button"
            disabled={selectedIdxFields.length === 0}
            onClick={handleAddIndex}
            className="px-2.5 py-1 rounded bg-[#e08a3c] text-[#1a1206] font-semibold text-[11px] disabled:opacity-40 cursor-pointer"
          >
            + Add Index
          </button>
        </div>
      </div>
    </div>
  );
}