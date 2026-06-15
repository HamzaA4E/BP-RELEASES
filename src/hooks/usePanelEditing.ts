import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePanelEditingStore } from '@/store/panelEditingStore';
import { applyLocalMutations } from '@/utils/panelEditing';
import type { Article, Element } from '@/types';

interface UsePanelEditingOptions {
  panelId: number;
  elements: Element[];
  articlesByElement: Record<number, Article[]>;
  setElements: (elements: Element[]) => void;
  setArticlesByElement: (articles: Record<number, Article[]>) => void;
  refreshElements: () => Promise<void>;
  refreshPanels: () => Promise<void>;
}

export function usePanelEditing({
  panelId,
  elements,
  articlesByElement,
  setElements,
  setArticlesByElement,
  refreshElements,
  refreshPanels,
}: UsePanelEditingOptions) {
  const {
    recordOperation,
    consumeUndo,
    consumeRedo,
    clearEditingState,
    getPendingChanges,
    hasUnsavedChanges,
    canUndo,
    canRedo,
    initPanel,
    reset,
  } = usePanelEditingStore();

  const applyMutations = useCallback(
    (mutations: Parameters<typeof applyLocalMutations>[2]) => {
      const result = applyLocalMutations(elements, articlesByElement, mutations);
      setElements(result.elements);
      setArticlesByElement(result.articlesByElement);
      return result;
    },
    [elements, articlesByElement, setElements, setArticlesByElement]
  );

  const undo = useCallback(() => {
    const entry = consumeUndo();
    if (!entry) return;
    applyMutations(entry.inverse);
    toast.success('Annulé');
  }, [consumeUndo, applyMutations]);

  const redo = useCallback(() => {
    const entry = consumeRedo();
    if (!entry) return;
    applyMutations(entry.redo);
    toast.success('Rétabli');
  }, [consumeRedo, applyMutations]);

  const save = useCallback(async () => {
    const changes = getPendingChanges();
    if (changes.length === 0) {
      toast.success('Aucune modification à enregistrer');
      return;
    }
    try {
      await window.bilpow.panels.saveChanges({ panelId, changes });
      clearEditingState();
      await refreshElements();
      await refreshPanels();
      toast.success('Modifications enregistrées');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    }
  }, [getPendingChanges, panelId, clearEditingState, refreshElements, refreshPanels]);

  const discard = useCallback(async () => {
    clearEditingState();
    await refreshElements();
    toast.success('Modifications abandonnées');
  }, [clearEditingState, refreshElements]);

  return {
    recordOperation,
    applyMutations,
    undo,
    redo,
    save,
    discard,
    hasUnsavedChanges,
    canUndo,
    canRedo,
    initPanel,
    reset,
  };
}
