import { useArchitectureStore } from '../../../store/architectureStore';
import { FieldProperties } from './FieldProperties';
import { FieldRelations } from './FieldRelations';
import { TableIndexes } from './TableIndexes';

export function FieldInspectorDrawer() {
  const { present, inspectorTarget, closeInspector } = useArchitectureStore();

  const inspectedEntity = inspectorTarget
    ? present.entities.find((e) => e.name === inspectorTarget.entityName)
    : null;
  const inspectedField =
    inspectedEntity && inspectorTarget
      ? inspectedEntity.fields.find((f) => f.name === inspectorTarget.fieldName)
      : null;

  const isInspectorOpen = Boolean(inspectorTarget && inspectedField);

  return (
    <div
      className={`absolute top-0 right-0 w-[320px] h-full z-40 bg-[#14161d] border-l border-white/[0.09] flex flex-col transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
        isInspectorOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
      }`}
    >
      <div className="px-4 py-3.5 border-b border-white/[0.09] flex items-center gap-[9px]">
        <b className="text-[13px] font-semibold">Edit field</b>
        <span className="text-[11px] text-[#565766] font-mono ml-auto mr-1.5 truncate max-w-[140px]">
          {inspectorTarget ? `${inspectorTarget.entityName}.${inspectorTarget.fieldName}` : ''}
        </span>
        <button
          type="button"
          onClick={closeInspector}
          className="w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] hover:border-white/20 flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
        >
          ✕
        </button>
      </div>

      {inspectorTarget && inspectedEntity && inspectedField && (
        <div className="flex-1 overflow-y-auto p-4">
          <FieldProperties entity={inspectedEntity} field={inspectedField} />
          <FieldRelations entity={inspectedEntity} field={inspectedField} />
          <TableIndexes entity={inspectedEntity} />
        </div>
      )}
    </div>
  );
}