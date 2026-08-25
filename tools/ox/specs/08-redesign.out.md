=== FILE: app/globals.css ===
@import 'tailwindcss';
@import 'tw-animate-css';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent-soft: var(--accent-soft);
  --color-accent-softer: var(--accent-softer);
  --font-sans: var(--font-dm-sans), sans-serif;
  --font-serif: var(--font-dm-serif), serif;
}

:root {
  --background: #f7f4ee; --foreground: #1c2b26; --card: #fffdf8; --card-foreground: #1c2b26;
  --primary: #1f6b4f; --primary-foreground: #f7f4ee; --muted: #ebe6db; --muted-foreground: #6b7671;
  --border: #ded7c9;
  --accent: #c8663d; --accent-foreground: #fffdf8;
  --accent-soft: #d9e4dc; --accent-softer: #e6ede4; --track: #e2ddd0;
  --tint-sun-bg: #f2e7cf; --tint-sun-fg: #84682e;
  --tint-sky-bg: #d9e6e8; --tint-sky-fg: #3f707f;
  --tint-mint-bg: #ddeadd; --tint-mint-fg: #497a57;
  --nav-surface: rgba(247,244,238,.92);
  --sheet-shadow: rgba(46,36,22,.18);
  --grain: rgba(28,43,38,.05);
}

/* layout.tsx declares colorScheme 'light dark', so the UA styles form controls and
   scrollbars dark in dark mode. Without these tokens the page stayed light and the
   controls did not match. */
