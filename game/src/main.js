// AETHER RUSH — main loop, states, input, scoring. Wires every system
// together: track, skiff, gates, hazards, HUD, audio, autopilot.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { mulberry32 } from './random.js';
import { buildTrack } from './track.js';
import { createSkiff, updateSkiff, resetSkiff, forwardOf } from './skiff.js';
import { createGateTracker, nextGate, nextGateDistance } from './gates.js';
import { createHazards, createParticles } from './hazards.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { autopilotInput, startPose } from './autopilot.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 140, 950);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2200);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a1840, 1.15);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffb060, 1.6);
sunLight.position.set(-300, 160, -220);
scene.add(sunLight);

const rng = mulberry32(CONFIG.seed);
const track = buildTrack(scene, rng);
const skiff = createSkiff(scene);
const gates = createGateTracker(track);
const hazards = createHazards(track);
const particles = createParticles(scene);
const hud = createHud(track);
const audio = createAudio();

const game = {
  state: 'title',
  timeLeft: CONFIG.startTime,
  raceTime: 0,
  hull: CONFIG.hullMax,
  score: 0,
  autopilot: false,
  muted: false,
  countdownT: 0,
  countdownShown: 4,
  elapsed: 0,
  orbitYaw: 0,
  orbitPitch: 0,
  best: null,
};

try {
  const saved = window.localStorage.getItem('aether-rush-best');
  if (saved !== null) game.best = Number(saved);
} catch (err) {
  game.best = null;
}

function fmtTime(seconds) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
}

function completedLaps() {
  return game.state === 'win' ? CONFIG.lapsToWin : gates.lap - 1;
}

function computeScore() {
  return (
    hazards.state.orbsTaken * CONFIG.orbScore +
    gates.gatesPassed * CONFIG.gatePassScore +
    completedLaps() * CONFIG.lapBonus +
    (game.state === 'win' ? Math.floor(game.timeLeft) * CONFIG.winTimeBonus : 0)
  );
}

function refreshScore() {
  game.score = computeScore();
}

function startRace() {
  const { start, yaw } = startPose(track);
  resetSkiff(skiff, new THREE.Vector3(start.x, start.y, start.z), yaw);
  gates.reset();
  hazards.reset();
  game.timeLeft = CONFIG.startTime;
  game.raceTime = 0;
  game.hull = CONFIG.hullMax;
  game.autopilot = false;
  game.orbitYaw = 0;
  game.orbitPitch = 0;
  refreshScore();
  game.state = 'countdown';
  game.countdownT = 3.4;
  game.countdownShown = 4;
  hud.hideScreens();
  hud.showScreen('countdown');
  audio.resume();
}

function finishWin() {
  game.state = 'win';
  refreshScore();
  audio.engineOff();
  audio.fanfare();
  const total = game.raceTime;
  if (game.best === null || total < game.best) {
    game.best = total;
    try {
      window.localStorage.setItem('aether-rush-best', String(total));
    } catch (err) {}
  }
  const winBonus = Math.floor(game.timeLeft) * CONFIG.winTimeBonus;
  hud.winStats.innerHTML =
    `TIME ${fmtTime(total)} &nbsp;·&nbsp; ORBS ${hazards.state.orbsTaken}/${CONFIG.orbCount}<br>` +
    `GATES ${gates.gatesPassed} × 100 &nbsp;·&nbsp; LAP BONUS ${completedLaps() * CONFIG.lapBonus}<br>` +
    `TIME BONUS ${winBonus} &nbsp;·&nbsp; <b>SCORE ${game.score}</b><br>` +
    `BEST TIME ${fmtTime(game.best)}`;
  hud.showScreen('win');
}

function finishLose(reason) {
  game.state = 'lose';
  refreshScore();
  audio.engineOff();
  hud.loseReason.textContent = reason;
  hud.loseStats.innerHTML =
    `LAPS ${gates.lap - 1} &nbsp;·&nbsp; ORBS ${hazards.state.orbsTaken}/${CONFIG.orbCount}<br>` +
    `GATES ${gates.gatesPassed} &nbsp;·&nbsp; <b>SCORE ${game.score}</b>`;
  hud.showScreen('lose');
}

// ------------------------------------------------------------ input

const keys = new Set();
let dragging = false;
let lastPointer = { x: 0, y: 0 };

