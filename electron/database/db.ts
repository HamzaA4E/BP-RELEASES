import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db: Database.Database | null = null;

/** Chemin DB — userData fonctionne en dev et en production (pas __dirname). */
export function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'bilpow.db');
}

function resolveDatabasePath(): string {
  const dbPath = getDatabasePath();
  const legacyPath = path.join(app.getPath('userData'), 'bilpow', 'bilpow.db');

  if (!fs.existsSync(dbPath) && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, dbPath);
    for (const suffix of ['-wal', '-shm']) {
      const legacySidecar = `${legacyPath}${suffix}`;
      if (fs.existsSync(legacySidecar)) {
        fs.copyFileSync(legacySidecar, `${dbPath}${suffix}`);
      }
    }
    console.log('[BilPow] Base migrée vers', dbPath);
  }

  return dbPath;
}

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT,
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
  type TEXT NOT NULL CHECK(type IN ('eclairage', 'prise', 'attente', 'jeu_de_barres')),
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
  type TEXT NOT NULL CHECK(type IN ('eclairage', 'prise', 'divers')),
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
  client_logo_path TEXT DEFAULT '',
  client_logo_base64 TEXT DEFAULT '',
  client_logo_mime TEXT DEFAULT '',
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

const RECREATE_ELEMENTS_SQL = `
  DROP TABLE IF EXISTS elements_new;

  CREATE TABLE elements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('eclairage', 'prise', 'attente', 'jeu_de_barres')),
    repere TEXT NOT NULL,
    designation TEXT NOT NULL,
    type_label TEXT DEFAULT '',
    emplacement TEXT DEFAULT '',
    row_kind TEXT DEFAULT 'element',
    bar_set_index INTEGER DEFAULT 0,
    phase_type TEXT DEFAULT 'mono' CHECK(phase_type IN ('mono', 'tri')),
    jdb_category TEXT DEFAULT NULL CHECK(jdb_category IS NULL OR jdb_category IN ('eclairage', 'prise')),
    power_w REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    distance_m REAL NOT NULL DEFAULT 0,
    ku REAL DEFAULT 1,
    ks REAL DEFAULT 1,
    fp REAL DEFAULT 1,
    coef_ks REAL DEFAULT 0.8,
    coef_ku REAL DEFAULT 1.0,
    coef_fp REAL DEFAULT 1.0,
    circuit TEXT,
    notes TEXT,
    order_index INTEGER DEFAULT 0
  );

  INSERT INTO elements_new (
    id, panel_id, type, repere, designation, type_label, emplacement,
    row_kind, bar_set_index, phase_type, jdb_category,
    power_w, quantity, distance_m, ku, ks, fp,
    coef_ks, coef_ku, coef_fp, circuit, notes, order_index
  )
  SELECT
    id, panel_id,
    CASE
      WHEN COALESCE(row_kind, 'element') = 'bar_set' THEN 'jeu_de_barres'
      ELSE type
    END,
    repere, designation,
    COALESCE(type_label, designation, ''),
    COALESCE(emplacement, ''),
    COALESCE(row_kind, 'element'),
    COALESCE(bar_set_index, 0),
    COALESCE(phase_type, 'mono'),
    CASE
      WHEN COALESCE(row_kind, 'element') = 'bar_set' AND type = 'eclairage' THEN 'eclairage'
      WHEN COALESCE(row_kind, 'element') = 'bar_set' AND type = 'prise' THEN 'prise'
      ELSE jdb_category
    END,
    power_w, quantity, distance_m,
    COALESCE(ku, 1), COALESCE(ks, 1), COALESCE(fp, 1),
    COALESCE(coef_ks, 0.8), COALESCE(coef_ku, 1.0), COALESCE(coef_fp, 1.0),
    circuit, notes, order_index
  FROM elements;

  DROP TABLE elements;
  ALTER TABLE elements_new RENAME TO elements;
`;

export function getDatabase(): Database.Database {
  if (db) {
    ensureElementArticlesSchema(db);
    migrateFavoritesTable(db);
    return db;
  }

  const dbPath = resolveDatabasePath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(MIGRATIONS);
  recoverInterruptedElementsMigration(db);
  ensureElementsColumns(db);  
  migratePanelCoefficients(db);
  migrateElementsTable(db);
  migrateElementArticles(db);
  migrateCompanySettings(db);
  migrateFavoritesTable(db);
  seedFavorites();
  db.pragma('wal_checkpoint(PASSIVE)');
  console.log('[DB] Connexion prête');
  return db;
}

