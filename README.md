# ISO FACTORY — 2.5D Isometric Idle Factory

A browser game built on a hand-rolled HTML5 Canvas isometric renderer. No
libraries, no build step — open `index.html`.

**Step 1: rendering engine. Step 2: idle economy. Step 3: shell, UI and
audio.** The game is complete and playable.

```
index.html        the game (loads the modules below)
isofactory.html   single-file build — no server, no network, no deps
build.js          regenerates isofactory.html from the modules

css/style.css     dark industrial theme, full shell layout
js/iso.js         projection math, camera, colour, draw primitives
js/entities.js    every procedural prop (belts, arms, trucks, props)
js/engine.js      render list, sim loop, input, factory layout
js/products.js    product registry, upgrade axes, level curve, objectives
js/economy.js     mutable state: income, offline, autosave, unlocks
js/binding.js     the seam: economy → renderer
js/audio.js       procedural Web Audio synthesiser
js/ui.js          header, tabs, panels, modals, listeners, floaters
```

Open `index.html` for the modular version, or hand someone
`isofactory.html` — one file, 181 KB, opens straight off the filesystem
with zero network requests. Run `node build.js` after editing any module.

## Coordinate contract

```
sx = (gx - gy) * TILE_W/2
sy = (gx + gy) * TILE_H/2 - gz * Z_UNIT        (64 / 32 / 32 px)
```

`gx` runs screen right-and-down, `gy` screen left-and-down, `gz` straight up.
One unit = one tile; floats are fine. `iso.unproject()` inverts onto any
horizontal plane (used for mouse picking) and round-trips to ~1e-15.

Depth is painter's algorithm: `depth = (gx+gy)*1000 + gz*10 + layer`, ties
broken by insertion order. Entities emit **many** commands rather than one —
a conveyor emits one per tile plus one per item — so tall props interleave
correctly with whatever stands beside them.

## Rendering

`Engine.render()` clears, applies the camera transform, lets every entity
push commands into a pooled `RenderList`, sorts once, then draws. A second
untransformed pass is reserved for screen-space overlays.

