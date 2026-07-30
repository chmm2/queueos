# Handoff: QueueOS Console redesign (light "warm paper" system)

## Overview
Full visual redesign of QueueOS — a multi-branch queue-management product for clinics. Covers the login page, the admin console (Branches, Branch Overview, Departments, Rooms & Counters, Analytics, Displays & QR), the staff counter desk, and the public waiting-screen board. The redesign replaces a generic white/indigo admin look with a warm off-white ("paper") system, an ink-espresso primary, a clay accent, and a logo that reads as an actual moving queue.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the existing codebase** (the current app appears to be React on `queueos-web`), using its established routing, component, and styling patterns. If no styling system exists yet, pick the project's natural choice (CSS modules / Tailwind / styled-components) and implement the tokens below there.

`QueueOS Console.dc.html` is a single-file prototype: all screens live in one file and are switched with local state (a `screen` string). In the real app these are separate routes; the sidebar links and buttons map to real navigation. Open the file directly in a browser to click through it (`support.js` must sit next to it).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and interaction states are final and should be matched closely. Data shown (branch names, tokens, counts) is placeholder — wire to the real API.

---

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| paper | `#F4F1E8` | App background |
| surface | `#FFFDF8` | Cards, panels, inputs on cards |
| surface-sunken | `#F7F4EC` | Input fields, table header strips |
| surface-alt | `#F9F6EF` | Nested cards (counter tiles, queue rows) |
| sidebar | `#EFEBE0` | Sidebar background |
| line | `#E5DFD2` | Default border |
| line-soft | `#EDE7DA` | Inner dividers |
| line-input | `#E1DACB` | Input / secondary button border |
| ink | `#1B1A17` | Primary text, TV board background |
| ink-2 | `#4A443A` | Secondary text (strong) |
| muted | `#6B6357` | Body copy |
| muted-2 | `#8A8172` | Meta text |
| muted-3 | `#A79E8E` | Mono labels, placeholders |
| primary (espresso) | `#2E2A22` | Primary buttons, active accents, chart bars |
| primary-hover | `#17140F` | Primary button hover |
| primary-tint bg / border | `#F3ECE0` / `#E6DCC9` | Neutral chips, dept avatars |
| accent (clay) | `#C2603C` | Eyebrow labels, live dots, alerts, over-capacity bars |
| accent-ink | `#B04E2E` | Clay text on tint |
| accent-tint bg / border | `#F6EEE9` / `#EBD8CD` | Clay chips |
| success | `#3F7D5A` | LIVE / open / completed |
| success-tint bg / border | `#EDF3EE` / `#CFE0D4` | Open + LIVE chips |
| warning | `#D8A24A` (text `#98701F`) | Missed, no-show flags |
| warning-tint bg / border | `#FBF2E4` / `#EDDCBE` | No-show flag chip |
| board amber | `#F0C48A` | Token number on dark waiting screen |
| spark-idle | `#DCCFB8` | Sparkline bars (recent bars use clay) |

### Typography
- **Display / UI**: `Space Grotesk` (400, 500, 600, 700) — Google Fonts.
- **Mono / labels / tokens**: `IBM Plex Mono` (400, 500, 600).
- Page title: 42px / 700 / `letter-spacing:-.035em`
- Login headline: 38px / 700 / -.035em, centered
- Section title (card heading): 17–19px / 700 / -.02em
- Body: 15–16px, `color: muted`
- KPI number: 38–40px / 700 / -.035em
- Eyebrow label: IBM Plex Mono 11px, `letter-spacing:.2em`, uppercase, clay
- Mono micro-label: IBM Plex Mono 10px, `.16–.20em`, uppercase, muted-3
- TV board token: 170px / 700 / -.05em; board title 62px

