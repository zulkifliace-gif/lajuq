/**
 * Web Audio API Sound Generator for Real-Time Order System Alerts
 * Does not require external audio files or MP3 network downloads.
 * Works natively across all modern browsers (Chrome, Edge, Safari, Firefox).
 */

let audioCtx = null;

// Initialize or resume Web Audio Context safely on user gesture
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Unlock Audio Context on first user touch/click
 */
export function unlockAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch (e) {
    console.warn('AudioContext unlock attempt:', e);
  }
}

/**
 * Play Urgent Double-Beep Alert Sound (Order Cancelled Event)
 * Uses high-pitch dual oscillator chime pattern for high clarity
 */
export function playCancellationAlertSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Beep 1: High alert tone (880Hz - A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Beep 2: Lower urgent warning tone (440Hz - A4) after 0.28s delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(440, now + 0.28);
    gain2.gain.setValueAtTime(0.4, now + 0.28);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.28);
    osc2.stop(now + 0.7);

    // Beep 3: Repeat urgent tone for emphasis
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(880, now + 0.75);
    gain3.gain.setValueAtTime(0.35, now + 0.75);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.1);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.75);
    osc3.stop(now + 1.1);

  } catch (err) {
    console.error('Failed to play cancellation alert sound:', err);
  }
}
