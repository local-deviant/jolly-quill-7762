// Screenshot modes (?shot=title|race|boost|finish): put the game into a fixed,
// readable state so each screenshot shows one part of the loop. The race and
// boost shots fly on autopilot from a mid-race position; finish shows the
// results screen of a completed run.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { startPose } from './autopilot.js';

// Place the skiff on the line behind a gate, facing it, at speed.
// `behind` is how far back along the line to start.
function placeAtGate(game, sys, gateIndex, speed, behind = 26) {
  const { track, skiff } = sys;
  const gate = track.gates[gateIndex];
  const prev = track.gates[(gateIndex + track.gates.length - 1) % track.gates.length];
  const dir = new THREE.Vector3().subVectors(gate.pos, prev.pos).normalize();
  const pos = gate.pos.clone().addScaledVector(dir, -behind);
  pos.y = gate.pos.y;
  skiff.pos.copy(pos);
  skiff.yaw = Math.atan2(dir.x, dir.z);
  skiff.speed = speed;
  skiff.group.position.copy(pos);
  skiff.group.rotation.set(0, skiff.yaw, 0);
}

// Mark the first `count` gates passed and the first `orbs` orbs taken.
function presetProgress(sys, gatesPassed, orbsTaken) {
  const { track, gates, hazards } = sys;
  gates.gatesPassed = gatesPassed;
  gates.nextIndex = gatesPassed % CONFIG.gateCount;
  gates.lap = Math.floor(gatesPassed / CONFIG.gateCount) + 1;
  gates.paint();
  let taken = 0;
  for (const orb of track.orbs) {
    if (taken >= orbsTaken) break;
    orb.taken = true;
    orb.mesh.visible = false;
    taken++;
  }
  hazards.state.orbsTaken = taken;
}

export function applyShot(game, sys, shot) {
  const { track, skiff, gates, hazards, hud, audio } = sys;
  if (shot === 'title') {
    // The title screen over the orbiting track view: nothing to preset.
    hud.showScreen('title');
    return;
  }

  if (shot === 'race' || shot === 'boost') {
    // Mid-race on lap 1, autopilot flying, HUD alive.
    const { start, yaw } = startPose(track);
    game.state = 'racing';
    game.autopilot = true;
    game.timeLeft = shot === 'race' ? 118 : 96;
    game.raceTime = shot === 'race' ? 42 : 61;
    game.hull = shot === 'race' ? 100 : 75;
    game.orbitYaw = 0;
    game.orbitPitch = 0;
    gates.reset();
    hazards.reset();
    presetProgress(sys, shot === 'race' ? 5 : 8, shot === 'race' ? 7 : 11);
    // Boost shot starts right on the gate so the ring fills the frame.
    placeAtGate(game, sys, shot === 'race' ? 5 : 8, shot === 'race' ? 30 : 38, shot === 'boost' ? 14 : 26);
    if (shot === 'boost') {
      skiff.boost = 82;
      skiff.boosting = true;
      hud.showBanner('BOOST!', 3000);
    }
    hud.hideScreens();
    audio.engineOff();
    return;
  }

  if (shot === 'finish') {
    // A completed run: the win results screen with a real score breakdown.
    gates.reset();
    hazards.reset();
    gates.gatesPassed = CONFIG.gateCount * CONFIG.lapsToWin;
    gates.nextIndex = 0;
    gates.lap = CONFIG.lapsToWin;
    gates.paint();
    let taken = 0;
    for (const orb of track.orbs) {
      if (taken >= 19) break;
      orb.taken = true;
      orb.mesh.visible = false;
      taken++;
    }
    hazards.state.orbsTaken = taken;
    game.state = 'win';
    game.timeLeft = 34;
    game.raceTime = 132.4;
    game.score =
      taken * CONFIG.orbScore +
      gates.gatesPassed * CONFIG.gatePassScore +
      CONFIG.lapsToWin * CONFIG.lapBonus +
      Math.floor(game.timeLeft) * CONFIG.winTimeBonus;
    game.best = 132.4;
    placeAtGate(game, sys, 0, 0);
    // Make the HUD corners agree with the results screen behind it.
    hud.update({
      lap: CONFIG.lapsToWin,
      timeLeft: game.timeLeft,
      speed: 0,
      hull: 100,
      boost: 100,
      orbsTaken: taken,
      nextGateIndex: 0,
      gateBearing: 0,
      gateDist: 0,
      pos: skiff.pos,
      yaw: skiff.yaw,
    });
    hud.winStats.innerHTML =
      `TIME 2:12.4 &nbsp;·&nbsp; ORBS 19/${CONFIG.orbCount}<br>` +
      `GATES 36 × 100 &nbsp;·&nbsp; LAP BONUS ${CONFIG.lapsToWin * CONFIG.lapBonus}<br>` +
      `TIME BONUS ${Math.floor(game.timeLeft) * CONFIG.winTimeBonus} &nbsp;·&nbsp; <b>SCORE ${game.score}</b><br>` +
      `BEST TIME 2:12.4`;
    hud.showScreen('win');
    return;
  }

  // Unknown ?shot: fall back to the title screen.
  hud.showScreen('title');
}
