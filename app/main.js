// Electron entry point. The app is a small browser of its own: ChatGPT and
// Perplexity open in tabs inside it, and every prompt and file leaving those
// tabs is inspected in-process before the site sees it.
import { app, BaseWindow, WebContentsView, Menu, dialog, ipcMain, nativeImage, session, shell } from 'electron';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './core/config.js';
import { Broker } from './core/broker.js';
import { warmUpOcr, shutdownOcr } from './core/extractors/ocr.js';
import { createConfirm } from './confirm-dialog.js';
import { Settings } from './settings.js';
import { setUpE2E } from './e2e-support.js';

const require = createRequire(import.meta.url);
const { SITES, detectSite } = require('./site/sites.cjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(here, 'assets', 'icon.png');
const PARTITION = 'persist:walled-dlp'; // one shared, persistent profile: logins survive restarts
const TABBAR_HEIGHT = 52;
const MAX_LOG = 100;
// Sign-in providers open pop-ups; these are allowed to, everything else opens in the system browser.
const AUTH_HOSTS = /(^|\.)(google|apple|microsoft|microsoftonline|live|openai|auth0|perplexity|chatgpt)\.(com|ai)$/;

const isE2E = Boolean(process.env.WALLED_DLP_E2E_DIR);
const activity = [];
let win = null;
let tabsView = null;
let active = 'chatgpt';
const views = {};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => win?.focus());
  const debugPort = process.env.WALLED_DLP_DEBUG_PORT || (isE2E && (process.env.WALLED_DLP_E2E_PORT || '9333'));
  if (debugPort) app.commandLine.appendSwitch('remote-debugging-port', String(debugPort));
  app.whenReady().then(start);
}

function start() {
  const settings = new Settings(app.getPath('userData'), { responseColor: config.defaultResponseColor });
  const broker = new Broker({ confirm: createConfirm({ marker: config.marker }) });
  const siteSession = session.fromPartition(PARTITION);
  const getPolicy = () => ({ marker: config.marker, responseColor: settings.get('responseColor'), maxFileBytes: config.maxFileBytes });

  // Present as a regular Chrome so sign-in pages treat this like a normal browser.
  siteSession.setUserAgent(`Mozilla/5.0 (${process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  if (isE2E) setUpE2E(siteSession);

  app.dock?.setIcon(nativeImage.createFromPath(iconPath));
  warmUpOcr();

  broker.on('decision', (event) => {
    activity.unshift(event);
    activity.length = Math.min(activity.length, MAX_LOG);
    views.dashboard?.webContents.send('activity', event);
  });

  // --- IPC -------------------------------------------------------------------
  ipcMain.on('dlp:policy', (event) => { event.returnValue = getPolicy(); });

  ipcMain.handle('dlp:inspect', async (event, payload) => {
    const site = detectSite(new URL(event.senderFrame?.url || 'about:blank').hostname);
    if (!site || site.id !== payload?.site) throw new Error('unexpected sender'); // only our two sites may ask
    const request = payload.kind === 'prompt'
      ? { kind: 'prompt', site: site.id, text: String(payload.text ?? '') }
      : {
          kind: 'file',
          site: site.id,
          name: String(payload.name || 'unnamed file'),
          mime: String(payload.mime || ''),
          buffer: payload.data ? Buffer.from(payload.data.buffer, payload.data.byteOffset, payload.data.byteLength) : Buffer.alloc(0),
          skipReason: payload.skipReason,
        };
    const result = await broker.submit(request).promise;
    return { decision: result.decision };
  });

  ipcMain.handle('state', () => ({ ...getPolicy(), activity, sites: SITES.map(({ id, title }) => ({ id, title })) }));
  ipcMain.handle('set-response-color', (_event, color) => {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      settings.set('responseColor', color);
      for (const site of SITES) views[site.id]?.webContents.send('dlp:policy', getPolicy());
    }
    return settings.get('responseColor');
  });
  ipcMain.handle('tabs:select', (_event, name) => select(name));
  ipcMain.handle('tabs:reload', () => views[active]?.webContents.reload());

  // --- window ----------------------------------------------------------------
  win = new BaseWindow({ width: 1320, height: 880, minWidth: 900, minHeight: 640, title: 'Walled DLP', icon: iconPath, backgroundColor: '#12131c' });

  tabsView = new WebContentsView({ webPreferences: { preload: path.join(here, 'ui', 'tabs-preload.cjs'), contextIsolation: true, sandbox: true } });
  tabsView.webContents.loadFile(path.join(here, 'ui', 'tabs.html'));
  win.contentView.addChildView(tabsView);

  for (const site of SITES) views[site.id] = createSiteView(site);
  views.dashboard = new WebContentsView({ webPreferences: { preload: path.join(here, 'ui', 'preload.cjs'), contextIsolation: true, sandbox: true } });
  views.dashboard.webContents.loadFile(path.join(here, 'ui', 'index.html'));
  win.contentView.addChildView(views.dashboard);

  win.on('resize', layout);
  win.on('closed', () => { win = null; app.quit(); });
  layout();
  select(isE2E ? 'dashboard' : active);
  if (isE2E) for (const site of SITES) views[site.id].webContents.loadURL(site.url);

  Menu.setApplicationMenu(buildMenu());
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => shutdownOcr());
}

function createSiteView(site) {
  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      preload: path.join(here, 'site', 'preload.cjs'),
      // The guards must patch the page's own DOM and fetch, so they run in its world.
      // nodeIntegration stays off: the page itself gets no Node or Electron access.
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    let host = '';
    try { host = new URL(url).hostname; } catch { /* malformed */ }
    if (AUTH_HOSTS.test(host)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, title: 'Sign in' } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.contentView.addChildView(view);
  view.webContents.__site = site;
  return view;
}

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  tabsView.setBounds({ x: 0, y: 0, width, height: TABBAR_HEIGHT });
  for (const view of Object.values(views)) view.setBounds({ x: 0, y: TABBAR_HEIGHT, width, height: Math.max(0, height - TABBAR_HEIGHT) });
}

function select(name) {
  if (!views[name]) return active;
  active = name;
  for (const [key, view] of Object.entries(views)) view.setVisible(key === name);
  const site = SITES.find((s) => s.id === name);
  const web = views[name].webContents;
  if (site && !web.getURL()) web.loadURL(site.url); // sites load lazily, on first visit
  views[name].webContents.focus();
  tabsView.webContents.send('tabs:active', name);
  return active;
}

function buildMenu() {
  const tab = (label, name, key) => ({ label, accelerator: `CmdOrCtrl+${key}`, click: () => select(name) });
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' }, // needed for copy / paste to work inside the embedded pages
    {
      label: 'View',
      submenu: [
        tab('ChatGPT', 'chatgpt', 1),
        tab('Perplexity', 'perplexity', 2),
        tab('Dashboard', 'dashboard', 3),
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => views[active]?.webContents.reload() },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ]);
}
