import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.deployment', 'api');
if (path.relative(root, output) !== path.join('.deployment', 'api')) throw new Error('Invalid package directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'server'), path.join(output, 'server'), { recursive: true, filter: source => !source.endsWith('.ts') });
for (const file of ['package.json', 'package-lock.json']) await cp(path.join(root, file), path.join(output, file));
const installed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: output, stdio: 'inherit', shell: process.platform === 'win32' });
if (installed.status !== 0) throw new Error('Could not install API dependencies');
console.log('Lambda API package ready at .deployment/api. No local credentials or environment files included.');
