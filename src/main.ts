// Smallest thing that proves the page can make sound: one AudioContext, one
// oscillator per keystroke. Everything else grows from here.
let ctx: AudioContext | null = null;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

function beep(): void {
  const ac = audio();
  // the context starts suspended until a gesture; every keystroke is one
  void ac.resume();

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = 440;
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.45);
}

window.addEventListener("keydown", beep);
