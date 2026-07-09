import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";
import { calculationCurrent, formatPower } from "@/utils/calculations";
import { exportLocationToExcel } from "@/utils/export";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUnsavedNavigationGuard } from "@/hooks/useUnsavedNavigationGuard";
import { formatNumber } from "@/utils/calculations";
import type { PanelWithStats } from "@/types";

export function LocationView() {
  const { projectId, locationId } = useParams<{
    projectId: string;
    locationId: string;
  }>();
  const navigate = useNavigate();
  const pId = Number(projectId);
  const lId = Number(locationId);
  const { panels, setPanels, setSelection, setLocations, company, markProjectDirty, markProjectClean, addNewPanelId, clearNewPanelIds, clearNewLocationIds, currentProject } =
    useAppStore();
  const { guardedNavigate } = useUnsavedNavigationGuard();
  const [locationName, setLocationName] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newPanelName, setNewPanelName] = useState("");
  const [saving, setSaving] = useState(false);
  const panelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddPanel && panelInputRef.current) {
      panelInputRef.current.focus();
    }
  }, [showAddPanel]);

  const handleSave = async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      const localStorageKey = `bilpow_export_path_${pId}`;
      const storedPath = localStorage.getItem(localStorageKey);

      if (storedPath) {
        const result = await window.bilpow.project.exportWithPath(pId, storedPath);
        if (result.error) {
          toast.error(result.error);
          return;
        }
      } else {
        const result = await window.bilpow.project.export(pId);
        if (result.success && result.filePath) {
          localStorage.setItem(localStorageKey, result.filePath);
        } else if (result.error) {
          if (result.error !== "Export annulé") {
            toast.error(result.error);
          }
          return;
        }
      }
      markProjectClean();
      clearNewPanelIds();
      clearNewLocationIds();
      toast.success("Projet enregistré avec succès");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };
  const [, setExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedPanelIds, setSelectedPanelIds] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    try {
      const locs = await window.bilpow.locations.getByProject(pId);
      setLocations(locs);
      const loc = locs.find((l) => l.id === lId);
      if (loc) setLocationName(loc.name);
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      setSelection({
        type: "location",
        projectId: pId,
        locationId: lId,
        panelId: null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }, [pId, lId, setLocations, setPanels, setSelection]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useKeyboardShortcuts({
    onExport: () => void handleExport(),
  });

  const saveLocationName = async (name: string) => {
    try {
      await window.bilpow.locations.update({ id: lId, name });
      toast.success("Emplacement mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleAddPanel = async () => {
    if (!newPanelName.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    try {
      const panel = await window.bilpow.panels.create({
        location_id: lId,
        name: newPanelName.trim(),
      });
      addNewPanelId(panel.id);
      setNewPanelName("");
      setShowAddPanel(false);
      await loadData();
      markProjectDirty();
      toast.success("Tableau ajouté");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const openPanel = (panelId: number) => {
    setSelection({ type: "panel", projectId: pId, locationId: lId, panelId });
    navigate(`/project/${pId}/location/${lId}/panel/${panelId}`);
  };

  const handleExport = async (panelIds?: number[]) => {
    setExporting(true);
    try {
      const result = await exportLocationToExcel(
        lId,
        company ?? undefined,
        panelIds,
      );
      if (result.filePath) {
        toast.success(`Export réussi: ${result.filePath}`);
        if (result.warning) {
          toast(result.warning, { icon: "ℹ️", duration: 6000 });
        }
        await window.bilpow.shell.openPath(result.filePath);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'export");
    } finally {
      setExporting(false);
    }
  };

  const handleExportSelected = async () => {
    if (selectedPanelIds.length === 0) {
      toast.error("Veuillez sélectionner au moins un tableau");
      return;
    }
    setShowExportDialog(false);
    await handleExport(selectedPanelIds);
    setSelectedPanelIds([]);
  };

  const togglePanelSelection = (panelId: number) => {
    setSelectedPanelIds((prev) =>
      prev.includes(panelId)
        ? prev.filter((id) => id !== panelId)
        : [...prev, panelId],
    );
  };

  const toggleAllPanels = (panelsList: PanelWithStats[]) => {
    setSelectedPanelIds((prev) =>
      prev.length === panelsList.length ? [] : panelsList.map((p) => p.id),
    );
  };

  const handleDeleteLocation = async () => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'emplacement "${locationName}" ?\n\nCette action supprimera également tous les tableaux contenus dans cet emplacement.`)) {
      return;
    }
    try {
      await window.bilpow.locations.delete(lId);
      toast.success("Emplacement supprimé");
      navigate(`/project/${pId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  const handleDeletePanel = async (panelId: number, panelName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le tableau "${panelName}" ?\n\nCette action est irréversible.`)) {
      return;
    }
    try {
      await window.bilpow.panels.delete(panelId);
      toast.success("Tableau supprimé");
      await loadData();
      markProjectDirty();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              onBlur={(e) => void saveLocationName(e.target.value)}
              className="text-2xl font-bold text-primary dark:text-white bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-accent outline-none w-full max-w-md"
            />
            <p className="text-sm text-gray-500 mt-1">
              {panels.length} tableau{panels.length !== 1 ? "x" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-primary text-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "💾 Enregistrer"
              )}
            </button>
            <button
              type="button"
              onClick={handleDeleteLocation}
              className="btn-danger text-sm"
              title="Supprimer l'emplacement"
            >
              🗑️ Supprimer l'emplacement
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPanelIds(panels.map((p) => p.id));
                setShowExportDialog(true);
              }}
              className="btn-secondary text-sm"
            >
              📊 Exporter tableaux
            </button>
            <button
              type="button"
              onClick={() => setShowAddPanel(true)}
              className="btn-primary text-sm"
            >
              + Ajouter un tableau
            </button>
          </div>
           
        </div>

        {panels.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            Aucun tableau. Ajoutez un tableau pour commencer le bilan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {panels.map((panel) => (
              <div
                key={panel.id}
                className="card card-hover-readable p-5 hover:shadow-md transition-all cursor-pointer border-2 border-transparent hover:border-accent/30 relative group"
                onClick={() => openPanel(panel.id)}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeletePanel(panel.id, panel.name);
                  }}
                  className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer le tableau"
                >
                  🗑️
                </button>
                <h3 className="font-semibold text-primary dark:text-white mb-2 pr-8">
                  ⚡ {panel.name}
                </h3>
                <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
                  <p>
                    {panel.element_count} élément
                    {panel.element_count !== 1 ? "s" : ""}
                  </p>
                  <p>P. installée: {formatPower(panel.installed_power_w)}</p>
                  <p>
                    Intensité de calcul:{" "}
                    {formatNumber(
                      calculationCurrent(panel.installed_power_w),
                      2,
                    )}{" "}
                    A
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card p-6 w-full max-w-sm mx-4">
              <h3 className="font-semibold mb-3">Nouveau tableau</h3>
              <input
                ref={panelInputRef}
                type="text"
                value={newPanelName}
                onChange={(e) => setNewPanelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddPanel();
                }}
                className="input-field mb-4"
                placeholder="Ex: TGBT, TD01..."
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddPanel(false)}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddPanel()}
                  className="btn-primary"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card p-6 w-full max-w-md mx-4">
              <h3 className="font-semibold text-lg mb-1">
                Exporter les tableaux
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Sélectionnez les tableaux à inclure dans l'export Excel.
              </p>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4 max-h-72 overflow-y-auto">
                <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={
                      panels.length > 0 &&
                      selectedPanelIds.length === panels.length
                    }
                    onChange={() => toggleAllPanels(panels)}
                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Tout sélectionner
                  </span>
                </label>
                {panels.map((panel) => (
                  <label
                    key={panel.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPanelIds.includes(panel.id)}
                      onChange={() => togglePanelSelection(panel.id)}
                      className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        ⚡ {panel.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {panel.element_count} élément
                        {panel.element_count !== 1 ? "s" : ""} ·{" "}
                        {formatPower(panel.installed_power_w)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowExportDialog(false);
                    setSelectedPanelIds([]);
                  }}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportSelected()}
                  disabled={selectedPanelIds.length === 0}
                  className="btn-primary disabled:opacity-50"
                >
                  Exporter {selectedPanelIds.length > 0 && selectedPanelIds.length}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
