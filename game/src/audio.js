// Procedural WebAudio sounds only — no audio files. Engine hum pitched with
// speed, gate chime, orb blip, mine explosion, boost whoosh, countdown
// beeps and a win fanfare. Everything is guarded: audio starts on the first
// user gesture and stays silent when the context cannot run.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
    } catch (err) {
      ctx = null;
    }
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (err) {}
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (i % 7 === 0 ? 0.9 : -0.9) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch (err) {}
  }

  return {
    resume,
    setMuted(m) {
      muted = m;
      if (engineGain) engineGain.gain.value = 0;
    },
    isMuted() {
      return muted;
    },
    engine(speed01, boosting) {
      if (!ctx || !engineOsc || !engineGain || muted) return;
      try {
        engineOsc.frequency.value = 52 + speed01 * 130 + (boosting ? 45 : 0);
        engineGain.gain.value = 0.028 + speed01 * 0.05;
      } catch (err) {}
    },
    engineOff() {
      if (engineGain) engineGain.gain.value = 0;
    },
    chime() {
      tone(880, 0.28, 'sine', 0.22);
      tone(1318, 0.34, 'sine', 0.16, 0.06);
    },
    wrong() {
      tone(196, 0.22, 'square', 0.12);
    },
    blip() {
      tone(1320, 0.12, 'sine', 0.18);
    },
    explosion() {
      noise(0.5, 0.5, 900);
      tone(90, 0.4, 'sine', 0.3);
    },
    whoosh() {
      noise(0.45, 0.28, 2400);
    },
    beep(final) {
      tone(final ? 1180 : 740, final ? 0.5 : 0.16, 'square', 0.16);
    },
    fanfare() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((f, i) => tone(f, 0.32, 'triangle', 0.22, i * 0.13));
    },
    lap() {
      tone(660, 0.2, 'triangle', 0.2);
      tone(990, 0.3, 'triangle', 0.2, 0.1);
    },
  };
}
