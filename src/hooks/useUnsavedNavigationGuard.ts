import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePanelEditingStore } from '@/store/panelEditingStore';
import { useAppStore } from '@/store/useAppStore';

export function useUnsavedNavigationGuard() {
  const hasUnsaved = usePanelEditingStore((s) => s.pendingChanges.length > 0);
  const savedFilePath = usePanelEditingStore((s) => s.savedFilePath);
  const clearEditingState = usePanelEditingStore((s) => s.clearEditingState);
  const { currentProject, setProjects, locations, panels, projectDirty, markProjectClean, setCurrentProject, setLocations, setPanels, newLocationIds, clearNewLocationIds, newPanelIds, clearNewPanelIds } = useAppStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const guardedNavigate = useCallback(
    (action: () => void) => {
      // Prevent multiple dialogs - if already showing confirmation, don't show another
      if (showConfirm) {
        console.log('[guardedNavigate] Dialog already open, ignoring navigation request');
        return;
      }

      // Check if project has been saved to disk (has physical file path)
      const projectSavedPath = currentProject
        ? localStorage.getItem(`bilpow_export_path_${currentProject.id}`)
        : null;
      const hasProjectPath = projectSavedPath !== null;

      // Check if project has unsaved data (locations or panels)
      const hasProjectData = locations.length > 0 || panels.length > 0;

      // Only show confirmation if:
      // - Project is dirty (has unsaved changes), OR
      // - The project has no physical file path AND has data (new project with unsaved data), OR
      // - The project has no physical file path AND is the current project (new project that needs to be saved)

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

      // If project is dirty, show confirmation
      if (projectDirty) {
        setPendingAction(() => action);
        setShowConfirm(true);
        return;
      }

      // Otherwise allow navigation
      action();
    },
    [projectDirty, currentProject, locations, panels, showConfirm]
  );

  const confirmDiscard = useCallback(async () => {
    clearEditingState();
    setShowConfirm(false);

    // If project has no physical file path, delete it from database
    if (currentProject) {
      const projectSavedPath = localStorage.getItem(`bilpow_export_path_${currentProject.id}`);
      if (!projectSavedPath) {
        try {
          // Delete all locations first (to ensure cascade deletion works properly)
          const locations = await window.bilpow.locations.getByProject(currentProject.id);
          for (const location of locations) {
            await window.bilpow.locations.delete(location.id);
          }
          
          // Delete the project
          await window.bilpow.projects.delete(currentProject.id);
          
          // Clear local state
          setCurrentProject(null);
          setLocations([]);
          setPanels([]);
          clearNewLocationIds();
          
          // Refresh projects list
          const projects = await window.bilpow.projects.getAll();
          setProjects(projects);
          
          toast.success("Projet non enregistré supprimé");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
        }
      } else {
        // Project exists on disk - delete newly created locations and panels only
        try {
          console.log('[confirmDiscard] Deleting new locations:', newLocationIds);
          console.log('[confirmDiscard] Deleting new panels:', newPanelIds);
          console.log('[confirmDiscard] Current locations in state:', locations);
          
          // Delete newly created panels
          for (const panelId of newPanelIds) {
            await window.bilpow.panels.delete(panelId);
            console.log('[confirmDiscard] Deleted panel:', panelId);
          }
          clearNewPanelIds();
          
          // Delete newly created locations
          for (const locationId of newLocationIds) {
            await window.bilpow.locations.delete(locationId);
            console.log('[confirmDiscard] Deleted location:', locationId);
          }
          clearNewLocationIds();
          
          // Reload project data to reflect the deletion
          const locs = await window.bilpow.locations.getByProject(currentProject.id);
          console.log('[confirmDiscard] Reloaded locations after deletion:', locs);
          console.log('[confirmDiscard] Setting locations to:', locs);
          setLocations(locs);
          
          toast.success("Modifications non enregistrées abandonnées");
        } catch (err) {
          console.error('[confirmDiscard] Error deleting locations/panels:', err);
          toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
        }
      }
    }

    pendingAction?.();
    setPendingAction(null);
  }, [clearEditingState, currentProject, setProjects, pendingAction, setCurrentProject, setLocations, setPanels, newLocationIds, clearNewLocationIds, newPanelIds, clearNewPanelIds]);

  const confirmSave = useCallback(async () => {
    if (!currentProject || isSaving) {
      console.log('[confirmSave] Already saving or no project, skipping');
      return;
    }

    console.log('[confirmSave] Starting save process');
    setIsSaving(true);
    try {
      // Only try to trigger panel save if we have pending panel changes
      // This avoids the 2-second timeout when not in PanelView
      if (hasUnsaved) {
        let panelSaveCompleted = false;
        const savePromise = new Promise<void>((resolve) => {
          const handleSaveComplete = () => {
            window.removeEventListener('panel-save-complete', handleSaveComplete);
            panelSaveCompleted = true;
            console.log('[confirmSave] Panel save completed');
            resolve();
          };
          window.addEventListener('panel-save-complete', handleSaveComplete);
          console.log('[confirmSave] Dispatching panel-request-save event');
          window.dispatchEvent(new CustomEvent('panel-request-save'));
          // Timeout after 2 seconds if no response
          setTimeout(() => {
            window.removeEventListener('panel-save-complete', handleSaveComplete);
            console.log('[confirmSave] Panel save timeout');
            resolve();
          }, 2000);
        });

        await savePromise;
      }

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

        // Clear editing state, mark project clean, clear new location and panel IDs, and proceed with navigation
        clearEditingState();
        markProjectClean();
        clearNewLocationIds();
        clearNewPanelIds();
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
  }, [currentProject, isSaving, pendingAction, clearEditingState, markProjectClean, hasUnsaved]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
    setPendingAction(null);
  }, []);

  return { guardedNavigate, showConfirm, confirmDiscard, cancelDiscard, confirmSave, hasUnsaved, isSaving };
}