The simulation runs on a **fixed 1/60 s step** with an accumulator (max 5
steps per frame, so a backgrounded tab can't spiral); rendering runs free at
`requestAnimationFrame` rate. Canvas is `devicePixelRatio`-aware and refits
on any resize via `ResizeObserver` — player pan and zoom survive the refit.

Measured under software rasterisation (no GPU): ~4.9 ms median frame,
~100 draw commands, ground plate 0.7 ms of it. Comfortable headroom.

## Primitives

`ISO.draw.*` — `box` (3 camera-facing faces, auto-shaded), `diamond`,
`cylinder` (gradient body + elliptical cap), `limb` (tubular capsule with
specular streak — the robot-arm links), `joint`, `shadow` (2-layer fake
penumbra), `glow` (additive), `fillPoly`, `label`.

## Entities

| Class | Notes |
|---|---|
| `Ground` | tiles, grid, road, floor paint, hover highlight |
| `Conveyor` | axis-aligned belt, scrolling treads, rails, legs, moving payload |
| `RobotArm` | yaw + **2-link IK** solved per frame, keyframed pick-and-place, gripper opens/closes on the payload |
| `Truck` | idle → inbound → docked → outbound, eased braking, head/brake lamps, lane gating via `canStart` |
| `LoadingDock` | apron, hazard stripes, bumpers, shutter, berth status lamp |
| `CrateStack` | jittered pallet stacks, ragged top row |
| `Generator` | housing, spinning fan, exhaust stack, steam puffs, gauges |
| `Silo`, `FloorLight` | background dressing, pooled light |

## The economy (Step 2)

### Income model

```
throughput (units/min) = base.rate  × speed × supply × robot
value      ($/unit)    = base.value × quality × global
income     ($/min)     = throughput × value
```

Line Speed, Supply Rate and Robot Multiplier are unbounded levels with
additive multipliers (+7% / +6% / +9% per level) and exponential costs.
Parts Quality is the discrete **1–5 star** axis and the only lever on unit
*value* (×1 → ×6), which keeps it the interesting decision rather than a
fourth throughput slider.

Money is **continuous**, derived from a rate — never from a crate touching a
truck. The floor is a view of the rate, so a dropped frame, a backgrounded
tab or an offline catch-up can't desync the books.

### Products

Eight lines, tier 0 → 7: SHIRT, Fly Kicks, Ray Block, Smellcohol, Pumps,
Dive Clock, Strap, Drone. Each carries its own value, unlock gate (player
level + cash) and payload palette. Unit value climbs ~7× per tier while
base rate falls slightly, so later lines are worth more per unit but need
the same upgrade work.

### Levelling

XP accrues per unit produced, weighted by tier. The curve is
`55 · L^1.9 · 1.12^(L-1)` — the geometric term matters: XP income scales
with throughput, which is exponential, so a purely polynomial curve gets
outrun and pins the cap in days, collapsing every unlock gate into one
moment. Simulated: ~level 3 in the first hour, 31 at day 1, 88 at day 30.

### Offline earnings

On load the gap since `lastSaved` is settled at **55% of the online rate,
capped at 24 h**, through the same `_accrue()` path the live tick uses —
one income implementation, two callers. Clock skew (a save stamped in the
future) pays nothing; gaps under 60 s produce no report. Backgrounding the
tab settles the same way, since a throttled `rAF` would otherwise lose time.

### Autosave

Every 5 s off the fixed-step tick, plus `beforeunload`, `pagehide` and
`visibilitychange`. `localStorage` with an in-memory fallback for private
mode and quota failures. Loads are defensive: corrupt JSON is discarded,
hostile values are clamped, the starter line is always unlocked.

### Objectives

An ordered chain of 18, three active at a time, each declarative
(`progress(state) → number` + target), so the tracker never grows a switch
statement and any of them renders generically.

## The shell (Step 3)

### Layout

A fixed header (money, $/min, level + XP meter, mute), an objective banner
that tracks the head of the chain, active-booster pills, a bottom sheet
holding the **PRODUCTS** and **FACTORY** panels, a **BOOSTERS** modal, a
welcome-back modal, toasts, and floating `+$` text drawn on the canvas
itself through the screen-space pass Step 1 reserved.

Two rules keep a 60 fps canvas and a DOM UI out of each other's way:

1. **Nothing rebuilds per frame.** Rows are built once and cached by id;
   the 10 Hz refresh only writes `textContent` and bar widths. DOM is
   rebuilt only on structural change.
2. **The UI polls, the state pushes.** Continuous values (cash, rate, XP,
   cooldowns) are read on a timer; discrete events (upgrade, unlock,
   levelup, objective, booster) arrive as state events and drive sound,
   toasts and re-renders.

### Boosters

Free, cooldown-gated surges: Overdrive (2× income), Belt Turbo (1.5×
throughput — the belts visibly speed up), XP Surge (3× XP), Rush Shipment
(banks 30 min of income instantly). Multipliers fold into the income model
at three different points and expire by timestamp, so offline settlement
automatically runs unboosted — a stale stamp simply stops counting.

### Audio

Everything is synthesised at call time from oscillators and noise buffers
— no files. Three things make it survive a real game: the context is built
**lazily on the first gesture** (browsers refuse otherwise) and resumed on
every play; every cue declares a **minimum gap** and silently drops calls
inside it, so a 10× speed upgrade doesn't become a buzzsaw; and everything
runs through one gain into a **compressor** with a generated impulse
response, so a level-up landing on four assembly clicks ducks instead of
clipping. Money blips walk up a pentatonic run when they cluster.

Cues: assembly, money, truck, levelup, unlock, upgrade, objective, click,
error. Mute persists to `localStorage`.

### Controls

`drag` pan · `wheel` zoom · `1`/`2`/`3` panels · `M` mute · `D` diagnostics
· `F` re-fit · `G` grid · `Space` pause · `Esc` close

## Extension points

Globals after boot: `GAME` (engine), `STATE` (economy), `VIEW` (binding).

```js
// ---- economy: everything a UI panel needs -------------------------
STATE.cash, STATE.level, STATE.xpProgress()
STATE.incomePerMinute()            // and lineIncomePerMinute(id)
STATE.throughputPerMinute(id), STATE.valuePerUnit(id)
STATE.upgradeCost(id, axis, n)     // n, or 'max'
STATE.upgradePreview(id, axis)     // {cost, gain, payback} for the button
STATE.buyUpgrade(id, axis, n)      // → {bought, spent}
STATE.unlockState(id)              // {levelMet, affordable, canUnlock, …}
STATE.unlockProduct(id)
STATE.activeObjectives()           // 3 × {name, label, progress, reward}
STATE.offlineReport                // welcome-back modal reads this
STATE.on('change'|'upgrade'|'unlock'|'levelup'|'objective'|'offline', fn)
PRODUCTS.Format.money / num / rate / time / stars

// ---- view: point the floor at a line ------------------------------
VIEW.setLine('kicks')

// ---- engine hooks (economy already owns onTick) -------------------
GAME.onRender    = (ctx, w, h) => {}      // screen-space overlay pass
GAME.onTileClick = ({gx, gy}) => {}       // tap on a floor tile
GAME.add(e) / GAME.remove(e) / GAME.byTag('conveyor') / GAME.pick(x, y)
GAME.paused = true
```

Entity `speed`, `cycle`, `active` and colour fields are plain mutable
properties, and `binding.js` already maps the economy onto them. HTML mount
points `#mount-left`, `#mount-right`, `#mount-bottom` are in place for the
UI panels.

## Testing

Driven headlessly with Playwright: 138 checks across the engine, the
economy and the shell — projection round-trips, depth ordering, income
identities, cost curves, offline payout at 3 h / 24 h-capped / clock-skew,
corrupt saves, every UI interaction, and each audio cue synthesising.
Balance is verified by simulating 30 days of greedy optimal play.
