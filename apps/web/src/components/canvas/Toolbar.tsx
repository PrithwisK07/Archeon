import { useArchitectureStore } from '../../store/architectureStore';

export function Toolbar() {
  const { nodes, dispatchManualAction } = useArchitectureStore();

  const handleAddTable = () => {
    const randomId = Math.floor(Math.random() * 1000);
    dispatchManualAction({
      action: "ADD_ENTITY",
      payload: {
        name: `NewTable_${randomId}`,
        fields: []
      }
    });
  };

  const handleAddField = () => {
    const selectedNode = nodes.find(n => n.selected);
    if (!selectedNode) {
      alert("Please select a table on the canvas first.");
      return;
    }

    const randomId = Math.floor(Math.random() * 1000);
    dispatchManualAction({
      action: "ADD_FIELD",
      targetEntity: selectedNode.id,
      payload: {
        name: `newField_${randomId}`,
        type: "string",
        nullable: false
      }
    });
  };

  const handleDelete = () => {
    const selectedNode = nodes.find(n => n.selected);
    if (!selectedNode) return;

    dispatchManualAction({
      action: "REMOVE_ENTITY",
      targetEntity: selectedNode.id
    });
  };

  return (
    <div className="flex flex-col gap-2 bg-[#111111] p-2 rounded-md border border-white/10 shadow-2xl">
      <button 
        onClick={handleAddTable}
        className="p-2 text-white/70 hover:text-white hover:bg-white/5 rounded transition-colors group relative"
        title="Add Table"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
      </button>

      <button 
        onClick={handleAddField}
        className="p-2 text-white/70 hover:text-white hover:bg-white/5 rounded transition-colors"
        title="Add Field to Selected Table"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <div className="w-full h-px bg-white/10 my-1" />

      <button 
        onClick={handleDelete}
        className="p-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-colors"
        title="Delete Selected Table"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  );
}