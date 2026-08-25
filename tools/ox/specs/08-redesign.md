# TASK: Rework globals.css into a distinctive editorial design system

Rewrite `app/globals.css` ONLY. Do not touch any component. Every existing class name and
CSS variable MUST still exist with the same name — components depend on them. You are
changing the VALUES and adding polish, not renaming anything.

@include app/globals.css

## The problem to fix

The current look is generic "AI-generated SaaS": every surface has the same soft drop
shadow, everything is rounded ~18px, flat green-on-white, no typographic tension, no
texture. Make it look like it was designed by a person with a point of view — an editorial,
warm, print-inspired charity brand, not a template.

## Direction — implement ALL of it

### 1. Palette — warmer, deeper, more considered
Replace the tokens with this exact set (keep every token NAME, change the values):
- `--background: #f7f4ee` (warm paper, not clinical near-white)
- `--foreground: #1c2b26` (deep ink green-black)
- `--card: #fffdf8` (warm off-white, distinct from the paper bg)
- `--card-foreground: #1c2b26`
- `--primary: #1f6b4f` (deeper, richer forest green)
- `--primary-foreground: #f7f4ee`
- `--muted: #ebe6db`
- `--muted-foreground: #6b7671`
- `--border: #ded7c9` (warm hairline, visible but quiet)
- `--accent-soft: #d9e4dc`, `--accent-softer: #e6ede4`, `--track: #e2ddd0`
- Keep the sun/sky/mint tint tokens but warm them slightly to sit on paper.
- ADD a warm signal accent for energy/urgency: `--accent: #c8663d` (terracotta) and
  `--accent-foreground: #fffdf8`. Use it ONLY where the spec below says.
- Keep the existing dark-mode block working: provide a dark value for EVERY new/changed
  token under both `@media (prefers-color-scheme: dark)` and the existing structure. Dark
  bg around `#14201b`, warm-neutral text, terracotta stays legible.

### 2. Kill the uniform-shadow tell
- Remove the blanket soft box-shadows. Cards get NO drop shadow by default — instead a
  1px `--border` hairline and a barely-there `0 1px 0` inner highlight on top using a
  warm white, so they read as paper, not floating glass.
- Keep exactly ONE real shadow in the whole system: the bottom-nav and the donation-sheet,
  because they genuinely float. Make it tighter and warmer than the current one.

### 3. Typography — create tension
- Base `body` font-size 15px, `line-height: 1.55`, and add `text-rendering: optimizeLegibility`
  and `-webkit-font-smoothing: antialiased`.
- Add a global rule so all `.font-serif` display text gets `letter-spacing: -0.02em` and
  `font-feature-settings: "liga" 1`. It should feel set, not default.
- Money and stats must use tabular figures: add a `.tnum { font-variant-numeric: tabular-nums; }`
  utility AND apply `font-variant-numeric: tabular-nums` inside `.progress-track`'s sibling
  contexts is not possible from CSS alone, so just provide `.tnum` for components to use and
  ALSO set `font-variant-numeric: tabular-nums` on `.amount-option` and `.amount-input`.
- `.eyebrow` (the caps overlines): keep caps, push `letter-spacing` to `.16em`, make them
  feel like a masthead label — slightly smaller, more weight.

### 4. Refine the component classes (same names, better values)
- `.campaign-card`: radius 14px (down from 18), hairline border, no drop shadow, a subtle
  1px top highlight. On hover (desktop) lift with a fast transform and a faint shadow.
- `.campaign-image`: add a very subtle inset border at the bottom edge so it meets the card
  cleanly; keep object-fit cover.
- `.pill` / `.pill-active`: less pill-perfect — radius 10px, tighter padding, the active
  state uses `--primary` with a subtle inset, inactive uses transparent bg with just the
  hairline border. Add a smooth 150ms transition.
- `.progress-track`: thinner (5px), `--track` bg; `.progress-fill` gets a subtle
  left-to-right tonal gradient within the green (not flat), and a soft rounded cap.
- `.donate-button` / `.confirm-button`: radius 11px, weight 700, letter-spacing .01em, a
  1px darker bottom border for a printed/pressed feel, 150ms transitions, clear active state.
- `.icon-button`, `.avatar`, `.mini-avatar`: keep circular; give them the hairline border
  and remove any heavy shadow.
- `.category-badge`: less bubbly — radius 7px, backdrop blur, tighter.
- `.eyebrow`, headings: introduce a reusable `.hairline` rule (`border-top: 1px solid
  var(--border)`) components can use as section dividers.
- Bottom nav: keep it floating with the one allowed shadow, tighten the blur.

### 5. Texture — the anti-slop detail
- Add a subtle paper texture to `body` using a CSS-only approach: a faint repeating linear
  or radial gradient at very low opacity, OR a tiny inline SVG noise as a data URI at ~2%
  opacity. Must be extremely subtle — felt, not seen — and must not hurt text contrast.

### 6. Motion
- Add a `@media (prefers-reduced-motion: reduce)` block that disables the rise animation,
  hovers, and transitions.
- Keep the existing `rise` keyframe but make the campaign-card entrance a touch subtler.

## Constraints
- ONE file: app/globals.css. No component edits, no new dependencies, no external fonts
  beyond the DM Sans / DM Serif already wired via next/font.
- Every current selector and token name survives. Adding new ones is fine.
- Must remain valid Tailwind v4 (`@import 'tailwindcss'` + `@theme inline`).
- Contrast: body text and muted text must stay AA on the new paper background.
