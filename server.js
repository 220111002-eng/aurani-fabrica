const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Encabezados de Seguridad HTTP Nivel Empresa (Helmet Standards)
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'app/static')));

// Inicializar Base de Datos SQLite
const dbPath = path.join(__dirname, 'sistema_fabrica_node.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error al abrir base de datos SQLite:", err);
  else console.log("✅ Base de datos SQLite conectada correctamente:", dbPath);
});

// Crear tablas relacionales
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'OPERADOR',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    contact_person TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    stock_quantity REAL DEFAULT 0.0,
    min_stock REAL DEFAULT 10.0,
    unit_price REAL DEFAULT 0.0,
    supplier_id INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    quote_number TEXT,
    raw_content TEXT,
    ai_summary TEXT,
    total_amount REAL DEFAULT 0.0,
    status TEXT DEFAULT 'RECIBIDA',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER,
    product_name TEXT,
    quantity REAL,
    unit_price REAL,
    total_price REAL,
    FOREIGN KEY(quote_id) REFERENCES quotes(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT,
    entity_id INTEGER,
    action TEXT,
    user_name TEXT DEFAULT 'Sistema/Android',
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT,
    message TEXT,
    status TEXT DEFAULT 'PENDIENTE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Sembrar datos iniciales si está vacía
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (row && row.count === 0) seedDatabase();
  });
});

function seedDatabase() {
  db.run(`INSERT INTO users (name, email, password, role) VALUES 
    ('Ing. Juan Pérez', 'admin@fabrica.com', '123456', 'ADMIN'),
    ('Carlos Almacenista', 'operador@fabrica.com', '123456', 'OPERADOR')
  `);

  db.run(`INSERT INTO suppliers (name, email, phone, contact_person) VALUES 
    ('Aceros del Norte S.A.', 'ventas@acerosnorte.com', '81-8000-1122', 'Ing. Carlos Ramos'),
    ('Empaques e Insumos Industriales', 'cotizaciones@empaquesind.com', '55-5555-4321', 'Lic. Ana Morales')
  `);

  db.run(`INSERT INTO products (sku, name, category, stock_quantity, min_stock, unit_price, supplier_id) VALUES
    ('MAT-001', 'Placa de Acero Calibre 10', 'Materias Primas', 45.0, 15.0, 1250.0, 1),
    ('MAT-002', 'Tornillo Hexagonal 1/2 x 2', 'Fijación', 8.0, 50.0, 4.5, 2),
    ('MAT-003', 'Caja de Cartón Corrugado 40x40', 'Empaque', 120.0, 100.0, 18.0, 2),
    ('INS-004', 'Aceite Lubricante Sintético 20L', 'Mantenimiento', 3.0, 5.0, 2400.0, 1)
  `, function() {
    checkAllLowStock();
    logAudit('Sistema', 0, 'INICIALIZACION', 'Base de datos Node.js inicializada con datos demo.', 'Sistema Central Node.js');
  });
}

// Función Helper para Auditoría y Alertas
function logAudit(entityType, entityId, action, details, userName = 'Android App / Operador') {
  db.run(`INSERT INTO audit_logs (entity_type, entity_id, action, user_name, details) VALUES (?, ?, ?, ?, ?)`,
    [entityType, entityId, action, userName, details]
  );
}

