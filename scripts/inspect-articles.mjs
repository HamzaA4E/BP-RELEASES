import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const paths = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'bilpow', 'bilpow.db'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'bilpow', 'bilpow', 'bilpow.db'),
];

for (const dbPath of paths) {
  if (!fs.existsSync(dbPath)) {
    console.log('missing:', dbPath);
    continue;
  }
  const db = new Database(dbPath, { readonly: true });
  const cols = db.pragma('table_info(element_articles)').map((c) => c.name);
  const count = db.prepare('SELECT COUNT(*) as c FROM element_articles').get();
  console.log('\nDB:', dbPath);
  console.log('cols:', cols);
  console.log('article count:', count);
  if (count.c > 0) {
    const rows = db
      .prepare(
        'SELECT id, element_id, type_label, designation, power_w, quantity FROM element_articles LIMIT 5'
      )
      .all();
    console.log('sample:', rows);
  }
  db.close();
}
