function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
}

function validName(name) {
  return name.length >= 2 && /^[\p{L}\p{N} _-]+$/u.test(name);
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function readScores(database) {
  const result = await database.prepare(`
    SELECT name, score, seconds
    FROM leaderboard_scores
    ORDER BY score DESC, seconds DESC, name ASC
    LIMIT 100
  `).all();
  return result.results || [];
}

async function handleLeaderboard(request, env) {
  if (!env.DB) return json({ error: 'Leaderboard unavailable' }, 503);

  if (request.method === 'GET') return json({ scores: await readScores(env.DB) });

  if (request.method === 'POST') {
    const contentLength = Number(request.headers.get('content-length')) || 0;
    if (contentLength > 4096) return json({ error: 'Payload too large' }, 413);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    const name = cleanName(body.name);
    const score = Math.floor(Number(body.score));
    const seconds = Number(body.seconds);
    if (!validName(name) || !Number.isFinite(score) || score < 0 || score > 10_000_000 || !Number.isFinite(seconds) || seconds < 0 || seconds > 36_000) {
      return json({ error: 'Invalid score' }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO leaderboard_scores (player_key, name, score, seconds, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(player_key) DO UPDATE SET
        name = excluded.name,
        score = excluded.score,
        seconds = excluded.seconds,
        updated_at = excluded.updated_at
      WHERE excluded.score > leaderboard_scores.score
         OR (excluded.score = leaderboard_scores.score AND excluded.seconds > leaderboard_scores.seconds)
    `).bind(name.toLocaleLowerCase(), name, score, Number(seconds.toFixed(1)), Date.now()).run();

    return json({ scores: await readScores(env.DB) });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, POST' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/leaderboard') return await handleLeaderboard(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Neon Dodge request failed', error);
      if (url.pathname === '/api/leaderboard') return json({ error: 'Leaderboard unavailable' }, 500);
      return new Response('Site unavailable', { status: 500 });
    }
  }
};
