import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const server = http.createServer((req, res) => {
  const rawUrl = req.url ?? '/';
  const safePath = rawUrl === '/' || rawUrl === '/login' ? '/login.html' : rawUrl;
  // Sanitize: allow only simple filenames with no path traversal
  const basename = path.basename(safePath);
  if (!basename || basename.startsWith('.') || !/^[\w.-]+$/.test(basename)) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const filePath = path.join(__dirname, '..', 'examples', 'demo-app', basename);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Demo server running at http://localhost:${PORT}/login`);
});
