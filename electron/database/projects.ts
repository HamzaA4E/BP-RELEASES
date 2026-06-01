import { getDatabase } from './db';

export interface ProjectRow {
  id: number;
  name: string;
  client: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStatsRow extends ProjectRow {
  location_count: number;
  total_power_w: number;
}

export function getAllProjects(): ProjectWithStatsRow[] {
  const db = getDatabase();
  return db
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
}): ProjectRow {
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO projects (name, client, description)
       VALUES (@name, @client, @description)`
    )
    .run({
      name: data.name,
      client: data.client ?? null,
      description: data.description ?? null,
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
}): ProjectRow {
  const db = getDatabase();
  const existing = getProjectById(data.id);
  if (!existing) throw new Error('Project not found');

  db.prepare(
    `UPDATE projects SET
      name = @name,
      client = @client,
      description = @description,
      updated_at = datetime('now')
    WHERE id = @id`
  ).run({
    id: data.id,
    name: data.name ?? existing.name,
    client: data.client !== undefined ? data.client : existing.client,
    description:
      data.description !== undefined ? data.description : existing.description,
  });

  const project = getProjectById(data.id);
  if (!project) throw new Error('Failed to update project');
  return project;
}

export function deleteProject(id: number): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Project not found');
}
