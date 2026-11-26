SPDX-License-Identifier: MIT

# AETHER RUSH — a 3D hover-racer

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/local-deviant/best-game-01-ours/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/local-deviant/best-game-01-ours/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)


Pilot a hover-skiff through a floating sky-island circuit at sunset. Fly the
loop of 12 glowing ring gates, 3 laps, against the countdown.

## The goal

Finish 3 laps before the timer hits zero. Win by crossing the finish gate on
lap 3 in time. Lose if the countdown reaches zero or your hull is destroyed
by mines.

- **Gates:** fly the next gate (cyan) in order for +100 score and +6 seconds.
  A gate flown out of order flashes red and scores nothing.
- **Orbs:** 24 energy orbs along the racing line, +50 score each and +10 boost.
- **Boost pads:** 4 glowing pads refill the boost meter. Hold SPACE to spend
  boost for a speed burst.
- **Mines:** floating mines near the line cost 25 hull and knock you back.
  They drift on lap 2, faster on lap 3 — and 4 extra mines wake up on lap 3.
- **Score:** orbs × 50 + gates × 100 + 500 per lap + time bonus on a win
  (seconds left × 20).

## Controls

- **W / ↑** thrust, **S / ↓** brake, **A D / ← →** steer
- **SPACE** boost, **P** pause, **R** restart, **M** mute, **ENTER** start
- Drag the mouse to orbit the camera (chase cam by default)

The HUD shows lap, time left, speed, hull and boost bars, orbs collected,
the next-gate arrow and distance, and a top-down minimap of gates, mines
and your skiff.

## Sound

All sound is procedural WebAudio — an engine hum pitched with speed, gate
chimes, orb blips, mine explosions, a boost whoosh, countdown beeps and a
win fanfare. No audio files.

## Files

- `game/index.html` — page, HUD, import map
- `game/src/config.js` — constants (track, laps, timer, scoring)
- `game/src/random.js` — seeded RNG (mulberry32)
- `game/src/track.js` — islands, gates, orbs, mines, boost pads
- `game/src/skiff.js` — skiff mesh and flight model
- `game/src/gates.js` — gate order, pass detection, lap counting
- `game/src/hazards.js` — mine drift and collisions, orb pickup, pads
- `game/src/hud.js` — HUD readouts and minimap
- `game/src/audio.js` — procedural WebAudio sounds
- `game/src/autopilot.js` — auto-drive toward the next gate
- `game/src/shots.js` — screenshot setups (?shot=title|race|boost|finish)
- `game/src/main.js` — game loop, states, input, scoring
- `game/vendor/three.module.min.js` — vendored three.js r160
- `main.ts` — entrypoint: hands the game in, `--check`, `--serve`
- `vendor/makefun-game.ts` — make.fun dossier library (kit copy, unchanged)

The track is built from a fixed seed, so the circuit is identical on every
run. No network at runtime: every file the game loads lives under `game/`.

## Play locally

```sh
node serve.ts
# open http://127.0.0.1:8080
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node main.ts --check
```

## License

MIT. Entry for the make.fun best-game-01 bounty.

---

<sub>Entered on [make.fun](https://make.fun/?ref=njrtxptt&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
