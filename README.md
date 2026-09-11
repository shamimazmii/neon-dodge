# Neon Dodge

A small browser arcade game made just for fun. Dodge the red blocks, collect energy, and save your score to the leaderboard.

## Run locally

Requires Node.js 22 or newer.

```bash
git clone https://github.com/shamimazmii/neon-dodge.git
cd neon-dodge
node server.cjs
```

Open `http://localhost:5173`.

## Run with Docker

```bash
docker build -t neon-dodge .
docker run -d --name neon-dodge -p 8080:80 -v neon-dodge-data:/app/data neon-dodge
```

Open `http://localhost:8080`. The Docker volume keeps leaderboard data between restarts.

Feel free to pull, self-host, or modify the project.
