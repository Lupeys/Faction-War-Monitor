# Faction War Monitor — SPEC.md

## 1. Concept & Vision

A mobile-first war monitor for Torn factions. Designed for half-asleep 2am chain sessions — big tap targets, glanceable status pills, no horizontal scroll. The UI communicates target state instantly; one tap opens the attack link. Calm dark theme with red/amber/green status signals that are readable with one eye open.

## 2. Design Language

**Aesthetic:** Military command center meets mobile gaming HUD. Dense but clean.

**Colors:**
- Background: `#0f1117` (near-black)
- Card surface: `#1a1d27` (dark slate)
- Border: `#2a2d3a`
- Primary accent: `#3b82f6` (blue — interactive elements)
- Text primary: `#f1f5f9`
- Text muted: `#94a3b8`
- Status — Hospital: `#ef4444` (red)
- Status — Traveling/Abroad: `#f59e0b` (amber)
- Status — Okay + Online: `#22c55e` (green)
- Status — Idle: `#6b7280` (gray)
- Bstats color coding relative to user's own:
  - Grey (<50%): `#6b7280`
  - Green (50-150%): `#22c55e`
  - Orange (150-300%): `#f59e0b`
  - Red (>300%): `#ef4444`

**Typography:**
- Font: Inter (system stack fallback)
- Mono numbers for battle stats and timer

