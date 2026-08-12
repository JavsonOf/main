# ISO FACTORY — 2.5D Isometric Idle Factory

A browser game built on a hand-rolled HTML5 Canvas isometric renderer. No
libraries, no build step — open `index.html`.

**Step 1 (this commit): the rendering engine.** No economy, no menus, no
audio yet — those attach to the hooks listed below.

```
index.html        markup + reserved Step-2 mount points
css/style.css     dark industrial theme, HUD chrome
js/iso.js         projection math, camera, colour, draw primitives
js/entities.js    every procedural prop (belts, arms, trucks, props)
js/engine.js      render list, sim loop, input, factory layout
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

## Step-2 attachment points

```js
const g = window.GAME;

g.onTick     = (dt, time) => {}   // fixed 60 Hz — run the economy here
g.onRender   = (ctx, w, h) => {}  // screen-space overlay pass
g.onTileClick= ({gx, gy}) => {}   // tap on a floor tile

conveyor.onDeliver = item => {}   // item ran off the end
conveyor.spawnItem(kind)          // push a payload onto the belt
arm.onPlace  = arm => {}          // released at its place point
truck.onArrive / truck.onDepart   // dock berth events
truck.canStart = () => bool       // gate the lane

g.add(e) / g.remove(e) / g.byTag('conveyor') / g.pick(clientX, clientY)
g.paused = true
```

Every entity's `speed`, `cycle`, `active`, and colour fields are plain
mutable properties — upgrades in Step 2 just assign to them. HTML mount
points `#mount-left`, `#mount-right`, `#mount-bottom` are already in place
for the UI.

## Controls

drag = pan · wheel = zoom · `F` = re-fit · `G` = grid · `Space` = pause
