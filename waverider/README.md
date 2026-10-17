# Wave Rider (remake)

A fan remake of the browser surfing game *Wave Rider*, rebuilt from gameplay footage
(`gameplay_1080p30.mp4` in this folder). Everything here — code, 3D models, textures,
UI art, sounds and music — is original and generated procedurally in the browser.

## Play

Open `index.html` in a browser. No build step and no server needed (three.js is
bundled in `lib/`). It also works when hosted as static files, e.g. GitHub Pages.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | ← → / A D | drag sideways |
| Jump | ↑ / W / Space | swipe up |
| Dive | ↓ / S | swipe down |
| Pause | Esc / P | — |

## What's in it

- First-person endless river run with distance (M), score (+1 every 5 M) and seashells.
- Zones that rotate as you ride: jungle river, flooded forest with fallen logs,
  fisherman village, fallen city, stone water-bridges, ravine, sewer tunnel and waterfall drops.
- Two-sided board damage: clip something and you're swerved away with a cracked side;
  hit a cracked side again or anything head-on and the run ends.
- Jump over low obstacles, dive under hanging logs and pipes, dive into turtles to get launched.
- Land on boats, docks and fallen slabs.
- Powerups: wrench (repairs a side), freeze (−25% speed), shield (blocks one hit),
  magnet (pulls shells), star (double points) — 15 seconds each, rarer in Hard Mode.
- Normal / Hard mode (faster, denser, darker water), separate bests.
- Continue screen (costs seashells, price doubles each time) and results screen.
- First-run tutorial that pauses and prompts for steer / jump / dive.
- Shop with 9 boards (speed / accel / turn stats), daily missions, tiered achievements,
  local leaderboard, settings (name, sound, music, popups, reset).

Progress is saved in the browser's localStorage.

## Not included

The original's online features (recovery-ID accounts, global leaderboards, messages,
feedback form) need a server, so they're replaced with local equivalents or left out.
The footage had no audio track, so all sound and music are new.

## Files

- `index.html`, `style.css` — page, HUD and menus
- `js/util.js` — helpers and the low-poly geometry builder
- `js/textures.js` — board paint jobs, icons, particles, clouds
- `js/world.js` — river chunks, zones, obstacles, collectibles, water shaders
- `js/game.js` — player physics, collisions, camera, run lifecycle
- `js/ui.js` — panels, shop, HUD, overlays
- `js/save.js` — progress, missions, achievements, leaderboard
- `js/audio.js` — synthesized sound effects and music
