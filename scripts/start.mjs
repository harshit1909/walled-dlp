// Launches the desktop app. Goes through a launcher (rather than `electron .`)
// because some shells, e.g. VS Code's, export ELECTRON_RUN_AS_NODE, which would
// make Electron start as plain Node.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, [root, ...process.argv.slice(2)], { stdio: 'inherit', env })
  .on('exit', (code) => process.exit(code ?? 0));
