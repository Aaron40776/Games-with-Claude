// App shell: what makes the game behave like an app instead of a web page.
// - Browser gestures that don't belong in a game are turned off (context menu,
//   page zoom, iOS long-press callouts, accidental reload in the installed app).
// - Installing (PWA): only when the page ships a web app manifest (dist/index.html
//   on GitHub Pages). The artifact build has none, so there it stays a page.

/** Running as an installed app (home screen on iOS, app window on desktop). */
export const isStandalone = () => {
  try {
    return navigator.standalone === true
      || matchMedia('(display-mode: standalone)').matches
      || matchMedia('(display-mode: fullscreen)').matches;
  } catch { return false; }
};

/** iPhone/iPad, including iPadOS which reports itself as a Mac. */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const hasManifest = () => !!document.querySelector('link[rel="manifest"]');

let installPrompt = null; // Chrome/Edge: deferred beforeinstallprompt event
let installed = false;
let onInstallChange = null;

/** Call once at startup, before the first screen renders. */
export function initShell(root) {
  guardBrowser(root);
  if (!hasManifest()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own mini-infobar away; the title screen offers the install.
    e.preventDefault();
    installPrompt = e;
    onInstallChange?.();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    onInstallChange?.();
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered:', err));
    });
  }
}

/** Whether the title screen should offer "Install app". */
export function canInstall() {
  if (!hasManifest() || installed || isStandalone()) return false;
  return !!installPrompt || isIOS();
}

/** One listener (the title screen's install link) is told when canInstall() may have changed. */
export function watchInstall(fn) { onInstallChange = fn; }

/**
 * Starts the install. Chrome/Edge show their own dialog; iOS has no API for it,
 * so iosHelp() explains the two taps in Safari's share menu instead.
 * Resolves true once the browser dialog was accepted.
 */
export async function install(iosHelp) {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    onInstallChange?.();
    return choice?.outcome === 'accepted';
  }
  if (isIOS()) iosHelp();
  return false;
}

function guardBrowser(root) {
  const editable = (t) => t instanceof Element && t.closest('input, textarea, [contenteditable="true"]');
  // Right-click / long-press menu ("Back", "Reload", "Save image"…), except in text fields.
  root.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); });
  // Page zoom: Ctrl/Cmd + wheel (desktop trackpad pinch arrives as this too) and Ctrl/Cmd + plus/minus/0.
  window.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault();
    // In the installed app a reload would restart the current fight. The browser tab keeps its keys.
    if (isStandalone() && (e.key === 'F5' || (mod && e.key.toLowerCase() === 'r'))) e.preventDefault();
  }, { capture: true });
  // iOS Safari zooms on pinch even with touch-action set; its gesture events can be cancelled.
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
