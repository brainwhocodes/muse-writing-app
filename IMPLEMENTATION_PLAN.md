# Implementation Plan: Hierarchical Expansion & Rolling Context

## Phase 1: Data Modeling & Schema Design
- [ ] Add `storyBible` object to `useProjectStore` (CoreThemes, CharacterTerminologies, ToneGuidelines, NarrativeArc, Motifs, WorldRules) and persist it to SQLite (`projects` table JSON column + IPC wiring in `electron/db.ts` handlers).
- [ ] Extend `StoryChapter` model to track skeleton + rollout fields: `placeholder` (architect text), `validatorNotes`, `draftStatus` (idea/skeleton/validated/draft/complete), `denseSummary` (recursive summary), `contextSnapshot` (StoryBible excerpt + prev summary IDs), and persist columns in `schema.ts`/`db.ts` with backfill defaults.
- [ ] Add per-chapter `contextWindow` data (token estimates, lastPromptHash) to help prune prompts; store lightweight numeric/text fields so UI can surface when context needs refresh.
- [ ] Update IPC save/load paths to round-trip new fields in `db-save-project`/`db-load-project`, and guard against missing legacy fields to avoid crashes on existing projects.
- [ ] Document data contracts in `src/stores/project.ts` (types + inline comments) so prompt builders and UI share the same canonical structure.

## Phase 2: Prompt Engineering (System & User Prompts)
- [ ] Add prompt templates to `constants/prompts.ts` (and `promptStore.optimizablePrompts`) for: `STORY_BIBLE_EXTRACTOR`, `STORY_BIBLE_VALIDATOR`, `ARCHITECT_PLACEHOLDER`, `SKELETON_VALIDATOR`, `CHAPTER_SUMMARIZER`, `CHAPTER_WRITER_HIERARCHICAL`, `ROLLING_CONTEXT_EDIT`.
- [ ] Refactor `useChapterContext` to assemble prompts as `[System Instructions] + [StoryBible inject] + [Prev dense summary] + [Current placeholder]` with strict separators and token budgets.
- [ ] Update `services/ai.ts` helpers to accept structured context payloads (system prompt + ordered user blocks) and to normalize JSON/markdown cleanup for the new prompt outputs (placeholders, summaries, validator notes).
- [ ] Ensure English-enforcement preamble remains prepended in all new templates and streaming modes.

## Phase 3: Orchestration Logic (The Loop)
- [ ] Story Bible stage: When generating from a premise in `ChapterList` (outline modal), run `STORY_BIBLE_EXTRACTOR` first, store into `storyBible`, optionally validate/normalize via `STORY_BIBLE_VALIDATOR`, and expose it in `BookBible` UI for edits.
- [ ] Skeleton stage: Replace current one-pass outline generation with two-pass flow in `ChapterList`: Architect generates placeholders per chapter; Validator checks placeholders against Story Bible (theme/tone/arc) and writes `validatorNotes`; UI surfaces per-chapter status chips and allows re-run per item.
- [ ] Drafting stage: In `EditorView`, before writing Chapter N, auto-generate/refresh `denseSummary` for Chapter N-1 via `CHAPTER_SUMMARIZER`; build the chapter system prompt with Story Bible + Prev Summary + Current Placeholder, then call `CHAPTER_WRITER_HIERARCHICAL`; persist `content`, `denseSummary`, and status transitions.
- [ ] Rolling context manager: Add a small service/composable to cache summaries, enforce max token lengths, and signal when summaries or placeholders are stale; integrate with continuity/transition modals and beats generator so they consume the same structured context.
- [ ] UI/UX wiring: Surface Story Bible sections in `BookBible.vue`, placeholder + validator states in `ChapterItem.vue`/`ChapterEditor.vue`, context freshness badges in `EditorView.vue`, and manual refresh actions for summaries/validator runs.

## Phase 4: Testing & Validation
- [ ] Add unit tests (or lightweight integration scripts) for schema serialization/deserialization of new fields (Pinia store ⇄ IPC ⇄ SQLite) to prevent data loss.
- [ ] Add prompt-builder tests for `useChapterContext` to confirm ordering/injection of Story Bible and summaries, and to guard against missing fields.
- [ ] Create manual QA checklist: generate outline → story bible → skeleton → validator → chapter draft → summary refresh; verify drift/hallucination reduction and UI status transitions.
