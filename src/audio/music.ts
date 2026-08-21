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

/**
 * Which scale degrees of the pentatonic pool are chord tones under each chord
 * of the loop. Everything in the pool is consonant; these are the notes that
 * sound settled rather than passing, so a phrase starts and ends on one.
 */
const CHORD_TONES: readonly (readonly number[])[] = [
  [0, 1, 3], // Am — A C E
  [0, 1], // F — A C
  [1, 3, 4], // C — C E G
  [2, 4], // G — D G
];

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

// --- Phrases ---------------------------------------------------------------
//
// Letter-to-pitch on its own makes a word a random walk: every leap is in key,
// and none of it goes anywhere. A word typed correctly should sound composed,
// so each word gets a phrase built by ear-rules instead — start settled, move
// mostly by step, arc up then back down, and land on a chord tone. It is
// deterministic, so the same word under the same chord sings the same line.

const seedOf = (word: string): number => {
  let hash = 2166136261;
  for (const char of word) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** A tiny deterministic PRNG, so a phrase is a property of the word. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampIndex = (index: number): number =>
  Math.min(PITCHES.length - 1, Math.max(0, index));

const isChordTone = (index: number, tones: readonly number[]): boolean =>
  tones.includes(index % PENTATONIC.length);

/** The nearest note that sits inside the chord. */
function settle(index: number, tones: readonly number[]): number {
  for (let step = 0; step < PITCHES.length; step += 1) {
    for (const candidate of [index - step, index + step]) {
      const clamped = clampIndex(candidate);
      if (isChordTone(clamped, tones)) return clamped;
    }
  }
  return index;
}

/**
 * Where a line comes to rest, measured from the note before it rather than
 * from wherever the arc happened to end. Resolving from the generated note
 * stacked its own step on top of the arc's and left short words ending on a
 * leap; a resolution is only an arrival if it is next door.
 */
function resolveFrom(previous: number, tones: readonly number[]): number {
  for (const offset of [-1, 1, -2, 2, 0]) {
    const candidate = clampIndex(previous + offset);
    if (isChordTone(candidate, tones)) return candidate;
  }
  return previous;
}

/**
 * The melodic line a word plays when it is typed correctly, one note per
 * letter. Mistyped letters leave the line rather than joining it, which is
 * what makes a clean word sound more resolved than a scrambled one.
 */
export function phraseFor(word: string, chordIndex: number): number[] {
  const tones = CHORD_TONES[chordIndex % CHORD_TONES.length]!;
  const length = Math.max(word.length, 1);
  const random = noise(seedOf(word) ^ Math.imul(chordIndex + 1, 0x9e3779b9));

  // open in the middle of the range, on a note the chord already contains
  let index = settle(
    PENTATONIC.length + Math.floor(random() * PENTATONIC.length),
    tones,
  );
  const indices = [index];

  for (let note = 1; note < length; note += 1) {
    const roll = random();
    const step = roll < 0.6 ? 1 : roll < 0.85 ? 2 : 0;
    // an arc: lean upward through the first half, downward through the second
    const rising = note < length / 2;
    const direction = random() < 0.75 === rising ? 1 : -1;

    index = clampIndex(index + direction * step);
    indices.push(index);
  }

  // the last note resolves, so finishing a word feels like an arrival
  if (indices.length > 1) {
    indices[indices.length - 1] = resolveFrom(indices[indices.length - 2]!, tones);
  }

  return indices.map((i) => PITCHES[i]!);
}
