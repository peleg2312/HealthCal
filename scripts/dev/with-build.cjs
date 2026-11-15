#!/usr/bin/env node
/**
 * Runs a check against a fresh web build instead of the dev server, the way a build
 * pipeline does: export the app, serve the export for exactly as long as the command
 * runs, then stop. Nothing is left running afterwards, and the build is the same kind
 * the hosted preview and the stores get (minified, no hot reload).
 *
 *   node scripts/dev/with-build.cjs [--dir=<export folder>] [--port=8200] [--reuse] -- <command> [args]
 *
 *   node scripts/dev/with-build.cjs -- node scripts/dev/e2e.cjs --url={url}
 *   node scripts/dev/with-build.cjs --reuse --port=8201 -- node scripts/dev/evidence.cjs --url={url} --states=sweep --out=/tmp/sweep
 *   node scripts/dev/with-build.cjs --dir=/tmp/build          (export only, no command)
 *
 * `{url}` in the command's arguments becomes http://localhost:<port>; the same value is in
 * HEALTHCAL_URL. Every script in this folder takes --url.
 *   --dir     where the export goes (default: a folder under the system temp directory)
 *   --port    the port to serve on (default 8200); two runs at once need two ports and two folders
 *   --reuse   skip the export when the folder already holds one (after a code change, export again)
 * The build is made with EXPO_PUBLIC_E2E=1, so browser tests can read the app's state
 * (window.__healthcal) as they do on the dev server, and without a backend, like the dev
 * server without a .env file. Exits with the command's exit code.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

// This file's folder (scripts/dev), from the command line: the lint setup does not define __dirname.
const HERE = path.dirname(path.resolve(process.argv[1]));
const ROOT = path.resolve(HERE, '../..');

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const own = split === -1 ? argv : argv.slice(0, split);
const command = split === -1 ? [] : argv.slice(split + 1);
const flags = Object.fromEntries(own.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const dir = path.resolve(flags.dir || path.join(os.tmpdir(), 'healthcal-web-build'));
const port = Number(flags.port || 8200);
const url = `http://localhost:${port}`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.map': 'application/json' };

function exportBuild() {
  if (flags.reuse && fs.existsSync(path.join(dir, 'index.html'))) {
    console.log(`with-build: reusing the export in ${dir}`);
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`with-build: exporting to ${dir}`);
  const env = { ...process.env, EXPO_PUBLIC_E2E: '1', EXPO_NO_TELEMETRY: '1' };
  // No backend, as on the dev server without a .env file.
  delete env.EXPO_PUBLIC_SUPABASE_URL;
  delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const run = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', dir], { cwd: ROOT, env, encoding: 'utf8' });
  if (run.status !== 0 || !fs.existsSync(path.join(dir, 'index.html'))) {
    console.error((run.stdout || '').split('\n').slice(-15).join('\n'));
    console.error((run.stderr || '').split('\n').slice(-15).join('\n'));
    console.error('with-build: the export failed');
    process.exit(2);
  }
}

/** The export, with every unknown path answered by index.html (the app routes in the browser). */
function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(dir, pathname);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

(async () => {
  exportBuild();
  if (!command.length) {
    console.log(`with-build: exported; no command given, nothing served`);
    return;
  }
  let server;
  try {
    server = await serve();
  } catch (e) {
    console.error(`with-build: cannot serve on port ${port} (${e.code || e.message}); give another --port`);
    process.exit(2);
  }
  console.log(`with-build: serving ${dir} on ${url} while the command runs`);
  const child = spawn(command[0], command.slice(1).map((a) => a.split('{url}').join(url)), { cwd: process.cwd(), env: { ...process.env, HEALTHCAL_URL: url }, stdio: 'inherit' });
  const stop = (code) => server.close(() => process.exit(code));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', (e) => { console.error(`with-build: could not start the command: ${e.message}`); stop(2); });
  child.on('exit', (code, signal) => { server.closeAllConnections?.(); stop(code ?? (signal ? 1 : 0)); });
})();
