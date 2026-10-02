import { StateCreator } from "zustand";
import { applyNodeChanges } from "reactflow";
import type { CanonicalIR } from "@zero-dollar/ir-core";
import { StoreState, CanvasSlice, StickyNote, StickyNoteColor } from "../types";
import { normalizeNotes, persistToDB } from "../utils";

export const createCanvasSlice: StateCreator<
  StoreState,
  [],
  [],
  CanvasSlice
> = (set, get) => ({
  nodes: [],
  canvasMode: "select",
  notes: [],

  setCanvasMode: (mode) => set({ canvasMode: mode }),

  addNote: () => {
    const { present, projectId, showToast } = get();
    const palette: StickyNoteColor[] = [
      "yellow",
      "amber",
      "rose",
      "violet",
      "cyan",
      "lime",
    ];
    const currentNotes = normalizeNotes(present.notes);
    const nextColor = palette[currentNotes.length % palette.length];

    const newNote: StickyNote = {
      id: `note_${Date.now()}`,
      x: 220 + Math.round(Math.random() * 80),
      y: 160 + Math.round(Math.random() * 80),
      text: "New note — click to edit",
      color: nextColor,
    };

    const nextNotes: StickyNote[] = [...currentNotes, newNote];
    const newIR: CanonicalIR = { ...present, notes: nextNotes as any };

    set({
      present: newIR,
      notes: nextNotes,
      isDirty: true,
      syncStatus: "syncing",
    });
    if (projectId) persistToDB(projectId, newIR);
    showToast("Note added to canvas");
  },

  updateNote: (id, patch) => {
    const { present, projectId } = get();
    const currentNotes = normalizeNotes(present.notes);
    const nextNotes: StickyNote[] = currentNotes.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    );
    const newIR: CanonicalIR = { ...present, notes: nextNotes as any };

    set({
      present: newIR,
      notes: nextNotes,
      isDirty: true,
      syncStatus: "syncing",
    });
    if (projectId) persistToDB(projectId, newIR);
  },

  deleteNote: (id) => {
    const { present, projectId, showToast } = get();
    const currentNotes = normalizeNotes(present.notes);
    const nextNotes: StickyNote[] = currentNotes.filter((n) => n.id !== id);
    const newIR: CanonicalIR = { ...present, notes: nextNotes as any };

    set({
      present: newIR,
      notes: nextNotes,
      isDirty: true,
      syncStatus: "syncing",
    });
    if (projectId) persistToDB(projectId, newIR);
    showToast("Note deleted");
  },

  autoArrangeNodes: () => {
    const cols = 3,
      gapX = 360,
      gapY = 300;
    set((state) => ({
      nodes: state.nodes.map((node, i) => ({
        ...node,
        position: {
          x: 80 + (i % cols) * gapX,
          y: 60 + Math.floor(i / cols) * gapY,
        },
      })),
    }));
    get().showToast("Tables auto-arranged");
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },
});
