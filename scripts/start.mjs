import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const url = 'http://127.0.0.1:8790';
function openBrowser() {
  if (process.platform === 'win32' && process.env.LIFECAST_OPEN_BROWSER !== '0') {
    const browser = spawn('explorer.exe', [url], { stdio: 'ignore', windowsHide: true, detached: true });
    browser.on('error', () => console.log(`Open ${url} in your browser.`)); browser.unref();
  }
}
try {
  const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1500) });
  const data = await response.json();
  if (response.ok && data.provider === 'bedrock') {
    console.log(`LifeCast is already running: ${url}`);
    openBrowser();
    process.exit(0);
  }
} catch { /* Start our server below. */ }
if (!existsSync(path.join(root, 'node_modules/vite/bin/vite.js'))) {
  console.error('Dependencies are missing. Run npm ci in this folder, then npm start.');
  process.exit(1);
}
const build = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, stdio: 'inherit', windowsHide: true });
await new Promise((resolve, reject) => { build.once('error', reject); build.once('exit', code => code === 0 ? resolve() : reject(new Error('The website build failed.'))); });
const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, PORT: '8790' }, stdio: 'inherit', windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code || 0; });
process.once('SIGINT', () => child.kill());
process.once('SIGTERM', () => child.kill());
console.log(`Open ${url}. Keep this process running while using LifeCast.`);
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { openBrowser(); break; }
  } catch { /* Wait briefly for our child to bind. */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