@media (prefers-color-scheme: dark) {
  :root {
    --background: #14201b; --foreground: #ece8de; --card: #1b2822; --card-foreground: #ece8de;
    --primary: #55b788; --primary-foreground: #0a1510; --muted: #232f29; --muted-foreground: #a3ada5;
    --border: #2c3831;
    --accent: #d07a4e; --accent-foreground: #211209;
    --accent-soft: #24382d; --accent-softer: #20342a; --track: #2a352d;
    --tint-sun-bg: #39301d; --tint-sun-fg: #d2ba82;
    --tint-sky-bg: #21343b; --tint-sky-fg: #92becb;
    --tint-mint-bg: #223826; --tint-mint-fg: #8fc79b;
    --nav-surface: rgba(20,32,27,.92);
    --sheet-shadow: rgba(0,0,0,.55);
    --grain: rgba(236,232,222,.05);
  }
}
* { box-sizing: border-box; }
html { background: var(--background); }
body {
  margin: 0;
  background-color: var(--background);
  /* paper tooth: two offset 1px dot fields at ~5% alpha — felt, not seen */
  background-image: radial-gradient(var(--grain) 1px, transparent 1px), radial-gradient(var(--grain) 1px, transparent 1px);
  background-size: 22px 22px;
  background-position: 0 0, 11px 11px;
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
button { cursor: pointer; }
.font-serif { letter-spacing: -.02em; font-feature-settings: "liga" 1; }
.tnum { font-variant-numeric: tabular-nums; }
.hairline { border-top: 1px solid var(--border); }
.icon-button { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid var(--border); border-radius: 50%; background: var(--card); color: var(--foreground); transition: background .15s ease, border-color .15s ease; }
.avatar, .mini-avatar { display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; background: var(--accent-soft); color: var(--primary); font-size: 10px; font-weight: 700; }
.avatar { width: 38px; height: 38px; margin-left: 2px; }
.eyebrow { color: var(--primary); font-size: 9px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
.scrollbar-hidden { scrollbar-width: none; }
.scrollbar-hidden::-webkit-scrollbar { display: none; }
.pill { flex: 0 0 auto; border: 1px solid var(--border); border-radius: 10px; background: transparent; padding: 7px 12px; color: var(--muted-foreground); font-size: 12px; font-weight: 700; transition: background .15s ease, border-color .15s ease, color .15s ease; }
.pill-active { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--primary) 55%, #fff), inset 0 -1px 0 color-mix(in srgb, var(--primary) 70%, #000); }
.campaign-card { overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--card); box-shadow: inset 0 1px 0 rgba(255,253,248,.85); animation: rise .45s cubic-bezier(.22,.61,.36,1) both; transition: transform .15s ease, box-shadow .15s ease; }
@media (hover: hover) { .campaign-card:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,253,248,.85), 0 6px 16px rgba(46,36,22,.09); } }
.campaign-image { display: block; width: 100%; height: 190px; object-fit: cover; border-bottom: 1px solid var(--border); }
.image-fade { position: absolute; inset: auto 0 0; height: 65px; background: linear-gradient(transparent, rgba(16,32,26,.38)); }
.save-button { position: absolute; right: 12px; top: 12px; display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid rgba(28,43,38,.08); border-radius: 50%; background: rgba(255,253,248,.92); color: var(--foreground); }
.category-badge { position: absolute; bottom: 12px; left: 13px; border-radius: 7px; background: rgba(255,253,248,.88); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); padding: 4px 8px; color: var(--foreground); font-size: 10px; font-weight: 800; letter-spacing: .04em; }
.mini-avatar { width: 25px; height: 25px; }
.mini-avatar.sun { background: var(--tint-sun-bg); color: var(--tint-sun-fg); }
.mini-avatar.sky { background: var(--tint-sky-bg); color: var(--tint-sky-fg); } .mini-avatar.mint { background: var(--tint-mint-bg); color: var(--tint-mint-fg); }
.progress-track { height: 5px; overflow: hidden; border-radius: 99px; background: var(--track); } .progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 78%, #000), var(--primary)); }
.donate-button, .confirm-button { display: flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 11px; background: var(--primary); color: var(--primary-foreground); font-weight: 700; letter-spacing: .01em; box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--primary) 70%, #000); transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
.donate-button { padding: 9px 13px; font-size: 11px; }
.donate-button:active, .confirm-button:active { transform: translateY(1px); box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--primary) 70%, #000), inset 0 2px 4px rgba(0,0,0,.18); }
.bottom-nav { position: fixed; bottom: 0; z-index: 10; display: flex; align-items: center; justify-content: space-around; width: min(100%, 470px); border-top: 1px solid var(--border); background: var(--nav-surface); padding: 10px 14px 12px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 -6px 18px var(--sheet-shadow); }
.nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: transparent; color: var(--muted-foreground); font-size: 10px; font-weight: 700; transition: color .15s ease; } .nav-active { color: var(--primary); }
.create-button { display: grid; place-items: center; width: 46px; height: 46px; margin-top: -25px; border: 5px solid var(--background); border-radius: 50%; background: var(--primary); color: var(--primary-foreground); box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--primary) 70%, #000); transition: transform .15s ease, box-shadow .15s ease; }
.create-button:active { transform: translateY(1px); }
.modal-backdrop { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center; background: rgba(23,32,27,.42); }
.donation-sheet { position: relative; width: min(100%, 470px); border-radius: 26px 26px 0 0; background: var(--background); padding: 28px 22px 24px; box-shadow: 0 -14px 38px var(--sheet-shadow); }
.sheet-handle { position: absolute; left: 50%; top: 10px; width: 38px; height: 4px; transform: translateX(-50%); border-radius: 4px; background: var(--border); } .modal-close { position: absolute; right: 17px; top: 20px; display: grid; place-items: center; border: 0; background: transparent; color: var(--muted-foreground); }
.amount-option, .amount-input { border: 1px solid var(--border); border-radius: 12px; background: var(--card); padding: 13px; text-align: center; color: var(--foreground); font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; } .amount-active { border-color: var(--primary); background: var(--accent-softer); color: var(--primary); }
.amount-input { display: block; width: 100%; margin-top: 7px; outline: none; text-align: left; } .confirm-button { width: 100%; margin-top: 18px; padding: 15px; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (min-width: 700px) { body { padding: 28px 0; } .bottom-nav { bottom: 28px; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 10px 26px var(--sheet-shadow); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .campaign-card { animation: none; }
  .campaign-card:hover, .donate-button:active, .confirm-button:active, .create-button:active { transform: none; }
}
=== END FILE ===

=== NOTES ===
- Kept every original selector/token name; added only `--accent`, `--accent-foreground`, `--grain`, `.tnum`, `.hairline`, a `.font-serif` display rule, hover/active states, and the reduced-motion block. Registered the accent pair in `@theme inline` so components can adopt it later via `bg-accent`/`text-accent`; no existing markup uses it, per spec.
- Tonal derivatives (button bottom edge, pill-active insets, progress gradient) use `color-mix()` against `--primary` so they adapt automatically in dark mode instead of hardcoding light-mode greens.
- Risk: spec-mandated `--muted-foreground: #6b7671` measures ≈4.3:1 on `--background` (passes on the lighter `--card`). Kept the exact hex as instructed; nudge to ~#64706a if strict AA on the page background is ever audited.
- `.eyebrow` at weight 900 assumes DM Sans is loaded with a 900 axis/weight via next/font; browsers will synthesize bold otherwise (cosmetic only).
- Texture is a dual-offset 1px radial-gradient dot field driven by `--grain` (theme-aware) rather than an inline SVG turbulence URI — cheaper to paint and adapts to dark mode; effectively invisible at 5% alpha.
- The single persistent shadow token `--sheet-shadow` is shared by `.bottom-nav` and `.donation-sheet` (direction flipped per surface); the campaign-card hover shadow is the transient lift explicitly requested in §4.