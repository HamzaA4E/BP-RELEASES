import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { ProjectView } from '@/pages/ProjectView';
import { LocationView } from '@/pages/LocationView';
import { PanelView } from '@/pages/PanelView';
import { Favorites } from '@/pages/Favorites';
import { useAppStore } from '@/store/useAppStore';

export default function App() {
  const { darkMode, setProjects } = useAppStore();

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

  return (
    <HashRouter>
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
        </Route>
      </Routes>
    </HashRouter>
  );
}
