import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Share2, Download, Loader2, FolderPlus, ArrowLeft, MoreVertical } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatPower } from "@/utils/calculations";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { importBilpowProject } from "@/utils/projectShare";
import type { Folder } from "../../shared/types";

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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  
  const loadFolders = async () => {
    try {
      const data = await window.bilpow.folders.getAll();
      setFolders(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de chargement des dossiers");
    }
  };

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
    void loadFolders();
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
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.client?.toLowerCase().includes(q) ?? false);
    const matchesFolder = selectedFolder ? p.folder_id === selectedFolder.id : true;
    return matchesSearch && matchesFolder;
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
        folder_id: selectedFolder?.id ?? null,
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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("Le nom du dossier est requis");
      return;
    }
    try {
      await window.bilpow.folders.create({
        name: newFolderName.trim(),
      });
      await loadFolders();
      setShowNewFolder(false);
      setNewFolderName("");
      toast.success("Dossier créé");
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

  const handleDeleteFolder = async () => {
    if (deleteFolderId === null) return;
    try {
      await window.bilpow.folders.delete(deleteFolderId);
      await loadFolders();
      await loadProjects();
      if (selectedFolder?.id === deleteFolderId) {
        setSelectedFolder(null);
      }
      toast.success("Dossier supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setDeleteFolderId(null);
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
          // If imported to a folder, update the project's folder_id
          if (selectedFolder && result.projectId) {
            await window.bilpow.projects.update({
              id: result.projectId,
              folder_id: selectedFolder.id,
            });
          }
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
              onClick={() => setShowNewFolder(true)}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              Ajouter un dossier
            </button>
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

        {/* Display Folders */}
        {!loading && folders.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Dossiers</h2>
              {selectedFolder && (
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {folders.map((folder) => {
                const projectCount = projects.filter(p => p.folder_id === folder.id).length;
                return (
                  <div
                    key={folder.id}
                    className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow relative group"
                  >
                    <div
                      onClick={() => setSelectedFolder(folder)}
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                    >
                      <FolderPlus className="w-5 h-5 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{folder.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{projectCount} projet{projectCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteFolderId(folder.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-opacity"
                      title="Supprimer le dossier"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                  }}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                  }}
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

      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Nouveau dossier</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nom du dossier *
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreateFolder();
                  }}
                  className="input-field"
                  placeholder="Nom du dossier"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
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

      <ConfirmDialog
        isOpen={deleteFolderId !== null}
        title="Supprimer le dossier"
        message="Êtes-vous sûr de vouloir supprimer ce dossier ? Les projets contenus seront déplacés hors du dossier."
        onConfirm={() => void handleDeleteFolder()}
        onCancel={() => setDeleteFolderId(null)}
      />
    </div>
  );
}
