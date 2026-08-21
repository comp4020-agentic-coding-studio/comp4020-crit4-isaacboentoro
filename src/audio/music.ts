// Pure music theory. No Web Audio here on purpose: jsdom has no AudioContext,
// so keeping the note-choosing separate is what makes it testable.

/** A above middle C, an octave down — the bottom of the melody range. */
const BASE_HZ = 220;

/** A minor pentatonic, in semitones from the root. */
const PENTATONIC = [0, 3, 5, 7, 10];

/** How many octaves of that scale the letters are spread across. */
const OCTAVES = 3;

const semitonesToHz = (semitones: number): number =>
  BASE_HZ * Math.pow(2, semitones / 12);

/**
 * Every pitch this instrument can ever sound, low to high. One fixed
 * pentatonic pool is the whole reason there is no wrong note: it stays
 * consonant over all four chords in the loop below.
 */
export const PITCHES: readonly number[] = Array.from(
  { length: OCTAVES * PENTATONIC.length },
  (_, i) =>
    semitonesToHz(PENTATONIC[i % PENTATONIC.length]! + 12 * Math.floor(i / PENTATONIC.length)),
);

/**
 * i — VI — III — VII in A minor. Slow, unhurried, and every chord takes the
 * melody pool without complaint.
 */
export const CHORDS: readonly (readonly number[])[] = [
  [0, 3, 7], // Am
  [-4, 0, 3], // F
  [3, 7, 10], // C
  [-2, 2, 5], // G
].map((chord) => chord.map((semitone) => semitonesToHz(semitone - 12)));

/** The bass note under each chord, an octave below the pad. */
export const BASS: readonly number[] = CHORDS.map((chord) => chord[0]! / 2);

/**
 * Letters spread low-to-high across the pool, so a word has a melodic shape
 * you can hear again when you type it again. Anything else falls back to its
 * character code — still in the pool, still in key.
 */
export function pitchIndexForChar(char: string): number {
  const code = char.toLowerCase().charCodeAt(0);
  const letter = code - 97;

  if (letter >= 0 && letter <= 25) {
    return Math.round((letter / 25) * (PITCHES.length - 1));
  }

  return ((code % PITCHES.length) + PITCHES.length) % PITCHES.length;
}

/** The frequency a keystroke sounds. Total: every char maps somewhere. */
export function charToFreq(char: string): number {
  return PITCHES[pitchIndexForChar(char)]!;
}

/** A semitone flat — where a mistyped note starts before it bends home. */
export const flat = (hz: number): number => hz * Math.pow(2, -1 / 12);

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
};

export const MIN_BPM = 50;
export const MAX_BPM = 170;

/**
 * Your typing cadence, read as a tempo. The median gap between keystrokes is
 * one sixteenth note, which puts a comfortable typist somewhere near 90.
 */
export function bpmFromIntervals(intervals: readonly number[]): number {
  if (intervals.length === 0) return MIN_BPM;

  const gapMs = Math.max(median(intervals), 1);
  const bpm = 60000 / (gapMs * 4);

  return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
}

/** 0 (slow, dark) to 1 (fast, bright) — drives the filter, not a grade. */
export function brightnessFromBpm(bpm: number): number {
  return (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
}
