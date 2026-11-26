// Gate order logic: the next gate in sequence, pass detection, lap counting.
// A gate flown through out of order flashes red and scores nothing.
import { CONFIG } from './config.js';
import { setGateState } from './track.js';

export function createGateTracker(track) {
  const tracker = {
    nextIndex: 0,
    gatesPassed: 0,
    lap: 1,
    wrongFlash: 0,
  };

  function paint() {
    for (const gate of track.gates) {
      if (gate.index < tracker.nextIndex) setGateState(gate, 'passed');
      else if (gate.index === tracker.nextIndex) setGateState(gate, 'next');
      else setGateState(gate, 'up');
    }
  }

  // Returns 'gate' (next gate passed), 'lap' (last gate of a lap), 'win'
  // (last gate of lap 3), 'wrong' (another gate flown through), or null.
  function checkPass(pos) {
    for (const gate of track.gates) {
      // A gate already passed this lap cannot be passed again: the skiff is
      // still inside its ring for a few frames after flying through it, and
      // that must not read as a wrong gate.
      if (gate.index < tracker.nextIndex) continue;
      if (pos.distanceTo(gate.pos) > CONFIG.gateRadius) continue;
      if (gate.index === tracker.nextIndex) {
        tracker.gatesPassed++;
        tracker.nextIndex++;
        if (tracker.nextIndex >= CONFIG.gateCount) {
          if (tracker.lap >= CONFIG.lapsToWin) {
            paint();
            return 'win';
          }
          tracker.lap++;
          tracker.nextIndex = 0;
          paint();
          return 'lap';
        }
        paint();
        return 'gate';
      }
      // Wrong gate: flash it red briefly, no score.
      setGateState(gate, 'wrong');
      tracker.wrongFlash = 0.7;
      return 'wrong';
    }
    return null;
  }

  function update(dt) {
    if (tracker.wrongFlash > 0) {
      tracker.wrongFlash -= dt;
      if (tracker.wrongFlash <= 0) paint();
    }
  }

  function reset() {
    tracker.nextIndex = 0;
    tracker.gatesPassed = 0;
    tracker.lap = 1;
    tracker.wrongFlash = 0;
    paint();
  }

  // Attach the methods to the live tracker object (no copy: lap and
  // nextIndex must stay current for the HUD and the main loop).
  tracker.checkPass = checkPass;
  tracker.update = update;
  tracker.reset = reset;
  tracker.paint = paint;
  paint();
  return tracker;
}

// The next gate the skiff must fly through.
export function nextGate(track, tracker) {
  return track.gates[tracker.nextIndex];
}

// Distance from the skiff to the next gate, for the HUD arrow.
export function nextGateDistance(track, tracker, pos) {
  return pos.distanceTo(track.gates[tracker.nextIndex].pos);
}