function tableExists(database: Database.Database, name: string): boolean {
  const row = database
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
    )
    .get(name);
  return row != null;
}

/** Fix DB left in a half-finished migration (elements_new leftover). */
function recoverInterruptedElementsMigration(database: Database.Database): void {
  if (!tableExists(database, 'elements_new')) return;

  const hasElements = tableExists(database, 'elements');

  if (hasElements) {
    const newCount = (
      database.prepare('SELECT COUNT(*) as c FROM elements_new').get() as { c: number }
    ).c;
    if (newCount > 0) {
      database.exec('DROP TABLE elements');
      database.exec('ALTER TABLE elements_new RENAME TO elements');
    } else {
      database.exec('DROP TABLE elements_new');
    }
  } else {
    database.exec('ALTER TABLE elements_new RENAME TO elements');
  }
}

function getElementsTableSql(database: Database.Database): string | null {
  const row = database
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='elements'`
    )
    .get() as { sql: string } | undefined;
  return row?.sql ?? null;
}

function elementsTypeAllowsJeuDeBarres(database: Database.Database): boolean {
  const sql = getElementsTableSql(database);
  return sql != null && sql.includes("'jeu_de_barres'");
}

function recreateElementsTable(database: Database.Database): void {
  ensureElementsColumns(database);
  const run = database.transaction(() => {
    database.exec(RECREATE_ELEMENTS_SQL);
  });
  run();
}

/** Add every optional column on elements if missing (each column checked separately). */
function ensureElementsColumns(database: Database.Database): void {
  if (!tableExists(database, 'elements')) return;

  const cols = database.pragma('table_info(elements)') as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));

  const addColumn = (name: string, definition: string): void => {
    if (!names.has(name)) {
      database.exec(`ALTER TABLE elements ADD COLUMN ${name} ${definition}`);
      names.add(name);
    }
  };

  addColumn('type_label', "TEXT DEFAULT ''");
  addColumn('emplacement', "TEXT DEFAULT ''");
  addColumn('row_kind', "TEXT DEFAULT 'element'");
  addColumn('bar_set_index', 'INTEGER DEFAULT 0');
  addColumn('phase_type', "TEXT DEFAULT 'mono'");
  addColumn('jdb_category', 'TEXT DEFAULT NULL');
  addColumn('ku', 'REAL DEFAULT 1');
  addColumn('ks', 'REAL DEFAULT 1');
  addColumn('fp', 'REAL DEFAULT 1');
  addColumn('coef_ks', 'REAL DEFAULT 0.8');
  addColumn('coef_ku', 'REAL DEFAULT 1.0');
  addColumn('coef_fp', 'REAL DEFAULT 1.0');
  addColumn('is_multi', 'INTEGER DEFAULT 0');

  database.exec(
    `UPDATE elements SET type_label = designation WHERE (type_label = '' OR type_label IS NULL) AND designation IS NOT NULL`
  );
}

function migratePanelCoefficients(database: Database.Database): void {
  if (!tableExists(database, 'panels')) return;

  const cols = database.pragma('table_info(panels)') as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));

  if (!names.has('coef_ks')) {
    database.exec(`ALTER TABLE panels ADD COLUMN coef_ks REAL DEFAULT 0.8`);
    database.exec(`ALTER TABLE panels ADD COLUMN coef_ku REAL DEFAULT 1.0`);
    database.exec(`ALTER TABLE panels ADD COLUMN coef_fp REAL DEFAULT 1.0`);
  }
}

function migrateElementsTable(database: Database.Database): void {
  if (!tableExists(database, 'elements')) return;

  ensureElementsColumns(database);

  if (!elementsTypeAllowsJeuDeBarres(database)) {
    recreateElementsTable(database);
    return;
  }

  database.exec(
    `UPDATE elements SET type = 'jeu_de_barres'
     WHERE COALESCE(row_kind, 'element') = 'bar_set' AND type IN ('eclairage', 'prise')`
  );
  database.exec(
    `UPDATE elements SET jdb_category = 'eclairage'
     WHERE type = 'jeu_de_barres' AND jdb_category IS NULL
       AND (designation LIKE '%Éclairage%' OR designation LIKE '%Eclairage%' OR type_label LIKE '%Éclairage%')`
  );
  database.exec(
    `UPDATE elements SET jdb_category = 'prise'
     WHERE type = 'jeu_de_barres' AND jdb_category IS NULL
       AND (designation LIKE '%Prise%' OR type_label LIKE '%Prise%')`
  );
  database.exec(
    `UPDATE elements SET jdb_category = 'eclairage'
     WHERE type = 'jeu_de_barres' AND jdb_category IS NULL`
  );
}

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const cols = database.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function ensureElementArticlesSchema(database: Database.Database): void {
  
  database.exec(`
    CREATE TABLE IF NOT EXISTS element_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      element_id INTEGER NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
      designation TEXT NOT NULL,
      power_w REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER DEFAULT 0
    );
  `);
 
  if (!hasColumn(database, 'element_articles', 'coef_ks')) {
    database.exec(`ALTER TABLE element_articles ADD COLUMN coef_ks REAL DEFAULT 1.0`);
    database.exec(`ALTER TABLE element_articles ADD COLUMN coef_ku REAL DEFAULT 1.0`);
    database.exec(`
      UPDATE element_articles SET
        coef_ks = COALESCE(
          (SELECT e.coef_ks FROM elements e WHERE e.id = element_articles.element_id),
          1.0
        ),
        coef_ku = COALESCE(
          (SELECT e.coef_ku FROM elements e WHERE e.id = element_articles.element_id),
          1.0
        )
    `);
  } else if (!hasColumn(database, 'element_articles', 'coef_ku')) {
    database.exec(`ALTER TABLE element_articles ADD COLUMN coef_ku REAL DEFAULT 1.0`);
  }

  if (!hasColumn(database, 'element_articles', 'type_label')) {
    database.exec(`ALTER TABLE element_articles ADD COLUMN type_label TEXT DEFAULT ''`);
    database.exec(`
      UPDATE element_articles SET type_label = designation
      WHERE COALESCE(type_label, '') = ''
    `);
  }

  database.exec(`
    UPDATE element_articles SET type_label = (
      SELECT COALESCE(NULLIF(e.type_label, ''), NULLIF(e.designation, ''), '')
      FROM elements e WHERE e.id = element_articles.element_id
    )
    WHERE COALESCE(type_label, '') = ''
      AND id = (
        SELECT a2.id FROM element_articles a2
        WHERE a2.element_id = element_articles.element_id
        ORDER BY a2.order_index, a2.id
        LIMIT 1
      )
  `);

  // database.pragma('wal_checkpoint(FULL)');
}

function migrateElementArticles(database: Database.Database): void {
  ensureElementArticlesSchema(database);
}

function migrateCompanySettings(database: Database.Database): void {
  if (!tableExists(database, 'company_settings')) return;

  if (!hasColumn(database, 'company_settings', 'client_logo_path')) {
    database.exec(`ALTER TABLE company_settings ADD COLUMN client_logo_path TEXT DEFAULT ''`);
    database.exec(`ALTER TABLE company_settings ADD COLUMN client_logo_base64 TEXT DEFAULT ''`);
    database.exec(`ALTER TABLE company_settings ADD COLUMN client_logo_mime TEXT DEFAULT ''`);
  }
}

function getFavoritesTableSql(database: Database.Database): string | null {
  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='favorites'`)
    .get() as { sql: string } | undefined;
  return row?.sql ?? null;
}

