// Original procedural sound effects. Off by default, never used for Hebrew pronunciation.
let context = null;

const TONES = {
  step: [[160, 0.03]],
  bump: [[90, 0.06]],
  confirm: [[660, 0.07], [880, 0.09]],
  wrong: [[220, 0.14]],
  capture: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.18]],
};

export function play(name, enabled) {
  if (!enabled || !TONES[name]) return;
  try {
    context ??= new AudioContext();
    let at = context.currentTime;
    for (const [frequency, length] of TONES[name]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'square';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.04, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + length);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + length);
      at += length;
    }
  } catch {
    // Sound is decorative, so a blocked audio device changes nothing.
  }
}
