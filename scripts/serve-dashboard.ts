#!/usr/bin/env tsx
import { spawn } from 'child_process';
import { loadDashboardConfig } from './load-dashboard-config';

function main() {
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  const config = loadDashboardConfig();
  const port = config.server.dashboardPort;
  const child = spawn('npx', ['serve', 'dashboard', '-p', String(port), '--no-clipboard'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
