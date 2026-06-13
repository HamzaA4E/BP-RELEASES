const { getDatabase, closeDatabase } = require('../dist-electron/electron/database/db');

const db = getDatabase();
const cols = db.pragma('table_info(element_articles)');
console.log('columns after migration:', cols.map((c) => c.name));

const rows = db
  .prepare(
    `SELECT id, element_id, type_label, designation, power_w, quantity, order_index
     FROM element_articles ORDER BY element_id, order_index, id`
  )
  .all();
console.log('articles:', JSON.stringify(rows, null, 2));

closeDatabase();
console.log('migration complete, database closed');
