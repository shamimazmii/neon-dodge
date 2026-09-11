'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || '127.0.0.1';
const publicDir = path.join(__dirname, 'dist');
const dataFile = process.env.LEADERBOARD_FILE || path.join(__dirname, 'data', 'leaderboard.json');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']]
]);
let writeQueue = Promise.resolve();

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
}

function validName(name) {
  return name.length >= 2 && /^[\p{L}\p{N} _-]+$/u.test(name);
}

function normalizeScores(scores) {
  const byPlayer = new Map();
  for (const item of Array.isArray(scores) ? scores : []) {
    const name = cleanName(item?.name);
    const score = Math.floor(Number(item?.score));
    const seconds = Number(item?.seconds);
    if (!validName(name) || !Number.isFinite(score) || score < 0 || score > 10_000_000 || !Number.isFinite(seconds) || seconds < 0 || seconds > 36_000) continue;
    const safe = { name, score, seconds: Number(seconds.toFixed(1)) };
    const key = name.toLocaleLowerCase();
    const previous = byPlayer.get(key);
    if (!previous || safe.score > previous.score || (safe.score === previous.score && safe.seconds > previous.seconds)) byPlayer.set(key, safe);
  }
  return [...byPlayer.values()]
    .sort((a, b) => b.score - a.score || b.seconds - a.seconds || a.name.localeCompare(b.name))
    .slice(0, 10);
}

async function readScores() {
  try {
    return normalizeScores(JSON.parse(await fs.promises.readFile(dataFile, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function saveScore(entry) {
  const operation = writeQueue.then(async () => {
    const scores = normalizeScores([...(await readScores()), entry]);
    await fs.promises.mkdir(path.dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(scores, null, 2), 'utf8');
    await fs.promises.rename(temporary, dataFile);
    return scores;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error('Payload too large');
  }
  return JSON.parse(body || '{}');
}

async function handleApi(request, response, pathname) {
  if (pathname !== '/api/leaderboard') return false;
  try {
    if (request.method === 'GET') {
      json(response, 200, { scores: await readScores() });
      return true;
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const entry = { name: cleanName(body.name), score: Math.floor(Number(body.score)), seconds: Number(body.seconds) };
      if (!validName(entry.name) || !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 10_000_000 || !Number.isFinite(entry.seconds) || entry.seconds < 0 || entry.seconds > 36_000) {
        json(response, 400, { error: 'Invalid score' });
        return true;
      }
      json(response, 200, { scores: await saveScore(entry) });
      return true;
    }
    response.setHeader('Allow', 'GET, POST');
    json(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('Leaderboard error:', error.message);
    json(response, error.message === 'Payload too large' ? 413 : 500, { error: 'Leaderboard unavailable' });
  }
  return true;
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (await handleApi(request, response, url.pathname)) return;
  const asset = files.get(url.pathname);
  if (!asset || request.method !== 'GET') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const [filename, contentType] = asset;
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': filename === 'index.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(path.join(publicDir, filename)).pipe(response);
}).listen(port, host, () => console.log(`http://${host}:${port}`));
