# Architecture

Walled DLP is one Electron application. It is its own small browser: ChatGPT and Perplexity load in tabs inside the app, and the app controls what leaves those tabs.

```
┌──────────────────────── Electron app ────────────────────────┐
│  Tab view: chatgpt.com / perplexity.ai                       │
│   └─ preload (runs before the site's own scripts)            │
│        prompt guard · file guard · network guard · recolour  │
│               │  IPC  dlp:inspect  (prompt text / file bytes)│
│               ▼                                              │
│  Main process                                                │
│   Broker ─► Inspector ─► extractors (text · PDF · OCR)       │
│      │                                                       │
│      └─ marker found ─► native dialog ─► Continue / Cancel   │
│               │                                              │
│               ▼  decision: allow | block                     │
│  Guard releases or discards the held prompt / file           │
└──────────────────────────────────────────────────────────────┘
```

## Interception (inside the page)

A preload script runs in each site tab before any site code. It installs three guards. All of them hold the action until the main process has answered.

- **Prompt guard.** Capture-phase listeners on `window` for Enter, the send button and form submit. They run before the site's own handlers, so a marked prompt can be stopped with `preventDefault` and `stopImmediatePropagation`. Prompts without the marker are never touched.
- **File guard.** Intercepts files at every entry point: the file picker (`input` / `change`), drag-and-drop and paste. The original event is held and the files are inspected. Allowed files are re-dispatched in a fresh event, so the site only ever sees files that were approved, exactly as the browser delivered them. A cancelled file never reaches the site.
- **Network guard.** A safety net that wraps `fetch` for the sites' prompt endpoints. It catches prompts that bypass the composer, such as editing an earlier message. A prompt already approved in the dialog is not asked about twice.

## Inspection (main process)

The page sends the prompt text, or the raw bytes of a file, to the main process over IPC. The main process only accepts requests coming from the two supported sites.

- `filetype.js` identifies the file from its magic bytes: PDF, image, or text.
- `extractors/` turns the file into text segments, produced lazily so scanning stops at the first match. PDFs use the text layer first and OCR for image-only pages. Images use Tesseract OCR with language data bundled in the app, so nothing leaves the machine.
- `detector.js` matches the marker. For OCR and PDF text it also tolerates spacing and look-alike characters that OCR commonly produces.
- `broker.js` runs the inspection, and when the marker is found shows the native dialog. Dialogs are shown one at a time.

## Enforcement

The dialog is a native OS dialog (`dialog.showMessageBox`), not HTML. It states whether the content is a prompt or a file, shows the prompt text or file name, and offers **Continue** and **Cancel**.

- **Continue:** the guard replays the original action untouched.
- **Cancel:** the action is discarded. The prompt stays in the composer and the file can be chosen again.
- **Fail closed:** if anything goes wrong while asking, the action is blocked, never silently allowed. A file that cannot be inspected triggers the dialog.

## Response recolouring

The preload injects a stylesheet that colours AI-generated response elements on each site. The selectors are defined per site in `app/site/sites.cjs`. The colour is chosen on the Dashboard and pushed to open tabs immediately.

## Design choices

- **One process, no extension.** Keeping the browser inside the app means there is nothing to install in another browser, and nothing running outside the app that could be switched off.
- **`core/` has no Electron code.** The inspection engine is unit-tested on its own, and the dialog is injected into the broker.
- **Site-specific code in one file.** If a site changes its markup, only `sites.cjs` needs editing.
- **Security of the injected code.** The preload runs in the page's own context because the guards must patch the real DOM and `fetch`. Node integration stays off, and the guards keep their state in closures, so the page cannot call them. Only chatgpt.com and perplexity.ai can send inspection requests.
