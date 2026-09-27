import { useReactFlow, useViewport } from 'reactflow';
import { useArchitectureStore } from '../../store/architectureStore';

export function ZoomHud() {
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();

  return (
    <div className="absolute bottom-5 right-5 z-25 flex items-center bg-[#14161d] border border-white/[0.09] rounded-full p-1 gap-0.5 shadow-xl">
      <button
        type="button"
        onClick={() => zoomOut({ duration: 200 })}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee] cursor-pointer"
      >
        −
      </button>
      <span className="font-mono text-[11px] text-[#8a8b9a] w-[42px] text-center select-none">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => zoomIn({ duration: 200 })}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a8b9a] hover:bg-white/[0.045] hover:text-[#e8e8ee] cursor-pointer"
      >
        +
      </button>
    </div>
  );
}

export function StickyNotesLayer({ onAddTable }: { onAddTable: () => void }) {
  const { notes, updateNote, deleteNote } = useArchitectureStore();

  return (
    <>
      {notes.map((note) => (
        <div
          key={note.id}
          style={{ left: note.x, top: note.y }}
          className="group/note absolute w-[180px] min-h-[104px] bg-[#e0d199] text-[#3a3320] rounded-lg shadow-[0_14px_28px_-14px_rgba(0,0,0,0.5)] text-[12.5px] leading-[1.45] z-20"
        >
          <div
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              e.stopPropagation();
              const startX = e.clientX;
              const startY = e.clientY;
              const origX = note.x;
              const origY = note.y;
              const move = (ev: PointerEvent) => {
                updateNote(note.id, {
                  x: origX + (ev.clientX - startX),
                  y: origY + (ev.clientY - startY),
                });
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
            className="h-[18px] cursor-grab active:cursor-grabbing flex items-center relative"
          >
            <span className="flex-1 flex items-center justify-center gap-[3px]">
              <span className="w-[3px] h-[3px] rounded-full bg-[#3a3320]/40" />
              <span className="w-[3px] h-[3px] rounded-full bg-[#3a3320]/40" />
              <span className="w-[3px] h-[3px] rounded-full bg-[#3a3320]/40" />
            </span>
            <button
              type="button"
              onClick={() => deleteNote(note.id)}
              className="absolute right-1.5 top-[1px] w-4 h-4 rounded-[5px] text-[#3a3320] opacity-0 group-hover/note:opacity-60 hover:!opacity-100 hover:bg-[#3a3320]/12 flex items-center justify-center transition-opacity cursor-pointer"
              title="Delete note"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-[11px] h-[11px]"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => updateNote(note.id, { text: e.currentTarget.textContent || '' })}
            className="px-3 pb-3 outline-none break-words select-text"
          >
            {note.text}
          </div>
        </div>
      ))}

      {/* Bottom-Center "+ Add table" Pill */}
      <button
        type="button"
        onClick={onAddTable}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-25 flex items-center gap-2 pl-3.5 pr-4 py-[9px] rounded-full bg-[#14161d] border border-white/[0.09] hover:border-[#e08a3c]/40 shadow-[0_10px_26px_-10px_rgba(0,0,0,0.6)] text-[13px] transition-colors cursor-pointer"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e08a3c"
          strokeWidth="1.8"
          className="w-[15px] h-[15px]"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add table
      </button>

      {/* Bottom-Right Zoom HUD */}
      <ZoomHud />
    </>
  );
}