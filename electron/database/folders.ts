import { getDatabase } from './db';

export interface FolderRow {
  id: number;
  name: string;
  description: string | null;
  folder_path: string | null;
  created_at: string;
  updated_at: string;
}

export function getAllFolders(): FolderRow[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM folders ORDER BY name ASC`)
    .all() as FolderRow[];
}

export function getFolderById(id: number): FolderRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as
    | FolderRow
    | undefined;
}

export function createFolder(data: {
  name: string;
  description?: string;
  folder_path?: string;
}): FolderRow {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Folder name is required');
  }
  
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO folders (name, description, folder_path)
       VALUES (@name, @description, @folder_path)`
    )
    .run({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      folder_path: data.folder_path || null,
    });

  const folder = getFolderById(Number(result.lastInsertRowid));
  if (!folder) throw new Error('Failed to create folder');
  return folder;
}

export function updateFolder(data: {
  id: number;
  name?: string;
  description?: string;
  folder_path?: string;
}): FolderRow {
  const db = getDatabase();
  const existing = getFolderById(data.id);
  if (!existing) throw new Error('Folder not found');

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error('Folder name cannot be empty');
  }

  // Check name uniqueness if name is being changed
  if (data.name !== undefined && data.name !== existing.name) {
    const duplicate = db.prepare('SELECT id FROM folders WHERE name = ? AND id != ?').get(data.name, data.id);
    if (duplicate) {
      throw new Error('Un dossier avec ce nom existe déjà');
    }
  }

  // Check if name is changing and rename physical folder
  if (data.name !== undefined && data.name !== existing.name && existing.folder_path) {
    const fs = require('fs');
    const path = require('path');
    
    console.log('[updateFolder] Renaming physical folder:', {
      folderId: data.id,
      oldName: existing.name,
      newName: data.name,
      existingFolderPath: existing.folder_path
    });
    
    try {
      if (fs.existsSync(existing.folder_path)) {
        const parentDir = path.dirname(existing.folder_path);
        const sanitizedName = data.name.replace(/[^a-zA-Z0-9]/g, '_');
        const newFolderPath = path.join(parentDir, sanitizedName);
        
        // Only rename if the folder name would actually change
        if (path.basename(existing.folder_path) !== sanitizedName) {
          fs.renameSync(existing.folder_path, newFolderPath);
          db.prepare('UPDATE folders SET folder_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newFolderPath, data.id);
          console.log('[updateFolder] Folder renamed from:', existing.folder_path, 'to:', newFolderPath);
          
          // Update file paths of all projects in this folder
          const projects = db.prepare('SELECT id, file_path FROM projects WHERE folder_id = ?').all(data.id) as Array<{ id: number; file_path: string | null }>;
          for (const project of projects) {
            if (project.file_path && fs.existsSync(project.file_path)) {
              const fileName = path.basename(project.file_path);
              const newProjectPath = path.join(newFolderPath, fileName);
              if (project.file_path !== newProjectPath) {
                fs.renameSync(project.file_path, newProjectPath);
                db.prepare('UPDATE projects SET file_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newProjectPath, project.id);
                console.log('[updateFolder] Updated project file path:', project.id, 'to:', newProjectPath);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[updateFolder] Failed to rename physical folder:', err);
    }
  }

  db.prepare(
    `UPDATE folders SET
      name = COALESCE(@name, name),
      description = CASE WHEN @description IS NULL THEN description ELSE @description END,
      folder_path = CASE WHEN @folder_path IS NULL THEN folder_path ELSE @folder_path END,
      updated_at = datetime('now')
    WHERE id = @id`
  ).run({
    id: data.id,
    name: data.name?.trim() || null,
    description: data.description !== undefined ? data.description.trim() || null : null,
    folder_path: data.folder_path !== undefined ? data.folder_path : null,
  });

  const folder = getFolderById(data.id);
  if (!folder) throw new Error('Failed to update folder');
  return folder;
}

export function deleteFolder(id: number): void {
  const db = getDatabase();
  const existing = getFolderById(id);
  if (!existing) throw new Error('Folder not found');
  
  const result = db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Failed to delete folder');
}