function createAlert(alertType, message) {
  db.get(`SELECT id FROM alerts WHERE alert_type = ? AND message = ? AND status = 'PENDIENTE'`, [alertType, message], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO alerts (alert_type, message, status) VALUES (?, ?, 'PENDIENTE')`, [alertType, message]);
    }
  });
}

function checkProductLowStock(product) {
  if (product && product.stock_quantity !== undefined && product.min_stock !== undefined) {
    if (product.stock_quantity <= product.min_stock) {
      const msg = `¡ALERTA MÓVIL! Stock crítico en '${product.name}' (SKU: ${product.sku}). Disponibles: ${product.stock_quantity} (Mínimo: ${product.min_stock})`;
      createAlert('STOCK_BAJO', msg);
      logAudit('Product', product.id, 'ALERTA_STOCK_BAJO', msg, 'Motor de Inventario Node.js');
    }
  }
}

function checkAllLowStock() {
  db.all(`SELECT * FROM products`, (err, rows) => {
    if (rows) rows.forEach(p => checkProductLowStock(p));
  });
}

// IA Parser con Gemini API o Fallback Inteligente
async function parseQuoteContent(supplierName, rawText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analiza esta cotización de '${supplierName}':\n${rawText}\nResponde en JSON: {"supplier_name":"${supplierName}","quote_number":"COT-01","ai_summary":"resumen","total_amount":100,"items":[{"product_name":"prod","quantity":1,"unit_price":100,"total_price":100}]}`
      });
      const match = response.text.match(/\{.*\}/s);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.log("Error usando Gemini SDK, ejecutando fallback local:", e.message);
    }
  }

  // Fallback estructurado local
  const items = [];
  const lines = rawText.split('\n').filter(l => l.trim());
  let total = 0;

  lines.forEach(l => {
    const nums = l.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 2) {
      const qty = parseFloat(nums[0]);
      const price = parseFloat(nums[nums.length - 1]);
      const name = l.replace(/\$?\s*\d+(?:\.\d+)?/g, '').trim().replace(/^[-:*]+/, '').trim() || "Insumo Industrial";
      const totalItem = qty * price;
      items.push({ product_name: name, quantity: qty, unit_price: price, total_price: totalItem });
      total += totalItem;
    }
  });

  if (items.length === 0) {
    items.push({ product_name: "Insumos y Materiales de Fábrica", quantity: 1, unit_price: 1500.0, total_price: 1500.0 });
    total = 1500.0;
  }

  return {
    supplier_name: supplierName,
    quote_number: `COT-${supplierName.substring(0,3).toUpperCase()}-2026`,
    ai_summary: `🤖 [Node.js IA Engine]: Cotización de '${supplierName}' procesada automáticamente con ${items.length} partidas por un total de $${total.toFixed(2)} MXN.`,
    total_amount: total,
    items: items
  };
}

// --- ENDPOINTS AUTENTICACIÓN (Para App Android: Login, Registro, Recuperación) ---

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
    [name, email, hashedPassword, role || 'OPERADOR'],
    function(err) {
      if (err) return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
      logAudit('User', this.lastID, 'REGISTRO', `Nuevo usuario registrado desde App Android: ${name} (${email})`, name);
      res.status(201).json({ id: this.lastID, name, email, role: role || 'OPERADOR', message: 'Usuario registrado exitosamente' });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
  }

  db.get(`SELECT id, name, email, password, role FROM users WHERE LOWER(TRIM(email)) = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const isValidPassword = bcrypt.compareSync(password, user.password) || (password === user.password);

    if (!isValidPassword) {
      logAudit('User', user.id, 'LOGIN_FALLIDO', `Intento fallido de acceso para correo: ${email}`, user.name);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    logAudit('User', user.id, 'LOGIN', `Inicio de sesión exitoso desde App Android`, user.name);
    const { password: _, ...cleanUser } = user;
    res.json({ status: 'ok', message: 'Bienvenido', user: cleanUser });
  });
});

app.post('/api/auth/recover-password', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { newPassword, new_password } = req.body;
  const targetPassword = newPassword || new_password;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
  }

  db.get(`SELECT id, name FROM users WHERE LOWER(TRIM(email)) = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'El correo electrónico no está registrado en la base de datos' });

    if (targetPassword) {
      const hashedPassword = bcrypt.hashSync(targetPassword, 10);
      db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashedPassword, user.id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: 'Error al actualizar la contraseña' });
        logAudit('User', user.id, 'CAMBIO_PASSWORD', `Contraseña reestablecida exitosamente para ${email}`, user.name);
        return res.json({ status: 'ok', message: '¡Contraseña reestablecida exitosamente! Ya puedes iniciar sesión.' });
      });
    } else {
      logAudit('User', user.id, 'RECUPERAR_PASS', `Solicitud de recuperación para ${email}`, user.name);
      return res.json({ status: 'ok', message: `Correo verificado para ${email}. Por favor ingresa tu nueva contraseña.` });
    }
  });
});

