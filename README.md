# Walled DLP

A standalone desktop app that stops sensitive data being sent to **ChatGPT** and **Perplexity** by accident.

It opens both sites in its own window. Before any prompt or file upload leaves that window, the app inspects it for the marker `WALLED_SENSITIVE`. If the marker is found, a **native desktop dialog** asks you to **Continue** or **Cancel**. It also recolours every AI response on both sites.

No browser extension or add-on is involved.

## Requirements

- macOS, Windows or Linux
- Node.js 20 or newer

## Setup and run

```bash
npm install
npm start
```

The first run opens ChatGPT in the app. Sign in once on each site; the app remembers you after that. Use the tabs at the top, or Cmd/Ctrl+1, 2, 3, to switch between **ChatGPT**, **Perplexity** and the **Dashboard**.

> If "Continue with Google" is refused inside the app, sign in with email instead. Embedded browsers are sometimes blocked by Google's sign-in.

## Using it

| You do | What happens |
|---|---|
| Send a prompt without the marker | Sent normally, no interruption. |
| Send a prompt containing `WALLED_SENSITIVE` | Native dialog: says it is a **prompt**, shows the text, offers Continue / Cancel. |
| Upload, drag in or paste a text file, PDF or image containing the marker | Native dialog: says it is a **file**, shows the file name and where the marker was found. |
| Click **Continue** | The prompt or file goes through exactly as it was. |
| Click **Cancel** | Nothing is sent. Your text stays in the box and the file can be picked again. |
| Read an AI answer | The response text is recoloured (default orange). Change it on the Dashboard. |

Pressing Enter or Esc in the dialog chooses **Cancel**, the safe option.

Files to try are in [samples/](samples): `sensitive.txt`, `sensitive.pdf`, `sensitive-scanned.pdf` (image-only PDF), `sensitive.png`, `sensitive-dark.jpg`, and clean versions that should upload silently. Regenerate them with `npm run samples`.

## What is inspected

- **Prompts:** the text of the prompt.
- **Text files:** decoded as UTF-8 / UTF-16.
- **PDFs:** the text layer of every page, then OCR of the rendered pages (catches scanned PDFs), plus document properties.
- **Images:** OCR with Tesseract, fully offline.
- File type is detected from the file's contents, not its extension. A file that cannot be read (corrupt, password-protected, too large) triggers the dialog with a "could not be checked" message instead of being let through silently.

## Tests

```bash
npm test          # unit tests: detection for every format
npm run test:e2e  # launches the real app against a mock of both sites
```

The end-to-end test covers, on both site layouts: clean and marked prompts (Enter and send button), Cancel and Continue, all file formats via picker, drag-and-drop and paste, mixed selections, the response colour, and the network safety net.

## Project layout

```
app/
  main.js              window, tabs, IPC, application menu
  confirm-dialog.js    the native Continue / Cancel dialog
  core/                inspection engine (no Electron code)
    detector.js        marker matching
    filetype.js        file type from content
    extractors/        text, PDF, image + OCR
    inspector.js       prompt / file -> verdict
    broker.js          verdict -> dialog -> decision
  site/                code injected into ChatGPT / Perplexity
    sites.cjs          per-site selectors (the only site-specific file)
    guards/            prompt, file and network interception
    response-style.cjs response recolouring
  ui/                  tab bar and dashboard
test/                  unit and end-to-end tests
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how interception and enforcement work.
