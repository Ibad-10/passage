# Passage design system

Mockup: https://claude.ai/artifact/AmBTfVxv3KfSXrDHuc5mSB

Look: adopted from Precedent (github.com/esh1306/mubithack), the sister hackathon app, so both read as one product family. The light workspace is the default: off-white page, white cards, ink text, navy actions, and brand red used only as an accent. The dark theme is Linear/Vercel-style: near-black, cool greys, one coral accent.

## Colour tokens

Passage token names, with Precedent's equivalent shadcn token in brackets.

| Token | Light (default) | Dark |
|---|---|---|
| `bg` (background) | #F7F8FA | oklch(0.145 0.003 286) |
| `surface` (card) | #FFFFFF | oklch(0.172 0.004 286) |
| `surface-2` (secondary/muted) | #EEF1F6 | oklch(0.215 0.005 286) |
| `border` | #DDE2EA | oklch(1 0 0 / 7.5%) |
| `border-strong` (input) | #C9D0DB | oklch(1 0 0 / 12%) |
| `text` (foreground) | #0E1A2F | oklch(0.955 0.003 286) |
| `text-muted` (muted-foreground) | #4A5872 | oklch(0.72 0.012 286) |
| `accent` (primary: actions) | #13306B navy | oklch(0.68 0.2 29) coral |
| `accent-ink` (primary-foreground) | #FFFFFF | oklch(0.14 0.01 40) |
| `brand` (logo, accent only, never body text) | #C2362B | oklch(0.68 0.2 29) |
| `ok` (good) | #0F7A3D | oklch(0.74 0.14 160) |
| `warn` | #A15C07 | oklch(0.8 0.14 80) |
| `danger` (bad/destructive) | #B42318 | oklch(0.7 0.18 22) |
| `info` (link) | #1D4ED8 | oklch(0.72 0.13 255) |

Tinted backgrounds (`*-bg`, `*-border`) are the status colour at roughly 8% and 30%. The full set is in the mockup's `:root` (dark) and `.light` blocks.

Rules carried over from Precedent: status is always shown with an icon and a label, never colour alone. Muted text stays at 4.5:1 or better. Brand red fails 4.5:1 as text on white, so it is only used for the logo and decoration.

## Type

| Role | Font | Where |
|---|---|---|
| Interface | IBM Plex Sans 400/500/600 | Everything by default |
| Codes and labels | JetBrains Mono 400/500 | Case IDs, control-list entries, uppercase labels |
| Titles and rulings | Source Serif 4 400/600 | Page H1s, officer decisions, quotes |
| Display | Big Shoulders 800/900, uppercase | Sign-in hero only |

In the app, load these with `next/font/google` (`IBM_Plex_Sans`, `JetBrains_Mono`, `Source_Serif_4`, `Big_Shoulders`) as CSS variables, the same way Precedent's `app/layout.tsx` does.

## Shape and layout

- Radius: 0.5rem for cards and inputs, 6px for buttons (Precedent `--radius: 0.5rem`).
- Max width 1400 px, gutter `clamp(16px, 3vw, 32px)`.
- Case screens: main column (`flex: 999 1 560px`) plus side panel (`flex: 1 1 320px`), stacking to one column on phones.
- Wide tables scroll inside their own box. Touch targets are at least 44 px.

## Motion

- Entrance: rise and fade, 0.5–0.6 s, `cubic-bezier(.2,.7,.2,1)`, staggered.
- Active step: warn-coloured pulse. Confidence bars grow from zero. Wizard steps slide in.
- Approve button: shimmer. Success: a pop-in check.
- `prefers-reduced-motion` turns all animation off.
- Precedent uses GSAP and Lenis for scroll effects. Passage uses Framer Motion for transitions and keeps Lenis optional.

## Components

| Need | Source |
|---|---|
| Forms, selects, tables, tabs, dialogs, toasts (sonner), command menu (cmdk) | shadcn/ui, as in Precedent |
| Sign-in grid background with scan | Aceternity UI background pattern |
| Shipments stats | Magic UI Number Ticker |
| Approve button | Magic UI Shimmer Button |
| Case timeline connector | Magic UI Animated Beam |
| Theme switch | next-themes, `class` strategy |
| Sign-in | Clerk `<SignIn />` with the `appearance` prop mapped to these tokens |

## UI rules applied (Figma UI design principles)

- **Hierarchy:** one serif H1 per screen with a mono label above it, and one primary button per view.
- **Progressive disclosure:** the 4-step new-shipment wizard with a live completeness checklist. The officer's route choice unlocks only after sanctions are resolved.
- **Consistency:** the same chip, button, panel and label styles on every screen.
- **Contrast:** the primary colour is for the next action. Destructive actions are outlined red, never filled.
- **Accessibility:** WCAG AA in both themes, a real label on every input, 44 px targets, reduced motion, symbols alongside status colours.
- **Proximity:** risky actions (Confirm match) are kept apart from safe ones (Clear).
- **Alignment:** one container, a shared gutter, and grids written as `repeat(N, minmax(0,1fr))`.
- **No AI slop:** no gradient washes, glowing blobs, left-border accent cards or emoji.
