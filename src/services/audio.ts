// Web Audio API Synthesizer and Android Haptic Feedback
let audioCtx: AudioContext | null = null;
let audioCtxInitialized = false;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtxInitialized) {
      // Only create AudioContext when called from a user gesture (click/tap/scan)
      // Chrome mobile / TWA blocks AudioContext creation without user gesture
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
        audioCtxInitialized = true;
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play high-pitched crisp sine beep for valid SKU scan
 */
export function playSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // ignore audio failure
  }
}

/**
 * Play loud, industrial-grade two-tone buzzer for scan error / invalid SKU / over-pick
 * Specially tuned for mobile phone speakers and noisy warehouse environments.
 * Uses high-efficiency mid-range harmonic frequencies (480Hz & 330Hz) with sharp double-pulse.
 */
export function playErrorBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Pulse 1: High warning buzz (480Hz + 720Hz discordant harmonic)
    const osc1 = ctx.createOscillator();
    const osc1Harmonic = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(480, now);

    osc1Harmonic.type = 'square';
    osc1Harmonic.frequency.setValueAtTime(720, now);

    gain1.gain.setValueAtTime(0.85, now);
    gain1.gain.setValueAtTime(0.85, now + 0.09);
    gain1.gain.linearRampToValueAtTime(0.01, now + 0.11);

    osc1.connect(gain1);
    osc1Harmonic.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1Harmonic.start(now);
    osc1.stop(now + 0.11);
    osc1Harmonic.stop(now + 0.11);

    // Pulse 2: Low-mid rejection buzzer (330Hz + 495Hz harmonic) after 35ms silence
    const pulse2Time = now + 0.145;
    const osc2 = ctx.createOscillator();
    const osc2Harmonic = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(330, pulse2Time);

    osc2Harmonic.type = 'square';
    osc2Harmonic.frequency.setValueAtTime(495, pulse2Time);

    gain2.gain.setValueAtTime(0.9, pulse2Time);
    gain2.gain.setValueAtTime(0.9, pulse2Time + 0.15);
    gain2.gain.linearRampToValueAtTime(0.01, pulse2Time + 0.18);

    osc2.connect(gain2);
    osc2Harmonic.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(pulse2Time);
    osc2Harmonic.start(pulse2Time);
    osc2.stop(pulse2Time + 0.18);
    osc2Harmonic.stop(pulse2Time + 0.18);
  } catch {
    // ignore audio failure
  }

  // Automatic forceful double haptic vibration on error
  vibrateDevice([150, 70, 220]);
}

/**
 * Play clear, attention-grabbing melodic chime when new picking task arrives from admin
 */
export function playNewTaskChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // 3-tone bright chime: D5 (587.33), A5 (880.00), D6 (1174.66)
    const notes = [
      { freq: 587.33, start: now, duration: 0.10 },
      { freq: 880.00, start: now + 0.09, duration: 0.10 },
      { freq: 1174.66, start: now + 0.19, duration: 0.40 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle'; // Clear bell-like chime
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.7, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    });
  } catch {
    // ignore audio failure
  }

  // Distinct vibration for incoming task
  vibrateDevice([250, 100, 250, 100, 450]);
}

/**
 * Play double melodic tone for Category / Location changes
 */
export function playCategoryBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    // First tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Second tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.09); // D6
    gain2.gain.setValueAtTime(0.25, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.2);
  } catch {
    // ignore audio failure
  }
}

/**
 * Play joyful ascending chime when saving data successfully to Supabase
 */
export function playSaveSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const startTime = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const noteTime = startTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);
      gain.gain.setValueAtTime(0.2, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.18);
    });
  } catch {
    // ignore audio failure
  }
}

/**
 * Device vibration for Android phone/tablet
 */
export function vibrateDevice(pattern: number | number[] = 50) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}
