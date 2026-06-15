import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePanelEditingStore } from '@/store/panelEditingStore';
import { useAppStore } from '@/store/useAppStore';
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
    savedFilePath,
    setSavedFilePath,
  } = usePanelEditingStore();

  const { currentProject } = useAppStore();

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
      // Sauvegarder d'abord les changements dans la base de données
      await window.bilpow.panels.saveChanges({ panelId, changes });
      clearEditingState();
      await refreshElements();
      await refreshPanels();

      // Si aucun chemin n'est défini, ouvrir la boîte de dialogue pour exporter
      if (!savedFilePath) {
        if (currentProject) {
          const exportResult = await window.bilpow.project.export(currentProject.id);
          if (exportResult.success && exportResult.filePath) {
            setSavedFilePath(exportResult.filePath);
            toast.success('Modifications enregistrées et fichier exporté');
          } else if (exportResult.error && exportResult.error !== 'Export annulé') {
            toast.error(exportResult.error);
          }
        }
      } else {
        // Exporter directement avec le chemin sauvegardé
        if (currentProject) {
          const exportResult = await window.bilpow.project.exportWithPath(currentProject.id, savedFilePath);
          if (exportResult.success) {
            toast.success('Modifications enregistrées et fichier exporté');
          } else if (exportResult.error) {
            toast.error(exportResult.error);
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    }
  }, [getPendingChanges, panelId, savedFilePath, setSavedFilePath, clearEditingState, refreshElements, refreshPanels, currentProject]);

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
