# Implementation Plan: AI-Powered Book Writing App

## 1. Project Setup & Configuration
- **Goal**: Initialize the environment with necessary styling and state management libraries.
- **Actions**:
  - Install `tailwindcss`, `postcss`, `autoprefixer`.
  - Install `daisyui` plugin for Tailwind.
  - Initialize Tailwind configuration (`tailwind.config.js`, `postcss.config.js`).
  - Install `pinia` for global state management.
  - Install `vue-router` for navigation between views (Editor, Outline, Characters).
  - Install `@tiptap/vue-3` and `@tiptap/starter-kit` for the rich text editor.
  - Install `diff` for text comparison.
  - Install `openai` (compatible with OpenRouter) for AI API calls.
  - Configure `src/style.css` to include Tailwind directives.

## 2. Data Architecture (Pinia Stores)
- **Goal**: Manage application state for the book, characters, and settings.
- **Stores**:
  - `useSettingsStore`: Manage OpenRouter API Key, selected model (e.g., `anthropic/claude-3-opus`, `meta-llama/llama-3-70b`), and default prompt styles.
  - `useProjectStore`:
    - `storyOutline`: Array of plot points/chapters (Title, Summary, Status).
    - `characterOutlines`: Array of characters (Name, Role, Bio, Traits).
  - `useEditorStore`:
    - Manage the current document content.
    - Handle selection state for AI operations.

## 3. UI Layout & Navigation
- **Goal**: Create a clean, functional application layout.
- **Components**:
  - `Sidebar`: Navigation links (Write, Story Outline, Characters, Settings).
  - `MainLayout`: Wrapper for the router view.
  - `App.vue`: Setup basic layout structure using DaisyUI drawer or grid.

## 4. Feature: Settings
- **Goal**: Allow user to configure AI connection.
- **UI**:
  - Input field for OpenRouter API Key.
  - Dropdown for Model Selection.
  - Save settings to `localStorage` (or Electron store).

## 5. Feature: Outlining (Story & Characters)
- **Story Outline**:
  - Kanban-style or List view of chapters/scenes.
  - fields: Title, Synopsis, Notes.
- **Character Outlines**:
  - Card grid view.
  - Fields: Name, Description, Personality, Goals.
  - These outlines will be fed as "Context" to the AI.

## 6. Feature: Editor & AI Integration
- **Goal**: The core writing experience with AI assistance.
- **Editor Component**:
  - Implement TipTap editor.
  - **Paragraph Selection**:
    - Detect current paragraph under cursor.
    - "Regenerate" button in a floating menu or sidebar.
  - **Custom Selection**:
    - Bubble menu allowing "Prompt" action on highlighted text.
- **AI Service**:
  - Function to send current text + instruction + context (Story/Characters) to OpenRouter.
  - Return streaming or complete response.

## 7. Feature: Diff & Review
- **Goal**: Allow user to review AI changes safely.
- **Workflow**:
  1. User selects text -> Requests change (Regenerate/Prompt).
  2. AI generates new text.
  3. **Diff Modal/Inline View**:
     - Use `diff` library to compute changes.
     - Display deletions in Red, additions in Green.
  4. **Actions**:
     - `Accept`: Replace original text with new text.
     - `Reject`: Discard new text.
     - `Edit`: Manually tweak the result before accepting.

## 8. Electron Specifics
- **File System**:
  - Implement Load/Save functionality to write the book data to local JSON/Markdown files.
