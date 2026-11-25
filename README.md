# Felt Links

A side-on physics crazy-golf game for the browser: flick a wooly pompom across hand-made felt and patchwork landscapes stitched onto a quilt, and sink it in a buttonhole in as few strokes as you can.

**Play:** https://gorzawebk.github.io/Felt-Links/

Plays on PC (mouse, keyboard or gamepad) and on phones and tablets (touch, portrait or landscape). There is no timer, ever. Everything is made in code: the felt and fabric textures, the quilt, the pompom, the favicon, every sound effect and the music. There are no image or audio files.

*"Felt Links" is a working title.*

## Controls

| Action | Mouse / touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Aim and set power | Press anywhere, pull back like a catapult | ← → aim, ↑ ↓ power (hold Shift for fine aim) | Left stick aims, d-pad / LB RB fine aim, d-pad ↑ ↓ power |
| Shoot | Let go | Space (or Enter) | Squeeze the right trigger and let go, or press A |
| Cancel a shot | Pull back to the start, or right-click | Esc | — |
| Look at the whole hole | ⤢ button | O | X |
| Restart the hole | ↺ button | R | Y |
| Pause | Ⅱ button | Esc or P | Start |
| Mute | — | M | Back / Select |
| Menus | Tap or click | Arrow keys, Enter, Esc | D-pad or stick, A, B |

Every keyboard action except Esc can be rebound in **the button tin** (Settings); the choice is saved on the device.

## How to play

Each hole is a little diorama seen from the side. Pull back from the pompom (or from anywhere on the screen) to aim: a running stitch shows the line the shot sets off on, and a tape measure at the bottom shows the power. Let go to shoot. You can only shoot when the pompom has come to rest.

- **Par and thimbles.** Every hole has a par. Finish at or under par for **3 gold thimbles**, one over for **2**, and any finish for **1**.
- **Courses.** Three courses of nine holes: **Meadow Quilt**, **Seaside Bunting** and **Attic Sewing Box**. Collect **15 thimbles** in a course to unlock the next. Pick any hole on an unlocked course and the round carries on from there.
- **The scorecard** is a cross-stitch sampler that stitches in each hole as you finish it.
- **Daily hole.** A hole built from the date, the same for everyone that day, with your best score kept on the device.
- **Stuck?** After par + 3 strokes the pause menu lets you pick up and move on (no thimbles).

### Fabrics

| Surface | How it plays | Marked with |
| --- | --- | --- |
| Felt | Grippy: stops quickly and holds a slope | plain, stitched |
| Satin | Slippery: barely stops | `~` |
| Corduroy | Bumpy: little hops over the ridges | `\|\|\|` |
| Denim | Fast: keeps rolling | `///` |

### Notions and hazards

Each is introduced on its own hole with a chalk note before it is mixed with others.

| Thing | What it does |
| --- | --- |
| Elastic bands | Bumpers: twang the pompom back at least as fast as it came |
| Felt water | Ball out: +1 stroke and back to where you last stopped. Wave-stitched, with a wave tag |
| Spinning buttons | Carry and fling you; a chain of them is a ferry. An arrow on each shows the spin |
| Zips | Conveyor belts; the pull tab and arrow show which way they run |
| Ribbon bridges | Sag under the pompom and slow it down |
| Pincushions | Pins snag wool: +1 stroke. Spiky, with a hatched triangle tag |
| The sewing-machine needle | Bobs up and down; wait for it to lift. The machine whirrs louder as you get close |
| Cotton reels | Rollers that spin as you cross; some are motor-driven |
| Loose threads | Snag the pompom and take most of its speed |
| Hand fans | Blow you along (and up) while you're in the draught |

## Look, sound and accessibility

