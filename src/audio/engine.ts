// Everything that touches Web Audio lives here. One AudioContext, built on the
// first gesture because the autoplay policy leaves it suspended until then.

import { BASS, CHORDS, MIN_BPM } from "./music.ts";

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  send: GainNode;
}

let rig: Rig | null = null;
let chordIndex = 0;
let bpm = MIN_BPM;
let brightness = 0.3;
let lastPlayed = 0;
let pulseStep = 0;
let nextPulseAt = 0;
let scheduler: number | null = null;

/** How long after the last keystroke the backing pulse fades out. */
const IDLE_MS = 4500;

function rigUp(): Rig {
  if (rig) return rig;

  const ctx = new AudioContext();

  const master = ctx.createGain();
  master.gain.value = 0.85;

  // a limiter, so a fast typist stacking twenty voices doesn't clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);

  // one shared echo, which is what makes a sparse typist sound intentional
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.33;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2000;
  const send = ctx.createGain();
  send.gain.value = 0.3;

  send.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  damp.connect(master);

  rig = { ctx, master, send };
  return rig;
}

interface VoiceOptions {
  /** Where the pitch starts, if it should slide into place. */
  from?: number;
  level?: number;
  release?: number;
  type?: OscillatorType;
  /** 0–1; opens the filter and adds an octave shimmer. */
  colour?: number;
}

function voice(freq: number, when: number, options: VoiceOptions = {}): void {
  const { ctx, master, send } = rigUp();
  const {
    from,
    level = 0.22,
    release = 1.1,
    type = "triangle",
    colour = brightness,
  } = options;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from ?? freq, when);
  if (from !== undefined) {
    // the blue note: land flat, then bend home over a tenth of a second
    osc.frequency.exponentialRampToValueAtTime(freq, when + 0.09);
  }

  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime((from ?? freq) * 2, when);
  if (from !== undefined) {
    shimmer.frequency.exponentialRampToValueAtTime(freq * 2, when + 0.09);
  }
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.1 + colour * 0.25;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 0.9;
  tone.frequency.setValueAtTime(900 + colour * 4200, when);
  tone.frequency.exponentialRampToValueAtTime(500 + colour * 900, when + release);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(level, when + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, when + release);

  osc.connect(tone);
  shimmer.connect(shimmerGain).connect(tone);
  tone.connect(env);
  env.connect(master);
  env.connect(send);

  osc.start(when);
  shimmer.start(when);
  osc.stop(when + release + 0.05);
  shimmer.stop(when + release + 0.05);
}

/**
 * Resume the context. Safe to call on every gesture; only the first matters.
 * The state lands on <html data-audio> so a blocked autoplay policy is visible
 * on the page instead of being silently silent.
 */
export function unlock(): void {
  const { ctx } = rigUp();
  const report = (): void => {
    document.documentElement.dataset["audio"] = ctx.state;
  };

  report();
  if (ctx.state !== "running") void ctx.resume().then(report, report);
  ctx.addEventListener("statechange", report);
  startScheduler();
}

/** A typed character. `bendFrom` is set when the character wasn't the expected one. */
export function playNote(freq: number, bendFrom?: number): void {
  const { ctx } = rigUp();
  lastPlayed = ctx.currentTime;
  voice(freq, ctx.currentTime, { from: bendFrom, level: 0.2 });
}

/** A finished word: the harmony moves. */
export function advanceChord(): number {
  const { ctx } = rigUp();
  chordIndex = (chordIndex + 1) % CHORDS.length;
  lastPlayed = ctx.currentTime;

  const now = ctx.currentTime;
  for (const [i, freq] of CHORDS[chordIndex]!.entries()) {
    voice(freq, now + i * 0.012, {
      level: 0.075,
      release: 2.6,
      type: "sine",
      colour: brightness * 0.5,
    });
  }
  voice(BASS[chordIndex]!, now, {
    level: 0.16,
    release: 1.6,
    type: "sine",
    colour: 0.05,
  });

  return chordIndex;
}

/** Backspace. Quiet, downward, and deliberately not a buzzer. */
export function playUndo(): void {
  const { ctx } = rigUp();
  lastPlayed = ctx.currentTime;
  voice(150, ctx.currentTime, {
    from: 300,
    level: 0.07,
    release: 0.22,
    type: "sine",
    colour: 0,
  });
}

export function setTempo(nextBpm: number, nextBrightness: number): void {
  bpm = nextBpm;
  brightness = nextBrightness;
}

export function setMuted(next: boolean): void {
  const { ctx, master } = rigUp();
  master.gain.setTargetAtTime(next ? 0 : 0.85, ctx.currentTime, 0.05);
}

// The backing pulse. A lookahead scheduler rather than a timer per note: the
// setInterval clock is far too jittery to hang music off directly.
function startScheduler(): void {
  if (scheduler !== null) return;

  scheduler = window.setInterval(() => {
    if (!rig) return;
    const { ctx } = rig;
    const idle = (ctx.currentTime - lastPlayed) * 1000 > IDLE_MS;
    const beat = 60 / bpm / 2;

    if (idle) {
      nextPulseAt = ctx.currentTime;
      return;
    }

    while (nextPulseAt < ctx.currentTime + 0.15) {
      nextPulseAt = Math.max(nextPulseAt, ctx.currentTime);
      const chord = CHORDS[chordIndex]!;
      const freq = chord[pulseStep % chord.length]! * 2;
      voice(freq, nextPulseAt, {
        level: pulseStep % 4 === 0 ? 0.05 : 0.028,
        release: beat * 1.8,
        type: "sine",
        colour: brightness * 0.6,
      });
      pulseStep += 1;
      nextPulseAt += beat;
    }
  }, 25);
}
