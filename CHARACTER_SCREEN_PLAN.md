# Character Screen Modernization Plan

## 1. UI/UX Overhaul
- **Goal**: Transform the simple list into a "Character Gallery" or "Cast & Crew" dashboard.
- **Layout**:
  - **Grid View**: Display characters as rich cards with avatars (initials or future image support).
  - **Detail Drawer/Modal**: Clicking a character opens a slide-over drawer or large modal for editing, keeping context.

## 2. Character Card Design
- **Visuals**:
  - Large circular avatar with initials or distinct color coding.
  - Name (Bold, Large).
  - Role (Badge/Pill).
  - Traits (Tag list).
- **Interactions**:
  - Hover effects to show "Edit" or "Delete" actions.
  - Context menu for quick actions.

## 3. Character Editor (New Component)
- **Structure**: A dedicated form component (`CharacterEditor.vue`) that is cleaner than the current inline/modal mix.
- **Fields**:
  - **Identity**: Name, Role (Protagonist, Antagonist, Supporting, etc.).
  - **Appearance**: Physical description.
  - **Personality**: Traits (tag input), Flaws, Motivations.
  - **Backstory**: Rich text area.
- **AI Integration**:
  - **"Flesh Out" Button**: Use AI to expand a simple 3-word description into a full bio.
  - **"Suggest Traits"**: AI suggests traits based on the role and bio.

## 4. Store Updates
- Ensure `projectStore` handles `updateCharacter` and `deleteCharacter` robustly.

## 5. Implementation Steps
1.  **Create `CharacterCard.vue`**: A reusable component for the grid view.
2.  **Create `CharacterEditor.vue`**: The editing form with AI features.
3.  **Refactor `CharactersView.vue`**:
    - Switch to a grid layout.
    - Integrate the new components.
    - Add the "Add Character" floating action button (FAB) or prominent header button.
