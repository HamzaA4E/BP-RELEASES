import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Download, Loader2, FolderPlus, ArrowLeft, MoreVertical, Folder as FolderIcon, Edit2, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FolderDeleteDialog } from "@/components/FolderDeleteDialog";
import { formatPower } from "@/utils/calculations";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUnsavedNavigationGuard } from "@/hooks/useUnsavedNavigationGuard";
import { importBilpowProject } from "@/utils/projectShare";
import type { Folder } from "../../shared/types";

export function Dashboard() {
  const navigate = useNavigate();
  const {
    projects,
    setProjects,
    folders,
    setFolders,
    searchQuery,
    setSearchQuery,
    setSelection,
    setCurrentProject,
  } = useAppStore();
  const { guardedNavigate } = useUnsavedNavigationGuard();
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showRenameFolder, setShowRenameFolder] = useState(false);
  const [showMoveToFolder, setShowMoveToFolder] = useState(false);
  const [projectToMove, setProjectToMove] = useState<number | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<number | null>(null);
  const [folderMenuId, setFolderMenuId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [deleteFolderOption, setDeleteFolderOption] = useState<'move' | 'delete'>('move');
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

  useEffect(() => {
    const handleFileRenamed = (data: { type: 'project' | 'folder'; id: number; newName: string }) => {
      console.log('[Dashboard] File renamed event received:', data);
      // Reload projects and folders to reflect the change
      void loadProjects();
      void loadFolders();
    };

    const cleanup = window.bilpow.project.onFileRenamed(handleFileRenamed);
    
    // Fallback: poll for changes every 10 seconds (reduced frequency for performance)
    const interval = setInterval(() => {
      void loadProjects();
      void loadFolders();
    }, 10000);
    
    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, []);

  useKeyboardShortcuts({
    onNewProject: () => setShowNewProject(true),
  });

  // Close folder menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (folderMenuId !== null) {
        setFolderMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [folderMenuId]);

  const filtered = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.client?.toLowerCase().includes(q) ?? false);
    
    // If searching, show all matching projects regardless of folder
    if (searchQuery.trim()) {
      return matchesSearch;
    }
    
    // If folder selected, show only projects in that folder
    if (selectedFolder) {
      return matchesSearch && p.folder_id === selectedFolder.id;
    }
    
    // Otherwise, show only projects without folder
    return matchesSearch && p.folder_id === null;
  });

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Le nom du projet est requis");
      return;
    }
    try {
      // Open save dialog to choose file location
      const sanitizedName = newName.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const defaultName = `${sanitizedName}.bilpow`;
      const { canceled, filePath } = await window.bilpow.projects.showSaveDialog(defaultName);

      if (canceled || !filePath) {
        toast.error("Veuillez choisir un emplacement pour le projet");
        return;
      }

      const project = await window.bilpow.projects.create({
        name: newName.trim(),
        client: newClient.trim() || undefined,
        folder_id: selectedFolder?.id,
        file_path: filePath,
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
      const { filePath, canceled } = await window.bilpow.folders.showFolderDialog(newFolderName.trim());
      
      if (canceled) {
        toast.error("Veuillez choisir un emplacement pour le dossier");
        return;
      }
      
      await window.bilpow.folders.create({
        name: newFolderName.trim(),
        folder_path: filePath || undefined,
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

  const handleDeleteFolder = async (option?: 'move' | 'delete') => {
    const folderId = deleteFolderId;
    const deleteOption = option || deleteFolderOption;
    if (folderId === null) return;
    console.log('[Dashboard] handleDeleteFolder called with folderId:', folderId, 'and option:', deleteOption);
    try {
      await window.bilpow.folders.delete(folderId, deleteOption);
      console.log('[Dashboard] Folder deletion completed');
      await loadFolders();
      await loadProjects();
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(null);
      }
      toast.success("Dossier supprimé");
    } catch (err) {
      console.error('[Dashboard] Folder deletion error:', err);
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setDeleteFolderId(null);
    setDeleteFolderOption('move');
  };

  const handleRenameFolder = async () => {
    if (renameFolderId === null || !renameFolderName.trim()) {
      toast.error("Le nom du dossier est requis");
      return;
    }
    try {
      await window.bilpow.folders.update({
        id: renameFolderId,
        name: renameFolderName.trim(),
      });
      await loadFolders();
      // Update selected folder name if it's the one being renamed
      if (selectedFolder?.id === renameFolderId) {
        setSelectedFolder({ ...selectedFolder, name: renameFolderName.trim() });
      }
      setShowRenameFolder(false);
      setRenameFolderId(null);
      setRenameFolderName("");
      toast.success("Dossier renommé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleSetFolderPath = async (folderId: number) => {
    try {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return;

      const { filePath, canceled } = await window.bilpow.folders.showFolderDialog(folder.name);
      
      if (canceled || !filePath) {
        toast.error("Veuillez choisir un emplacement pour le dossier");
        return;
      }
      
      await window.bilpow.folders.update({
        id: folderId,
        folder_path: filePath,
      });
      await loadFolders();
      toast.success("Emplacement du dossier mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleMoveToFolder = async (folderId: number | null) => {
    if (projectToMove === null) return;
    try {
      await window.bilpow.projects.update({
        id: projectToMove,
        folder_id: folderId,
      });
      await loadProjects();
      setShowMoveToFolder(false);
      setProjectToMove(null);
      toast.success("Projet déplacé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
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
          <div className="flex items-center gap-4">
            {selectedFolder && (
              <button
                type="button"
                onClick={() => guardedNavigate(() => setSelectedFolder(null))}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-primary dark:text-white">
                {selectedFolder ? selectedFolder.name : 'Tableau de bord'}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                {selectedFolder 
                  ? `${projects.filter(p => p.folder_id === selectedFolder.id).length} projet${projects.filter(p => p.folder_id === selectedFolder.id).length !== 1 ? 's' : ''}`
                  : 'Gérez vos projets de bilan de puissance'
                }
              </p>
            </div>
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
          <div className="mb-8">
            {!selectedFolder ? (
              <>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">Dossiers</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Organisez vos projets par catégorie</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {folders.map((folder) => {
                    const projectCount = projects.filter(p => p.folder_id === folder.id).length;
                    return (
                      <div
                        key={folder.id}
                        onClick={() => setSelectedFolder(folder)}
                        className="relative group cursor-pointer rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary/50 hover:shadow-md transition-all duration-200"
                      >
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-3 rounded-lg bg-primary/10 text-primary">
                              <FolderPlus className="w-6 h-6" />
                            </div>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFolderMenuId(folderMenuId === folder.id ? null : folder.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                title="Actions du dossier"
                              >
                                <MoreVertical className="w-4 h-4 text-gray-500" />
                              </button>
                              {folderMenuId === folder.id && (
                                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRenameFolderId(folder.id);
                                      setRenameFolderName(folder.name);
                                      setShowRenameFolder(true);
                                      setFolderMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-t-lg"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                    Renommer
                                  </button>
                                  {/* <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFolderMenuId(null);
                                      void handleSetFolderPath(folder.id);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <FolderIcon className="w-4 h-4" />
                                    Définir l'emplacement
                                  </button> */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteFolderId(folder.id);
                                      setFolderMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 rounded-b-lg"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Supprimer
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <h3 className="font-semibold text-gray-800 dark:text-white text-lg mb-1">
                            {folder.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {projectCount} projet{projectCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
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
            {filtered.map((project) => {
              const projectFolder = folders.find(f => f.id === project.folder_id);
              return (
                <div
                  key={project.id}
                  className={`card p-5 hover:shadow-md transition-shadow ${project.folder_id ? 'border-l-4 border-l-primary' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg text-primary dark:text-white">
                      {project.name}
                    </h3>
                    {projectFolder && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {projectFolder.name}
                      </span>
                    )}
                  </div>
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
                    onClick={() => {
                      setProjectToMove(project.id);
                      setShowMoveToFolder(true);
                    }}
                    className="btn-outline flex-1 min-w-[80px]"
                  >
                    <FolderIcon className="w-3.5 h-3.5" />
                    Déplacer
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
              );
            })}
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

      {showRenameFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Renommer le dossier</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nom du dossier *
                </label>
                <input
                  type="text"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleRenameFolder();
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
                onClick={() => {
                  setShowRenameFolder(false);
                  setRenameFolderId(null);
                  setRenameFolderName("");
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleRenameFolder()}
                className="btn-primary"
              >
                Renommer
              </button>
            </div>
          </div>
        </div>
      )}

      {showMoveToFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Déplacer le projet</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => void handleMoveToFolder(null)}
                className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300">Sans dossier</span>
                </div>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => void handleMoveToFolder(folder.id)}
                  className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FolderPlus className="w-5 h-5 text-primary" />
                    <span className="text-gray-700 dark:text-gray-300">{folder.name}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowMoveToFolder(false);
                  setProjectToMove(null);
                }}
                className="btn-secondary"
              >
                Annuler
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

      <FolderDeleteDialog
        isOpen={deleteFolderId !== null}
        onConfirm={(option) => {
          console.log('[Dashboard] FolderDeleteDialog onConfirm with option:', option);
          void handleDeleteFolder(option);
        }}
        onCancel={() => setDeleteFolderId(null)}
      />
    </div>
  );
}
