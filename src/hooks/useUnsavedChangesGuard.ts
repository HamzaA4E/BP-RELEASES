import { useEffect } from 'react';
import { usePanelEditingStore } from '@/store/panelEditingStore';

export function useUnsavedChangesGuard() {
  const hasUnsavedChanges = usePanelEditingStore((s) => s.hasUnsavedChanges());

  useEffect(() => {
    // Informer le main process de l'état des modifications non sauvegardées
    void window.bilpow?.app.setUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges]);
}
