// Runs inside ChatGPT / Perplexity pages, before any of the site's own scripts
// (contextIsolation is off on purpose: the guards must patch the page's real
// DOM and fetch). It only activates on the two supported sites.
const { ipcRenderer } = require('electron');
const { detectSite } = require('./sites.cjs');
const createRuntime = require('./runtime.cjs');
const installPromptGuard = require('./guards/prompt-guard.cjs');
const installFileGuard = require('./guards/file-guard.cjs');
const installNetworkGuard = require('./guards/network-guard.cjs');
const installResponseStyle = require('./response-style.cjs');

const site = detectSite(location.hostname);
if (site) {
  const policy = ipcRenderer.sendSync('dlp:policy');
  const ns = createRuntime({ ipcRenderer, site, policy });
  installPromptGuard(ns);
  installFileGuard(ns);
  installNetworkGuard(ns);
  const style = installResponseStyle({ site, policy });
  ipcRenderer.on('dlp:policy', (_event, next) => { Object.assign(policy, next); style.update(); });
}