**Motion:**
- Card press: scale(0.98), 100ms
- Toast slide-up, 3s auto-dismiss
- Filter tab switch: instant (no animation — it's a tool, not decoration)
- Haptic on attack tap: `navigator.vibrate(50)` if available

**Icons:** Lucide React + Tabler icons — already installed.

## 3. Layout & Structure

```
┌─────────────────────────────┐
│  CHAIN TIMER BANNER (sticky) │  ← 5:00 countdown, chain count, score
├─────────────────────────────┤
│  [Opposing Faction] [Targets]│  ← mode toggle pills
│  [API Key input]             │  ← collapsible, shows BS once set
├─────────────────────────────┤
│  [All] [Hittable] [Hosp]     │  ← quick filter tabs
│  [Travel] [Offline] [Idle]   │
├─────────────────────────────┤
│  ┌───────────────────────┐   │
│  │ MemberCard            │   │  ← scrollable list
│  │ Name | Level | BS     │   │
│  │ Status pill | Last act│   │
│  │ [========= ATTACK ===]│   │  ← full-width tap target
│  └───────────────────────┘   │
│  ┌───────────────────────┐   │
│  │ MemberCard            │   │
│  └───────────────────────┘   │
├─────────────────────────────┤
│  [+ Add]  [⟳ Refresh]  [⏸]  │  ← bottom action bar (thumb-friendly)
└─────────────────────────────┘
```

**Responsive:** Single column on mobile. On desktop (≥768px), max-width 600px centered — war monitor is inherently mobile-tool, desktop is for viewing only.

## 4. Features & Interactions

### Chain Banner (Sticky)
- Hardcoded display for now: `05:00` timer, `Chain: 2,269`, `Score: +3,513 | 1d 0h left`
- Tap to manually refresh data

### Mode Toggle
- **Opposing Faction**: calls `GET /api/faction` (server proxies Torn public API)
- **Chain Targets**: calls `GET /api/targets` (shared target list)
- Switching modes re-fetches and re-renders list

### API Key Input
- Stored in cookie (30-day expiry)
- On save: fetches `battlestats.total` from Torn API, displays "My BS: X" badge
- Used to color-code all member cards relative to user's stats
- If no key provided, cards render without color coding

### Filter Tabs
- **All**: no filter, shows everything
- **Hittable**: Okay status + Online activity (default on mobile)
- **Hospital / Travel / Offline / Idle**: single-status filters
- Active filter persists in `localStorage` across page refreshes

### Member Cards
Each card shows (top to bottom):
- Row 1: Name (bold) + Level badge
- Row 2: Battle Stats (colored relative to user) + Status pill (colored)
- Row 3: Last action (relative time)
- Row 4: Full-width **ATTACK** button (opens torn.com attack URL)
- Long-press / hold: opens bottom sheet with [Attack] [Profile] [Hosp] [Bounty] buttons

### Add Target Sheet
- Bottom sheet triggered by `+ Add` in action bar
- Input: target IDs (comma-separated) + optional token
- Submits `PUT /api/targets/shared`

### Bottom Action Bar
- `+ Add` → opens add target sheet
- `⟳ Refresh` → manual data refresh
- `⏸ Pause` / `▶ Resume` → toggle auto-refresh
- Auto-refresh: 30s visible, 60s hidden (visibility API)

### Error / Empty States
- API error: red banner toast "Failed to load — retrying..."
- Empty list: "No targets match filters" centered message
- Loading: subtle spinner in banner, cards show skeleton

## 5. Component Inventory

### `ChainBanner`
- Sticky top, dark surface, mono font timer
- States: loading (spinner), live (countdown), paused (dimmed)

### `ModeToggle`
- Two pills: Faction | Targets
- Active = filled blue, inactive = ghost

### `ApiKeyInput`
- Collapsed by default (shows "API: ✓" if set)
- Expand to show password input + show/hide toggle + Save button
- After save: shows "My BS: X" inline

### `FilterTabs`
- Horizontal scrollable row of pills
- Active = filled with status color
- Badge showing count per category

### `MemberCard`
- Dark surface, subtle border, rounded-lg
- States: default, pressed (scale down), hosp (red left border accent)
- Status pill colors: Hospital=red, Travel=amber, Okay=green, Online=green dot, Offline=gray, Idle=gray

### `BottomSheet`
- Slides up from bottom, backdrop blur
- Triggered by long-press on card or `+ Add` button
- Actions: Attack, Profile, Hosp (if hosp-eligible), Bounty

### `BottomActionBar`
- Fixed bottom, 3-4 buttons
- All tap targets ≥44px height

### `StatusPill`
- Compact badge with colored background
- Icon + text (e.g., 🏥 Hospital, ✈️ Traveling)

## 6. Technical Approach

**Frontend:** React 19 + Vite + Tailwind v4 + Radix UI components (dialog, tabs, tooltip) + Sonner toasts

**Backend:** Hono server (server.ts) — API routes proxy Torn API
- `GET /api/faction` — fetches from `https://api.torn.com/faction/{id}?selections=info,members` (public key)
- `GET /api/targets` — returns shared targets array (in-memory store for now)
- `PUT /api/targets/shared` — adds IDs to shared targets list

**Environment variables:**
- `TORN_PUBLIC_API_KEY` — faction leader's shared API key for public data
- `TORN_FACTION_ID` — faction ID to fetch

**Persistence:**
- User's API key + battle stats: cookie (30 days)
- Filter state: `localStorage`
- Shared targets: server-side in-memory (future: DB/file)

**Data flow:**
```
User action → React component → fetch('/api/...')
→ Hono route → Torn API (proxy) → response → React state → re-render
```

**No external auth** — this is a public tool. API keys are user-provided for personal stats only.

## 7. File Structure

```
src/
├── App.tsx                      ← router + providers
├── pages/
│   └── WarMonitor.tsx           ← main page
├── components/
│   ├── ChainBanner.tsx
│   ├── ModeToggle.tsx
│   ├── ApiKeyInput.tsx
│   ├── FilterTabs.tsx
│   ├── MemberCard.tsx
│   ├── MemberList.tsx
│   ├── BottomSheet.tsx
│   ├── BottomActionBar.tsx
│   └── ui/
│       ├── badge.tsx            ← existing shadcn badge
│       └── card.tsx             ← existing shadcn card
└── hooks/
    ├── useMembers.ts            ← data fetching + state
    ├── useFilters.ts            ← localStorage filter persistence
    └── useAutoRefresh.ts        ← visibility-aware polling
```