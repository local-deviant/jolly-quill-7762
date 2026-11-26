// Autopilot: steers the skiff toward the next gate, for the screenshot
// modes and as a demo driver. Returns the same input shape the keyboard
// produces: { thrust, brake, steer, boost }.
import { CONFIG } from './config.js';
import { forwardOf } from './skiff.js';

function angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function autopilotInput(skiff, targetPos, mines) {
  const dx = targetPos.x - skiff.pos.x;
  const dz = targetPos.z - skiff.pos.z;
  const desiredYaw = Math.atan2(dx, dz);
  let diff = angleDiff(desiredYaw, skiff.yaw);
  let thrust = Math.abs(diff) > 1.1 ? 0.35 : 1;
  // Dodge the nearest mine roughly ahead: turn away from it until clear.
  // Mines sit 11-22 units off the racing line and drift up to ~10 units on
  // lap 3, so a straight gate-to-gate line clips them without this.
  if (mines) {
    let threat = null;
    let threatD = 18;
    for (const mine of mines) {
      if (!mine.active) continue;
      const mx = mine.mesh.position.x - skiff.pos.x;
      const mz = mine.mesh.position.z - skiff.pos.z;
      const d = Math.hypot(mx, mz);
      if (d >= threatD) continue;
      // Only mines ahead of the skiff matter.
      const ahead = (mx * Math.sin(skiff.yaw) + mz * Math.cos(skiff.yaw)) / (d || 1);
      if (ahead < 0.3) continue;
      threatD = d;
      threat = { mx, mz };
    }
    if (threat) {
      const mineAngle = Math.atan2(threat.mx, threat.mz);
      const rel = angleDiff(mineAngle, skiff.yaw);
      // Mine on the left (rel < 0): turn right, and vice versa.
      diff = rel < 0 ? 0.9 : -0.9;
      thrust = 0.7;
    }
  }
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const dist = Math.hypot(dx, dz);
  // Slow down for a tight turn, boost on a long straight (never while dodging).
  const boost = Math.abs(diff) < 0.18 && dist > 60 && skiff.boost > 45;
  return { thrust, brake: false, steer, boost };
}

// Where the skiff should start a race: behind gate 1, facing gate 1.
export function startPose(track) {
  const g0 = track.gates[0].pos;
  const gLast = track.gates[track.gates.length - 1].pos;
  const dir = { x: g0.x - gLast.x, z: g0.z - gLast.z };
  const len = Math.hypot(dir.x, dir.z) || 1;
  const start = { x: g0.x - (dir.x / len) * 34, y: g0.y, z: g0.z - (dir.z / len) * 34 };
  const yaw = Math.atan2(g0.x - start.x, g0.z - start.z);
  return { start, yaw };
}
