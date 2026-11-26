// Hazards and pickups: mine drift and collisions, orb collection, boost pads.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

export function createHazards(track) {
  const state = { orbsTaken: 0, minesHit: 0 };

  function reset() {
    state.orbsTaken = 0;
    state.minesHit = 0;
    for (const orb of track.orbs) {
      orb.taken = false;
      orb.mesh.visible = true;
    }
    for (const mine of track.mines) mine.mesh.visible = mine.active;
    for (const pad of track.pads) pad.cooldown = 0;
  }

  // Drift mines slowly on lap 2, faster on lap 3; lap-3 mines wake up then.
  // Returns nothing; positions are visual plus collision.
  function update(dt, lap, elapsed) {
    const drift = lap >= 3 ? CONFIG.mineDriftLap3 : lap === 2 ? CONFIG.mineDriftLap2 : 0;
    for (const mine of track.mines) {
      if (lap >= 3) mine.active = true;
      mine.mesh.visible = mine.active;
      if (!mine.active || drift === 0) continue;
      const w = elapsed * 0.55 + mine.phase;
      mine.mesh.position.set(
        mine.base.x + Math.sin(w) * drift * 2.2,
        mine.base.y + Math.sin(w * 1.3) * drift * 1.1,
        mine.base.z + Math.cos(w * 0.8) * drift * 2.2,
      );
      mine.mesh.rotation.y += dt * 0.8;
      mine.mesh.rotation.x += dt * 0.35;
    }
    // Orbs bob and spin in place.
    for (const orb of track.orbs) {
      if (orb.taken) continue;
      orb.mesh.position.y = orb.pos.y + Math.sin(elapsed * 2 + orb.phase) * 0.8;
      orb.mesh.rotation.y += dt * 1.5;
    }
    for (const pad of track.pads) {
      if (pad.cooldown > 0) pad.cooldown -= dt;
      const s = 1 + Math.sin(elapsed * 3 + pad.pos.x) * 0.06;
      pad.mesh.scale.set(s, s, 1);
    }
  }

  // Check pickups and collisions at the skiff's position.
  // Returns { orb: bool, mine: mine|null, pad: bool } for this frame.
  function check(pos) {
    const out = { orb: false, mine: null, pad: false };
    for (const orb of track.orbs) {
      if (orb.taken) continue;
      if (pos.distanceTo(orb.mesh.position) < CONFIG.orbRadius + 1.6) {
        orb.taken = true;
        orb.mesh.visible = false;
        state.orbsTaken++;
        out.orb = true;
      }
    }
    for (const mine of track.mines) {
      if (!mine.active) continue;
      if (pos.distanceTo(mine.mesh.position) < CONFIG.mineRadius + 2.4) {
        out.mine = mine;
        state.minesHit++;
      }
    }
    for (const pad of track.pads) {
      if (pad.cooldown > 0) continue;
      const d = new THREE.Vector3(pos.x - pad.pos.x, 0, pos.z - pad.pos.z).length();
      if (d < CONFIG.padRadius && Math.abs(pos.y - pad.pos.y) < 6) {
        pad.cooldown = 3;
        out.pad = true;
      }
    }
    return out;
  }

  // Push the skiff away from a mine it just hit.
  function knockback(skiff, mine) {
    const away = new THREE.Vector3().subVectors(skiff.pos, mine.mesh.position).setY(0).normalize();
    skiff.pos.addScaledVector(away, 7);
    skiff.speed = Math.max(6, skiff.speed * 0.35);
  }

  return { state, reset, update, check, knockback };
}

// Burst particles: a reusable pool of glowing points, spawned on gate passes
// (green), mine hits (red) and orb pickups (gold).
export function createParticles(scene) {
  const max = 320;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < max; i++) {
    parts.push({ life: 0, vel: new THREE.Vector3(), active: false });
    pos[i * 3 + 1] = -999;
  }
  const color = new THREE.Color();
  let cursor = 0;

  function burst(at, hex, count, speed) {
    color.setHex(hex);
    for (let n = 0; n < count; n++) {
      const p = parts[cursor];
      const i = cursor;
      cursor = (cursor + 1) % max;
      p.active = true;
      p.life = 0.9;
      p.vel.set(
        (Math.sin(i * 12.9898) * 43758.5453 % 1) * 2 - 1,
        (Math.sin(i * 78.233) * 12543.1234 % 1) * 2 - 1,
        (Math.sin(i * 39.346) * 98765.4321 % 1) * 2 - 1,
      ).normalize().multiplyScalar(speed * (0.5 + (i % 5) / 8));
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    geo.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    for (let i = 0; i < max; i++) {
      const p = parts[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        pos[i * 3 + 1] = -999;
        continue;
      }
      pos[i * 3] += p.vel.x * dt;
      pos[i * 3 + 1] += p.vel.y * dt;
      pos[i * 3 + 2] += p.vel.z * dt;
      p.vel.multiplyScalar(1 - 1.6 * dt);
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { burst, update };
}
