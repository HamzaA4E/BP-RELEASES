import type { FavoriteType } from '../../shared/types';
import { getDatabase } from './db';

export interface FavoriteRow {
  id: number;
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
}): FavoriteRow {
  const db = getDatabase();
  const result = db
    .prepare(
      'INSERT INTO favorites (type, designation, power_w, color) VALUES (@type, @designation, @power_w, @color)'
    )
    .run({
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
