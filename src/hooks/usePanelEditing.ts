import { useCallback } from "react";
import toast from "react-hot-toast";
import { usePanelEditingStore } from "@/store/panelEditingStore";
import { useAppStore } from "@/store/useAppStore";
import { applyLocalMutations } from "@/utils/panelEditing";
import type { Article, Element } from "@/types";

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
    markSaved,
    getPendingChanges,
    hasUnsavedChanges,
    canUndo,
    canRedo,
    initPanel,
    reset,
  } = usePanelEditingStore();

  const { currentProject, markProjectDirty, markProjectClean, clearNewPanelIds, clearNewLocationIds } = useAppStore();

  const applyMutations = useCallback(
    (mutations: Parameters<typeof applyLocalMutations>[2]) => {
      const result = applyLocalMutations(
        elements,
        articlesByElement,
        mutations,
      );
      setElements(result.elements);
      setArticlesByElement(result.articlesByElement);
      markProjectDirty();
      return result;
    },
    [elements, articlesByElement, setElements, setArticlesByElement, markProjectDirty],
  );

  const undo = useCallback(() => {
    const entry = consumeUndo();
    if (!entry) return;
    applyMutations(entry.inverse);
    toast.success("Annulé");
  }, [consumeUndo, applyMutations]);

  const redo = useCallback(() => {
    const entry = consumeRedo();
    if (!entry) return;
    applyMutations(entry.redo);
    toast.success("Rétabli");
  }, [consumeRedo, applyMutations]);

  const save = useCallback(async () => {
    const changes = getPendingChanges();
    if (changes.length === 0) {
      toast.success("Aucune modification à enregistrer");
      return;
    }

    try {
      // Clean up any orphaned temp element changes before saving
      // Also remove any duplicate changes that might have been created by undo/redo
      const seenChanges = new Set<string>();
      const cleanedChanges = changes.filter(change => {
        console.log('[savePanel] Filtering change:', change.type, change);
        if (change.type === 'createElement') {
          // Keep only if the temp ID is still valid (negative)
          // This prevents "Unresolved temporary element id" errors
          if (change.tempId >= 0) return false;
          
          // Remove duplicates by tracking seen tempIds
          const key = `createElement-${change.tempId}`;
          if (seenChanges.has(key)) {
            console.log('[savePanel] Skipping duplicate createElement:', change.tempId);
            return false;
          }
          seenChanges.add(key);
          return true;
        }
        if (change.type === 'createArticle') {
          const key = `createArticle-${change.tempId}`;
          if (seenChanges.has(key)) {
            console.log('[savePanel] Skipping duplicate createArticle:', change.tempId);
            return false;
          }
          seenChanges.add(key);
          return true;
        }
        if (change.type === 'updateElement') {
          const key = `updateElement-${change.id}`;
          if (seenChanges.has(key)) {
            console.log('[savePanel] Skipping duplicate updateElement:', change.id);
            return false;
          }
          seenChanges.add(key);
          return true;
        }
        if (change.type === 'updateArticle') {
          const key = `updateArticle-${change.id}`;
          if (seenChanges.has(key)) {
            console.log('[savePanel] Skipping duplicate updateArticle:', change.id);
            return false;
          }
          seenChanges.add(key);
          return true;
        }
        if (change.type === 'reorderElements') {
          // Don't filter temporary IDs - they will be resolved in applyPanelChanges
          // Filtering them causes new elements to lose their order position
          return true;
        }
        return true;
      });

      if (cleanedChanges.length === 0) {
        toast.success("Aucune modification à enregistrer");
        return;
      }

      // D'abord, gérer l'export du projet (boîte de dialogue si nécessaire)
      if (currentProject) {
        const storedPath = currentProject.file_path;

        if (storedPath) {
          // Exporter directement avec le chemin sauvegardé
          const exportResult = await window.bilpow.project.exportWithPath(
            currentProject.id,
            storedPath,
          );
          if (exportResult.error) {
            toast.error(exportResult.error);
            return; // Arrêter si l'export échoue
          }
        } else {
          // Si aucun chemin n'est défini, ouvrir la boîte de dialogue pour exporter
          const exportResult = await window.bilpow.project.export(
            currentProject.id,
          );
          if (exportResult.error) {
            if (exportResult.error !== "Export annulé") {
              toast.error(exportResult.error);
            }
            // Si l'utilisateur annule ou s'il y a une erreur, ne pas sauvegarder
            return;
          }
        }
      }

      // Sauvegarder les changements dans la base de données seulement après export réussi
      console.log('[savePanel] Saving changes:', cleanedChanges.length, 'changes');
      await window.bilpow.panels.saveChanges({ panelId, changes: cleanedChanges });
      console.log('[savePanel] Changes saved, calling markSaved()');
      markSaved();
      console.log('[savePanel] After markSaved, pendingChanges:', getPendingChanges().length);
      await refreshElements();
      await refreshPanels();

      // Clear new panel and location IDs after successful save
      clearNewPanelIds();
      clearNewLocationIds();

      // Mark project as clean after successful save
      markProjectClean();

      // Show success message after both database save and export
      toast.success("Enregistrement effectué avec succès");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de la sauvegarde",
      );
    }
  }, [
    getPendingChanges,
    panelId,
    markSaved,
    refreshElements,
    refreshPanels,
    currentProject,
    clearNewPanelIds,
    clearNewLocationIds,
    markProjectClean,
  ]);

  const discard = useCallback(async () => {
    clearEditingState();
    await refreshElements();
    toast.success("Modifications abandonnées");
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
