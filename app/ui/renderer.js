const $ = (id) => document.getElementById(id);
const SITE_NAMES = { chatgpt: 'ChatGPT', perplexity: 'Perplexity' };
const FILE_ICONS = { text: 'TXT', pdf: 'PDF', image: 'IMG' };
const PRESETS = ['#e8590c', '#d6336c', '#7048e8', '#1c7ed6', '#0ca678', '#f08c00'];
const counts = { total: 0, flagged: 0, blocked: 0 };

function outcome(entry) {
  if (entry.status === 'clean') return ['clean', 'Clean'];
  return entry.decision === 'allow' ? ['continued', 'Sent anyway'] : ['blocked', 'Cancelled'];
}

function tally(entry) {
  counts.total++;
  if (entry.status !== 'clean') counts.flagged++;
  if (entry.decision === 'block') counts.blocked++;
  $('stat-total').textContent = counts.total;
  $('stat-flagged').textContent = counts.flagged;
  $('stat-blocked').textContent = counts.blocked;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(entry, { live = true } = {}) {
  tally(entry);
  $('empty').hidden = true;
  const [cls, text] = outcome(entry);
  const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const li = el('li');
  const main = el('div', 'main');
  const title = el('div', 'title', entry.label || '(empty)');
  title.title = entry.label || '';
  main.append(title, el('div', 'sub', `${SITE_NAMES[entry.site] || entry.site} · ${entry.kind === 'file' ? 'File' : 'Prompt'} · ${time}`));
  li.append(el('div', 'ico', entry.kind === 'file' ? FILE_ICONS[entry.fileType] || 'FILE' : 'Aa'), main, el('span', `badge ${cls}`, text));
  live ? $('activity').prepend(li) : $('activity').append(li);
}

const state = await window.dlp.state();
$('marker').textContent = state.marker;
[...state.activity].reverse().forEach((entry) => render(entry));

function selectColor(color) {
  $('color').value = color;
  for (const swatch of $('swatches').children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === color));
}
for (const color of PRESETS) {
  const swatch = el('button', 'swatch');
  swatch.type = 'button';
  swatch.dataset.color = color;
  swatch.title = color;
  swatch.style.background = color;
  swatch.addEventListener('click', async () => selectColor(await window.dlp.setResponseColor(color)));
  $('swatches').append(swatch);
}
selectColor(state.responseColor);
$('color').addEventListener('change', async (event) => selectColor(await window.dlp.setResponseColor(event.target.value)));

for (const button of document.querySelectorAll('[data-open]')) button.addEventListener('click', () => window.dlp.openTab(button.dataset.open));
window.dlp.onActivity((entry) => render(entry));
