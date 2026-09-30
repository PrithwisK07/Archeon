import { create } from 'zustand';
import { StoreState } from './types';
import { createUISlice } from './slices/createUISlice';
import { createCanvasSlice } from './slices/createCanvasSlice';
import { createCompilerSlice } from './slices/createCompilerSlice';
import { createDataEngineSlice } from './slices/createDataEngineSlice';
import { createHistorySlice } from './slices/createHistorySlice';

export const useArchitectureStore = create<StoreState>()((...a) => ({
  ...createUISlice(...a),
  ...createCanvasSlice(...a),
  ...createCompilerSlice(...a),
  ...createDataEngineSlice(...a),
  ...createHistorySlice(...a),
}));

export * from './types'; 