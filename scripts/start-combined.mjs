import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const required = ['ACCOUNT_ADMIN_INTERNAL_KEY', 'ADMIN_BOOTSTRAP_USER', 'ADMIN_BOOTSTRAP_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required for the combined service`);
}

const admin = spawn('dotnet', ['/app/admin/AccountAdmin.dll'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ADMIN_INTERNAL_KEY: process.env.ACCOUNT_ADMIN_INTERNAL_KEY,
    ADMIN_URLS: 'http://0.0.0.0:5092',
    ADMIN_DATA_DIR: '/var/lib/jshen',
  },
});

let web;
let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  if (web && web.exitCode === null) web.kill(signal);
  if (admin.exitCode === null) admin.kill(signal);
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

admin.once('exit', (code, signal) => {
  if (!stopping) {
    console.error(`AccountAdmin stopped (${signal ?? code}); stopping web process`);
    stop();
    process.exitCode = 1;
  }
});

for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:5092/Admin/Login', {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) break;
  } catch { /* The admin process is still starting. */ }
  if (attempt === 59) throw new Error('AccountAdmin did not become ready');
  await delay(500);
}

if (!stopping) {
  web = spawn('node', ['node_modules/vinext/dist/cli.js', 'start', '--port', process.env.PORT ?? '10000'], {
    cwd: '/app/web',
    stdio: 'inherit',
    env: { ...process.env, ACCOUNT_ADMIN_URL: 'http://127.0.0.1:5092' },
  });
  web.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`Web process stopped (${signal ?? code}); stopping AccountAdmin`);
      stop();
      process.exitCode = 1;
    }
  });
}