### Spacing / shape
- Card radius 18–22px; inner tiles 14px; pills 999px; buttons 10–12px; icon tiles 13px.
- Card padding 22–28px. Grid gaps 10–20px.
- Border: 1px solid `line`.
- Shadows: rest `0 2px 0 rgba(43,38,28,.03)`; hover `0 12–18px 30–40px rgba(43,38,28,.07–.09)`; login card `0 30px 70px rgba(43,38,28,.10)`; floating login cards `0 18px 40px rgba(43,38,28,.07)`.

### Motion
- `blink` 1.6s ease-in-out infinite (live dots: opacity 1 → .2)
- `rise` .4–.5s ease (page/section enter: translateY 12px + fade)
- `floaty` 9–13s ease-in-out infinite (login decorative cards, translateY 0 → -10px)
- `grow` .6s cubic-bezier(.2,.8,.2,1) (analytics bars, scaleY from 0, origin bottom)
- `ripple` 2.4s ease-out infinite (Call next button halo: scale .8→1.5, opacity .5→0)
- Logo `advance` / `joinq` 2.4s ease-in-out infinite (see below)
- Card hover: `translateY(-3px)` + shadow, 180ms ease. Button hover: background darken, 150ms.

---

## Logo
Three **stick figures queued at a desk** — the animation IS the brand.

- Viewbox `0 0 96 44`. A clay rounded rect (`x=2 y=20 w=7 h=18 rx=3`) at the left is the service desk.
- Each figure: head `circle r=3.6 cy=11`, body/arms/legs as one path — `M{x} 15 V26 M{x} 18 L{x-4.5} 22.5 M{x} 18 L{x+4.5} 22.5 M{x} 26 L{x-4.5} 34 M{x} 26 L{x+4.5} 34`, `stroke-width 2.6`, round caps.
- Figures at x = 26 (front, clay `#C2603C`), 50 (cream 85% opacity), 74 (cream 60%).
- 3.6s ease-in-out infinite loop, all three in sync:
  - `qFront`: 0–52% still → 72–100% `translateX(-34px)`, opacity 0 (served, walks off).
  - `qMid`: 0–52% still → 74–100% `translateX(-24px)` (steps forward).
  - `qBack`: starts `translateX(28px)` opacity 0 → 22% at rest opacity 1 (new arrival) → 74–100% `translateX(-24px)`.
- Tile: espresso `#2E2A22` rounded rect, `overflow:hidden` so figures enter/exit cleanly. Login 86×56 (radius 18), sidebar 58×40 (radius 12), QR badge 58×44 static (no animation, all three figures visible).

Wordmark: "QueueOS" 17–24px / 700 / -.02–.03em, ink. Sub-line: IBM Plex Mono 10px, `.2em`, uppercase — "the line, run properly" (login) or the org name (sidebar).

---

## Screens

### 1. Login (`/login`)
**Purpose:** admin and counter-staff sign-in.
**Layout:** full-viewport, centered column; card `max-width:460px`. Background = paper + 72px grid lines (`#E7E1D3`, 1px, opacity .7) + a radial light wash `radial-gradient(60% 55% at 50% 42%, #FFFDF8, transparent 70%)`.

**Decorative floating cards** (4, absolutely positioned, anchored to the centered card so they never collide):
- left, `right: calc(50% + 265px); top:20%` — "NOW SERVING / B-042 / Billing Desk · Counter 1", token in IBM Plex Mono 34px espresso.
- right, `left: calc(50% + 265px); top:26%` — "AVG WAIT TODAY / 4m 12s ▼38%" + a 14-bar sparkline (26px tall).
- left, `right: calc(50% + 285px); bottom:18%` — espresso card, "QUEUE JOINED / C-118 · ~9m".
- right, `left: calc(50% + 285px); bottom:20%` — clay dot + "Counter 3 just opened".
- All hidden below `1180px` viewport width.

**Center stack:** logo + wordmark row → rotating headline (38px, swaps every 4.2s between: "Take the desk." / "The line moves again." / "Nobody likes waiting. Fix the waiting." / "Ten counters. One console.") → card with Email + Password (mono uppercase labels, sunken inputs, focus = espresso border + white bg) → primary button "Open the console →" full width → "First time here? Start an organization" → footer stat row (mono 11px): "1,284 tokens today · 4 branches live · no app installs".

