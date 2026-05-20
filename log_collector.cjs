const http = require('http');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'browser_logs.txt');

// Reset log file on start
fs.writeFileSync(logFile, `=== Log Collector Started at ${new Date().toISOString()} ===\n`);

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const time = new Date().toLocaleTimeString();
        const line = `[${time}] [${data.type.toUpperCase()}] ${data.message}\n`;
        fs.appendFileSync(logFile, line);
      } catch (e) {
        fs.appendFileSync(logFile, `[ERROR] Failed to parse log: ${body}\n`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(9999, '0.0.0.0', () => {
  console.log('Log collector running on http://localhost:9999');
});
