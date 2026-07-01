import type { FavoriteType } from '../../shared/types';
import { getDatabase } from './db';

export interface FavoriteRow {
  id: number;
  system_key: string | null;
  type: FavoriteType;
  designation: string;
  power_w: number;
  color: string;
}

export function getAllFavorites(): FavoriteRow[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM favorites ORDER BY type, designation')
    .all() as FavoriteRow[];
}

export function createFavorite(data: {
  type: FavoriteType;
  designation: string;
  power_w: number;
  color?: string;
  system_key?: string;
}): FavoriteRow {
  const db = getDatabase();
  
  // Vérifier si un favori avec le même type et désignation existe déjà
  const existing = db
    .prepare('SELECT id FROM favorites WHERE type = ? AND designation = ?')
    .get(data.type, data.designation) as { id: number } | undefined;
  
  if (existing) {
    throw new Error('Un favori avec cette désignation existe déjà');
  }
  
  const result = db
    .prepare(
      'INSERT INTO favorites (system_key, type, designation, power_w, color) VALUES (@system_key, @type, @designation, @power_w, @color)'
    )
    .run({
      system_key: data.system_key ?? null,
      type: data.type,
      designation: data.designation,
      power_w: data.power_w,
      color: data.color ?? '#3B82F6',
    });

  const favorite = db
    .prepare('SELECT * FROM favorites WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as FavoriteRow | undefined;
  if (!favorite) throw new Error('Failed to create favorite');
  return favorite;
}

export function deleteFavorite(id: number): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM favorites WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Favorite not found');
}

export function updateFavorite(data: {
  id: number;
  type?: FavoriteType;
  designation?: string;
  power_w?: number;
  color?: string;
}): FavoriteRow {
  const db = getDatabase();
  
  // Vérifier si le favori existe
  const existing = db
    .prepare('SELECT * FROM favorites WHERE id = ?')
    .get(data.id) as FavoriteRow | undefined;
  
  if (!existing) {
    throw new Error('Favori non trouvé');
  }
  
  // Si la désignation ou le type change, vérifier les doublons
  if (data.designation || data.type) {
    const newType = data.type ?? existing.type;
    const newDesignation = data.designation ?? existing.designation;
    
    const duplicate = db
      .prepare('SELECT id FROM favorites WHERE type = ? AND designation = ? AND id != ?')
      .get(newType, newDesignation, data.id) as { id: number } | undefined;
    
    if (duplicate) {
      throw new Error('Un favori avec cette désignation existe déjà');
    }
  }
  
  // Construire la requête de mise à jour dynamique
  const updates: string[] = [];
  const params: Record<string, any> = { id: data.id };
  
  if (data.type !== undefined) {
    updates.push('type = @type');
    params.type = data.type;
  }
  if (data.designation !== undefined) {
    updates.push('designation = @designation');
    params.designation = data.designation;
  }
  if (data.power_w !== undefined) {
    updates.push('power_w = @power_w');
    params.power_w = data.power_w;
  }
  if (data.color !== undefined) {
    updates.push('color = @color');
    params.color = data.color;
  }
  
  if (updates.length === 0) {
    return existing;
  }
  
  const sql = `UPDATE favorites SET ${updates.join(', ')} WHERE id = @id`;
  db.prepare(sql).run(params);
  
  const updated = db
    .prepare('SELECT * FROM favorites WHERE id = ?')
    .get(data.id) as FavoriteRow | undefined;
  
  if (!updated) throw new Error('Failed to update favorite');
  return updated;
}
