import { getDatabase } from './db';
import fs from 'fs';

export interface ProjectRow {
  id: number;
  name: string;
  client: string | null;
  description: string | null;
  folder_id: number | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
  original_id: number | null;
}

export interface ProjectWithStatsRow extends ProjectRow {
  location_count: number;
  total_power_w: number;
}

export function getAllProjects(): ProjectWithStatsRow[] {
  const db = getDatabase();
  const projects = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM locations l WHERE l.project_id = p.id) as location_count,
        COALESCE((
          SELECT SUM(e.power_w * e.quantity)
          FROM elements e
          JOIN panels pa ON e.panel_id = pa.id
          JOIN locations lo ON pa.location_id = lo.id
          WHERE lo.project_id = p.id
        ), 0) as total_power_w
      FROM projects p
      ORDER BY p.updated_at DESC`
    )
    .all() as ProjectWithStatsRow[];

  // Clean up orphaned projects (no file_path or file doesn't exist)
  // ON DELETE CASCADE will automatically delete associated locations, panels, and elements
  for (const project of projects) {
    if (!project.file_path || !fs.existsSync(project.file_path)) {
      console.log(`[getAllProjects] Cleaning up orphaned project ${project.id} (${project.name})`);
      try {
        db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
      } catch (err) {
        console.error(`[getAllProjects] Failed to delete orphaned project ${project.id}:`, err);
      }
    }
  }

  // Return only valid projects
  return projects.filter(project => {
    if (!project.file_path) return false;
    if (!fs.existsSync(project.file_path)) return false;
    return true;
  });
}

export function getProjectById(id: number): ProjectRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | ProjectRow
    | undefined;
}

export function createProject(data: {
  name: string;
  client?: string;
  description?: string;
  folder_id?: number | null;
}): ProjectRow {
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO projects (name, client, description, folder_id)
       VALUES (@name, @client, @description, @folder_id)`
    )
    .run({
      name: data.name,
      client: data.client ?? null,
      description: data.description ?? null,
      folder_id: data.folder_id ?? null,
    });

  const project = getProjectById(Number(result.lastInsertRowid));
  if (!project) throw new Error('Failed to create project');
  return project;
}

export function updateProject(data: {
  id: number;
  name?: string;
  client?: string;
  description?: string;
  folder_id?: number | null;
}): ProjectRow {
  const db = getDatabase();
  const existing = getProjectById(data.id);
  if (!existing) throw new Error('Project not found');

  // Check if folder_id is changing
  const folderIdChanged = data.folder_id !== undefined && data.folder_id !== existing.folder_id;
  
  // Handle physical file movement if folder is changing
  if (folderIdChanged && existing.file_path) {
    const fs = require('fs');
    const path = require('path');
    
    console.log('[updateProject] Moving project file:', {
      projectId: data.id,
      oldFolderId: existing.folder_id,
      newFolderId: data.folder_id,
      existingFilePath: existing.file_path
    });
    
    // Get the new folder's physical path
    let newFolderPath: string | null = null;
    if (data.folder_id !== null) {
      const folder = db.prepare('SELECT folder_path FROM folders WHERE id = ?').get(data.folder_id) as { folder_path: string | null } | undefined;
      newFolderPath = folder?.folder_path || null;
      console.log('[updateProject] New folder path:', newFolderPath);
    }
    
    if (newFolderPath && fs.existsSync(newFolderPath)) {
      // Move the file to the new folder
      const fileName = path.basename(existing.file_path);
      const newFilePath = path.join(newFolderPath, fileName);
      
      console.log('[updateProject] Attempting to move file from:', existing.file_path, 'to:', newFilePath);
      
      try {
        if (fs.existsSync(existing.file_path)) {
          fs.copyFileSync(existing.file_path, newFilePath);
          fs.unlinkSync(existing.file_path);
          // Update file_path in the database
          db.prepare('UPDATE projects SET file_path = ? WHERE id = ?').run(newFilePath, data.id);
          console.log('[updateProject] File moved successfully');
        } else {
          console.log('[updateProject] Source file does not exist:', existing.file_path);
        }
      } catch (err) {
        console.error('[updateProject] Failed to move project file:', err);
      }
    } else {
      console.log('[updateProject] Cannot move file - new folder path does not exist or is null');
    }
  } else {
    if (!folderIdChanged) {
      console.log('[updateProject] Folder ID not changed');
    } else {
      console.log('[updateProject] Project has no file_path to move');
    }
  }

  db.prepare(
    `UPDATE projects SET
      name = @name,
      client = @client,
      description = @description,
      folder_id = @folder_id,
      updated_at = datetime('now')
    WHERE id = @id`
  ).run({
    id: data.id,
    name: data.name ?? existing.name,
    client: data.client !== undefined ? data.client : existing.client,
    description:
      data.description !== undefined ? data.description : existing.description,
    folder_id: data.folder_id !== undefined ? data.folder_id : existing.folder_id,
  });

  const project = getProjectById(data.id);
  if (!project) throw new Error('Failed to update project');
  return project;
}

export function deleteProject(id: number): { filePath: string | null } {
  const db = getDatabase();
  const project = getProjectById(id);
  if (!project) throw new Error('Project not found');
  
  const filePath = project.file_path;
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Project not found');
  
  return { filePath };
}
