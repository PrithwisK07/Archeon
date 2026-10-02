import { useState } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import type { CustomSqlSnippet } from '@zero-dollar/ir-core';

export interface SqlModalState {
  isOpen: boolean;
  entityName: string;
  routineType: CustomSqlSnippet['type'];
}

interface SqlGeneratorModalProps {
  modalState: SqlModalState | null;
  onClose: () => void;
  onChangeState: (next: SqlModalState) => void;
}

export function SqlGeneratorModal({
  modalState,
  onClose,
  onChangeState,
}: SqlGeneratorModalProps) {
  const {
    present: currentIR,
    dispatchManualAction,
    addChatMessage,
    setActiveRoutineId,
    showToast,
  } = useArchitectureStore();

  const [sqlPrompt, setSqlPrompt] = useState('');
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);

  if (!modalState?.isOpen) return null;

  const existingRoutines = (currentIR.customSql || []).filter(
    (r) => r.targetEntity === modalState.entityName
  );

  const handleGenerateSql = async () => {
    if (!sqlPrompt.trim()) return;
    setIsGeneratingSql(true);

    try {
      const targetEntity = currentIR.entities.find((e) => e.name === modalState.entityName);

      const response = await fetch('/api/v1/ai/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer development-token',
        },
        body: JSON.stringify({
          prompt: `[${modalState.routineType}] ${sqlPrompt}`,
          targetEntitySchema: targetEntity,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate SQL');

      const prefix =
        modalState.routineType === 'TRIGGER'
          ? 'trg'
          : modalState.routineType === 'STORED_PROCEDURE'
          ? 'sp'
          : 'fn';
      const baseSlug = (modalState.entityName || 'schema').toLowerCase();
      const newId = crypto.randomUUID();

      dispatchManualAction({
        action: 'ADD_CUSTOM_SQL',
        payload: {
          id: newId,
          name: `${prefix}_${baseSlug}_${(currentIR.customSql?.length || 0) + 1}`,
          targetEntity: modalState.entityName || undefined,
          type: modalState.routineType,
          sql: data.sql,
          prompt: sqlPrompt,
        },
      });

      addChatMessage({
        role: 'ai',
        content: `Generated ${modalState.routineType.toLowerCase()} on ${
          modalState.entityName || 'database'
        }.`,
      });
      setSqlPrompt('');
      onClose();
      setActiveRoutineId(newId);
      showToast('SQL routine generated');
    } catch (err: any) {
      console.error('SQL Generation Failed:', err);
      showToast(`Failed to generate SQL: ${err.message}`);
    } finally {
      setIsGeneratingSql(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-60 flex items-center justify-center select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(500px,92vw)] bg-[#14161d] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-[18px] py-4 border-b border-white/[0.09] flex items-center">
          <b className="text-[14px]">AI PL/pgSQL Generator</b>
          <span className="text-[11.5px] text-[#565766] ml-2 font-mono">
            {modalState.entityName || 'global'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-[18px] space-y-4">
          {existingRoutines.length > 0 && (
            <div className="space-y-2 max-h-36 overflow-y-auto">
              <label className="block text-[10.5px] font-mono uppercase tracking-wider text-[#8a8b9a]">
                Active Routines on {modalState.entityName} ({existingRoutines.length})
              </label>
              {existingRoutines.map((snippet) => (
                <div
                  key={snippet.id}
                  onClick={() => {
                    onClose();
                    setActiveRoutineId(snippet.id);
                  }}
                  className="p-2.5 rounded-lg bg-[#101219] border border-white/[0.08] hover:border-[#8b7ff0]/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-[#8b7ff0] font-semibold">
                      ⚡ {snippet.name}
                    </span>
                    <span className="text-[10px] font-mono text-[#565766]">View SQL →</span>
                  </div>
                  <p className="text-[12px] text-[#e8e8ee]/85 italic">
                    &ldquo;{snippet.prompt}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Routine Type</label>
              <select
                value={modalState.routineType}
                onChange={(e) =>
                  onChangeState({
                    ...modalState,
                    routineType: e.target.value as CustomSqlSnippet['type'],
                  })
                }
                className="w-full bg-[#101219] border border-white/[0.09] rounded-lg px-2.5 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
              >
                <option value="TRIGGER">Trigger</option>
                <option value="FUNCTION">Function</option>
                <option value="STORED_PROCEDURE">Procedure</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Target Table</label>
              <select
                value={modalState.entityName}
                onChange={(e) =>
                  onChangeState({ ...modalState, entityName: e.target.value })
                }
                className="w-full bg-[#101219] border border-white/[0.09] rounded-lg px-2.5 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
              >
                {currentIR.entities.map((ent) => (
                  <option key={ent.name} value={ent.name}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#8a8b9a] mb-1.5">
              Behavioral Description
            </label>
            <textarea
              value={sqlPrompt}
              onChange={(e) => setSqlPrompt(e.target.value)}
              placeholder="e.g. Log every order status change to an audit table after update…"
              className="w-full h-28 bg-[#101219] border border-white/[0.09] focus:border-[#8b7ff0]/50 rounded-lg p-3 text-[12.5px] text-[#e8e8ee] outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-[7px] border border-white/[0.09] bg-white/[0.045] text-[12.5px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerateSql}
              disabled={!sqlPrompt.trim() || isGeneratingSql}
              className="px-4 py-2 rounded-[7px] text-[12.5px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingSql ? 'Generating PL/pgSQL…' : 'Generate Routine'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}