// Track builder: the floating sky-island circuit, its 12 ring gates, 24 energy
// orbs, mines and boost pads. Everything is placed from the seeded RNG, so the
// circuit is identical on every run.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { range } from './random.js';

// Gate ring: a glowing torus plus a faint inner disc, facing the next gate.
function makeGateMesh() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(CONFIG.gateRadius, 0.9, 10, 40),
    new THREE.MeshStandardMaterial({
      color: PALETTE.gateUp,
      emissive: PALETTE.gateUp,
      emissiveIntensity: 1.4,
      metalness: 0.2,
      roughness: 0.4,
    }),
  );
  group.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(CONFIG.gateRadius - 0.8, 32),
    new THREE.MeshBasicMaterial({
      color: PALETTE.gateUp,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  group.add(disc);
  group.userData.ring = ring;
  group.userData.disc = disc;
  return group;
}

// One floating island: a dark rock cone under a grassy top disc.
function makeIsland(rng, radius, y) {
  const group = new THREE.Group();
  const topR = range(rng, 14, 42);
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(topR, range(rng, 18, 40), 7),
    new THREE.MeshStandardMaterial({ color: PALETTE.islandRock, roughness: 1, flatShading: true }),
  );
  rock.rotation.x = Math.PI;
  rock.position.y = -rock.geometry.parameters.height / 2 + 1;
  group.add(rock);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(topR, topR * 0.82, 3, 9),
    new THREE.MeshStandardMaterial({
      color: rng() > 0.5 ? PALETTE.islandGrass : PALETTE.islandGrass2,
      roughness: 0.9,
      flatShading: true,
    }),
  );
  top.position.y = 1.5;
  group.add(top);
  // A few grass tufts: small cones on the top disc.
  const tufts = Math.floor(range(rng, 2, 6));
  for (let i = 0; i < tufts; i++) {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, range(rng, 2.5, 5), 5),
      new THREE.MeshStandardMaterial({ color: PALETTE.islandGrass2, roughness: 1, flatShading: true }),
    );
    const a = rng() * Math.PI * 2;
    const r = rng() * topR * 0.6;
    tuft.position.set(Math.cos(a) * r, 4.5, Math.sin(a) * r);
    group.add(tuft);
  }
  group.position.set(Math.cos(radius.a) * radius.r, y, Math.sin(radius.a) * radius.r);
  return group;
}

