// Runs a Node script with Electron's bundled Node (ELECTRON_RUN_AS_NODE), so native
// modules rebuilt for Electron (better-sqlite3) load in unit tests too.
const { spawnSync } = require('node:child_process')
const electron = require('electron')
const result = spawnSync(electron, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(result.status ?? 1)
