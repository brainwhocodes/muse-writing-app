# Book Bible UI Modernization Plan

## 1. Layout Restructuring
- **Goal**: Transform the "Book Bible" from a simple form into a visual "Project Identity" dashboard.
- **Grid System**:
  - **Header Section**: A Split view with a Book Cover placeholder on the left and Core Metadata (Title, Author, Genre) on the right.
  - **Core Concept**: A dedicated section for the Logline (Elevator Pitch).
  - **Story Arc**: A large, comfortable writing area for the Synopsis.

## 2. Visual Components

### A. Book Identity Header
- **Cover Art Placeholder**:
  - Aspect ratio 2:3 vertical rectangle.
  - Styled with a subtle gradient or pattern and a central icon.
  - Visual cue that this is a "Book" project.
- **Typography-First Inputs**:
  - **Title**: Large, bold input (text-3xl or 4xl) that looks like a page title rather than a form field.
  - **Author**: "Written by..." style input field.
  - **Genre**: Input styled as a pill/badge to distinguish it from standard text.

### B. Logline ("The Hook")
- **Design**: Styled to look like a featured quote or a highlighted box.
- **Input**: Larger text size to encourage brevity and punchiness.
- **Iconography**: Use a "Sparkles" or "Lightbulb" icon.

### C. Synopsis ("The Story")
- **Design**: A "Paper" sheet look – white/light background with a subtle shadow on a gray surface.
- **Experience**: Distraction-free text area with ample padding and line height.

## 3. UX Enhancements
- **Floating Labels**: Minimalist labels or placeholder-based UX.
- **Focus Effects**: subtle ring highlights using Tailwind colors.
- **Responsive**: Stack elements on mobile, side-by-side on desktop.

## 4. Implementation Steps
1.  Modify `src/components/BookBible.vue`.
2.  Introduce `grid` layout for the header.
3.  Apply specific Tailwind classes for the "Borderless" input feel.
4.  Add Lucide icons for visual flair.
