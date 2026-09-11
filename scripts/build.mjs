import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = resolve(projectRoot, 'dist');
const clientRoot = resolve(distRoot, 'client');

await rm(clientRoot, { recursive: true, force: true });
await rm(resolve(distRoot, 'server'), { recursive: true, force: true });
await rm(resolve(distRoot, '.openai'), { recursive: true, force: true });
await mkdir(clientRoot, { recursive: true });
await mkdir(resolve(distRoot, 'server'), { recursive: true });
await mkdir(resolve(distRoot, '.openai'), { recursive: true });

for (const filename of ['index.html', 'style.css', 'game.js']) {
  await cp(resolve(distRoot, filename), resolve(clientRoot, filename));
}
await cp(resolve(projectRoot, 'worker', 'index.js'), resolve(distRoot, 'server', 'index.js'));
await cp(resolve(projectRoot, '.openai', 'hosting.json'), resolve(distRoot, '.openai', 'hosting.json'));
await cp(resolve(projectRoot, 'drizzle'), resolve(distRoot, '.openai', 'drizzle'), { recursive: true });

console.log('Built Neon Dodge Sites artifact');
