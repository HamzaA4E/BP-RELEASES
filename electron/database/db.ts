import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db: Database.Database | null = null;

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT,
  engineer TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  general_breaker_ampere REAL DEFAULT 0,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_id INTEGER NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('eclairage', 'prise')),
  repere TEXT NOT NULL,
  designation TEXT NOT NULL,
  power_w REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  distance_m REAL NOT NULL DEFAULT 0,
  circuit TEXT,
  notes TEXT,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('eclairage', 'prise')),
  designation TEXT NOT NULL,
  power_w REAL NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#3B82F6'
);

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo_path TEXT DEFAULT '',
  logo_base64 TEXT DEFAULT '',
  logo_mime TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO company_settings (id) VALUES (1);

PRAGMA foreign_keys = ON;
`;

const DEFAULT_FAVORITES = [
  { type: 'prise', designation: 'Prise de courant 2P+T', power_w: 200, color: '#3B82F6' },
  { type: 'prise', designation: 'Prise informatique RJ45', power_w: 150, color: '#3B82F6' },
  { type: 'eclairage', designation: 'Panneau LED', power_w: 35, color: '#3B82F6' },
  { type: 'eclairage', designation: 'Réglette fluorescente', power_w: 58, color: '#3B82F6' },
] as const;

export function getDatabase(): Database.Database {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'bilpow');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'bilpow.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(MIGRATIONS);
  migrateElementsSchema(db);
  seedFavorites();

  return db;
}

function migrateElementsSchema(database: Database.Database): void {
  const cols = database.pragma('table_info(elements)') as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));

  if (!names.has('type_label')) {
    database.exec(`ALTER TABLE elements ADD COLUMN type_label TEXT DEFAULT ''`);
    database.exec(`ALTER TABLE elements ADD COLUMN emplacement TEXT DEFAULT ''`);
    database.exec(`ALTER TABLE elements ADD COLUMN row_kind TEXT DEFAULT 'element'`);
    database.exec(`ALTER TABLE elements ADD COLUMN bar_set_index INTEGER DEFAULT 0`);
    database.exec(`ALTER TABLE elements ADD COLUMN ku REAL DEFAULT 1`);
    database.exec(`ALTER TABLE elements ADD COLUMN ks REAL DEFAULT 1`);
    database.exec(`ALTER TABLE elements ADD COLUMN fp REAL DEFAULT 1`);
    database.exec(
      `UPDATE elements SET type_label = designation WHERE type_label = '' OR type_label IS NULL`
    );
  }
}

function seedFavorites(): void {
  const database = db;
  if (!database) return;

  const count = database.prepare('SELECT COUNT(*) as count FROM favorites').get() as {
    count: number;
  };

  if (count.count === 0) {
    const insert = database.prepare(
      'INSERT INTO favorites (type, designation, power_w, color) VALUES (@type, @designation, @power_w, @color)'
    );
    const insertMany = database.transaction(() => {
      for (const fav of DEFAULT_FAVORITES) {
        insert.run(fav);
      }
    });
    insertMany();
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
