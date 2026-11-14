import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chromium, { inflate } from '@sparticuz/chromium';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = await chromium.executablePath();
const chromiumLibraries = await inflate(path.join(repositoryRoot, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
const child = spawn('npm', ['run', 'test:e2e:playwright', '--workspace', 'web'], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_CHROMIUM_PATH: executablePath,
    LD_LIBRARY_PATH: [path.join(chromiumLibraries, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not launch Playwright: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
