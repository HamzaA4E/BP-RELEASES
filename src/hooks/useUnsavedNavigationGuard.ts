import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePanelEditingStore } from '@/store/panelEditingStore';
import { useAppStore } from '@/store/useAppStore';

export function useUnsavedNavigationGuard() {
  const hasUnsaved = usePanelEditingStore((s) => s.pendingChanges.length > 0);
  const savedFilePath = usePanelEditingStore((s) => s.savedFilePath);
  const clearEditingState = usePanelEditingStore((s) => s.clearEditingState);
  const { currentProject, setProjects, locations, panels, projectDirty, markProjectClean } = useAppStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const guardedNavigate = useCallback(
    (action: () => void) => {
      // Check if project has been saved to disk (has physical file path)
      const projectSavedPath = currentProject
        ? localStorage.getItem(`bilpow_export_path_${currentProject.id}`)
        : null;
      const hasProjectPath = projectSavedPath !== null;

      // Check if project has unsaved data (locations or panels)
      const hasProjectData = locations.length > 0 || panels.length > 0;

      // Only show confirmation if:
      // - Project is dirty AND navigation is leaving the project (not intra-project navigation)
      // - The project has no physical file path AND has data (new project with unsaved data)
      // - The project has no physical file path AND is the current project (new project that needs to be saved)

      // Allow intra-project navigation (within the same project) even if dirty
      // This is handled by checking if the action is navigating within the current project
      // For now, we'll use a simpler approach: only show confirmation if leaving the project

      if (!projectDirty && hasProjectPath) {
        action();
        return;
      }

      // If project has no path but has data, or is a new project without path, show confirmation
      if (!hasProjectPath && currentProject) {
        setPendingAction(() => action);
        setShowConfirm(true);
        return;
      }

      // If project is dirty, we need to check if this is intra-project navigation
      // For now, we'll show confirmation for all dirty state navigation
      // TODO: Improve this to detect intra-project navigation and allow it
      if (projectDirty) {
        setPendingAction(() => action);
        setShowConfirm(true);
        return;
      }

      // Otherwise allow navigation
      action();
    },
    [projectDirty, currentProject, locations, panels]
  );

  const confirmDiscard = useCallback(async () => {
    clearEditingState();
    setShowConfirm(false);
    
    // If project has no physical file path, delete it from database
    if (currentProject) {
      const projectSavedPath = localStorage.getItem(`bilpow_export_path_${currentProject.id}`);
      if (!projectSavedPath) {
        try {
          await window.bilpow.projects.delete(currentProject.id);
          // Refresh projects list
          const projects = await window.bilpow.projects.getAll();
          setProjects(projects);
          toast.success("Projet non enregistré supprimé");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
        }
      } else {
        // Project exists on disk, restore from last save
        try {
          const restoreResult = await window.bilpow.project.restore(currentProject.id, projectSavedPath);
          if (restoreResult.success && restoreResult.projectId) {
            // Refresh projects list
            const projects = await window.bilpow.projects.getAll();
            setProjects(projects);
            toast.success("Projet restauré depuis le dernier enregistrement");
          } else {
            toast.error("Erreur lors de la restauration du projet");
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erreur lors de la restauration");
        }
      }
    }
    
    pendingAction?.();
    setPendingAction(null);
  }, [clearEditingState, currentProject, setProjects, pendingAction]);

  const confirmSave = useCallback(async () => {
    if (!currentProject || isSaving) return;

    setIsSaving(true);
    try {
      const localStorageKey = `bilpow_export_path_${currentProject.id}`;
      const storedPath = localStorage.getItem(localStorageKey);

      let exportResult;
      if (storedPath) {
        // Export directly with the saved path (no dialog)
        exportResult = await window.bilpow.project.exportWithPath(
          currentProject.id,
          storedPath,
        );
      } else {
        // Open save dialog for first save
        exportResult = await window.bilpow.project.export(currentProject.id);
      }

      if (exportResult.success && exportResult.filePath) {
        // Save the path to localStorage
        localStorage.setItem(localStorageKey, exportResult.filePath);
        toast.success("Projet enregistré");

        // Clear editing state, mark project clean (hierarchical save), and proceed with navigation
        clearEditingState();
        markProjectClean();
        setShowConfirm(false);
        pendingAction?.();
        setPendingAction(null);
      } else if (exportResult.error && exportResult.error !== "Export annulé") {
        toast.error(exportResult.error);
        // User canceled or error occurred, don't navigate
      }
      // If user canceled, don't navigate (dialog stays open)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  }, [currentProject, isSaving, pendingAction, clearEditingState, markProjectClean]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
    setPendingAction(null);
  }, []);

  return { guardedNavigate, showConfirm, confirmDiscard, cancelDiscard, confirmSave, hasUnsaved, isSaving };
}
