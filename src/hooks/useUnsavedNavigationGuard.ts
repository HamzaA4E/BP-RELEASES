import { useState, useCallback } from 'react';
import { usePanelEditingStore } from '@/store/panelEditingStore';

export function useUnsavedNavigationGuard() {
  const hasUnsaved = usePanelEditingStore((s) => s.pendingChanges.length > 0);
  const clearEditingState = usePanelEditingStore((s) => s.clearEditingState);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const guardedNavigate = useCallback(
    (action: () => void) => {
      if (!hasUnsaved) {
        action();
        return;
      }
      setPendingAction(() => action);
      setShowConfirm(true);
    },
    [hasUnsaved]
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
