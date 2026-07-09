import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Share2, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { formatPower } from "@/utils/calculations";
import { exportProjectExcelById } from "@/utils/projectExcelExport";
import { useUnsavedNavigationGuard } from "@/hooks/useUnsavedNavigationGuard";

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const id = Number(projectId);
  const {
    currentProject,
    setCurrentProject,
    locations,
    setLocations,
    setSelection,
    setPanels,
    company,
    markProjectDirty,
    addNewLocationId,
  } = useAppStore();
  const { guardedNavigate } = useUnsavedNavigationGuard();

  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingShare, setExportingShare] = useState(false);
  const [editFields, setEditFields] = useState({
    name: "",
    client: "",
    description: "",
  });
  const [newLocationName, setNewLocationName] = useState("");
  const [showAddLocation, setShowAddLocation] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const project = await window.bilpow.projects.getById(id);
      if (!project) {
        navigate("/");
        return;
      }
      console.log('[ProjectView loadData] Project file_path:', project.file_path);
      setCurrentProject(project);
      // Don't clear newLocationIds here - only clear when saving or changing projects
      setEditFields({
        name: project.name,
        client: project.client ?? "",
        description: project.description ?? "",
      });
      const locs = await window.bilpow.locations.getByProject(id);
      console.log('[ProjectView loadData] Loaded locations from DB:', locs);
      setLocations(locs);
      setSelection({
        type: "project",
        projectId: id,
        locationId: null,
        panelId: null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }, [id, navigate, setCurrentProject, setLocations, setSelection]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const saveField = async (field: keyof typeof editFields, value: string) => {
    try {
      const updated = await window.bilpow.projects.update({
        id,
        [field]: value || null,
      });
      setCurrentProject(updated);
      toast.success("Projet mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    try {
      const location = await window.bilpow.locations.create({
        project_id: id,
        name: newLocationName.trim(),
      });
      console.log('[ProjectView handleAddLocation] Created location with ID:', location.id);
      addNewLocationId(location.id);
      console.log('[ProjectView handleAddLocation] newLocationIds after add:', useAppStore.getState().newLocationIds);
      setNewLocationName("");
      setShowAddLocation(false);
      await loadData();
      markProjectDirty();
      toast.success("Emplacement ajouté");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleExportShare = async () => {
    setExportingShare(true);
    try {
      const result = await window.bilpow.project.export(id);
      if (result.success && result.filePath) {
        toast.success("Fichier enregistré !");
      } else if (result.error && result.error !== "Export annulé") {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'export");
    } finally {
      setExportingShare(false);
    }
  };

  const handleExportProjectExcel = async () => {
    if (!currentProject) return;
    setExportingExcel(true);
    try {
      const result = await exportProjectExcelById(id, company ?? undefined);

      if (result.filePath) {
        toast.success(`Export réussi: ${result.filePath}`);
        if (result.warning) {
          toast(result.warning, { icon: "ℹ️", duration: 6000 });
        }
        await window.bilpow.shell.openPath(result.filePath);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'export Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  const openLocation = async (locationId: number) => {
    const panels = await window.bilpow.panels.getByLocation(locationId);
    setPanels(panels);
    setSelection({
      type: "location",
      projectId: id,
      locationId,
      panelId: null,
    });
    navigate(`/project/${id}/location/${locationId}`);
  };

  const handleDeleteLocation = async (locationId: number, locationName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'emplacement "${locationName}" ?\n\nCette action supprimera également tous les tableaux contenus dans cet emplacement.`)) {
      return;
    }
    try {
      await window.bilpow.locations.delete(locationId);
      toast.success("Emplacement supprimé");
      await loadData();
      markProjectDirty();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  if (!currentProject) {
    return <p className="p-6 text-gray-400">Chargement...</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary dark:text-white mb-4">
            {currentProject.name}
          </h1>
          <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Nom
              </label>
              <input
                type="text"
                value={editFields.name}
                onChange={(e) =>
                  setEditFields((f) => ({ ...f, name: e.target.value }))
                }
                onBlur={(e) => void saveField("name", e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Client
              </label>
              <input
                type="text"
                value={editFields.client}
                onChange={(e) =>
                  setEditFields((f) => ({ ...f, client: e.target.value }))
                }
                onBlur={(e) => void saveField("client", e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Emplacements ({locations.length})
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void handleExportShare()}
              disabled={exportingShare}
              className="btn-outline text-sm py-2"
            >
              {exportingShare ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Export...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Partager
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleExportProjectExcel()}
              disabled={exportingExcel || locations.length === 0}
              className="btn-secondary text-sm"
            >
              {exportingExcel ? "Export..." : "📊 Exporter le projet complet"}
            </button>

            <button
              type="button"
              onClick={() => setShowAddLocation(true)}
              className="btn-primary text-sm"
            >
              + Ajouter un emplacement
            </button>
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            Aucun emplacement. Ajoutez-en un pour commencer.
          </div>
        ) : (
          <div className="space-y-3">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="card card-hover-readable p-4 flex items-center justify-between hover:shadow-md transition-colors cursor-pointer relative group"
                onClick={() => void openLocation(loc.id)}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteLocation(loc.id, loc.name);
                  }}
                  className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer l'emplacement"
                >
                  🗑️
                </button>
                <div className="pr-8">
                  <h3 className="font-medium text-primary dark:text-white">
                    {loc.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {loc.panel_count} tableau{loc.panel_count !== 1 ? "x" : ""}{" "}
                    · {formatPower(loc.total_power_w)}
                  </p>
                </div>
                <span className="text-accent">→</span>
              </div>
            ))}
          </div>
        )}

        {showAddLocation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card p-6 w-full max-w-sm mx-4">
              <h3 className="font-semibold mb-3">Nouvel emplacement</h3>
              <input
                type="text"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddLocation();
                }}
                className="input-field mb-4"
                placeholder="Ex: RDC, Étage 1..."
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddLocation(false)}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddLocation()}
                  className="btn-primary"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
