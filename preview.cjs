const { createServer } = require('node:http');
const { createReadStream, statSync } = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.argv[2] || 4188);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary'
};

const server = createServer((request, response) => {
  let file;
  let size;
  try {
    const route = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    file = path.resolve(root, '.' + (route.endsWith('/') ? route + 'index.html' : route));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('File is outside the preview folder or does not exist.');
    }
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error('Not a file.');
    size = stat.size;
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }
  const headers = {
    'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  let range;
  if (['.mp4', '.mp3', '.wav'].includes(path.extname(file))) {
    headers['Accept-Ranges'] = 'bytes';
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
        return;
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        response.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
        return;
      }
      range = { start, end };
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
      size = end - start + 1;
    }
  }
  headers['Content-Length'] = size;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(file, range);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log('Portfolio preview: http://127.0.0.1:' + port);
});
