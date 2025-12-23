# Code Review Improvements

## High impact or correctness
- `app/electron/db.ts`: `dbPath` selection is reversed for dev vs prod. The comment says dev should use a local `dev.db`, but the code uses the app `userData` path in dev and `process.cwd()` in prod. This can write to a read-only install directory or fail in production. Swap the condition.
- `app/electron/db.ts`: `client.executeMultiple` is not awaited before `setupHandlers()` and the app UI starts. IPC handlers can run before tables/migrations exist. Make `initDb` async and await schema creation/migrations before exposing handlers or creating the window.
- `app/electron/db.ts`: `db-load-project` uses `JSON.parse(t.chapterIds || '[]')` without a guard. A malformed value will crash the load. Use the existing `parseJsonSafe` helper consistently.
- `app/src/services/ai.ts`: `containsNonEnglish` uses a non-global regex and then checks `matches.length > 5`. `matches.length` is always `1` for a non-global match, so the retry logic never triggers. Use a global regex and count matches, or use `matchAll`.
- `app/src/services/ai.ts`: `cleanModelResponse` uses `/```json\\s*/gi`, which matches a literal `\s*` instead of whitespace. Use `/```json\s*/gi` to actually strip the code fence.
- `app/src/views/EditorView.vue`: `loadChapterContent` sets content with `{ emitUpdate: true }`, which triggers `onUpdate` and writes content back to the store. This marks chapters as modified when simply switching or loading. Use `{ emitUpdate: false }` for initial loads to avoid dirty flags and unintended saves.
- `app/src/components/TerminologyPanel.vue`: `countTermUsage` builds a `RegExp` directly from user-defined terms. Terms like `C++` or `(` will throw or over-match. Escape the term before constructing the regex.
- `app/src/components/RichTextEditor.vue`: the `editable` prop is ignored. The editor always sets `editable: true` and calls `setEditable(true)`. Respect `props.editable` and update when it changes.

## Security and privacy
- `app/electron/preload.ts`: `ipcRenderer` is exposed with unrestricted `on/send/invoke` calls. Consider an allowlist of channels and explicit APIs to reduce the attack surface.
- `app/src/services/ai.ts` and multiple UI components (`app/src/views/EditorView.vue`, `app/src/components/DiffViewer.vue`, `app/src/components/ChapterItem.vue`, `app/src/components/ChapterEditor.vue`): AI/user content is rendered via `v-html` and `marked` without sanitization. If the model returns HTML/script tags, this is an XSS vector. Add a sanitizer (e.g., DOMPurify) before inserting HTML.
- `app/src/stores/settings.ts`: API keys are stored in `localStorage` in plain text. For Electron, use `safeStorage` or `keytar` to protect secrets.

## UX and polish
- `app/src/App.vue`: the save-status icon order hides errors because `loadError` is checked after "unsaved" in the template. Show error state first so users can see failures. Also, `saveNow()` clears `hasUnsavedChanges` even if `saveProject()` fails; clear only on success.
- `app/src/App.vue`: class names like `z-50!` and `z-100!` are not valid Tailwind syntax and likely do nothing. Use `!z-50` or `z-[100]`.
- `app/src/views/EditorView.vue`: `z-999` is not a default Tailwind class, so the dropdown may not layer correctly. Use `z-[999]` or add a custom value in `tailwind.config.js`.

## Maintainability and data consistency
- `app/src/stores/project.ts`: `bookMetadata.storyBible` and `storyBible` are separate sources of truth. They can diverge (e.g., `newProject` sets only `storyBible`). Consolidate to a single canonical location and keep persistence aligned.
- `app/src/stores/project.ts`: `saveProject` deep-clones with `JSON.parse(JSON.stringify(...))`, which drops `Date`, `undefined`, and non-JSON values. Prefer `structuredClone` or `toRaw` to preserve types.
- `app/electron/db.ts`: full project saves delete and re-insert all chapters/characters/terms without a transaction. A crash mid-save can leave partial data. Wrap in a transaction for atomicity.
