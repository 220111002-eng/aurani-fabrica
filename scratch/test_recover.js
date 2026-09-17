const http = require('http');
const https = require('https');

function test(url, data) {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? https : http;
  const body = JSON.stringify(data);

  const req = client.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, res => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      console.log(`[${res.statusCode}] ${url} =>`, raw);
    });
  });

  req.on('error', e => console.error(e.message));
  req.write(body);
  req.end();
}

test('https://aurani-fabrica.onrender.com/api/auth/recover-password', { email: 'saul@gmail.com', newPassword: '123' });
