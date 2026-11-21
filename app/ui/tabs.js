const buttons = [...document.querySelectorAll('#tabs button')];
const show = (name) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === name)));
buttons.forEach((b) => b.addEventListener('click', () => window.tabs.select(b.dataset.tab)));
document.getElementById('reload').addEventListener('click', () => window.tabs.reload());
window.tabs.onActive(show);
show('chatgpt');
