# ISO FACTORY — 2.5D Isometric Idle Factory

A browser game built on a hand-rolled HTML5 Canvas isometric renderer. No
libraries, no build step — open `index.html`.

**Step 1: the rendering engine. Step 2: the idle economy.** Menus and audio
are still to come; they attach to the hooks listed below.

```
index.html        markup + reserved UI mount points
css/style.css     dark industrial theme, HUD chrome
js/iso.js         projection math, camera, colour, draw primitives
js/entities.js    every procedural prop (belts, arms, trucks, props)
js/engine.js      render list, sim loop, input, factory layout
js/products.js    product registry, upgrade axes, level curve, objectives
js/economy.js     mutable state: income, offline, autosave, unlocks
js/binding.js     the seam: economy → renderer
```

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

## Step-3 attachment points

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

## Controls

drag = pan · wheel = zoom · `F` = re-fit · `G` = grid · `Space` = pause
