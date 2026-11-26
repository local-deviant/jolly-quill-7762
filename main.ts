// AETHER RUSH — entrypoint (Node 22, standard library only).
//
//   node main.ts            hand the game in: validate, copy game/ and
//                           screenshots/ to $MAKEFUN_OUTPUT_DIR (or /output)
//                           and write /output/dossier.json
//   node main.ts --check    validate only, exit 0 when every check passes
//   node main.ts --serve [--port 8080]
//                           serve game/ locally for playtesting (validates
//                           first and refuses to serve an invalid entry)
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const REQUIRED_GAME_FILES = [
  'index.html',
  'src/config.js',
  'src/random.js',
  'src/track.js',
  'src/skiff.js',
  'src/gates.js',
  'src/hazards.js',
  'src/hud.js',
  'src/audio.js',
  'src/autopilot.js',
  'src/shots.js',
  'src/main.js',
  'vendor/three.module.min.js',
];

const SOURCE_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json']);

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function walk(dir: string, base: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) walk(full, rel, out);
    else if (entry.isFile()) out.push(rel);
  }
}

function gameFiles(): string[] {
  const found: string[] = [];
  if (existsSync(gameDir)) walk(gameDir, '', found);
  return found.sort();
}

// Only authored sources count here: files under vendor/ and *.min.js are
// vendored libraries, not game sources (the dossier treats them the same way).
function isVendored(rel: string): boolean {
  return rel.startsWith('vendor/') || /\.min\.(?:js|mjs|css)$/i.test(rel);
}

function gameSourceTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  for (const rel of gameFiles()) {
    if (isVendored(rel)) continue;
    if (!SOURCE_EXTS.has(extname(rel).toLowerCase())) continue;
    texts.set(rel, readFileSync(join(gameDir, rel), 'utf8'));
  }
  return texts;
}

function checkEntrypoint(): CheckResult {
  const path = join(here, 'main.ts');
  if (!existsSync(path)) return { name: 'entrypoint', pass: false, detail: 'main.ts missing at the repository root' };
  const text = readFileSync(path, 'utf8');
  const handsIn = text.includes('buildDossier') && text.includes('MAKEFUN_OUTPUT_DIR');
  return {
    name: 'entrypoint',
    pass: handsIn,
    detail: handsIn ? 'main.ts at the root hands the game in (buildDossier + MAKEFUN_OUTPUT_DIR)' : 'main.ts does not hand the game in',
  };
}

function checkLicense(): CheckResult {
  const path = join(here, 'LICENSE');
  if (!existsSync(path)) return { name: 'license', pass: false, detail: 'LICENSE missing' };
  const first = readFileSync(path, 'utf8').split('\n')[0] ?? '';
  const ok = first.startsWith('SPDX-License-Identifier: MIT');
  return { name: 'license', pass: ok, detail: ok ? `LICENSE opens with "${first.trim()}"` : `LICENSE first line is "${first.trim()}"` };
}

function checkGameStatic(): CheckResult {
  const missing = REQUIRED_GAME_FILES.filter((f) => !existsSync(join(gameDir, f)));
  const count = gameFiles().length;
  return {
    name: 'game-static',
    pass: missing.length === 0,
    detail: missing.length === 0 ? `${count} files under game/, every required file present` : `missing under game/: ${missing.join(', ')}`,
  };
}

function checkGameComplete(): CheckResult {
  const texts = [...gameSourceTexts().values()].join('\n');
  const lower = texts.toLowerCase();
  const need = ['goal', 'win', 'lose', 'score', 'start', 'restart'];
  const missing = need.filter((w) => !lower.includes(w));
  const laps = /lapsToWin:\s*3/.test(texts) || /3 laps/i.test(texts);
  const pass = missing.length === 0 && laps;
  return {
    name: 'game-complete',
    pass,
    detail: pass
      ? 'goal, win, lose, score, start, restart and 3 laps all present in the sources/page'
      : `missing: ${[...missing, ...(laps ? [] : ['3 laps'])].join(', ')}`,
  };
}