function readInput() {
  const steer =
    (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0) +
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  return {
    thrust: keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0,
    brake: keys.has('KeyS') || keys.has('ArrowDown'),
    steer,
    boost: keys.has('Space'),
  };
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  audio.resume();
  if (e.code === 'Enter') {
    if (game.state === 'title') startRace();
    else if (game.state === 'win' || game.state === 'lose') startRace();
  }
  if (e.code === 'KeyR') {
    if (game.state === 'paused' || game.state === 'win' || game.state === 'lose' || game.state === 'racing') startRace();
  }
  if (e.code === 'KeyP') {
    if (game.state === 'racing') {
      game.state = 'paused';
      audio.engineOff();
      hud.showScreen('paused');
    } else if (game.state === 'paused') {
      game.state = 'racing';
      hud.hideScreens();
    }
  }
  if (e.code === 'KeyM') {
    game.muted = !game.muted;
    audio.setMuted(game.muted);
    hud.showBanner(game.muted ? 'SOUND OFF (M to unmute)' : 'SOUND ON', 1400);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastPointer = { x: e.clientX, y: e.clientY };
  audio.resume();
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  game.orbitYaw -= (e.clientX - lastPointer.x) * 0.005;
  game.orbitPitch += (e.clientY - lastPointer.y) * 0.004;
  game.orbitPitch = Math.max(-0.25, Math.min(0.6, game.orbitPitch));
  lastPointer = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => {
  dragging = false;
});

document.getElementById('btn-start').addEventListener('click', () => {
  audio.resume();
  startRace();
});
document.getElementById('btn-again-win').addEventListener('click', startRace);
document.getElementById('btn-again-lose').addEventListener('click', startRace);
document.getElementById('btn-resume').addEventListener('click', () => {
  if (game.state === 'paused') {
    game.state = 'racing';
    hud.hideScreens();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------ camera

function chaseCamera(dt) {
  const forward = forwardOf(skiff);
  const back = 15;
  const up = 5.5 + game.orbitPitch * 14;
  const yaw = skiff.yaw + game.orbitYaw;
  const cx = skiff.pos.x - Math.sin(yaw) * back;
  const cz = skiff.pos.z - Math.cos(yaw) * back;
  camera.position.lerp(new THREE.Vector3(cx, skiff.pos.y + up, cz), Math.min(1, dt * 7));
  camera.lookAt(skiff.pos.x + forward.x * 12, skiff.pos.y + 1, skiff.pos.z + forward.z * 12);
}

function orbitCamera(dt, target, radius, height) {
  const a = game.elapsed * 0.08;
  const want = new THREE.Vector3(target.x + Math.cos(a) * radius, target.y + height, target.z + Math.sin(a) * radius);
  camera.position.lerp(want, Math.min(1, dt * 2));
  camera.lookAt(target.x, target.y, target.z);
}

// ------------------------------------------------------------ loop

const clock = new THREE.Clock();
let titleBestShown = false;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.elapsed += dt;

  // Clouds drift on the elapsed time alone: the same on every run.
  for (const cloud of track.clouds) {
    cloud.group.position.x = cloud.baseX + Math.sin(game.elapsed * 0.02 * cloud.speed + cloud.phase) * 24;
  }
  particles.update(dt);
  gates.update(dt);

  if (game.state === 'title') {
    if (!titleBestShown) {
      titleBestShown = true;
      hud.best.textContent = game.best === null ? 'BEST TIME —' : `BEST TIME ${fmtTime(game.best)}`;
    }
    orbitCamera(dt, new THREE.Vector3(0, 30, 0), 330, 90);
    hud.showScreen('title');
  } else if (game.state === 'countdown') {
    game.countdownT -= dt;
    const shown = Math.ceil(game.countdownT);
    const num = document.getElementById('countdown-num');
    if (shown !== game.countdownShown) {
      game.countdownShown = shown;
      if (shown > 0) {
        num.textContent = String(shown);
        audio.beep(false);
      } else {
        num.textContent = 'GO!';
        audio.beep(true);
      }
    }
    chaseCamera(dt);
    if (game.countdownT <= 0) {
      game.state = 'racing';
      hud.hideScreens();
    }
  } else if (game.state === 'racing') {
    game.raceTime += dt;
    game.timeLeft -= dt;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      finishLose('TIME UP — the countdown hit zero.');
    } else {
      const input = game.autopilot ? autopilotInput(skiff, nextGate(track, gates).pos, track.mines) : readInput();
      const targetY = nextGate(track, gates).pos.y;
      updateSkiff(skiff, input, targetY, dt);
      audio.engine(Math.min(skiff.speed / CONFIG.maxSpeed, 1), skiff.boosting);

      const gateEvent = gates.checkPass(skiff.pos);
      if (gateEvent === 'gate') {
        game.timeLeft += CONFIG.gateTimeBonus;
        audio.chime();
        particles.burst(nextGate(track, gates).pos, PALETTE.gatePassed, 26, 22);
        hud.showBanner(`GATE +100 &nbsp;·&nbsp; +${CONFIG.gateTimeBonus}s`, 1400);
        refreshScore();
      } else if (gateEvent === 'lap') {
        audio.lap();
        hud.showBanner(`LAP ${gates.lap} &nbsp;·&nbsp; +${CONFIG.lapBonus}`, 2000);
        refreshScore();
      } else if (gateEvent === 'win') {
        particles.burst(skiff.pos, PALETTE.gatePassed, 60, 30);
        finishWin();
      } else if (gateEvent === 'wrong') {
        audio.wrong();
        hud.showBanner('WRONG GATE — follow the cyan ring', 1400);
      }

      const hit = hazards.check(skiff.pos);
      if (hit.orb) {
        skiff.boost = Math.min(CONFIG.boostMax, skiff.boost + CONFIG.orbBoost);
        audio.blip();
        particles.burst(skiff.pos, PALETTE.orb, 12, 12);
        refreshScore();
      }
      if (hit.mine) {
        game.hull -= CONFIG.mineDamage;
        hazards.knockback(skiff, hit.mine);
        audio.explosion();
        particles.burst(skiff.pos, PALETTE.mine, 40, 26);
        hud.showBanner(`MINE HIT — HULL -${CONFIG.mineDamage}`, 1600);
        if (game.hull <= 0) {
          game.hull = 0;
          finishLose('HULL DESTROYED — a mine finished the skiff.');
        }
      }
      if (hit.pad) {
        skiff.boost = CONFIG.boostMax;
        audio.whoosh();
        hud.showBanner('BOOST REFILLED', 1400);
      }
      hazards.update(dt, gates.lap, game.elapsed);

      // The gate or mine above may have ended the race (win/lose): when
      // state is no longer 'racing', nextGate() can be past the last gate
      // (nextIndex == gateCount on the win frame), so skip the HUD block
      // and let the win/lose branch take over next frame.
      if (game.state === 'racing') {
        const gate = nextGate(track, gates);
        const dx = gate.pos.x - skiff.pos.x;
        const dz = gate.pos.z - skiff.pos.z;
        hud.update({
          lap: gates.lap,
          timeLeft: game.timeLeft,
          speed: skiff.speed,
          hull: game.hull,
          boost: skiff.boost,
          orbsTaken: hazards.state.orbsTaken,
          nextGateIndex: gates.nextIndex,
          gateBearing: Math.atan2(dx, dz),
          gateDist: Math.hypot(dx, dz),
          pos: skiff.pos,
          yaw: skiff.yaw,
        });
        chaseCamera(dt);
      }
    }
  } else if (game.state === 'paused') {
    // Frozen frame; the pause overlay stays up.
  } else if (game.state === 'win' || game.state === 'lose') {
    orbitCamera(dt, skiff.pos, 42, 14);
  }

  renderer.render(scene, camera);
}

// Screenshot modes (?shot=title|race|boost|finish) set up a fixed state.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) applyShot(game, { track, skiff, gates, hazards, hud, audio }, shot);
else hud.showScreen('title');

tick();

// Test hook: the play-test reads state, score and errors through this.
window.__game = {
  get state() {
    return game.state;
  },
  get score() {
    return game.score;
  },
  get lap() {
    return gates.lap;
  },
  get timeLeft() {
    return game.timeLeft;
  },
  get hull() {
    return game.hull;
  },
  get orbsTaken() {
    return hazards.state.orbsTaken;
  },
  get gatesPassed() {
    return gates.gatesPassed;
  },
  startRace,
  game,
  skiff,
};
