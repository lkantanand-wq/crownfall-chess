window.CrownfallSound = (function () {
  let ctx = null;
  let muted = false;

  function getCtx() {
    if (!ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(freq, duration, type = 'triangle', gainVal = 0.12) {
    if (muted) return;
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    gain.gain.setValueAtTime(gainVal, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  return {
    setMuted(v) { muted = Boolean(v); },
    isMuted() { return muted; },
    move() { tone(240, 0.07, 'triangle', 0.14); },
    capture() { tone(165, 0.1, 'sawtooth', 0.11); },
    check() {
      tone(520, 0.09, 'sine', 0.13);
      setTimeout(() => tone(660, 0.12, 'sine', 0.11), 65);
    },
    gameOver() {
      tone(392, 0.14, 'triangle', 0.12);
      setTimeout(() => tone(523, 0.22, 'triangle', 0.14), 120);
    }
  };
})();