- **Textiles everywhere:** felt made from noise and fibres, corduroy ribs, satin sheen, denim twill, gingham and dot prints, running-stitch outlines, pinked (zig-zag) edges and soft fabric shadows. Palette: warm oatmeal, mustard, rust, sage, dusty rose and denim, in warm afternoon light.
- **Menus are objects:** the main menu is a sewing-pattern envelope, course select is three fabric swatches pinned to a corkboard, the scorecard is a cross-stitch sampler, settings is a tin of buttons (toggles are buttons that are sewn on or loose).
- **Type:** Fredoka (rounded) for display and labels, Gochi Hand for tailor's-chalk notes, both from Google Fonts with system fallbacks.
- **Small satisfactions:** the cloth wobbles where the pompom lands, a thread unspools as a hole opens, a felt panel stitches across between holes, the flag is an embroidered pennant, and the pompom pops into the buttonhole with a little music-box flourish.
- **Sound** is synthesised with the Web Audio API: soft woolly thuds that change with the fabric, a woody plip for buttons and reels, an elastic twang, the sewing-machine whirr, zip ticks, a felt splash, the pop into the cup. **Music** is generated live, one theme per course: plucked strings (Meadow), ukulele strums (Seaside), a music-box waltz (Attic) and a lullaby on the menus. Separate music and effects volumes; M mutes.
- **Accessibility:** hazards are marked by shape and pattern as well as colour (wave tags on water, hatched triangle tags on pins, striped needle bar, symbols on fabrics); a reduced-motion option (no wobbles, sweeps, waving or camera glide); a larger-text option; every menu works with keyboard, gamepad and touch.

## Running locally

```bash
npm install
npm run dev           # dev server at http://localhost:5173 (also on your LAN for phone testing)
npm run check:holes   # prove every hole can be completed and its par is fair
npm run build         # static site in dist/
npm run preview
```

`npm run check:holes` runs a robot golfer over every hole (and the next ten daily holes) using the real simulation. It searches a grid of shots, plus waiting for the needle or fan where a hole has them, and only counts a finish if it still goes in when the aim is 1° off or the power is 2.5% off. A par is fair when *robot best ≤ par ≤ robot best + 1*. Options: `--only=m1,s3`, `--daily=30`, `--quick`.

Testing helpers: `window.feltLinks` in the console gives you the `game`, the `renderer`, `startRound(course, hole)`, `startDaily()` and `shoot(angle, power)`.

## Code layout

Plain JavaScript ES modules and [Vite](https://vite.dev), drawn with Canvas 2D. No framework, no physics engine and no runtime dependencies.

| File | What it does |
| --- | --- |
| `src/main.js` | Start-up, the game loop and the flow of a round |
| `src/physics.js` | Small physics module: circle against segments and circles, contacts with moving surfaces, surface table, segment grid |
| `src/sim.js` | One hole as a simulation: ground, cup, obstacles, hazards, settling. No DOM, shared with the checker |
| `src/holes/meadow.js`, `seaside.js`, `attic.js` | The 27 holes as data |
| `src/holes/index.js` | Courses, thimbles and unlock rules |
| `src/holes/daily.js` | The daily hole, built from a seed hashed from the date |
| `src/render.js` | Canvas renderer: camera, the static diorama layer, obstacles, pompom, aim stitch, effects, transitions |
| `src/art.js` | Textile art: fabric tiles, stitches, pinking, the pompom, the favicon, CSS textures |
| `src/audio.js` | Synthesised sound effects and generative music |
| `src/ui.js` | Pattern envelope, corkboard, pause patch, instructions, button tin and the HUD |
| `src/sampler.js` | The cross-stitch sampler scorecard |
| `src/input.js` | Mouse, touch, keyboard (rebindable) and gamepad input, menu navigation |
| `src/storage.js` | Progress, best scores, daily results, settings and bindings in `localStorage` |
| `src/rng.js` | Seeded random numbers and date keys |
| `src/style.css` | The textile menus and HUD, responsive layout |
| `tools/check-holes.mjs` | `npm run check:holes` |

## Deployment

Every push to `main` checks the holes, builds the game and publishes it to GitHub Pages via `.github/workflows/deploy.yml` (Vite's `base` is `/Felt-Links/`). One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
