import { useState } from 'react';
import type { Entity } from '@zero-dollar/ir-core';
import {
  EndpointSelection,
  METHODS_ORDER,
  VERB_PILL_STYLES,
  getEndpointMeta,
} from './playgroundTypes';

interface PlaygroundSidebarProps {
  entities: Entity[];
  selectedEp: EndpointSelection;
  onSelectEndpoint: (selection: EndpointSelection) => void;
}

export function PlaygroundSidebar({
  entities,
  selectedEp,
  onSelectEndpoint,
}: PlaygroundSidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  return (
    <div className="w-[252px] border-r border-white/[0.09] bg-[#0b0c10] overflow-y-auto p-2.5 space-y-2 flex-none">
      {entities.map((ent) => {
        const isCollapsed = !!collapsedGroups[ent.name];
        const rowCount = ent.seedData?.length || 0;

        return (
          <div key={ent.name}>
            <button
              type="button"
              onClick={() =>
                setCollapsedGroups((p) => ({ ...p, [ent.name]: !p[ent.name] }))
              }
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-mono font-semibold text-[#e8e8ee] hover:text-white cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`w-2.5 h-2.5 text-[#565766] transition-transform ${
                  isCollapsed ? 'rotate-0' : 'rotate-90'
                }`}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span className="truncate">{ent.name}</span>
              <span className="ml-auto text-[10px] font-normal text-[#565766]">
                {rowCount} {rowCount === 1 ? 'row' : 'rows'}
              </span>
            </button>

            {!isCollapsed && (
              <div className="space-y-1 mt-0.5">
                {METHODS_ORDER.map((mType) => {
                  const meta = getEndpointMeta(ent.name, mType);
                  const isSelected =
                    selectedEp.entityName === ent.name &&
                    selectedEp.methodType === mType;

                  return (
                    <button
                      key={mType}
                      type="button"
                      onClick={() =>
                        onSelectEndpoint({ entityName: ent.name, methodType: mType })
                      }
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] font-mono text-[11.5px] transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#e08a3c]/14 border border-[#e08a3c]/35 text-[#e08a3c]'
                          : 'border border-transparent text-[#8a8b9a] hover:bg-white/[0.04] hover:text-[#e8e8ee]'
                      }`}
                    >
                      <span
                        className={`w-[44px] flex-none text-center font-semibold text-[9.5px] rounded-[4px] py-[2px] uppercase border ${
                          VERB_PILL_STYLES[meta.verb]
                        }`}
                      >
                        {meta.verb}
                      </span>
                      <span className="truncate">{meta.path}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}