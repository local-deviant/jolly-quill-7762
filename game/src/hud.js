// HUD: the DOM readouts (lap, time, speed, hull, boost, orbs, next-gate
// arrow) and the top-down minimap canvas (gates, skiff, mines).
import { CONFIG } from './config.js';

export function createHud(track) {
  const el = (id) => document.getElementById(id);
  const hud = {
    lap: el('hud-lap'),
    time: el('hud-time'),
    speed: el('hud-speed'),
    hullFill: el('hud-hull-fill'),
    boostFill: el('hud-boost-fill'),
    orbs: el('hud-orbs'),
    gate: el('hud-gate'),
    arrow: el('hud-arrow'),
    banner: el('hud-banner'),
    minimap: el('minimap'),
    screens: {
      title: el('screen-title'),
      countdown: el('screen-countdown'),
      paused: el('screen-paused'),
      win: el('screen-win'),
      lose: el('screen-lose'),
    },
    best: el('title-best'),
    winStats: el('win-stats'),
    loseReason: el('lose-reason'),
    loseStats: el('lose-stats'),
  };
  const ctx = hud.minimap.getContext('2d');
  let bannerTimer = 0;

  function showBanner(text, ms) {
    // innerHTML: banner strings use &nbsp; spacing.
    hud.banner.innerHTML = text;
    hud.banner.style.opacity = '1';
    bannerTimer = ms / 1000;
  }

  function updateBanner(dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) hud.banner.style.opacity = '0';
    }
  }

  function showScreen(name) {
    for (const [key, node] of Object.entries(hud.screens)) {
      node.classList.toggle('hidden', key !== name);
    }
  }

  function hideScreens() {
    for (const node of Object.values(hud.screens)) node.classList.add('hidden');
  }

  // The next-gate arrow: rotate it toward the gate relative to the skiff's yaw.
  function update(state) {
    hud.lap.textContent = `LAP ${state.lap}/${CONFIG.lapsToWin}`;
    const t = Math.max(0, state.timeLeft);
    hud.time.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    hud.time.classList.toggle('danger', t <= 15);
    hud.speed.textContent = `${Math.round(state.speed * 3.6)} km/h`;
    hud.hullFill.style.width = `${Math.max(0, state.hull)}%`;
    hud.hullFill.classList.toggle('danger', state.hull <= 30);
    hud.boostFill.style.width = `${Math.max(0, state.boost)}%`;
    hud.orbs.textContent = `◆ ${state.orbsTaken}/${CONFIG.orbCount}`;
    hud.gate.textContent = `GATE ${state.nextGateIndex + 1}/${CONFIG.gateCount}`;
    const rel = state.gateBearing - state.yaw;
    hud.arrow.style.transform = `rotate(${rel}rad)`;
    hud.arrow.textContent = state.gateDist < 60 ? '▼' : '▲';
    drawMinimap(state);
    updateBanner(1 / 60);
  }

  function drawMinimap(state) {
    const w = hud.minimap.width;
    const h = hud.minimap.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = (w / 2 - 10) / (CONFIG.trackRadius + CONFIG.trackWobble + 30);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10, 8, 24, 0.55)';
    ctx.fillRect(0, 0, w, h);
    // Track loop.
    ctx.strokeStyle = 'rgba(255, 176, 58, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= track.gates.length; i++) {
      const g = track.gates[i % track.gates.length];
      const x = cx + g.pos.x * scale;
      const y = cy + g.pos.z * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // Gates: green passed, cyan next, amber the rest.
    for (const gate of track.gates) {
      const x = cx + gate.pos.x * scale;
      const y = cy + gate.pos.z * scale;
      ctx.fillStyle = gate.state === 'passed' ? '#37e08a' : gate.state === 'next' ? '#35e0ff' : '#ffb03a';
      ctx.beginPath();
      ctx.arc(x, y, gate.state === 'next' ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mines as red dots.
    ctx.fillStyle = '#ff4455';
    for (const mine of track.mines) {
      if (!mine.active) continue;
      ctx.beginPath();
      ctx.arc(cx + mine.mesh.position.x * scale, cy + mine.mesh.position.z * scale, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Skiff as a white triangle pointing along its yaw.
    const sx = cx + state.pos.x * scale;
    const sy = cy + state.pos.z * scale;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(state.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return { ...hud, showBanner, showScreen, hideScreens, update };
}
