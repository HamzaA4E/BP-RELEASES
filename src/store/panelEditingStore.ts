import { create } from 'zustand';
import type { PanelChange } from '@/types';
import type { EditOperation } from '@/utils/panelEditing';

const MAX_UNDO = 50;

interface UndoEntry {
  inverse: EditOperation['inverse'];
  redo: EditOperation['redo'];
  pending: PanelChange[];
}

interface PanelEditingState {
  panelId: number | null;
  pendingChanges: PanelChange[];
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  tempIdCounter: number;
  savedFilePath: string | null;

  initPanel: (panelId: number) => void;
  reset: () => void;
  hasUnsavedChanges: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  nextTempId: () => number;

  recordOperation: (operation: EditOperation) => void;
  consumeUndo: () => UndoEntry | undefined;
  consumeRedo: () => UndoEntry | undefined;
  clearEditingState: () => void;
  getPendingChanges: () => PanelChange[];
  removePendingForTempElement: (tempId: number) => void;
  setSavedFilePath: (filePath: string | null) => void;
}

export const usePanelEditingStore = create<PanelEditingState>((set, get) => ({
  panelId: null,
  pendingChanges: [],
  undoStack: [],
  redoStack: [],
  tempIdCounter: -1,
  savedFilePath: null,

  initPanel: (panelId) =>
    set({
      panelId,
      pendingChanges: [],
      undoStack: [],
      redoStack: [],
      tempIdCounter: -1,
      savedFilePath: null,
    }),

  reset: () =>
    set({
      panelId: null,
      pendingChanges: [],
      undoStack: [],
      redoStack: [],
      tempIdCounter: -1,
      savedFilePath: null,
    }),

  hasUnsavedChanges: () => get().pendingChanges.length > 0,

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,

  nextTempId: () => {
    const id = get().tempIdCounter;
    set({ tempIdCounter: id - 1 });
    return id;
  },

  recordOperation: (operation) =>
    set((state) => {
      const entry: UndoEntry = {
        inverse: operation.inverse,
        redo: operation.redo,
        pending: operation.pending,
      };
      return {
        pendingChanges: [...state.pendingChanges, ...operation.pending],
        undoStack: [...state.undoStack, entry].slice(-MAX_UNDO),
        redoStack: [],
      };
    }),

  consumeUndo: () => {
    const state = get();
    if (state.undoStack.length === 0) return undefined;
    const entry = state.undoStack[state.undoStack.length - 1];
    set({
      undoStack: state.undoStack.slice(0, -1),
      pendingChanges: state.pendingChanges.slice(0, -entry.pending.length),
      redoStack: [...state.redoStack, entry],
    });
    return entry;
  },

  consumeRedo: () => {
    const state = get();
    if (state.redoStack.length === 0) return undefined;
    const entry = state.redoStack[state.redoStack.length - 1];
    set({
      redoStack: state.redoStack.slice(0, -1),
      pendingChanges: [...state.pendingChanges, ...entry.pending],
      undoStack: [...state.undoStack, entry].slice(-MAX_UNDO),
    });
    return entry;
  },

  clearEditingState: () =>
    set({
      pendingChanges: [],
      undoStack: [],
      redoStack: [],
    }),

  getPendingChanges: () => get().pendingChanges,

  removePendingForTempElement: (tempId) =>
    set((state) => ({
      pendingChanges: state.pendingChanges.filter((c) => {
        if (c.type === 'createElement' && c.tempId === tempId) return false;
        if (c.type === 'createArticle' && c.data.element_id === tempId) return false;
        if (c.type === 'updateElement' && c.id === tempId) return false;
        return true;
      }),
    })),

  setSavedFilePath: (filePath) => set({ savedFilePath: filePath }),
}));
