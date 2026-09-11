(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ids = [
    'score','time','best','overlay','heading','message','start','pause','tag','hint','sound',
    'leaderboard','playerLabel','playerSetup','playerName','nameError','overlayLeaderboard',
    'boardModal','boardStatus','scoreList','boardPlayer','closeBoard','boardPlay','changePlayer'
  ];
  const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const W = 900;
  const H = 510;
  const keys = new Set();
  const scoreStoreKey = 'neon-dodge-leaderboard-v1';

  let state = 'ready';
  let elapsed = 0;
  let score = 0;
  let best = 0;
  let objects = [];
  let sparks = [];
  let spawn = 0;
  let coin = 0;
  let last = 0;
  let currentPlayer = '';
  let cachedScores = [];
  const player = { x: 450, y: 458, w: 32, h: 22 };

  const audio = (() => {
    let context;
    let muted = false;
    try { muted = localStorage.getItem('neon-dodge-muted') === '1'; } catch {}

    function getContext() {
      if (muted) return null;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context ||= new AudioContext();
      if (context.state === 'suspended') context.resume();
      return context;
    }

    function tone(frequency, duration = .09, type = 'square', volume = .035, delay = 0, endFrequency = frequency) {
      const ac = getContext();
      if (!ac) return;
      const startAt = ac.currentTime + delay;
      const oscillator = ac.createOscillator();
      const gain = ac.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startAt + duration);
      gain.gain.setValueAtTime(.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
      oscillator.connect(gain).connect(ac.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + .02);
    }

    const effects = {
      start() { tone(220, .1, 'square', .03); tone(330, .1, 'square', .03, .08); tone(520, .14, 'square', .035, .16); },
      collect() { tone(740, .07, 'sine', .045); tone(1180, .12, 'sine', .04, .05); },
      crash() { tone(180, .28, 'sawtooth', .065, 0, 45); tone(92, .34, 'square', .04, .04, 30); },
      pause() { tone(360, .08, 'triangle', .03, 0, 250); },
      resume() { tone(260, .08, 'triangle', .03, 0, 390); },
      record() { [520, 660, 820, 1040].forEach((note, index) => tone(note, .15, 'sine', .035, index * .09)); }
    };

    function updateButton() {
      ui.sound.setAttribute('aria-pressed', String(muted));
      ui.sound.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
      ui.sound.innerHTML = muted ? '× <span>Muted</span>' : '♪ <span>Sound</span>';
    }

    return {
      play(name) { effects[name]?.(); },
      toggle() {
        muted = !muted;
        try { localStorage.setItem('neon-dodge-muted', muted ? '1' : '0'); } catch {}
        updateButton();
        if (!muted) effects.resume();
      },
      updateButton
    };
  })();

  function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  }

  function nameError(name) {
    if (name.length < 2) return 'Use at least 2 characters.';
    if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return 'Use letters, numbers, spaces, _ or - only.';
    return '';
  }

  function playerKey(name) {
    return name.toLocaleLowerCase();
  }

  function setPlayer(name) {
    currentPlayer = cleanName(name);
    if (nameError(currentPlayer)) return false;
    try {
      localStorage.setItem('neon-dodge-player', currentPlayer);
      best = Number(localStorage.getItem(`neon-dodge-best:${playerKey(currentPlayer)}`)) || 0;
    } catch { best = 0; }
    ui.playerLabel.textContent = currentPlayer.toUpperCase();
    ui.boardPlayer.textContent = currentPlayer.toUpperCase();
    ui.best.textContent = String(best).padStart(4, '0');
    ui.leaderboard.disabled = false;
    ui.start.disabled = false;
    return true;
  }

  function showNameGate(copy = 'Your best score will be saved to the leaderboard.') {
    state = 'ready';
    ui.overlay.classList.remove('hidden');
    ui.playerSetup.classList.remove('hidden');
    ui.overlayLeaderboard.classList.add('hidden');
    ui.tag.textContent = 'ENTER THE ARCADE';
    ui.heading.innerHTML = 'Choose your<br>player name';
    ui.message.textContent = copy;
    ui.start.innerHTML = 'Start game <span>→</span>';
    ui.start.disabled = Boolean(nameError(cleanName(ui.playerName.value)));
    ui.hint.textContent = 'ENTER A NAME TO START';
    setTimeout(() => ui.playerName.focus(), 0);
  }

  function gameOverlay(tag, title, message, label, showBoard = false) {
    ui.overlay.classList.remove('hidden');
    ui.playerSetup.classList.add('hidden');
    ui.tag.textContent = tag;
    ui.heading.innerHTML = title;
    ui.message.textContent = message;
    ui.start.innerHTML = `${label} <span>→</span>`;
    ui.start.disabled = false;
    ui.overlayLeaderboard.classList.toggle('hidden', !showBoard);
    ui.hint.textContent = state === 'paused' ? 'PRESS SPACE TO RESUME' : 'PRESS SPACE TO START';
  }

  function confirmPlayer() {
    const name = cleanName(ui.playerName.value);
    const error = nameError(name);
    ui.nameError.textContent = error;
    if (error) return false;
    ui.playerName.value = name;
    setPlayer(name);
    return true;
  }

  function start() {
    if (!currentPlayer && !confirmPlayer()) return;
    if (state === 'paused') {
      state = 'playing';
      ui.overlay.classList.add('hidden');
      ui.pause.innerHTML = 'Ⅱ <span>Pause</span>';
      audio.play('resume');
      return;
    }
    elapsed = 0;
    score = 0;
    objects = [];
    sparks = [];
    spawn = .4;
    coin = 1;
    player.x = W / 2;
    keys.clear();
    state = 'playing';
    ui.pause.disabled = false;
    ui.pause.innerHTML = 'Ⅱ <span>Pause</span>';
    ui.overlay.classList.add('hidden');
    updateHud();
    audio.play('start');
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    keys.clear();
    ui.pause.innerHTML = '▶ <span>Resume</span>';
    gameOverlay('TAKE A BREATHER', 'Game paused', 'Ready? Pick up where you left off.', 'Resume game');
    audio.play('pause');
  }

  function readLocalScores() {
    try {
      const value = JSON.parse(localStorage.getItem(scoreStoreKey) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function mergeScore(list, entry) {
    const byPlayer = new Map();
    for (const item of [...list, entry]) {
      if (!item || nameError(cleanName(item.name))) continue;
      const safe = {
        name: cleanName(item.name),
        score: Math.max(0, Math.floor(Number(item.score) || 0)),
        seconds: Math.max(0, Number(item.seconds) || 0)
      };
      const key = playerKey(safe.name);
      const previous = byPlayer.get(key);
      if (!previous || safe.score > previous.score || (safe.score === previous.score && safe.seconds > previous.seconds)) byPlayer.set(key, safe);
    }
    return [...byPlayer.values()].sort((a, b) => b.score - a.score || b.seconds - a.seconds || a.name.localeCompare(b.name)).slice(0, 10);
  }

  function saveLocalScore(entry) {
    cachedScores = mergeScore(readLocalScores(), entry);
    try { localStorage.setItem(scoreStoreKey, JSON.stringify(cachedScores)); } catch {}
    return cachedScores;
  }

  async function loadScores() {
    try {
      const response = await fetch('/api/leaderboard', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const body = await response.json();
      cachedScores = Array.isArray(body.scores) ? body.scores : [];
      return cachedScores;
    } catch {
      cachedScores = readLocalScores();
      return cachedScores;
    }
  }

  async function submitScore(entry) {
    saveLocalScore(entry);
    try {
      const response = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!response.ok) throw new Error('Score was not saved online');
      const body = await response.json();
      if (Array.isArray(body.scores)) cachedScores = body.scores;
    } catch {}
  }

  function renderScores(scores) {
    ui.scoreList.textContent = '';
    ui.boardStatus.classList.add('hidden');
    if (!scores.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-score';
      empty.textContent = 'No scores yet. Be the first on the board.';
      ui.scoreList.appendChild(empty);
      return;
    }
    scores.forEach((item, index) => {
      const row = document.createElement('li');
      if (playerKey(item.name) === playerKey(currentPlayer)) row.classList.add('current');
      for (const [className, value] of [
        ['rank', `#${String(index + 1).padStart(2, '0')}`],
        ['score-name', item.name.toUpperCase()],
        ['score-points', String(Math.floor(item.score)).padStart(4, '0')],
        ['score-time', `${Number(item.seconds).toFixed(1)}s`]
      ]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = value;
        row.appendChild(span);
      }
      ui.scoreList.appendChild(row);
    });
  }

  async function openLeaderboard() {
    if (!currentPlayer) {
      showNameGate('Enter your player name before viewing the leaderboard.');
      return;
    }
    if (state === 'playing') pause();
    ui.boardModal.classList.remove('hidden');
    ui.boardStatus.classList.remove('hidden');
    ui.boardStatus.textContent = 'Loading scores…';
    ui.scoreList.textContent = '';
    ui.closeBoard.focus();
    renderScores(await loadScores());
  }

  function closeLeaderboard() {
    ui.boardModal.classList.add('hidden');
    ui.start.focus();
  }

  function end() {
    state = 'over';
    keys.clear();
    ui.pause.disabled = true;
    const finalScore = Math.floor(score);
    const isRecord = finalScore > best;
    best = Math.max(best, finalScore);
    try { localStorage.setItem(`neon-dodge-best:${playerKey(currentPlayer)}`, String(best)); } catch {}
    ui.best.textContent = String(best).padStart(4, '0');
    submitScore({ name: currentPlayer, score: finalScore, seconds: Number(elapsed.toFixed(1)) });
    gameOverlay(isRecord ? 'NEW PERSONAL BEST!' : 'TRY AGAIN?', 'Oops, you got hit!', `Score ${finalScore} · Survived ${elapsed.toFixed(1)} seconds.`, 'Play again', true);
    audio.play('crash');
    if (isRecord) setTimeout(() => audio.play('record'), 340);
  }

  function updateHud() {
    ui.score.textContent = String(Math.floor(score)).padStart(4, '0');
    ui.time.textContent = `${elapsed.toFixed(1)}s`;
  }

  function update(dt) {
    elapsed += dt;
    score += dt * 10;
    const dir = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    player.x = Math.max(20, Math.min(W - 20, player.x + dir * 510 * dt));
    spawn -= dt;
    coin -= dt;
    const speed = 175 + Math.min(elapsed * 5, 290);
    if (spawn <= 0) {
      const width = 30 + Math.random() * 65;
      objects.push({ x: width / 2 + Math.random() * (W - width), y: -50, w: width, h: 22 + Math.random() * 24, v: speed, type: 'block' });
      spawn = Math.max(.22, .72 - elapsed * .009);
    }
    if (coin <= 0) {
      objects.push({ x: 24 + Math.random() * (W - 48), y: -30, w: 18, h: 18, v: speed * .8, type: 'coin' });
      coin = 1.5 + Math.random() * 1.4;
    }
    for (const object of objects) {
      object.y += object.v * dt;
      if (Math.abs(object.x - player.x) < (object.w + player.w) / 2 && Math.abs(object.y - player.y) < (object.h + player.h) / 2) {
        if (object.type === 'block') { end(); return; }
        score += 50;
        object.dead = true;
        audio.play('collect');
        for (let index = 0; index < 12; index++) sparks.push({ x: object.x, y: object.y, vx: (Math.random() - .5) * 240, vy: (Math.random() - .5) * 240, life: .5 });
      }
    }
    objects = objects.filter(object => !object.dead && object.y < H + 60);
    for (const spark of sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.life -= dt;
    }
    sparks = sparks.filter(spark => spark.life > 0);
    updateHud();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111722';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#263345';
    ctx.lineWidth = .6;
    for (let x = 0; x <= W; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = (elapsed * 30) % 45; y < H; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = '#58e5ef08';
    ctx.fillRect(0, 430, W, 70);
    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = '#58e5ef38';
    ctx.beginPath();
    ctx.moveTo(0, 430);
    ctx.lineTo(W, 430);
    ctx.stroke();
    ctx.setLineDash([]);
    const visible = state === 'ready' ? [
      { x: 140, y: 80, w: 55, h: 28, type: 'block' },
      { x: 730, y: 270, w: 80, h: 25, type: 'block' },
      { x: 590, y: 125, w: 18, h: 18, type: 'coin' },
      { x: 280, y: 340, w: 18, h: 18, type: 'coin' }
    ] : objects;
    for (const object of visible) {
      ctx.save();
      ctx.translate(object.x, object.y);
      ctx.fillStyle = object.type === 'coin' ? '#d8ff63' : '#ff647b';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 15;
      if (object.type === 'coin') ctx.rotate(Math.PI / 4);
      ctx.fillRect(-object.w / 2, -object.h / 2, object.w, object.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff40';
      ctx.fillRect(-object.w / 2 + 3, -object.h / 2 + 3, object.w - 6, 3);
      ctx.restore();
    }
    ctx.shadowColor = '#58e5ef';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#58e5ef';
    ctx.fillRect(player.x - player.w / 2, player.y - player.h / 2, player.w, player.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#d9ffff';
    ctx.fillRect(player.x - 10, player.y - 7, 20, 4);
    for (const spark of sparks) {
      ctx.globalAlpha = spark.life * 2;
      ctx.fillStyle = '#d8ff63';
      ctx.fillRect(spark.x, spark.y, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, .04);
    last = now;
    if (state === 'playing') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  ui.playerName.addEventListener('input', () => {
    const error = nameError(cleanName(ui.playerName.value));
    ui.nameError.textContent = ui.playerName.value ? error : '';
    ui.start.disabled = Boolean(error);
  });
  ui.playerName.addEventListener('keydown', event => { if (event.key === 'Enter' && !ui.start.disabled) start(); });
  ui.start.addEventListener('click', start);
  ui.pause.addEventListener('click', () => state === 'paused' ? start() : pause());
  ui.sound.addEventListener('click', () => audio.toggle());
  ui.leaderboard.addEventListener('click', openLeaderboard);
  ui.overlayLeaderboard.addEventListener('click', openLeaderboard);
  ui.closeBoard.addEventListener('click', closeLeaderboard);
  ui.boardPlay.addEventListener('click', () => { closeLeaderboard(); start(); });
  ui.boardModal.addEventListener('click', event => { if (event.target === ui.boardModal) closeLeaderboard(); });
  ui.changePlayer.addEventListener('click', () => {
    if (state === 'playing') pause();
    try { localStorage.removeItem('neon-dodge-player'); } catch {}
    currentPlayer = '';
    best = 0;
    score = 0;
    elapsed = 0;
    objects = [];
    sparks = [];
    updateHud();
    ui.best.textContent = '0000';
    ui.playerLabel.textContent = 'GUEST';
    ui.leaderboard.disabled = true;
    ui.playerName.value = '';
    showNameGate();
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !ui.boardModal.classList.contains('hidden')) { closeLeaderboard(); return; }
    if (event.target === ui.playerName) return;
    const key = event.key.toLowerCase();
    if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.code === 'Space' && !event.repeat) {
      if (!currentPlayer) { showNameGate(); return; }
      state === 'playing' ? pause() : start();
      return;
    }
    keys.add(event.key.startsWith('Arrow') ? event.key : key);
  });
  window.addEventListener('keyup', event => keys.delete(event.key.startsWith('Arrow') ? event.key : event.key.toLowerCase()));
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  for (const [id, key] of [['left', 'ArrowLeft'], ['right', 'ArrowRight']]) {
    const button = document.getElementById(id);
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      keys.add(key);
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(eventName, () => keys.delete(key));
  }

  if (document.modelContext?.registerTool) {
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'control_neon_dodge',
        description: 'Set a player name, start, pause or resume Neon Dodge, and read the current score or leaderboard.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['set_name', 'start', 'pause', 'resume', 'status', 'leaderboard'] },
            name: { type: 'string', minLength: 2, maxLength: 18 }
          },
          required: ['action'],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false },
        execute(input) {
          if (!input || !['set_name', 'start', 'pause', 'resume', 'status', 'leaderboard'].includes(input.action)) throw new Error('Invalid action');
          if (input.action === 'set_name' && (!input.name || !setPlayer(input.name))) throw new Error('A valid player name is required');
          if (input.action === 'start' && currentPlayer) { if (state === 'paused') state = 'over'; start(); }
          if (input.action === 'pause') pause();
          if (input.action === 'resume' && state === 'paused') start();
          return {
            state,
            score: Math.floor(score),
            seconds: Number(elapsed.toFixed(1)),
            best,
            player: currentPlayer || null,
            needsName: !currentPlayer,
            leaderboard: input.action === 'leaderboard' ? cachedScores : undefined
          };
        }
      })).catch(() => {});
    } catch {}
  }

  audio.updateButton();
  try {
    const savedPlayer = cleanName(localStorage.getItem('neon-dodge-player'));
    if (savedPlayer && setPlayer(savedPlayer)) {
      ui.playerName.value = savedPlayer;
      gameOverlay('READY FOR THE CHALLENGE?', 'How long can<br>you survive?', 'Dodge red blocks. Collect yellow energy. One collision ends the game.', 'Start game');
    } else showNameGate();
  } catch { showNameGate(); }
  requestAnimationFrame(frame);
})();
