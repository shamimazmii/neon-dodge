import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
for (const path of [
  'dist/client/index.html',
  'dist/client/style.css',
  'dist/client/game.js',
  'dist/server/index.js',
  'dist/.openai/hosting.json',
  'dist/.openai/drizzle/0000_melted_millenium_guard.sql',
  'dist/.openai/drizzle/meta/_journal.json',
  'dist/.openai/drizzle/meta/0000_snapshot.json'
]) {
  await access(resolve(projectRoot, path));
}

const html = await readFile(resolve(projectRoot, 'dist/client/index.html'), 'utf8');
assert.match(html, /id="playerName"/);
assert.match(html, /id="sound"/);
assert.doesNotMatch(html, /Top 10/i);
assert.match(html, /class="player-setup hidden" id="playerSetup"/);
assert.doesNotMatch(html, /id="start" disabled/);

const workerUrl = pathToFileURL(resolve(projectRoot, 'dist/server/index.js'));
workerUrl.searchParams.set('validate', String(Date.now()));
const { default: worker } = await import(workerUrl.href);
assert.equal(typeof worker.fetch, 'function');

const rows = [];
const database = {
  prepare(sql) {
    const statement = {
      values: [],
      bind(...values) { this.values = values; return this; },
      async all() {
        return { results: [...rows].sort((a, b) => b.score - a.score || b.seconds - a.seconds).slice(0, 100) };
      },
      async run() {
        const [playerKey, name, score, seconds, updatedAt] = this.values;
        const existing = rows.find(row => row.playerKey === playerKey);
        if (!existing) rows.push({ playerKey, name, score, seconds, updatedAt });
        else if (score > existing.score || (score === existing.score && seconds > existing.seconds)) Object.assign(existing, { name, score, seconds, updatedAt });
        return { success: true };
      }
    };
    assert.match(sql, /leaderboard_scores/);
    return statement;
  }
};

const staticResponse = await worker.fetch(new Request('https://example.com/'), {
  ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }) },
  DB: database
});
assert.equal(staticResponse.status, 200);

const saveResponse = await worker.fetch(new Request('https://example.com/api/leaderboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Neon Ace', score: 850, seconds: 34.2 })
}), { DB: database });
assert.equal(saveResponse.status, 200);
assert.equal((await saveResponse.json()).scores[0].name, 'Neon Ace');

const invalidResponse = await worker.fetch(new Request('https://example.com/api/leaderboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '<script>', score: 900, seconds: 20 })
}), { DB: database });
assert.equal(invalidResponse.status, 400);

console.log('Validated Neon Dodge Sites artifact');
