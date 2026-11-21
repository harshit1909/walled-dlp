// Per-site adapters: everything site-specific lives here, so a DOM change on
// either site is a one-line fix and adding a site is one more entry.
const SITES = [
  {
    id: 'chatgpt',
    title: 'ChatGPT',
    url: 'https://chatgpt.com/',
    hosts: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/,
    // The prompt editor(s).
    composer: '#prompt-textarea, [data-testid="prompt-textarea"], form textarea, [contenteditable="true"].ProseMirror',
    // Buttons that submit the prompt.
    sendButton: '[data-testid="send-button"], #composer-submit-button, button[aria-label="Send prompt"], button[aria-label="Send message"]',
    // Network backstop: requests that carry a prompt to the model.
    submitEndpoints: [/\/backend-(api|anon)\/(f\/)?conversation(\?|$)/],
    // AI-generated responses (user messages are not matched).
    responses: '[data-message-author-role="assistant"], [data-message-author-role="assistant"] *, article[data-turn="assistant"] .markdown, article[data-turn="assistant"] .markdown *',
  },
  {
    id: 'perplexity',
    title: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    hosts: /(^|\.)perplexity\.ai$/,
    composer: '#ask-input, textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"][data-lexical-editor="true"]',
    sendButton: '[data-testid="submit-button"], button[aria-label="Submit"], button[aria-label="Send"], button[type="submit"]',
    submitEndpoints: [/\/rest\/sse\/perplexity_ask/, /\/rest\/sse\/perplexity\.ask/],
    responses: '[id^="markdown-content"], [id^="markdown-content"] *, main .prose, main .prose *',
  },
];

const detectSite = (hostname) => SITES.find((site) => site.hosts.test(hostname)) || null;

module.exports = { SITES, detectSite };
