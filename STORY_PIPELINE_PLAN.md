# Story Pipeline Implementation Plan

## 1. Pipeline Manager (New Store/Service)
- **Goal**: Create a centralized controller to manage the state of the 4-step generation process.
- **State Management**:
  - `currentStep`: 'logline' | 'synopsis' | 'characters' | 'chapters'
  - `isGenerating`: boolean
  - `progress`: number (0-100)

## 2. UI Components
- **PipelineWizard.vue**: A new parent component or a mode within `BookBible.vue` that guides the user through the steps.
  - **Step 1: Logline**: Input field + "Generate Synopsis" button.
  - **Step 2: Synopsis**: Textarea (editable) + "Generate Characters" button.
  - **Step 3: Characters**: List view of generated characters (approve/edit/reject) + "Generate Outline" button.
  - **Step 4: Outline**: Chapter list preview.

## 3. AI Prompts (Updates to `prompts.ts`)
- **SYNOPSIS_FROM_LOGLINE**: "Expand this logline into a 3-act synopsis..."
- **CHARACTERS_FROM_SYNOPSIS**: "Extract and develop main characters from this synopsis... Return JSON."
- **OUTLINE_FROM_SYNOPSIS_AND_CHARS**: "Create a chapter outline using this synopsis and these characters... Return JSON."

## 4. Integration Steps
1.  **Update Prompts**: Add the specific chaining prompts.
2.  **Create `PipelineView.vue`**: A new view or a modal overlay that runs this specific flow.
3.  **Connect Services**: Ensure the AI service can handle the larger context (synopsis text) required for later steps.

## 5. Data Flow Logic
1.  **Input**: User types Logline.
2.  **Action**: User clicks "Auto-Build Story".
3.  **Step 1 (Synopsis)**: 
    - Prompt: `System: SYNOPSIS_GENERATOR`, User: `Logline: {logline}`.
    - Output: Updates `projectStore.bookMetadata.synopsis`.
4.  **Step 2 (Characters)**: 
    - Prompt: `System: CHARACTER_EXTRACTOR`, User: `Synopsis: {synopsis}`.
    - Output: JSON array -> parsed -> pushed to `projectStore.characterOutline`.
5.  **Step 3 (Chapters)**: 
    - Prompt: `System: CHAPTER_GENERATOR`, User: `Synopsis: {synopsis}, Characters: {list}`.
    - Output: JSON array -> parsed -> pushed to `projectStore.storyOutline`.

## 6. User Experience
- Allow "Stop/Edit" at each stage. The user should verify the synopsis before characters are generated, and verify characters before the outline is generated, to prevent cascading errors.
