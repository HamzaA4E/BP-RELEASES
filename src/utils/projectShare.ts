import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";

export async function importBilpowProject(
  filePath?: string,
): Promise<{ success: boolean; projectId?: number; isNew?: boolean }> {
  try {
    const result = await window.bilpow.project.import(filePath);

    if (result.success && result.projectName) {
      if (result.isNew === false) {
        toast.success(`Projet « ${result.projectName} » ouvert !`);
        return { success: true, projectId: result.projectId, isNew: false };
      }

      const projects = await window.bilpow.projects.getAll();
      useAppStore.getState().setProjects(projects);
      toast.success(`Projet « ${result.projectName} » importé avec succès !`);
      return { success: true, projectId: result.projectId, isNew: true };
    }

    if (result.error && result.error !== "Import annulé") {
      toast.error(result.error);
    }

    return { success: false };
  } catch (err) {
    throw err;
  }
}
