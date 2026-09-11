'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = {};
const events = {};
const registered = [];
const storage = new Map();
let frame;

const canvasContext = new Proxy({}, { get: () => () => {}, set: () => true });

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : force;
      enabled ? values.add(name) : values.delete(name);
      return enabled;
    }
  };
}

function element(id = '') {
  return elements[id] ||= {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    classList: classList(),
    children: [],
    addEventListener(name, handler) { this[name] = handler; },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this[name] = value; },
    getContext: () => canvasContext,
    setPointerCapture() {},
    focus() {}
  };
}

const sandbox = {
  document: {
    hidden: false,
    getElementById: element,
    createElement: () => element(`generated-${Math.random()}`),
    addEventListener(name, handler) { events[name] = handler; },
    modelContext: { registerTool: tool => registered.push(tool) }
  },
  window: { addEventListener: (name, handler) => { events[name] = handler; } },
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  fetch: async () => ({ ok: true, json: async () => ({ scores: [] }) }),
  requestAnimationFrame: callback => { frame = callback; },
  setTimeout: callback => { callback(); return 1; },
  Math,
  Promise,
  URL
};

const html = fs.readFileSync('dist/index.html', 'utf8');
for (const requiredId of ['playerName', 'sound', 'boardModal', 'scoreList']) {
  assert.match(html, new RegExp(`id="${requiredId}"`));
}
assert.doesNotMatch(html, /Top 10/i);
assert.match(html, /class="player-setup hidden" id="playerSetup"/);
assert.doesNotMatch(html, /id="start" disabled/);

vm.runInNewContext(fs.readFileSync('dist/game.js', 'utf8'), sandbox);
const tool = registered[0];
assert.equal(tool.name, 'control_neon_dodge');
assert.throws(() => tool.execute({ action: 'bad' }));
assert.equal(tool.execute({ action: 'status' }).needsName, false);
assert.throws(() => tool.execute({ action: 'set_name', name: '<script>' }));
assert.equal(tool.execute({ action: 'start' }).state, 'playing');
assert.equal(tool.execute({ action: 'set_name', name: 'Neon Ace' }).player, 'Neon Ace');

for (let timestamp = 16; timestamp < 700; timestamp += 16) frame(timestamp);
assert.ok(tool.execute({ action: 'status' }).score > 0);
assert.equal(tool.execute({ action: 'pause' }).state, 'paused');
const pausedScore = tool.execute({ action: 'status' }).score;
frame(720);
assert.equal(tool.execute({ action: 'status' }).score, pausedScore);
assert.equal(tool.execute({ action: 'resume' }).state, 'playing');
events.blur();
assert.equal(tool.execute({ action: 'status' }).state, 'paused');
assert.equal(tool.execute({ action: 'start' }).score, 0);

console.log('PASS: instant start, validation, sound UI, scoring, pause, resume, restart and leaderboard controls');
