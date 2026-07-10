import { create } from "zustand";
import type { PanelChange } from "@/types";
import type { EditOperation } from "@/utils/panelEditing";

const MAX_UNDO = 50;

// Helper function to match PanelChange objects for undo/redo
function changesMatch(a: PanelChange, b: PanelChange): boolean {
  if (a.type !== b.type) return false;
  
  switch (a.type) {
    case 'createElement':
      return b.type === 'createElement' && a.tempId === b.tempId;
    case 'createArticle':
      return b.type === 'createArticle' && a.tempId === b.tempId;
    case 'updateElement':
      return b.type === 'updateElement' && a.id === b.id;
    case 'updateArticle':
      return b.type === 'updateArticle' && a.id === b.id;
    case 'deleteElement':
      return b.type === 'deleteElement' && a.id === b.id;
    case 'deleteArticle':
      return b.type === 'deleteArticle' && a.id === b.id;
    case 'reorderElements':
      return b.type === 'reorderElements' && 
             a.orderedIds.length === b.orderedIds.length &&
             a.orderedIds.every((id, i) => id === b.orderedIds[i]);
    default:
      return false;
  }
}

interface UndoEntry {
  inverse: EditOperation["inverse"];
  redo: EditOperation["redo"];
  pending: PanelChange[];
  undoPending: PanelChange[];
  redoPending: PanelChange[];
  committed: boolean;
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
  markSaved: () => void;
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
        undoPending: operation.undoPending ?? [],
        redoPending: operation.redoPending ?? operation.pending,
        committed: false,
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
    const entry = state.undoStack[state.undoStack.length - 1]!;
    
    if (entry.committed) {
      // After save, undo adds undoPending changes to pendingChanges
      set({
        undoStack: state.undoStack.slice(0, -1),
        pendingChanges: [...state.pendingChanges, ...entry.undoPending],
        redoStack: [...state.redoStack, entry],
      });
    } else {
      // Before save, undo removes the pending changes that were added by this operation
      // We need to remove the specific changes that match entry.pending
      // Use a more robust approach: remove changes from the end that match the operation's pending
      const pendingToRemove = [...entry.pending]; // Copy to avoid mutating original
      const filteredPending = state.pendingChanges.filter((change) => {
        // Try to match against pendingToRemove
        for (let i = 0; i < pendingToRemove.length; i++) {
          const toRemove = pendingToRemove[i];
          if (toRemove && changesMatch(change, toRemove)) {
            pendingToRemove.splice(i, 1);
            return false; // Remove this change
          }
        }
        return true; // Keep this change
      });
      
      set({
        undoStack: state.undoStack.slice(0, -1),
        pendingChanges: filteredPending,
        redoStack: [...state.redoStack, entry],
      });
    }
    return entry;
  },

  consumeRedo: () => {
    const state = get();
    if (state.redoStack.length === 0) return undefined;
    const entry = state.redoStack[state.redoStack.length - 1]!;
    
    if (entry.committed) {
      // After save, redo removes undoPending and adds redoPending
      set({
        redoStack: state.redoStack.slice(0, -1),
        pendingChanges: [
            ...state.pendingChanges.slice(
              0,
              Math.max(
                0,
                state.pendingChanges.length - entry.undoPending.length,
              ),
            ),
            ...entry.redoPending,
          ],
        undoStack: [...state.undoStack, entry].slice(-MAX_UNDO),
      });
    } else {
      // Before save, redo adds the pending changes back
      set({
        redoStack: state.redoStack.slice(0, -1),
        pendingChanges: [...state.pendingChanges, ...entry.pending],
        undoStack: [...state.undoStack, entry].slice(-MAX_UNDO),
      });
    }
    return entry;
  },

  clearEditingState: () =>
    set({
      pendingChanges: [],
      undoStack: [],
      redoStack: [],
    }),

  markSaved: () =>
    set((state) => {
      console.log('[panelEditingStore markSaved] Before:', {
        pendingChanges: state.pendingChanges.length,
        undoStack: state.undoStack.length,
        redoStack: state.redoStack.length,
      });
      const result = {
        pendingChanges: [],
        redoStack: [],
        undoStack: state.undoStack.map((entry) => ({
          ...entry,
          committed: true,
        })),
      };
      console.log('[panelEditingStore markSaved] After:', {
        pendingChanges: result.pendingChanges.length,
        undoStack: result.undoStack.length,
        redoStack: result.redoStack.length,
      });
      return result;
    }),

  getPendingChanges: () => get().pendingChanges,

  removePendingForTempElement: (tempId) =>
    set((state) => ({
      pendingChanges: state.pendingChanges.filter((c) => {
        if (c.type === "createElement" && c.tempId === tempId) return false;
        if (c.type === "createArticle" && c.data.element_id === tempId)
          return false;
        if (c.type === "updateElement" && c.id === tempId) return false;
        if (c.type === "reorderElements" && c.orderedIds.includes(tempId)) return false;
        return true;
      }),
    })),

  setSavedFilePath: (filePath) => set({ savedFilePath: filePath }),
}));