### 2. App shell
Grid `250px minmax(0,1fr)`.
- **Sidebar** (`sidebar` bg, right border): logo block; nav groups "ORGANIZATION" (Branches, Administrators), "BRANCH — MAIN HOSPITAL" (Overview, Departments, Rooms & Counters, Analytics, Displays & QR), "LIVE SURFACES" (Waiting screen, Counter desk). Nav item = 7×7px rounded square marker + label; inactive marker `#CFC7B5`, active marker espresso (clay for live surfaces), active row = surface bg + `line-input` border + soft shadow + 600 weight. Nav must be `overflow-x:hidden; min-width:0`. Footer: avatar `AU`, name/role, "Exit" button.
- **Header** (sticky, translucent paper + blur, bottom border): breadcrumb "Branches / **Main Hospital**", right side LIVE pill (success tint + blinking dot) and the admin email.
- **Content column:** `max-width:1280px; margin:0 auto; padding:40px 40px 72px` — the header uses the same max-width so everything is symmetric with no dead right-hand gutter.

### 3. Branches
Eyebrow "ORGANIZATION" → H1 "Every branch, one pulse." → subtitle → "+ Add branch" primary button right-aligned.
Grid `repeat(auto-fit, minmax(310px,1fr))`, gap 20px. Card: name + address, "N WAITING" clay pill (blinking dot), 14-bar sparkline (48px tall, last 3 bars clay), 4-up stat row (Depts / Rooms / Counters / Staff) above a top border, and a full-width secondary "Open branch →" button. Hover lifts 3px.

### 4. Branch Overview
Eyebrow "BRANCH CONTROL" → H1 "Main Hospital" → "Six departments awake. Ten counters listening. Here's the room in one glance."
- KPI row: `repeat(auto-fit, minmax(230px,1fr))` — Waiting now `1 ▼62%`, Being served `0 idle`, Avg wait (24h) `2m ▼40s` (espresso), No-show rate `0% steady` (clay). Delta in mono 12px, success green when good.
- "CONFIGURE THIS BRANCH": 4 equal cards, each a vertical stack (44px icon tile, title, description). First two espresso tint, last two clay tint. Navigate to the corresponding screens.
- Location settings card: 2×2 input grid (Name, Street address, Phone, Timezone), then "OPENING HOURS" as a **two-column** grid of 8 rows (Mon–Sun + Public holidays): day label 104px, open/closed pill, right-aligned mono time range ("09:00 — 17:00" or "—").

### 5. Departments
List of 6 rows, each a fixed grid `44px minmax(0,1fr) 90px 150px 110px`: avatar (initial, espresso tint), name + type pill (walk-in neutral / emergency clay) + "~N min per patient · prefix X", waiting count with mono "WAITING" label, a 6px load bar (espresso, clay above 70%), and an "Archive" secondary button. Hover raises shadow only (no movement).
Below: "Add a department" card — grid `2fr 1fr 1fr 1fr auto`: Name, Prefix (mono), type `<select>`, SLA seconds (mono, 300), primary "Add department".

### 6. Rooms & Counters
Header row with "+ Add room". One card per room:
- Room header strip (`surface-sunken`, bottom border): room name, code chip (mono, e.g. `BILL`), "serves Billing", spacer, "Display & QR" and "Remove" (clay) secondary buttons.
- Body: "COUNTERS (n)" + "+ Add counter" link, then counter tiles in `repeat(auto-fit, minmax(280px,1fr))`: ID chip (mono), name, open/closed pill, login email (mono, truncated), divider, "All depts in room" + "Reset password" link.