// Endpoint para consultar todos los usuarios registrados (nube y local)
app.get('/api/users', (req, res) => {
  db.all(`SELECT id, name, email, role, created_at FROM users ORDER BY id ASC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- ENDPOINTS API REST (Para App Android y Dashboard Web) ---

// 1. Obtener lista de productos (Ideal para RecyclerView en Android)
app.get('/api/products', (req, res) => {
  db.all(`SELECT * FROM products ORDER BY id ASC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 2. Crear producto
app.post('/api/products', (req, res) => {
  const { sku, name, category, stock_quantity, min_stock, unit_price, supplier_id } = req.body;
  db.run(`INSERT INTO products (sku, name, category, stock_quantity, min_stock, unit_price, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sku, name, category || 'General', stock_quantity || 0, min_stock || 10, unit_price || 0, supplier_id || null],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      const newId = this.lastID;
      logAudit('Product', newId, 'CREAR', `Nuevo producto creado desde App/Web: ${name} (SKU: ${sku})`, req.body.user_name || 'Operador');
      db.get(`SELECT * FROM products WHERE id = ?`, [newId], (e, row) => {
        checkProductLowStock(row);
        res.status(201).json(row);
      });
    }
  );
});

// 3. Modificar producto / Editar stock desde App Android
app.put('/api/products/:id', (req, res) => {
  const id = req.params.id;
  const { name, stock_quantity, min_stock, unit_price, user_name } = req.body;

  db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, prod) => {
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    const newName = name !== undefined ? name : prod.name;
    const newStock = stock_quantity !== undefined ? stock_quantity : prod.stock_quantity;
    const newMin = min_stock !== undefined ? min_stock : prod.min_stock;
    const newPrice = unit_price !== undefined ? unit_price : prod.unit_price;
    const user = user_name || 'Operador Android';

    db.run(`UPDATE products SET name = ?, stock_quantity = ?, min_stock = ?, unit_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newName, newStock, newMin, newPrice, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const details = `Stock: ${prod.stock_quantity} -> ${newStock}, Precio: $${prod.unit_price} -> $${newPrice}`;
        logAudit('Product', id, 'ACTUALIZAR', details, user);

        db.get(`SELECT * FROM products WHERE id = ?`, [id], (e, updatedProd) => {
          checkProductLowStock(updatedProd);
          res.json(updatedProd);
        });
      }
    );
  });
});

// 3b. Eliminar producto
app.delete('/api/products/:id', (req, res) => {
  const id = req.params.id;
  db.get(`SELECT name, sku FROM products WHERE id = ?`, [id], (err, prod) => {
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
    db.run(`DELETE FROM products WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('Product', id, 'ELIMINAR', `Producto eliminado: ${prod.name} (SKU: ${prod.sku})`, req.body.user_name || 'Administrador');
      res.json({ status: 'ok', message: 'Producto eliminado exitosamente' });
    });
  });
});

// 4. Ingesta de Cotización con IA
app.post('/api/quotes/process', async (req, res) => {
  const { supplier_name, raw_text, user_name } = req.body;
  const parsed = await parseQuoteContent(supplier_name, raw_text);

  db.run(`INSERT INTO quotes (supplier_name, quote_number, raw_content, ai_summary, total_amount, status) VALUES (?, ?, ?, ?, ?, 'RECIBIDA')`,
    [parsed.supplier_name, parsed.quote_number, raw_text, parsed.ai_summary, parsed.total_amount],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const quoteId = this.lastID;

      parsed.items.forEach(item => {
        db.run(`INSERT INTO quote_items (quote_id, product_name, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)`,
          [quoteId, item.product_name, item.quantity, item.unit_price, item.total_price]
        );
      });

      logAudit('Quote', quoteId, 'INGESTION_IA', `Cotización IA procesada para ${supplier_name}. Total: $${parsed.total_amount}`, user_name || 'Ingesta IA');

      res.status(201).json({ id: quoteId, ...parsed });
    }
  );
});

// 5. Historial de Cotizaciones
app.get('/api/quotes', (req, res) => {
  db.all(`SELECT * FROM quotes ORDER BY created_at DESC`, (err, quotes) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(quotes);
  });
});

// 6. Auditoría de Cambios
app.get('/api/audit-logs', (req, res) => {
  db.all(`SELECT * FROM audit_logs ORDER BY timestamp DESC`, (err, logs) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(logs);
  });
});

// 7. Alertas Pendientes
app.get('/api/alerts', (req, res) => {
  db.all(`SELECT * FROM alerts ORDER BY created_at DESC`, (err, alerts) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(alerts);
  });
});

app.post('/api/alerts/:id/read', (req, res) => {
  db.run(`UPDATE alerts SET status = 'ATENDIDA' WHERE id = ?`, [req.params.id], (err) => {
    res.json({ status: 'ok' });
  });
});

// Endpoint para descargar la base de datos SQLite en vivo
app.get('/api/download-db', (req, res) => {
  const dbFile = path.join(__dirname, 'sistema_fabrica_node.db');
  res.download(dbFile, 'sistema_fabrica_node.db');
});

// Arrancar Servidor Node.js
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Node.js (Express) corriendo en el puerto ${PORT}`);
  console.log(`📱 Endpoints de la API listos para conectar con la App Android en http://localhost:${PORT}/api/products`);
});
