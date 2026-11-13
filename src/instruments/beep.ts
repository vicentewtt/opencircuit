/** Continuity tone. Browsers only allow audio that starts from a user action. */

let context: AudioContext | undefined;
let gain: GainNode | undefined;
let oscillator: OscillatorNode | undefined;
let pitch = 0;
let sounding = false;

/** Call from a click handler (starting the simulation) so audio is allowed later. */
export function primeAudio(): void {
  try {
    if (!context) {
      context = new AudioContext();
      gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = 2000;
      oscillator.connect(gain);
      oscillator.start();
    }
    void context.resume();
  } catch {
    // No audio available: the meter still shows the reading.
    context = undefined;
  }
}

const DEFAULT_HERTZ = 2000;

export function setBeep(on: boolean, hertz = DEFAULT_HERTZ): void {
  if (!context || !gain) return;
  if (on && oscillator && hertz !== pitch) {
    pitch = hertz;
    oscillator.frequency.setTargetAtTime(hertz, context.currentTime, 0.005);
  }
  if (on === sounding) return;
  sounding = on;
  gain.gain.setTargetAtTime(on ? 0.05 : 0, context.currentTime, 0.01);
}
