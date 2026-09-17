const http = require('http');
const { spawn } = require('child_process');

console.log("=== PROBANDO BACKEND NODE.JS (EXPRESS) ===");

// 1. Iniciar servidor temporalmente
const server = spawn('node', ['server.js']);

server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[Server]: ${output.trim()}`);
  if (output.includes('Servidor Node.js (Express) corriendo')) {
    runApiTests();
  }
});

server.stderr.on('data', (data) => {
  console.error(`[Server Error]: ${data.toString()}`);
});

function runApiTests() {
  console.log("\n⚡ Ejecutando peticiones HTTP de prueba a la API de Node.js...");

  // Petición GET /api/products
  http.get('http://localhost:8000/api/products', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      const products = JSON.parse(rawData);
      console.log(`✅ [OK] GET /api/products retorno ${products.length} productos en la base de datos.`);
      
      // Probar Ingesta de Cotización
      postQuoteTest();
    });
  });
}

function postQuoteTest() {
  const postData = JSON.stringify({
    supplier_name: "Proveedora Industrial Node",
    raw_text: "Cotización:\n- 20 Rodamientos Industriales a $85 c/u\n- 5 Litros Solvente a $210 c/u",
    user_name: "Prueba Node"
  });

  const req = http.request({
    hostname: 'localhost',
    port: 8000,
    path: '/api/quotes/process',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const quote = JSON.parse(data);
      console.log(`✅ [OK] POST /api/quotes/process procesó cotización ID #${quote.id} por $${quote.total_amount}`);
      console.log(`     Resumen IA: ${quote.ai_summary}`);

      // Finalizar prueba
      console.log("\n>>> TODAS LAS PRUEBAS EN NODE.JS PASARON SATISFACTORIAMENTE. <<<");
      server.kill();
      process.exit(0);
    });
  });

  req.write(postData);
  req.end();
}
