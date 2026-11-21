// Recolours AI-generated responses. The colour is owned by the desktop app and
// can change at any time; the stylesheet is rebuilt and re-attached if the
// site's own scripts remove it.
module.exports = function installResponseStyle({ site, policy }) {
  const style = document.createElement('style');
  style.id = 'walled-dlp-response-style';

  const render = () => { style.textContent = `${site.responses} { color: ${policy.responseColor} !important; }`; };
  const attach = () => {
    const root = document.head || document.documentElement;
    if (root && !style.isConnected) root.append(style);
  };

  render();
  attach();
  document.addEventListener('readystatechange', attach);
  new MutationObserver(attach).observe(document, { childList: true, subtree: true });
  return { update: () => { render(); attach(); } };
};
