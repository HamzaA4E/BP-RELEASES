import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAppStore } from "@/store/useAppStore";
import { navigateHierarchically, shouldShowBackButton } from "@/utils/hierarchicalNavigation";
import { useUnsavedNavigationGuard } from "@/hooks/useUnsavedNavigationGuard";

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, setDarkMode } = useAppStore();
  const canGoBack = shouldShowBackButton(location.pathname);
  const { guardedNavigate, showConfirm, confirmDiscard, cancelDiscard } = useUnsavedNavigationGuard();

  // Get action handlers from PanelView via custom event
  const [quickActions, setQuickActions] = useState<{
    onAddJdb?: () => void;
    onConfigurePrefix?: () => void;
    onSave?: () => void;
    canSave?: boolean;
    prefixEnabled?: boolean;
  }>({});

  const [hideQuickActions, setHideQuickActions] = useState(false);

  useEffect(() => {
    const handleSetQuickActions = (e: CustomEvent) => {
      setQuickActions(e.detail);
    };

    const handleModalStateChange = (e: CustomEvent) => {
      setHideQuickActions(e.detail.open);
    };

    window.addEventListener("quick-actions-update", handleSetQuickActions as EventListener);
    window.addEventListener("modal-state-change", handleModalStateChange as EventListener);
    return () => {
      window.removeEventListener("quick-actions-update", handleSetQuickActions as EventListener);
      window.removeEventListener("modal-state-change", handleModalStateChange as EventListener);
    };
  }, []);

  // Force re-render when quick actions change to ensure QuickActionsMenu gets fresh handlers
  useEffect(() => {
    // This effect runs whenever quickActions changes, ensuring QuickActionsMenu receives updated handlers
  }, [quickActions]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
        <header className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={() => guardedNavigate(() => navigateHierarchically(navigate, location.pathname))}
            disabled={!canGoBack}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 interactive-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Revenir en arrière"
          >
            <ArrowLeft size={16} />
            Retour
          </button>
          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg interactive-hover text-lg transition-colors"
            title={darkMode ? "Mode clair" : "Mode sombre"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          className: "dark:bg-gray-800 dark:text-white text-sm",
          duration: 3000,
        }}
      />
      <QuickActionsMenu
        onAddJdb={quickActions.onAddJdb}
        onConfigurePrefix={quickActions.onConfigurePrefix}
        onSave={quickActions.onSave}
        canSave={quickActions.canSave}
        hidden={hideQuickActions}
        prefixEnabled={quickActions.prefixEnabled}
      />
      <ConfirmDialog
        isOpen={showConfirm}
        title="Modifications non enregistrées"
        message="Vous avez des modifications non enregistrées sur ce tableau. Voulez-vous les abandonner ?"
        confirmLabel="Abandonner"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        tertiaryLabel="Enregistrer"
        onTertiary={() => {
          cancelDiscard();
          window.dispatchEvent(new CustomEvent('panel-request-save'));
        }}
      />
    </div>
  );
}
