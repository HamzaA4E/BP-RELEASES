import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Share2, Download, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatPower } from "@/utils/calculations";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { importBilpowProject } from "@/utils/projectShare";

export function Dashboard() {
  const navigate = useNavigate();
  const {
    projects,
    setProjects,
    searchQuery,
    setSearchQuery,
    setSelection,
    setCurrentProject,
  } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const loadProjects = async () => {
    try {
      const data = await window.bilpow.projects.getAll();
      setProjects(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    const handleNewProject = () => setShowNewProject(true);
    window.addEventListener('menu-request-new-project', handleNewProject);
    return () => window.removeEventListener('menu-request-new-project', handleNewProject);
  }, []);

  useKeyboardShortcuts({
    onNewProject: () => setShowNewProject(true),
  });

  const filtered = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.client?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Le nom du projet est requis");
      return;
    }
    try {
      const project = await window.bilpow.projects.create({
        name: newName.trim(),
        client: newClient.trim() || undefined,
      });
      await loadProjects();
      setShowNewProject(false);
      setNewName("");
      setNewClient("");
      toast.success("Projet créé");
      openProject(project.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const openProject = async (id: number) => {
    const project = await window.bilpow.projects.getById(id);
    if (project) {
      setCurrentProject(project);
      setSelection({
        type: "project",
        projectId: id,
        locationId: null,
        panelId: null,
      });
      navigate(`/project/${id}`);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.bilpow.projects.delete(deleteId);
      await loadProjects();
      toast.success("Projet supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setDeleteId(null);
  };

  const handleExport = async (projectId: number) => {
    setExportingId(projectId);
    try {
      const result = await window.bilpow.project.export(projectId);
      if (result.success && result.filePath) {
        toast.success("Fichier enregistré !");
      } else if (result.error && result.error !== "Export annulé") {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'export");
    } finally {
      setExportingId(null);
    }
  };

  const handleImport = async (filePath?: string) => {
    setImporting(true);
    try {
      const result = await importBilpowProject(filePath);
      if (result.success && result.projectId) {
        if (result.isNew === false) {
          navigate(`/project/${result.projectId}`);
        } else {
          await loadProjects();
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'import");
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-white">
              Tableau de bord
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Gérez vos projets de bilan de puissance
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing}
              className="btn-secondary inline-flex items-center gap-2"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {importing ? "Import..." : "Importer (.bilpow)"}
            </button>
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="btn-primary"
            >
              + Nouveau projet
            </button>
          </div>
        </div>

        <div className="mb-6">
          <input
            type="search"
            placeholder="Rechercher un projet..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field max-w-md"
          />
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-12">Chargement...</p>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-4xl mb-4">⚡</p>
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery
                ? "Aucun projet trouvé"
                : "Aucun projet. Créez votre premier projet !"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold text-lg text-primary dark:text-white mb-1">
                  {project.name}
                </h3>
                {project.client && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {project.client}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
                  <span>📍 {project.location_count} empl.</span>
                  <span>⚡ {formatPower(project.total_power_w)}</span>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  Créé le {formatDate(project.created_at)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openProject(project.id)}
                    className="btn-primary flex-1 min-w-[80px] text-xs py-1.5"
                  >
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport(project.id)}
                    disabled={exportingId === project.id}
                    className="btn-outline flex-1 min-w-[80px]"
                  >
                    {exportingId === project.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Export...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        Partager
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(project.id)}
                    className="btn-danger text-xs py-1.5 px-3"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Nouveau projet</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nom *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input-field"
                  placeholder="Nom du projet"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Client
                </label>
                <input
                  type="text"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  className="input-field"
                  placeholder="Nom du client"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="btn-primary"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Supprimer le projet"
        message="Êtes-vous sûr de vouloir supprimer ce projet ? Toutes les données associées seront perdues."
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