function checkNoNetwork(): CheckResult {
  const hits: string[] = [];
  for (const [rel, text] of gameSourceTexts()) {
    const stripped = text.replace(/data:[^"'`\s)]+/g, '');
    const bad: string[] = [];
    if (/\bfetch\s*\(/.test(stripped)) bad.push('fetch(');
    if (/XMLHttpRequest/.test(stripped)) bad.push('XMLHttpRequest');
    if (/WebSocket/.test(stripped)) bad.push('WebSocket');
    if (/https?:\/\//.test(stripped)) bad.push('http(s):// URL');
    if (/\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(stripped)) bad.push('protocol-relative URL');
    if (bad.length > 0) hits.push(`${rel}: ${bad.join(', ')}`);
  }
  return {
    name: 'no-network',
    pass: hits.length === 0,
    detail: hits.length === 0 ? 'no fetch, XHR, WebSocket or remote URL in game sources' : hits.join('; '),
  };
}

function checkScreenshots(): CheckResult {
  if (!existsSync(shotsDir)) return { name: 'screenshots', pass: false, detail: 'screenshots/ missing' };
  const files = readdirSync(shotsDir).filter((f) => !f.startsWith('.') && /\.(jpe?g|png)$/i.test(f)).sort();
  const bad: string[] = [];
  for (const f of files) {
    const size = statSync(join(shotsDir, f)).size;
    if (size < 20000 || size > 262144) bad.push(`${f} (${size} bytes)`);
  }
  const pass = files.length >= 3 && files.length <= 4 && bad.length === 0;
  return {
    name: 'screenshots',
    pass,
    detail: pass
      ? `${files.length} screenshots, each 20,000–262,144 bytes (${files.join(', ')})`
      : `${files.length} screenshots; out of range: ${bad.join(', ') || 'count must be 3–4'}`,
  };
}

function checkDeterministic(): CheckResult {
  const texts = [...gameSourceTexts().values()];
  const seeded = texts.some((t) => t.includes('mulberry32') || t.includes('seed'));
  const bad = texts.filter((t) => /Math\.random/.test(t) || /Date\.now/.test(t));
  return {
    name: 'deterministic',
    pass: seeded && bad.length === 0,
    detail: seeded
      ? bad.length === 0
        ? 'seeded RNG (mulberry32) present; no Math.random or Date.now in game sources'
        : 'Math.random or Date.now found in game sources'
      : 'no seeded RNG found in game sources',
  };
}

function checkDossier(): CheckResult {
  try {
    const bytes = buildDossier(here, CAPS);
    const ok = bytes.length <= 1500000;
    return {
      name: 'dossier',
      pass: ok,
      detail: ok ? `buildDossier builds: dossier.json ${bytes.length} bytes (cap 1,500,000)` : `dossier.json ${bytes.length} bytes, over the 1,500,000 cap`,
    };
  } catch (err) {
    return { name: 'dossier', pass: false, detail: `buildDossier refused: ${(err as Error).message}` };
  }
}

function runChecks(): CheckResult[] {
  return [
    checkEntrypoint(),
    checkLicense(),
    checkGameStatic(),
    checkGameComplete(),
    checkNoNetwork(),
    checkScreenshots(),
    checkDeterministic(),
    checkDossier(),
  ];
}

function printChecks(results: CheckResult[]): boolean {
  let ok = true;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`);
    if (!r.pass) ok = false;
  }
  return ok;
}

function handIn(): void {
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
  console.log(`handed in to ${out}`);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function serve(port: number): void {
  const root = resolve(gameDir);
  createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end('bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(join(root, normalize(pathname)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const stats = statSync(file);
      if (!stats.isFile()) throw new Error('not a file');
      response.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stats.size,
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end('not found');
    }
  }).listen(port, '127.0.0.1', () => {
    console.log(`game/ is on http://127.0.0.1:${port}`);
  });
}

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const ok = printChecks(runChecks());
  process.exit(ok ? 0 : 1);
} else if (args.includes('--serve')) {
  const ok = printChecks(runChecks());
  if (!ok) {
    console.error('refusing to serve an invalid entry');
    process.exit(1);
  }
  const portIndex = args.indexOf('--port');
  const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
  serve(Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080);
} else {
  const ok = printChecks(runChecks());
  if (!ok) {
    console.error('validation failed; nothing handed in');
    process.exit(1);
  }
  handIn();
}
