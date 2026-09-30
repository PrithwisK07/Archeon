import type { CanonicalIR, Entity, MasterAction, CustomSqlSnippet } from '@zero-dollar/ir-core';
import type { Node, NodeChange } from 'reactflow';
import type { UINodeData } from '../lib/reactFlowAdapter';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'warn';
  content: string;
}

export type StickyNoteColor = 'yellow' | 'amber' | 'rose' | 'violet' | 'cyan' | 'lime';

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: StickyNoteColor;
}

export interface InspectorTarget {
  entityName: string;
  fieldName: string;
}

export type IDECommand =
  | MasterAction
  | { action: 'ADD_CUSTOM_SQL'; payload: CustomSqlSnippet }
  | { action: 'REMOVE_CUSTOM_SQL'; id: string }
  | { action: 'UPDATE_CUSTOM_SQL'; id: string; payload: Partial<CustomSqlSnippet> };

export interface UISlice {
  isExplorerOpen: boolean;
  setIsExplorerOpen: (open: boolean) => void;
  isCopilotOpen: boolean;
  setIsCopilotOpen: (open: boolean) => void;
  inspectorTarget: InspectorTarget | null;
  openInspector: (entityName: string, fieldName: string) => void;
  closeInspector: () => void;
  activeRoutineId: string | null;
  setActiveRoutineId: (id: string | null) => void;
  activeTableName: string | null;
  setActiveTableName: (name: string | null) => void;
  isApiPlaygroundOpen: boolean;
  setIsApiPlaygroundOpen: (open: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

export interface HistorySlice {
  projectId: string | null;
  projectName: string;
  past: CanonicalIR[];
  present: CanonicalIR;
  future: CanonicalIR[];
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  isDirty: boolean;
  setSyncStatus: (status: 'synced' | 'syncing' | 'error' | 'offline') => void;
  loadProjectState: (ir: CanonicalIR, chatHistory: ChatMessage[], repoUrl: string | null, name: string) => void;
  markClean: () => void;
  initializeProject: (projectId: string) => Promise<void>;
  applyAIPatch: (newIR: CanonicalIR) => void;
  undo: () => void;
  redo: () => void;
  dispatchManualAction: (command: IDECommand) => void;
}

export interface CanvasSlice {
  nodes: Node<UINodeData>[];
  canvasMode: 'select' | 'pan';
  setCanvasMode: (mode: 'select' | 'pan') => void;
  notes: StickyNote[];
  addNote: () => void;
  updateNote: (id: string, patch: Partial<StickyNote>) => void;
  deleteNote: (id: string) => void;
  autoArrangeNodes: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
}

export interface DataEngineSlice {
  seedTableData: (entityName: string, count?: number) => void;
  addTableRow: (entityName: string, initialData?: Record<string, any>) => Record<string, any> | null;
  updateTableRow: (entityName: string, rowIndex: number, fieldName: string, value: any) => void;
  deleteTableRow: (entityName: string, rowIndex: number) => void;
  clearTableData: (entityName: string) => void;
  setEntitySeedData: (entityName: string, rows: Record<string, any>[]) => void;
  updateEntityIndexes: (entityName: string, indexes: NonNullable<Entity['indexes']>) => void;
  autoWireCompositeRelation: (parentEntity: string, childEntity: string) => void;
}

export interface CompilerSlice {
  compiledFiles: Record<string, string> | null;
  isCompiling: boolean;
  compileError: string | null;
  exportedRepoUrl: string | null;
  chatHistory: ChatMessage[];
  setExportedRepoUrl: (url: string | null) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id'>) => void;
  updateCompiledFile: (path: string, content: string) => void;
  compileArchitecture: () => Promise<void>;
}

export type StoreState = UISlice & HistorySlice & CanvasSlice & DataEngineSlice & CompilerSlice;