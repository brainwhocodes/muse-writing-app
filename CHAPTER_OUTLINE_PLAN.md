# Chapter Outline Improvement Plan

## 1. UX/UI Modernization
- **Structure**: Convert the vertical list into a "Timeline" or "Storyboard" style view.
- **Card Design**: 
  - Compact view by default (Chapter #, Title, Status, Character Avatars).
  - "Click to Expand" or "Click to Edit" interaction.
  - **Status Indicators**: Use a colored border-left (Yellow=Idea, Blue=Draft, Green=Complete) for quick visual scanning.
- **Character Visualization**: 
  - Replace text buttons with small circular avatars (initials) to show who is in the scene at a glance.

## 2. Reordering Capability
- Implement **Move Up / Move Down** controls on each chapter card to allow restructuring the story flow.
- (Future/Optional) Drag and drop (complex to implement robustly without libraries, so buttons are a good MVP).

## 3. Enhanced Edit Experience
- **Focus Mode**: When editing a chapter, highlighting it and dimming others, or opening a dedicated "Edit Drawer".
- **Rich Inputs**:
  - **Title**: Large, bold input.
  - **Summary**: Auto-expanding textarea.
  - **Character Selector**: A grid of toggleable character cards/chips rather than a simple button list.

## 4. AI Features (Per-Chapter)
- **"Suggest Beats"**: Add a button to generate scene beats based on the summary.
- **"Expand Summary"**: Use AI to flesh out a one-line idea into a full paragraph.

## 5. Implementation Strategy
1.  **Refactor `ChapterList.vue`**:
    - Extract `ChapterItem.vue` (display) and `ChapterEditor.vue` (edit form) to clean up the large file.
2.  **Update Store**: Ensure `projectStore` has `moveChapter(id, direction)` method.
3.  **Styling**: Apply the new Tailwind/DaisyUI styles for the modern look.
