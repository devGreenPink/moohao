// Minimal static server for local testing: `npm run serve` then open http://localhost:8080
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname, join, normalize, resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const port = Number(process.env.PORT) || 8080
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png',
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path))
  if (!file.startsWith(root) || file.includes('node_modules')) return res.writeHead(403).end()
  try {
    const body = await readFile(file)
    res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'})
    res.end(body)
  } catch {
    res.writeHead(404).end('Not found')
  }
}).listen(port, () => console.log(`Nearby running at http://localhost:${port}`))
