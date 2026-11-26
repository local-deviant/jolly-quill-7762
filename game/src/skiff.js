// The hover-skiff: its mesh and its flight model (thrust, steering, drag,
// boost, automatic altitude toward the next gate).
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

// A low-poly dart: hull, cockpit, twin engines, glowing trim.
export function createSkiff(scene) {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: PALETTE.skiff,
    metalness: 0.55,
    roughness: 0.35,
    flatShading: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: PALETTE.skiffTrim,
    emissive: PALETTE.skiffTrim,
    emissiveIntensity: 1.8,
    roughness: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1a26, metalness: 0.7, roughness: 0.4 });

  const hull = new THREE.Mesh(new THREE.ConeGeometry(1.7, 5.4, 4), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.rotation.y = Math.PI / 4;
  hull.scale.set(1, 1, 0.55);
  group.add(hull);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), new THREE.MeshStandardMaterial({
    color: 0x9fe8ff, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.85,
  }));
  canopy.position.set(0, 0.75, 0.6);
  canopy.scale.set(1, 0.7, 1.5);
  group.add(canopy);

  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.2, 8), darkMat);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 1.5, -0.15, -1.6);
    group.add(engine);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: PALETTE.skiffTrim }));
    glow.position.set(side * 1.5, -0.15, -2.75);
    glow.rotation.y = Math.PI;
    group.add(glow);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.6), hullMat);
    wing.position.set(side * 1.9, -0.1, -0.4);
    group.add(wing);
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 4.6), trimMat);
  stripe.position.set(0, 0.62, -0.2);
  group.add(stripe);

  scene.add(group);

  // Exhaust trail: a fading line of points behind the engines.
  const trailCount = 90;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(trailCount * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    color: PALETTE.skiffTrim, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.55,
  }));
  trail.frustumCulled = false;
  scene.add(trail);
  const trailPoints = [];
  for (let i = 0; i < trailCount; i++) trailPoints.push(new THREE.Vector3(0, -999, 0));

  const state = {
    group,
    pos: new THREE.Vector3(0, 30, 0),
    yaw: 0,
    speed: 0,
    boost: CONFIG.boostMax,
    boosting: false,
    trail,
    trailPoints,
    trailIndex: 0,
    trailTimer: 0,
  };
  return state;
}

export function forwardOf(skiff) {
  return new THREE.Vector3(Math.sin(skiff.yaw), 0, Math.cos(skiff.yaw));
}

// One physics step. input: { thrust (0..1), brake, steer (-1..1), boost }.
// targetY is the altitude the skiff eases toward (the next gate's height).
export function updateSkiff(skiff, input, targetY, dt) {
  const maxSpeed = CONFIG.maxSpeed * (skiff.boosting ? CONFIG.boostSpeed : 1);
  if (input.thrust > 0) skiff.speed += CONFIG.thrust * input.thrust * dt;
  if (input.brake) skiff.speed -= CONFIG.brake * dt;
  skiff.speed -= skiff.speed * CONFIG.drag * dt;
  if (skiff.speed < 0) skiff.speed = 0;
  if (skiff.speed > maxSpeed) skiff.speed = maxSpeed;

  // Steering answers only while moving, and more at speed.
  const steerAuthority = Math.min(skiff.speed / 12, 1);
  skiff.yaw += input.steer * CONFIG.steerRate * steerAuthority * dt;

  const forward = forwardOf(skiff);
  skiff.pos.addScaledVector(forward, skiff.speed * dt);

  // Ease toward the racing line's altitude; a gentle bob sells the hover.
  const dy = targetY - skiff.pos.y;
  skiff.pos.y += THREE.MathUtils.clamp(dy, -CONFIG.altitudeRate * dt, CONFIG.altitudeRate * dt);

  // Boost drains the meter; it refills only on pads and orbs.
  skiff.boosting = input.boost && skiff.boost > 1 && skiff.speed > 8;
  if (skiff.boosting) skiff.boost = Math.max(0, skiff.boost - CONFIG.boostDrain * dt);

  // Pose: nose follows the line, banking into turns, bobbing with the hover.
  const bob = Math.sin(performance.now() * 0.0022) * 0.35;
  skiff.group.position.set(skiff.pos.x, skiff.pos.y + bob * 0.4, skiff.pos.z);
  skiff.group.rotation.set(0, skiff.yaw, -input.steer * 0.42 * steerAuthority, 'YXZ');
  skiff.group.rotation.x = THREE.MathUtils.clamp(dy * 0.012, -0.22, 0.22);

  // Trail: drop a point at the tail every few frames while fast.
  skiff.trailTimer -= dt;
  if (skiff.speed > 18 && skiff.trailTimer <= 0) {
    skiff.trailTimer = 0.016;
    const tail = skiff.pos.clone().addScaledVector(forward, -3.2);
    tail.y += bob * 0.4;
    skiff.trailPoints[skiff.trailIndex] = tail;
    skiff.trailIndex = (skiff.trailIndex + 1) % skiff.trailPoints.length;
    const arr = skiff.trail.geometry.attributes.position.array;
    for (let i = 0; i < skiff.trailPoints.length; i++) {
      arr[i * 3] = skiff.trailPoints[i].x;
      arr[i * 3 + 1] = skiff.trailPoints[i].y;
      arr[i * 3 + 2] = skiff.trailPoints[i].z;
    }
    skiff.trail.geometry.attributes.position.needsUpdate = true;
  }
}

export function resetSkiff(skiff, startPos, startYaw) {
  skiff.pos.copy(startPos);
  skiff.yaw = startYaw;
  skiff.speed = 0;
  skiff.boost = CONFIG.boostMax;
  skiff.boosting = false;
  for (const p of skiff.trailPoints) p.set(0, -999, 0);
  skiff.group.position.copy(startPos);
  skiff.group.rotation.set(0, startYaw, 0);
}