export function buildTrack(scene, rng) {
  const gates = [];
  const gatePositions = [];
  // 12 gates around a wobbly loop; altitude varies so the line climbs and dives.
  for (let i = 0; i < CONFIG.gateCount; i++) {
    const angle = (i / CONFIG.gateCount) * Math.PI * 2;
    const r = CONFIG.trackRadius + (rng() - 0.5) * 2 * CONFIG.trackWobble;
    const pos = new THREE.Vector3(
      Math.cos(angle) * r,
      range(rng, CONFIG.gateMinY, CONFIG.gateMaxY),
      Math.sin(angle) * r,
    );
    gatePositions.push(pos);
    const mesh = makeGateMesh();
    mesh.position.copy(pos);
    scene.add(mesh);
    gates.push({ index: i, pos, mesh, state: 'up' });
  }
  // Each gate faces the next one, so the ring reads as a doorway on the line.
  for (let i = 0; i < gates.length; i++) {
    const next = gates[(i + 1) % gates.length];
    gates[i].mesh.lookAt(next.pos);
  }

  // Racing-line points between consecutive gates, for orb and pad placement.
  const linePoint = (seg, t) => {
    const a = gatePositions[seg];
    const b = gatePositions[(seg + 1) % gatePositions.length];
    return new THREE.Vector3().lerpVectors(a, b, t);
  };

  // 24 energy orbs: two per segment, bobbing above the line.
  const orbs = [];
  const orbGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const orbMat = new THREE.MeshStandardMaterial({
    color: PALETTE.orb,
    emissive: PALETTE.orb,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });
  for (let seg = 0; seg < CONFIG.gateCount; seg++) {
    for (const t of [0.33, 0.66]) {
      const pos = linePoint(seg, t);
      pos.y += 2;
      const mesh = new THREE.Mesh(orbGeo, orbMat);
      mesh.position.copy(pos);
      scene.add(mesh);
      orbs.push({ pos, mesh, taken: false, phase: rng() * Math.PI * 2 });
    }
  }

  // Mines near the line, offset sideways so a careless line clips them.
  const mines = [];
  const mineGeo = new THREE.IcosahedronGeometry(2.6, 0);
  const mineMat = new THREE.MeshStandardMaterial({
    color: PALETTE.mine,
    emissive: PALETTE.mine,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    flatShading: true,
  });
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a0a12, roughness: 0.6 });
  const spikeGeo = new THREE.ConeGeometry(0.7, 2.4, 4);
  const placeMine = (extra) => {
    const seg = Math.floor(rng() * CONFIG.gateCount);
    const t = range(rng, 0.25, 0.75);
    const pos = linePoint(seg, t);
    // Sideways offset from the racing line.
    const a = gatePositions[seg];
    const b = gatePositions[(seg + 1) % gatePositions.length];
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((rng() > 0.5 ? 1 : -1) * range(rng, 11, 22));
    pos.add(side);
    pos.y += range(rng, -6, 6);
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(mineGeo, mineMat);
    mesh.add(core);
    for (let s = 0; s < 6; s++) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(
        Math.sin((s / 6) * Math.PI * 2) * 2.2,
        Math.cos((s / 6) * Math.PI * 2) * 2.2,
        s % 2 === 0 ? 1.4 : -1.4,
      );
      spike.lookAt(spike.position.clone().multiplyScalar(2));
      mesh.add(spike);
    }
    mesh.position.copy(pos);
    scene.add(mesh);
    mines.push({ pos: pos.clone(), base: pos.clone(), mesh, active: !extra, phase: rng() * Math.PI * 2 });
  };
  for (let i = 0; i < CONFIG.mineCount; i++) placeMine(false);
  for (let i = 0; i < CONFIG.mineExtraLap3; i++) placeMine(true);

  // 4 boost pads: flat glowing rings on the line, just before gates 3, 6, 9, 12.
  const pads = [];
  const padGeo = new THREE.RingGeometry(4.5, 7.5, 32);
  const padMat = new THREE.MeshBasicMaterial({
    color: PALETTE.pad,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const gateIndex of [2, 5, 8, 11]) {
    const seg = (gateIndex + CONFIG.gateCount - 1) % CONFIG.gateCount;
    const pos = linePoint(seg, 0.72);
    pos.y -= 1.5;
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    scene.add(mesh);
    pads.push({ pos, mesh, cooldown: 0 });
  }

  // Floating islands scattered inside and outside the loop, below the track.
  const islands = [];
  for (let i = 0; i < 16; i++) {
    const island = makeIsland(rng, { a: rng() * Math.PI * 2, r: range(rng, 60, 430) }, range(rng, -70, -18));
    scene.add(island);
    islands.push(island);
  }

  // Cloud puffs drifting high above the circuit.
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffe9d6,
    transparent: true,
    opacity: 0.55,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 22; i++) {
    const cloud = new THREE.Group();
    const puffs = Math.floor(range(rng, 3, 6));
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 14), 8, 6), cloudMat);
      s.position.set(range(rng, -16, 16), range(rng, -3, 3), range(rng, -8, 8));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    const a = rng() * Math.PI * 2;
    const r = range(rng, 80, 480);
    cloud.position.set(Math.cos(a) * r, range(rng, 70, 130), Math.sin(a) * r);
    scene.add(cloud);
    clouds.push({ group: cloud, baseX: cloud.position.x, phase: rng() * Math.PI * 2, speed: range(rng, 0.5, 1.4) });
  }

  // The setting sun: a huge warm disc low on the horizon.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(55, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(-520, 55, -380);
  sun.lookAt(0, 20, 0);
  scene.add(sun);

  return { gates, gatePositions, orbs, mines, pads, islands, clouds, sun, linePoint };
}

// Colour a gate ring for its state: next (cyan, pulsing), up (amber), passed (green), wrong (red flash).
export function setGateState(gate, state) {
  gate.state = state;
  const color = PALETTE[state === 'next' ? 'gateNext' : state === 'passed' ? 'gatePassed' : state === 'wrong' ? 'gateWrong' : 'gateUp'];
  gate.mesh.userData.ring.material.color.setHex(color);
  gate.mesh.userData.ring.material.emissive.setHex(color);
  gate.mesh.userData.disc.material.color.setHex(color);
}
