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
}): FolderRow {
  const db = getDatabase();
  const existing = getFolderById(data.id);
  if (!existing) throw new Error('Folder not found');

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error('Folder name cannot be empty');
  }

  db.prepare(
    `UPDATE folders SET
      name = COALESCE(@name, name),
      description = CASE WHEN @description IS NULL THEN description ELSE @description END,
      updated_at = datetime('now')
    WHERE id = @id`
  ).run({
    id: data.id,
    name: data.name?.trim() || null,
    description: data.description !== undefined ? data.description.trim() || null : null,
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
