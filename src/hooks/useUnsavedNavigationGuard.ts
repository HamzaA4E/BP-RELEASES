import { useState, useCallback } from 'react';
import { usePanelEditingStore } from '@/store/panelEditingStore';

export function useUnsavedNavigationGuard() {
  const hasUnsaved = usePanelEditingStore((s) => s.pendingChanges.length > 0);
  const savedFilePath = usePanelEditingStore((s) => s.savedFilePath);
  const clearEditingState = usePanelEditingStore((s) => s.clearEditingState);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const guardedNavigate = useCallback(
    (action: () => void) => {
      // Only show confirmation if there are unsaved changes AND no physical file path
      // (i.e., new project that hasn't been saved to disk yet)
      if (!hasUnsaved || savedFilePath !== null) {
        action();
        return;
      }
      setPendingAction(() => action);
      setShowConfirm(true);
    },
    [hasUnsaved, savedFilePath]
  );

  const confirmDiscard = useCallback(() => {
    clearEditingState();
    setShowConfirm(false);
    pendingAction?.();
    setPendingAction(null);
  }, [clearEditingState, pendingAction]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
    setPendingAction(null);
  }, []);

  return { guardedNavigate, showConfirm, confirmDiscard, cancelDiscard, hasUnsaved };
}
