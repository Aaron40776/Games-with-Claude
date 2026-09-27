// Entry point. Boots through the artifact hot-reload hook when present so a
// republish keeps the current run.

import { App } from './ui/app.js';
import { initShell } from './ui/shell.js';

function start(data) {
  const root = document.getElementById('app');
  initShell(root);
  const app = new App(root);
  window.__riftdeck = app;
  app.boot(data || {});
  window.claude?.hot?.snapshot?.(() => app.snapshot());
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
