import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';

export async function importBilpowProject(filePath?: string): Promise<{ success: boolean; projectId?: number; isNew?: boolean }> {
  console.log('[IMPORT][util] importBilpowProject appelé', { filePath });
  try {
    console.log('[IMPORT][util] Appel window.bilpow.project.import...');
    const result = await window.bilpow.project.import(filePath);
    console.log('[IMPORT][util] Résultat IPC:', result);

    if (result.success && result.projectName) {
      if (result.isNew === false) {
        // Le projet existe déjà, ne pas recharger le store
        console.log('[IMPORT][util] Projet existant ouvert');
        toast.success(`Projet « ${result.projectName} » ouvert !`);
        return { success: true, projectId: result.projectId, isNew: false };
      }

      console.log('[IMPORT][util] Succès — rechargement store...');
      const projects = await window.bilpow.projects.getAll();
      console.log('[IMPORT][util] Projets récupérés:', projects.length);
      useAppStore.getState().setProjects(projects);
      toast.success(`Projet « ${result.projectName} » importé avec succès !`);
      return { success: true, projectId: result.projectId, isNew: true };
    }

    if (result.error && result.error !== 'Import annulé') {
      console.error('[IMPORT][util] Erreur retournée par IPC:', result.error);
      toast.error(result.error);
    } else {
      console.log('[IMPORT][util] Import annulé ou pas de projectName');
    }
    return { success: false };
  } catch (err) {
    console.error('[IMPORT][util] Exception non gérée:', err);
    throw err;
  }
}
