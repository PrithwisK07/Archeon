import { useReactFlow, useViewport } from 'reactflow';
import {
  useArchitectureStore,
  StickyNoteColor,
} from '../../store/architectureStore';

const NOTE_THEMES: Record<
  StickyNoteColor,
  { bg: string; text: string; dot: string; swatch: string }
> = {
  yellow: {
    bg: 'bg-[#e0d199]',
    text: 'text-[#3a3320]',
    dot: 'bg-[#3a3320]/40',
    swatch: '#e0d199',
  },
  amber: {
    bg: 'bg-[#e6ad73]',
    text: 'text-[#2e1b09]',
    dot: 'bg-[#2e1b09]/40',
    swatch: '#e08a3c',
  },
  rose: {
    bg: 'bg-[#e39bb0]',
    text: 'text-[#33111c]',
    dot: 'bg-[#33111c]/40',
    swatch: '#e0708f',
  },
  violet: {
    bg: 'bg-[#b5adf2]',
    text: 'text-[#1c163b]',
    dot: 'bg-[#1c163b]/40',
    swatch: '#8b7ff0',
  },
  cyan: {
    bg: 'bg-[#8fd9e3]',
    text: 'text-[#0e2d33]',
    dot: 'bg-[#0e2d33]/40',
    swatch: '#3fc6d8',
  },
  lime: {
    bg: 'bg-[#b2d498]',
    text: 'text-[#1b2e10]',
    dot: 'bg-[#1b2e10]/40',
    swatch: '#8fbf6b',
  },
};

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
  const {
    present,
    notes: storeNotes,
    updateNote,
    deleteNote,
  } = useArchitectureStore();
  const { x: vpX, y: vpY, zoom } = useViewport();

  const notes = present.notes || storeNotes || [];

  return (
    <>
      {/* World-Space Container: Pans and zooms together with the ReactFlow canvas */}
      <div
        style={{
          transform: `translate(${vpX}px, ${vpY}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none z-20"
      >
        {notes.map((note) => {
          const colorKey: StickyNoteColor =
            (note.color as StickyNoteColor) || 'yellow';
          const theme = NOTE_THEMES[colorKey] || NOTE_THEMES.yellow;

          return (
            <div
              key={note.id}
              style={{ left: note.x, top: note.y }}
              className={`group/note pointer-events-auto absolute w-[190px] min-h-[108px] ${theme.bg} ${theme.text} rounded-lg shadow-[0_14px_28px_-14px_rgba(0,0,0,0.5)] text-[12.5px] leading-[1.45] transition-colors duration-150`}
            >
              {/* Drag Handle + Delete */}
              <div
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origX = note.x;
                  const origY = note.y;
                  const currentZoom = zoom || 1;

                  const move = (ev: PointerEvent) => {
                    updateNote(note.id, {
                      x: Math.round(origX + (ev.clientX - startX) / currentZoom),
                      y: Math.round(origY + (ev.clientY - startY) / currentZoom),
                    });
                  };
                  const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                  };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }}
                className="h-[22px] px-2 cursor-grab active:cursor-grabbing flex items-center justify-end relative"
              >
                {/* Center Grip Dots */}
                <span className="absolute inset-0 flex items-center justify-center gap-[3px] pointer-events-none">
                  <span className={`w-[3px] h-[3px] rounded-full ${theme.dot}`} />
                  <span className={`w-[3px] h-[3px] rounded-full ${theme.dot}`} />
                  <span className={`w-[3px] h-[3px] rounded-full ${theme.dot}`} />
                </span>

                {/* Delete Note Button */}
                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  className="w-4 h-4 rounded-[5px] opacity-0 group-hover/note:opacity-60 hover:!opacity-100 hover:bg-black/10 flex items-center justify-center transition-opacity cursor-pointer"
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

              {/* Editable Note Body */}
              <div
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) =>
                  updateNote(note.id, {
                    text: e.currentTarget.textContent || '',
                  })
                }
                className="px-3 pb-3 pt-0.5 outline-none break-words select-text"
              >
                {note.text}
              </div>
            </div>
          );
        })}
      </div>

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