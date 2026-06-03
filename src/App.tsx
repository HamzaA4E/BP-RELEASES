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

function AutoImportListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = window.bilpow.project.onAutoImport((filePath) => {
      void (async () => {
        try {
          const ok = await importBilpowProject(filePath);
          if (ok) {
            navigate('/');
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

export default function App() {
  const { darkMode, setProjects, loadCompanySettings } = useAppStore();

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
