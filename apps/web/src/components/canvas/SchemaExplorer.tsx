import { useState } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import { NEXUS_COLORS, ArcheonColorKey } from '../../lib/reactFlowAdapter';
import type { CustomSqlSnippet } from '@zero-dollar/ir-core';

const PALETTE_KEYS: ArcheonColorKey[] = ['violet', 'cyan', 'amber', 'rose', 'lime'];

export function SchemaExplorer() {
  const {
    present,
    isExplorerOpen,
    setIsExplorerOpen,
    activeRoutineId,
    setActiveRoutineId,
    activeTableName,
    setActiveTableName,
  } = useArchitectureStore();

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openSqlModalWithType = (defaultType: CustomSqlSnippet['type']) => {
    window.dispatchEvent(
      new CustomEvent('open-sql-assistant', {
        detail: {
          entityId: present.entities[0]?.name || '',
          entityName: present.entities[0]?.name || '',
          defaultType,
        },
      })
    );
  };

  const routines = present.customSql || [];
  const routineGroups: {
    key: string;
    title: string;
    badgeChar: string;
    badgeStyle: string;
    hoverPlusColor: string;
    defaultType: CustomSqlSnippet['type'];
    emptyText: string;
    items: CustomSqlSnippet[];
    icon: React.ReactNode;
  }[] = [
    {
      key: 'triggers',
      title: 'Triggers',
      badgeChar: 'T',
      badgeStyle: 'bg-[#8b7ff0]/15 text-[#8b7ff0]',
      hoverPlusColor: 'hover:text-[#8b7ff0]',
      defaultType: 'TRIGGER',
      emptyText: 'No triggers',
      items: routines.filter((r) => r.type === 'TRIGGER'),
      icon: (
        <svg className="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 3 14h7l-1 8 11-14h-7z" />
        </svg>
      ),
    },
    {
      key: 'functions',
      title: 'Functions',
      badgeChar: 'F',
      badgeStyle: 'bg-[#3fc6d8]/15 text-[#3fc6d8]',
      hoverPlusColor: 'hover:text-[#3fc6d8]',
      defaultType: 'FUNCTION',
      emptyText: 'No functions',
      items: routines.filter((r) => r.type === 'FUNCTION' || r.type === 'RAW_MIGRATION'),
      icon: (
        <svg className="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M8 3c-2 0-3 1-3 3v3c0 1-.5 2-2 2 1.5 0 2 1 2 2v3c0 2 1 3 3 3M16 3c2 0 3 1 3 3v3c0 1 .5 2 2 2-1.5 0-2 1-2 2v3c0 2-1 3-3 3" />
        </svg>
      ),
    },
    {
      key: 'procedures',
      title: 'Procedures',
      badgeChar: 'P',
      badgeStyle: 'bg-[#e08a3c]/15 text-[#e08a3c]',
      hoverPlusColor: 'hover:text-[#e08a3c]',
      defaultType: 'STORED_PROCEDURE',
      emptyText: 'No procedures',
      items: routines.filter((r) => r.type === 'STORED_PROCEDURE'),
      icon: (
        <svg className="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      ),
    },
  ];

  return (
    <aside
      className={`flex-none overflow-hidden border-r border-white/[0.09] bg-[#14161d] transition-[width] duration-200 ease-out h-full z-30 ${
        isExplorerOpen ? 'w-[264px]' : 'w-0 border-r-0'
      }`}
    >
      <div className="w-[264px] h-full flex flex-col">
        {/* Explorer Header */}
        <div className="px-4 py-3.5 border-b border-white/[0.09] flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="w-[15px] h-[15px] text-[#8a8b9a]"
          >
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
          </svg>
          <b className="text-[13px] font-semibold text-[#e8e8ee]">Schema explorer</b>
          <button
            type="button"
            onClick={() => setIsExplorerOpen(false)}
            title="Collapse"
            className="ml-auto w-6 h-6 rounded-[6px] text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee] flex items-center justify-center cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[13px] h-[13px]">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* Explorer Body */}
        <div className="flex-1 overflow-y-auto">
          {/* TABLES SECTION */}
          <div className="border-b border-white/[0.09]">
            <button
              type="button"
              onClick={() => toggleSection('tables')}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[#8a8b9a] hover:text-[#e8e8ee] text-[12px] font-semibold cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M4 10h16M10 10v10" />
              </svg>
              <span>Tables</span>
              <span className="ml-auto font-mono text-[10.5px] text-[#565766] bg-white/[0.05] px-1.5 py-[1px] rounded-full">
                {present.entities.length}
              </span>
              <svg
                className={`w-3 h-3 flex-none text-[#565766] transition-transform duration-150 ${
                  collapsedSections.tables ? 'rotate-0' : 'rotate-90'
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            {!collapsedSections.tables && (
              <div className="px-2 pb-2 pt-0.5 space-y-0.5">
                {present.entities.length === 0 ? (
                  <div className="px-2 py-2.5 text-[11.5px] text-[#565766]">No tables yet</div>
                ) : (
                  present.entities.map((entity, idx) => {
                    const dotColor = NEXUS_COLORS[PALETTE_KEYS[idx % PALETTE_KEYS.length]];
                    const rowCount = entity.seedData?.length || 0;
                    const isActive = activeTableName === entity.name;
                    return (
                      <div
                        key={entity.name}
                        onClick={() => setActiveTableName(entity.name)}
                        className={`flex items-center gap-2 px-2 py-[7px] rounded-[7px] text-[12px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-white/[0.06] border border-white/[0.08]'
                            : 'hover:bg-white/[0.045] border border-transparent'
                        }`}
                      >
                        <span
                          className="w-[7px] h-[7px] rounded-full flex-none"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="font-mono text-[#e8e8ee] flex-1 truncate">
                          {entity.name}
                        </span>
                        <span className="text-[10px] text-[#565766] font-mono flex-none">
                          {entity.fields.length} cols · {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* TRIGGERS, FUNCTIONS & PROCEDURES SECTIONS */}
          {routineGroups.map((group) => (
            <div key={group.key} className="border-b border-white/[0.09]">
              <div className="w-full flex items-center pr-2">
                <button
                  type="button"
                  onClick={() => toggleSection(group.key)}
                  className="flex-1 flex items-center gap-2 px-3.5 py-2.5 text-[#8a8b9a] hover:text-[#e8e8ee] text-[12px] font-semibold cursor-pointer"
                >
                  {group.icon}
                  <span>{group.title}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-[#565766] bg-white/[0.05] px-1.5 py-[1px] rounded-full">
                    {group.items.length}
                  </span>
                  <svg
                    className={`w-3 h-3 flex-none text-[#565766] transition-transform duration-150 ${
                      collapsedSections[group.key] ? 'rotate-0' : 'rotate-90'
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => openSqlModalWithType(group.defaultType)}
                  title={`Generate AI ${group.title.slice(0, -1)}`}
                  className={`w-5 h-5 rounded text-[#565766] ${group.hoverPlusColor} hover:bg-white/[0.05] flex items-center justify-center text-xs cursor-pointer`}
                >
                  +
                </button>
              </div>

              {!collapsedSections[group.key] && (
                <div className="px-2 pb-2 pt-0.5">
                  {group.items.length === 0 ? (
                    <div className="px-2 py-2.5 text-[11.5px] text-[#565766]">{group.emptyText}</div>
                  ) : (
                    group.items.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => setActiveRoutineId(r.id)}
                        className={`flex items-center gap-2 px-2 py-[7px] rounded-[7px] text-[12px] cursor-pointer ${
                          activeRoutineId === r.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.045]'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 flex-none rounded-[4px] flex items-center justify-center text-[9px] font-bold font-mono ${group.badgeStyle}`}
                        >
                          {group.badgeChar}
                        </span>
                        <span className="font-mono text-[#e8e8ee] flex-1 truncate">{r.name}</span>
                        <span className="text-[10px] text-[#565766] font-mono flex-none">
                          {r.targetEntity || '—'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}