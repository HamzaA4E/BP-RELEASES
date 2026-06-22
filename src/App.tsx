import { useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { ProjectView } from '@/pages/ProjectView';
import { LocationView } from '@/pages/LocationView';
import { PanelView } from '@/pages/PanelView';
import { Favorites } from '@/pages/Favorites';
import { SettingsPage } from '@/pages/SettingsPage';
import { useAppStore } from '@/store/useAppStore';
import { importBilpowProject } from '@/utils/projectShare';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

function AutoImportListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = window.bilpow.project.onAutoImport((filePath) => {
      void (async () => {
        try {
          const result = await importBilpowProject(filePath);
          if (result.success && result.projectId) {
            if (result.isNew === false) {
              // Le projet existe déjà, naviguer directement vers le projet
              navigate(`/project/${result.projectId}`);
            } else {
              // Nouveau projet importé, naviguer vers le dashboard
              navigate('/');
            }
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erreur d'import");
        }
      })();
    });
    return unsubscribe;
  }, [navigate]);

  return null;
}

function MenuListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubNewProject = window.bilpow.menu.onNewProject(() => {
      navigate('/');
      window.dispatchEvent(new CustomEvent('menu-request-new-project'));
    });

    const unsubOpenProject = window.bilpow.menu.onOpenProject(() => {
      void (async () => {
        try {
          const result = await window.bilpow.project.import();
          if (result.success && result.projectId) {
            navigate(`/project/${result.projectId}`);
            toast.success(`Projet "${result.projectName}" importé avec succès`);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erreur d'import");
        }
      })();
    });

    const unsubSave = window.bilpow.menu.onSave(() => {
      window.dispatchEvent(new CustomEvent('panel-request-save'));
    });

    return () => {
      unsubNewProject();
      unsubOpenProject();
      unsubSave();
    };
  }, [navigate]);

  return null;
}

export default function App() {
  const { darkMode, setProjects, loadCompanySettings } = useAppStore();
  useUnsavedChangesGuard();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projects = await window.bilpow.projects.getAll();
        setProjects(projects);
      } catch {
        /* API not ready yet */
      }
    };
    void loadProjects();
  }, [setProjects]);

  useEffect(() => {
    void loadCompanySettings();
  }, [loadCompanySettings]);

  return (
    <HashRouter>
      <AutoImportListener />
      <MenuListener />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="project/:projectId" element={<ProjectView />} />
          <Route
            path="project/:projectId/location/:locationId"
            element={<LocationView />}
          />
          <Route
            path="project/:projectId/location/:locationId/panel/:panelId"
            element={<PanelView />}
          />
          <Route path="favorites" element={<Favorites />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