### 7. Analytics
Eyebrow "LAST 24 HOURS" → H1 "The day, measured."
- **Smart ETA banner**: full-width **espresso** card, paper text. Title + "Learning" pill (amber on translucent) + "Train now" button (paper bg, espresso text). Copy: "Until the model has your real rhythm, wait times come from a transparent estimate built on your own service durations." Progress: "3 real visits collected" / "activates at 120", 8px track at 14% filled with `#F0C48A`.
- KPI row of 4: Total issued 76, Avg wait 2m (espresso), Avg service 6m, No-show rate 4% (green).
- Charts `1.5fr 1fr`: "Tokens issued by hour" — 10 espresso bars, 210px plot, `grow` animation, mono hour labels; "Outcomes" — 3 labeled progress bars (Completed 68 green 89%, Missed 5 amber 7%, Cancelled 3 clay 4%).

### 8. Displays & QR
Room chooser card: chips for each room + "Whole branch"; selected chip = espresso fill, paper text.
Grid `1fr 1.3fr`:
- **Join QR** card (centered): 186px QR placeholder (`repeating-conic-gradient` checker — replace with the real generated QR), espresso logo badge centered on top with a 6px white ring, "Rotates every 45s — screenshots go stale", "Open the join page ↗" link.
- **Waiting screen preview**: dark `#1B1A17` panel — room name (mono, .3em), token in amber 86px, "now serving", up-next token chips. Below, full-width primary "Open this screen full-size ↗" → opens the board.

### 9. Counter desk (staff)
Top row: counter ID chip (mono), "counter open" success pill, "Close counter" clay button.
H1 "Billing Desk" + "One button. The rest of the room takes care of itself."
Grid `1fr 1.6fr`: **Call next** — big espresso button, 30px label, "N WAITING" mono sub-label, animated ripple ring; next to it a dashed empty state: "Nobody at this counter right now." / "Hit **Call next** and the screen out front updates instantly."
"Your queue" card: rows with mono token, department, optional flag chip ("1 no-show" amber, "transferred"), ETA, "Priority" espresso chip.

### 10. Waiting screen / board (public TV, own route, no chrome)
Dark `#1B1A17`, paper text, 52px/64px padding. Header: "NOW SERVING" (mono .34em), room 62px, branch name; right = clock 50px tabular-nums + green LIVE dot. Body grid `1.6fr 1fr`: giant token (170px, amber `#F0C48A`) in a translucent panel with "Please proceed to **Counter 1**"; right column "UP NEXT" list (34px mono tokens + ETA). Footer: "Scan the code at the entrance — keep your place from your seat." / "POWERED BY QUEUEOS". Clock ticks every second.

---

## Interactions & Behavior
- Sign in → Branches. "Exit" → login.
- Sidebar items, "Open branch →", the four Configure cards, "Display & QR", and "Open this screen full-size" all navigate.
- Login headline rotates every 4200ms; board clock updates every 1000ms (12-hour, `h:mm AM/PM`).
- Room chips are single-select and drive the QR + preview titles.
- Hover states: cards lift 3px with a deeper shadow; primary buttons darken to `#17140F`; secondary buttons darken border to `#C9C0AD` and text to ink.
- Focus states: inputs get a espresso border and white background.
- Responsive: below 1180px the login floaters hide; the console grids should collapse to 2-up then 1-up, and the sidebar to a drawer (not designed — use your judgement).

## State Management
Prototype-local only: `screen` (route), `room` (selected room chip), `line` (rotating headline index), `clock`. In production, `screen`/`room` become route params; everything else is server data (branches, KPIs, departments, rooms, counters, analytics series, queue) polled or streamed live — the LIVE pill implies a websocket/SSE feed.

## Assets
None external. Fonts: Space Grotesk + IBM Plex Mono (Google Fonts). The QR is a CSS placeholder — use the app's real QR generator. All icons are text glyphs (`≡ ▤ ▢ ◧`) and should be swapped for the codebase's icon set.

## Files
- `QueueOS Console.dc.html` — the full prototype (all 10 screens).
- `support.js` — runtime needed to open the prototype in a browser; **not** part of the design, do not port.
