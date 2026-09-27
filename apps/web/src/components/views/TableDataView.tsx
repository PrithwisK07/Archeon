import { useState } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import type { Entity, Field, CanonicalIR } from '@zero-dollar/ir-core';
import { SeedEngine } from '../../lib/seedEngine';

const PG_DISPLAY_TYPES: Record<Field['type'], string> = {
  uuid: 'uuid',
  string: 'text',
  number: 'numeric',
  boolean: 'boolean',
  datetime: 'timestamptz',
  json: 'jsonb',
};

function getColumnSubtitle(field: Field, entity: Entity, ir: CanonicalIR): string {
  const nameLower = field.name.toLowerCase();
  let baseType = PG_DISPLAY_TYPES[field.type] || field.type;
  if (
    field.type === 'number' &&
    (nameLower.includes('inventory') ||
      nameLower.includes('count') ||
      nameLower.includes('qty') ||
      nameLower.includes('quantity'))
  ) {
    baseType = 'int4';
  }

  // Check Foreign Key FIRST so any PK wired as a target FK shows "FK -> Parent.field"
  const fkRel = SeedEngine.resolveAllRelations(ir).find(
    (r) => r.childEntity === entity.name && r.childFkField === field.name
  );
  if (fkRel) return `${baseType} · FK → ${fkRel.parentEntity}.${fkRel.parentPkField}`;

  const isPk = field.isPrimaryKey ?? field.name === 'id';
  if (isPk) return `${baseType} · PK`;

  return baseType;
}

export interface TableDataViewProps {
  entity: Entity;
  onJumpToGraph: (tableName: string) => void;
}

export function TableDataView({ entity, onJumpToGraph }: TableDataViewProps) {
  const {
    present,
    setActiveTableName,
    seedTableData,
    addTableRow,
    updateTableRow,
    deleteTableRow,
    clearTableData,
  } = useArchitectureStore();

  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    fieldName: string;
  } | null>(null);

  const rows = entity.seedData || [];

  const handleAddRowClick = () => {
    addTableRow(entity.name);
    const firstNonPkField =
      entity.fields.find((f) => !(f.isPrimaryKey || f.name === 'id'))?.name ||
      entity.fields[0]?.name;
    if (firstNonPkField) {
      setEditingCell({ rowIndex: rows.length, fieldName: firstNonPkField });
    }
  };

  return (
    <div className="absolute inset-0 z-28 flex flex-col bg-[#0b0c10] select-none">
      {/* Table View Header */}
      <div className="h-[58px] px-5 border-b border-white/[0.09] flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTableName(null)}
          className="px-3.5 py-2 rounded-[8px] border border-white/[0.09] bg-[#14161d] hover:bg-white/[0.06] text-[12.5px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-3.5 h-3.5 text-[#8a8b9a]"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Schema Visualizer
        </button>

        <span className="font-mono text-[15px] font-semibold text-[#e8e8ee] ml-1">
          {entity.name}
        </span>
        <span className="font-mono text-[12px] text-[#565766]">
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>

        <button
          type="button"
          onClick={() => onJumpToGraph(entity.name)}
          title="Center this table node on the visual canvas"
          className="ml-2 px-2.5 py-1 rounded-[6px] border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] text-[11px] font-mono text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer transition-colors"
        >
          Locate node ↗
        </button>

        <div className="flex-1" />

        {/* Seed data */}
        <button
          type="button"
          onClick={() => seedTableData(entity.name, 5)}
          className="px-3.5 py-2 rounded-[8px] border border-white/[0.09] bg-[#14161d] hover:bg-white/[0.07] text-[12.5px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="w-3.5 h-3.5 text-[#8a8b9a]"
          >
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          Seed data
        </button>

        {/* + Add row */}
        <button
          type="button"
          onClick={handleAddRowClick}
          className="px-3.5 py-2 rounded-[8px] border border-white/[0.09] bg-[#14161d] hover:bg-white/[0.07] text-[12.5px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="w-3.5 h-3.5 text-[#8a8b9a]"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add row
        </button>

        {/* Clear data */}
        <button
          type="button"
          onClick={() => clearTableData(entity.name)}
          className="px-3.5 py-2 rounded-[8px] border border-white/[0.09] bg-[#14161d] hover:bg-white/[0.07] text-[12.5px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="w-3.5 h-3.5 text-[#8a8b9a]"
          >
            <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
          </svg>
          Clear data
        </button>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto p-4">
        {rows.length === 0 ? (
          <div className="border-b border-white/[0.07] pb-6 pt-3 px-4">
            <p className="text-center font-mono text-[12.5px] text-[#565766] mb-5">
              No rows yet in {entity.name}. Add one manually, or generate sample data to get
              started.
            </p>
            <button
              type="button"
              onClick={() => seedTableData(entity.name, 10)}
              className="px-4 py-2.5 rounded-[8px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 cursor-pointer transition-all"
            >
              Generate 10 rows
            </button>
          </div>
        ) : (
          <div className="w-full border-t border-white/[0.08]">
            <table className="w-full border-collapse text-left font-mono text-[12.5px]">
              <thead>
                <tr className="bg-[#101219] border-b border-white/[0.08]">
                  <th className="w-12 py-3 px-3" />
                  {entity.fields.map((field) => (
                    <th key={field.name} className="py-3 px-4 font-semibold">
                      <div className="text-[#e8e8ee] text-[12.5px]">{field.name}</div>
                      <div className="text-[#565766] text-[10.5px] font-normal mt-0.5">
                        {getColumnSubtitle(field, entity, present)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="group/row border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="w-12 py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => deleteTableRow(entity.name, rowIdx)}
                        className="w-5 h-5 rounded text-[#565766] hover:text-[#e0708f] opacity-60 group-hover/row:opacity-100 flex items-center justify-center text-xs cursor-pointer"
                        title="Delete row"
                      >
                        ✕
                      </button>
                    </td>

                    {entity.fields.map((field) => {
                      const isEditing =
                        editingCell?.rowIndex === rowIdx &&
                        editingCell?.fieldName === field.name;
                      const cellVal =
                        row[field.name] !== undefined && row[field.name] !== null
                          ? String(row[field.name])
                          : '';

                      return (
                        <td
                          key={field.name}
                          onClick={() =>
                            setEditingCell({ rowIndex: rowIdx, fieldName: field.name })
                          }
                          className="py-2 px-4 cursor-text"
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={cellVal}
                              onChange={(e) =>
                                updateTableRow(
                                  entity.name,
                                  rowIdx,
                                  field.name,
                                  e.target.value
                                )
                              }
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full max-w-[240px] bg-[#101219] border border-[#e08a3c]/70 rounded px-2.5 py-1.5 text-[#e8e8ee] text-[12.5px] font-mono outline-none"
                            />
                          ) : (
                            <span className="block min-h-[22px] py-1 text-[#e8e8ee] select-text">
                              {cellVal}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}