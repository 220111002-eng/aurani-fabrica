const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sistema_fabrica_node.db');

db.all('SELECT * FROM users', [], (err, rows) => {
  if (err) console.error(err);
  else console.log('USERS IN DB:', JSON.stringify(rows, null, 2));
});

db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5', [], (err, rows) => {
  if (err) console.error(err);
  else console.log('AUDIT LOGS IN DB:', JSON.stringify(rows, null, 2));
});
