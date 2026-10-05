import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer();
await server.listen();
await import('./build-electron.mjs');
const electron = (await import('electron')).default;
const proc = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, KAMVA_DEV_URL: 'http://localhost:5173' },
});
proc.on('close', () => { server.close(); process.exit(0); });
