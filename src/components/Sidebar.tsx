import { useState, useEffect, useCallback } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";
import { exportProjectExcelById } from "@/utils/projectExcelExport";
import { ConfirmDialog } from "./ConfirmDialog";
import { useUnsavedNavigationGuard } from "@/hooks/useUnsavedNavigationGuard";

interface ContextMenuState {
  x: number;
  y: number;
  type: "project" | "location" | "panel";
  id: number;
  name: string;
}

export function Sidebar() {
  const navigate = useNavigate();
  const {
    projects,
    selection,
    setSelection,
    sidebarExpanded,
    setSidebarExpanded,
    setProjects,
    setPanels,
    setElements,
    setCurrentProject,
    resetViewData,
    company,
  } = useAppStore();

  const [treeData, setTreeData] = useState<
    Record<
      number,
      {
        locations: Array<{
          id: number;
          name: string;
          panels: Array<{ id: number; name: string }>;
        }>;
      }
    >
  >({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContextMenuState | null>(
    null,
  );
  const [renaming, setRenaming] = useState<{
    type: string;
    id: number;
    value: string;
  } | null>(null);
  const [exportingProjectId, setExportingProjectId] = useState<number | null>(
    null,
  );
  const { guardedNavigate, showConfirm, confirmDiscard, cancelDiscard } =
    useUnsavedNavigationGuard();

  useEffect(() => {
    const handleSaveComplete = () => {
      cancelDiscard();
    };
    window.addEventListener('panel-save-complete', handleSaveComplete);
    return () => window.removeEventListener('panel-save-complete', handleSaveComplete);
  }, [cancelDiscard]);

  const loadTreeForProject = useCallback(async (projectId: number) => {
    try {
      const locations = await window.bilpow.locations.getByProject(projectId);
      const locData = await Promise.all(
        locations.map(async (loc) => {
          const panels = await window.bilpow.panels.getByLocation(loc.id);
          return {
            id: loc.id,
            name: loc.name,
            panels: panels.map((p) => ({ id: p.id, name: p.name })),
          };
        }),
      );
      setTreeData((prev) => ({ ...prev, [projectId]: { locations: locData } }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      for (const project of projects) {
        if (sidebarExpanded[`project-${project.id}`]) {
          await loadTreeForProject(project.id);
        }
      }
    };
    void loadAll();
  }, [projects, sidebarExpanded, loadTreeForProject]);

  const handleProjectClick = async (projectId: number) => {
    const key = `project-${projectId}`;
    const isExpanded = sidebarExpanded[key];
    setSidebarExpanded(key, !isExpanded);

    if (!isExpanded) {
      await loadTreeForProject(projectId);
    }

    const project = await window.bilpow.projects.getById(projectId);
    if (project) setCurrentProject(project);
    setSelection({
      type: "project",
      projectId,
      locationId: null,
      panelId: null,
    });
    guardedNavigate(() => navigate(`/project/${projectId}`));
  };

  const handleLocationClick = async (projectId: number, locationId: number) => {
    const key = `location-${locationId}`;
    setSidebarExpanded(key, !sidebarExpanded[key]);
    setSelection({ type: "location", projectId, locationId, panelId: null });
    const panels = await window.bilpow.panels.getByLocation(locationId);
    setPanels(panels);
    guardedNavigate(() =>
      navigate(`/project/${projectId}/location/${locationId}`),
    );
  };

  const handlePanelClick = async (
    projectId: number,
    locationId: number,
    panelId: number,
  ) => {
    setSelection({ type: "panel", projectId, locationId, panelId });
    guardedNavigate(async () => {
      const elements = await window.bilpow.elements.getByPanel(panelId);
      setElements(elements);
      navigate(`/project/${projectId}/location/${locationId}/panel/${panelId}`);
    });
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    type: "project" | "location" | "panel",
    id: number,
    name: string,
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, name });
  };

  const handleRename = async () => {
    if (!renaming) return;
    try {
      if (renaming.type === "project") {
        await window.bilpow.projects.update({
          id: renaming.id,
          name: renaming.value,
        });
        const all = await window.bilpow.projects.getAll();
        setProjects(all);
      } else if (renaming.type === "location") {
        await window.bilpow.locations.update({
          id: renaming.id,
          name: renaming.value,
        });
      } else if (renaming.type === "panel") {
        await window.bilpow.panels.update({
          id: renaming.id,
          name: renaming.value,
        });
      }
      toast.success("Renommé avec succès");
      if (selection.projectId) await loadTreeForProject(selection.projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setRenaming(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === "project") {
        await window.bilpow.projects.delete(confirmDelete.id);
        const all = await window.bilpow.projects.getAll();
        setProjects(all);
        navigate("/");
      } else if (confirmDelete.type === "location") {
        await window.bilpow.locations.delete(confirmDelete.id);
        if (selection.projectId) await loadTreeForProject(selection.projectId);
        navigate(`/project/${selection.projectId}`);
      } else if (confirmDelete.type === "panel") {
        await window.bilpow.panels.delete(confirmDelete.id);
        if (selection.projectId) await loadTreeForProject(selection.projectId);
        if (selection.locationId) {
          navigate(
            `/project/${selection.projectId}/location/${selection.locationId}`,
          );
        }
      }
      toast.success("Supprimé avec succès");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setConfirmDelete(null);
  };

  const handleDuplicate = async (type: string, id: number) => {
    try {
      if (type === "location") {
        await window.bilpow.locations.duplicate(id);
        if (selection.projectId) await loadTreeForProject(selection.projectId);
        toast.success("Emplacement dupliqué");
      } else if (type === "panel") {
        await window.bilpow.panels.duplicate(id);
        if (selection.projectId) await loadTreeForProject(selection.projectId);
        toast.success("Tableau dupliqué");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setContextMenu(null);
  };

  const handleProjectExcelExport = async (projectId: number) => {
    setExportingProjectId(projectId);
    try {
      const result = await exportProjectExcelById(
        projectId,
        company ?? undefined,
      );
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
      setExportingProjectId(null);
      setContextMenu(null);
    }
  };

  return (
    <aside className="w-sidebar flex-shrink-0 bg-primary flex flex-col h-full">
      <div className="px-4 py-4 border-b border-primary-light">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">
              BilPow
            </h1>
            <p className="text-blue-300 text-xs">Bilan de Puissance</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 ">
        <button
          type="button"
          onClick={() => {
            guardedNavigate(() => {
              resetViewData();
              setSelection({
                type: null,
                projectId: null,
                locationId: null,
                panelId: null,
              });
              navigate("/");
            });
          }}
          className="w-full px-4 py-2 text-left text-sm text-blue-200 hover:bg-primary-light hover:text-white flex items-center gap-2"
        >
          🏠 Tableau de bord
        </button>

        <button
          type="button"
          onClick={() => guardedNavigate(() => navigate("/favorites"))}
          className="w-full px-4 py-2 text-left text-sm text-blue-200 hover:bg-primary-light hover:text-white flex items-center gap-2"
        >
          ⭐ Favoris
        </button>

        <div className="mt-4 px-3">
          <p className="text-xs text-blue-300 uppercase tracking-wider font-semibold mb-2">
            Projets
          </p>
        </div>

        {projects.map((project) => {
          const isExpanded = sidebarExpanded[`project-${project.id}`];
          const isActive =
            selection.projectId === project.id && selection.type === "project";
          const tree = treeData[project.id];

          return (
            <div key={project.id}>
              <div
                className={`flex items-center px-3 py-1.5 cursor-pointer text-sm ${
                  isActive
                    ? "bg-accent text-white"
                    : "text-blue-100 hover:bg-primary-light"
                }`}
                onClick={() => void handleProjectClick(project.id)}
                onContextMenu={(e) =>
                  handleContextMenu(e, "project", project.id, project.name)
                }
              >
                <span className="mr-1 text-xs">{isExpanded ? "▼" : "▶"}</span>
                <span className="truncate flex-1">📁 {project.name}</span>
              </div>

              {isExpanded &&
                tree?.locations.map((loc) => {
                  const locActive =
                    selection.locationId === loc.id &&
                    selection.type === "location";
                  const locExpanded = sidebarExpanded[`location-${loc.id}`];

                  return (
                    <div key={loc.id}>
                      <div
                        className={`flex items-center pl-6 pr-3 py-1.5 cursor-pointer text-sm ${
                          locActive
                            ? "bg-accent/80 text-white"
                            : "text-blue-200 hover:bg-primary-light"
                        }`}
                        onClick={() =>
                          void handleLocationClick(project.id, loc.id)
                        }
                        onContextMenu={(e) =>
                          handleContextMenu(e, "location", loc.id, loc.name)
                        }
                      >
                        <span className="mr-1 text-xs">
                          {locExpanded ? "▼" : "▶"}
                        </span>
                        <span className="truncate flex-1">📍 {loc.name}</span>
                      </div>

                      {locExpanded &&
                        loc.panels.map((panel) => {
                          const panelActive =
                            selection.panelId === panel.id &&
                            selection.type === "panel";
                          return (
                            <div
                              key={panel.id}
                              className={`pl-10 pr-3 py-1.5 cursor-pointer text-sm truncate ${
                                panelActive
                                  ? "bg-accent/60 text-white font-medium"
                                  : "text-blue-300 hover:bg-primary-light hover:text-white"
                              }`}
                              onClick={() =>
                                void handlePanelClick(
                                  project.id,
                                  loc.id,
                                  panel.id,
                                )
                              }
                              onContextMenu={(e) =>
                                handleContextMenu(
                                  e,
                                  "panel",
                                  panel.id,
                                  panel.name,
                                )
                              }
                            >
                              ⚡ {panel.name}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-primary-light px-3 py-3 flex-shrink-0">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-accent text-white font-medium"
                : "text-blue-200 hover:bg-primary-light hover:text-white"
            }`
          }
        >
          <span>⚙️</span>
          Paramètres société
        </NavLink>
      </div>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 inline-block bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-1 w-auto min-w-0"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className="menu-item-hover block whitespace-nowrap px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-100"
              onClick={() => {
                setRenaming({
                  type: contextMenu.type,
                  id: contextMenu.id,
                  value: contextMenu.name,
                });
                setContextMenu(null);
              }}
            >
              ✏️ Renommer
            </button>
            {contextMenu.type === "project" && (
              <button
                type="button"
                disabled={exportingProjectId === contextMenu.id}
                className="menu-item-hover block whitespace-nowrap px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-100 disabled:opacity-50"
                onClick={() => void handleProjectExcelExport(contextMenu.id)}
              >
                {exportingProjectId === contextMenu.id
                  ? "⏳ Export Excel..."
                  : "📊 Exporter Excel"}
              </button>
            )}
            {(contextMenu.type === "location" ||
              contextMenu.type === "panel") && (
              <button
                type="button"
                className="menu-item-hover block whitespace-nowrap px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-100"
                onClick={() =>
                  void handleDuplicate(contextMenu.type, contextMenu.id)
                }
              >
                📋 Dupliquer
              </button>
            )}
            <button
              type="button"
              className="block whitespace-nowrap px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => {
                setConfirmDelete(contextMenu);
                setContextMenu(null);
              }}
            >
              🗑️ Supprimer
            </button>
          </div>
        </>
      )}

      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-4 w-80">
            <h3 className="font-semibold mb-3">Renommer</h3>
            <input
              type="text"
              value={renaming.value}
              onChange={(e) =>
                setRenaming({ ...renaming, value: e.target.value })
              }
              className="input-field mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleRename()}
                className="btn-primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Confirmer la suppression"
        message={`Êtes-vous sûr de vouloir supprimer "${confirmDelete?.name}" ? Cette action est irréversible.`}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(null)}
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
          window.dispatchEvent(new CustomEvent('panel-request-save'));
        }}
      />
    </aside>
  );
}
