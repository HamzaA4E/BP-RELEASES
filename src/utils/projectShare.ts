import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';

export async function importBilpowProject(filePath?: string): Promise<boolean> {
  const result = await window.bilpow.project.import(filePath);
  if (result.success && result.projectName) {
    const projects = await window.bilpow.projects.getAll();
    useAppStore.getState().setProjects(projects);
    toast.success(`Projet « ${result.projectName} » importé avec succès !`);
    return true;
  }
  if (result.error && result.error !== 'Import annulé') {
    toast.error(result.error);
  }
  return false;
}