function favoritesTypeAllowsDivers(database: Database.Database): boolean {
  const sql = getFavoritesTableSql(database);
  return sql != null && sql.includes("'divers'");
}

function migrateFavoritesTable(database: Database.Database): void {
  if (!tableExists(database, 'favorites')) return;
  if (favoritesTypeAllowsDivers(database)) return;

  if (tableExists(database, 'favorites_new')) {
    database.exec('DROP TABLE IF EXISTS favorites_new');
  }

  const run = database.transaction(() => {
    database.exec(`
      CREATE TABLE favorites_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('eclairage', 'prise', 'divers')),
        designation TEXT NOT NULL,
        power_w REAL NOT NULL DEFAULT 0,
        color TEXT DEFAULT '#3B82F6'
      );

      INSERT INTO favorites_new (id, type, designation, power_w, color)
      SELECT id, type, designation, power_w, color FROM favorites;

      DROP TABLE favorites;
      ALTER TABLE favorites_new RENAME TO favorites;
    `);
  });

  run();
  console.log('[DB] Migration favorites : type "divers" activé');
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
    console.log('[DB] Fermeture connexion');
    db.close();
    db = null;
    console.log('[DB] Connexion fermée');
  } else {
    console.log('[DB] closeDatabase() appelé mais db déjà null');
  }
}