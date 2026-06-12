---
name: Enterprise GitHub Actions Test Dashboard
description: Static dashboard design system for Playwright workflow status, trend analysis, and safe run triggers.
colors:
  brand: "#06b6d4"
  surface: "#0f172a"
  surface-deep: "#02060f"
  text-primary: "#eff2ff"
  text-secondary: "#cbd5e1"
  text-muted: "#94a3b8"
  border: "#94a3b8"
  status-pass: "#22c55e"
  status-fail: "#ef4444"
  status-skip: "#94a3b8"
  status-flaky: "#f59e0b"
  status-duration: "#3b82f6"
typography:
  display:
    fontFamily: "Sora, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(2rem, 2.8vw, 3.3rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "normal"
  headline:
    fontFamily: "Sora, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Sora, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Sora, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "1rem"
rounded:
  sm: "14px"
  md: "18px"
  lg: "24px"
  xl: "28px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "12px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "12px 18px"
  card-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
---

# Design System: Enterprise GitHub Actions Test Dashboard

## 1. Overview

**Creative North Star: "The Observatory for Test Health"**

This design system supports a static dashboard for Playwright test execution data, with a grounded, operational interface that helps teams read build health, trends, and workflow status quickly. The system is built around a restrained dark palette, explicit data surfaces, and a predictable visual hierarchy so the UI feels stable under frequent refreshes.

Key Characteristics:
- Clear status colors for success, failure, skip, flake, and duration.
- Strong text contrast on deep surfaces for quick scanning.
- Calm geometry and measured spacing that keeps charts, tables, and controls legible.
- Distinct controls for workflow actions separated from passive reporting.

## 2. Colors

The palette is anchored in a deep blue surface with a bright cyan brand accent, supported by neutral text tones and a set of status colors for test outcomes.

### Primary
- **Brand Blue** (#06b6d4): Used for primary action buttons, active controls, and link accents.

### Neutral
- **Surface** (#0f172a): The main panel background and large UI surfaces.
- **Deep Surface** (#02060f): The page background and the darkest canvas layer.
- **Text Primary** (#eff2ff): Main body text and primary headings.
- **Text Secondary** (#cbd5e1): Secondary copy, captions, and supporting labels.
- **Text Muted** (#94a3b8): Tertiary details, metadata, and disabled text.
- **Border** (#94a3b8): Subtle dividers, table borders, and input strokes.

### Status
- **Pass** (#22c55e): Successful run and passed test indicators.
- **Fail** (#ef4444): Failed count badges and alert highlights.
- **Skip** (#94a3b8): Skipped tests and subdued status markers.
- **Flaky** (#f59e0b): Flaky tests and warning states.
- **Duration** (#3b82f6): Runtime trend visualizations and duration-focused states.

### Named Rules
**The Reserved Accent Rule.** Use `Brand Blue` sparingly; it should appear on primary actions, important links, and the strongest interactive affordances only.

## 3. Typography

**Display Font:** Sora, with system UI fallbacks.
**Body Font:** Sora, with system UI fallbacks.
**Label/Mono Font:** JetBrains Mono for numeric totals, code values, and status tokens.

**Character:** The typography is practical and precise, with a single humanist sans serif used across headings and body text for consistency, and a monospace face for technical values.

### Hierarchy
- **Display** (700, clamp(2rem, 2.8vw, 3.3rem), 1.05): Primary page titles and main dashboard headings.
- **Headline** (700, 1.35rem, 1.3): Section titles and panel headers.
- **Title** (700, 1.1rem, 1.35): Subsection headings, chart titles, and modal headings.
- **Body** (400, 1rem, 1.6): Paragraph copy, table text, and descriptive details.
- **Label** (500, 0.95rem, 1.5): Form labels, button text, compact metadata, and table headers.

### Named Rules
**The One-Face Rule.** Use `Sora` for all primary text roles; reserve monospace for values, code, and data tokens.

## 4. Elevation

Depth is conveyed through tonal layering, subtle borders, and a restrained shadow system rather than bright glows or glass effects. Surfaces feel stable and layered without introducing heavy floating panels.

### Shadow Vocabulary
- **Panel** (`0 24px 80px rgba(0, 0, 0, 0.18)`): Used sparingly for the main dashboard panels and modal surfaces.

### Named Rules
**The Stable Surface Rule.** Surfaces are flat at rest and only gain depth through a soft shadow and a darker backing surface when separation is needed.

## 5. Components

### Buttons
- **Shape:** Rounded pill corners (`24px`) for primary and secondary actions.
- **Primary:** `backgroundColor` uses `Brand Blue`, `textColor` uses `Text Primary`, `padding` is `12px 18px`.
- **Secondary:** Transparent surface, subtle border, and primary text color.
- **Hover / Focus:** Lift the button with a slight transform and maintain strong contrast. Focus uses a visible outline or border shift while preserving the dark surface.

### Cards / Containers
- **Corner Style:** Large rounded corners (`28px`).
- **Background:** `Surface` with a subtle overlay or tonal layering.
- **Shadow Strategy:** Use the panel shadow only for high-level sections and modals.
- **Border:** Fine border with `Border` at low opacity.
- **Internal Padding:** `24px` inside cards and panels.

### Inputs / Fields
- **Style:** `Surface` backgrounds with `Border` strokes and `14px` radius.
- **Focus:** Strong but subtle highlight on the border and consistent text color.
- **Error / Disabled:** Use status colors for error states and muted text for disabled states.

### Tables
- **Style:** Wide rows, soft zebra backgrounds, and sticky headers on dark surfaces.
- **Text:** Primary values in `Text Primary`, secondary values in `Text Secondary`.
- **Hover:** Light surface tint on row hover to improve scanability.

### Modal / Overlay
- **Style:** Dark, high-contrast modal surfaces with `28px` radius and a blurred or tinted backdrop.
- **Copy:** Keep actions clearly separated from form inputs and generated command output.

## 6. Do's and Don'ts

### Do:
- **Do** keep the page grounded in a dark operational palette with deep blue surfaces and bright cyan highlights.
- **Do** use status colors consistently: green for pass, red for fail, amber for flaky, gray for skipped.
- **Do** keep headings, cards, and tables roomy with clear spacing and readable row states.
- **Do** use `Sora` for main text and `JetBrains Mono` for numeric values and code-like output.
- **Do** keep workflow action controls distinct from the passive reporting surfaces.

### Don't:
- **Don't** treat this like a marketing landing page. Avoid oversized hero banners, decorative gradients, and promotional styling.
- **Don't** use glassmorphism as a default surface treatment.
- **Don't** apply gradient text or bold color stripes as visual accents.
- **Don't** rely on thin gray text over tinted backgrounds; text should remain ≥ 4.5:1 contrast.
- **Don't** use side-stripe borders larger than 1px to indicate importance; prefer full surfaces, background tints, or clear badges instead.
