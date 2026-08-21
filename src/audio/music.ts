// Pure music theory. No Web Audio here on purpose: jsdom has no AudioContext,
// so keeping the note-choosing separate is what makes it testable.

/** A above middle C, an octave down — the bottom of the melody range. */
const BASE_HZ = 220;

/** A minor pentatonic, in semitones from the root. */
const PENTATONIC = [0, 3, 5, 7, 10];

/** A natural minor, in semitones from the root. The harmony comes from here. */
const SCALE = [0, 2, 3, 5, 7, 8, 10];

/** How many octaves of the pentatonic the melody is spread across. */
const OCTAVES = 3;

const semitonesToHz = (semitones: number): number =>
  BASE_HZ * Math.pow(2, semitones / 12);

/**
 * Every pitch this instrument can ever sound, low to high. One fixed
 * pentatonic pool is the whole reason there is no wrong note: it stays
 * consonant under every chord the harmony can reach.
 */
export const PITCHES: readonly number[] = Array.from(
  { length: OCTAVES * PENTATONIC.length },
  (_, i) =>
    semitonesToHz(PENTATONIC[i % PENTATONIC.length]! + 12 * Math.floor(i / PENTATONIC.length)),
);

// --- Chords ----------------------------------------------------------------
//
// Chords are stacked out of the scale rather than listed, so there is no table
// of progressions anywhere: a triad is the scale read every second degree from
// wherever you start. Six of the seven degrees carry a consonant triad; the
// second builds a diminished one, which is the only genuinely sour chord in the
// key, so it is left out.

const CONSONANT_DEGREES = [0, 2, 3, 4, 5, 6];

/** Semitone names from A, only ever used for the label on screen. */
const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

export interface Chord {
  /** Which degree of the scale the triad is stacked on, 0–6. */
  degree: number;
  /** Its notes as semitones from A, ascending. */
  semitones: number[];
  /** Its notes as pitch classes, for asking whether a melody note is in it. */
  classes: number[];
  /** What to call it: "Am", "F", "G". */
  name: string;
}

/** Read the scale every second degree — that is all a triad is. */
function triadOn(degree: number): Chord {
  const semitones = [0, 2, 4].map((third) => {
    const step = degree + third;
    return SCALE[step % SCALE.length]! + 12 * Math.floor(step / SCALE.length);
  });

  const root = semitones[0]! % 12;
  // a minor third is three semitones, a major third four — so the chord can
  // name its own quality instead of being told it
  const minor = semitones[1]! - semitones[0]! === 3;

  return {
    degree,
    semitones,
    classes: semitones.map((semitone) => semitone % 12),
    name: NOTE_NAMES[root]! + (minor ? "m" : ""),
  };
}

export const CHORDS: readonly Chord[] = CONSONANT_DEGREES.map(triadOn);

const seedOf = (word: string): number => {
  let hash = 2166136261;
  for (const char of word) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

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

const classOfChar = (char: string): number =>
  PENTATONIC[pitchIndexForChar(char) % PENTATONIC.length]!;

/**
 * The chord a word carries. Every letter already names a note; the word's chord
 * is the triad that contains the most of them, which is the same question a
 * musician asks when harmonising a melody. So it is derived from the spelling
 * rather than looked up, and any word in any language gets one.
 *
 * Ties are common on short words, so the whole word breaks them — "cat" and
 * "act" name the same notes but not the same chord.
 */
export function chordForWord(word: string): Chord {
  const wanted = [...word].filter((char) => char.trim() !== "").map(classOfChar);
  // start the scan at a different chord for each word, so the ties short words
  // produce don't all fall to the same triad
  const offset = seedOf(word) % CHORDS.length;

  let best = CHORDS[offset]!;
  let bestScore = -1;

  for (let i = 0; i < CHORDS.length; i += 1) {
    const chord = CHORDS[(i + offset) % CHORDS.length]!;
    const score = wanted.filter((pitch) => chord.classes.includes(pitch)).length;

    if (score > bestScore) {
      best = chord;
      bestScore = score;
    }
  }

  return best;
}

/** The pad voicing: the triad sitting an octave below the melody. */
export const voicing = (chord: Chord): number[] =>
  chord.semitones.map((semitone) => semitonesToHz(semitone - 12));

/** The bass note under it, an octave below that again. */
export const bassOf = (chord: Chord): number => semitonesToHz(chord.semitones[0]! - 24);

/** A semitone flat — where a mistyped note starts before it bends home. */
export const flat = (hz: number): number => hz * Math.pow(2, -1 / 12);

// --- Melody ----------------------------------------------------------------
//
// Letter-to-pitch on its own makes a word a random walk: every leap is in key,
// and none of it goes anywhere. So the melody is a walk with rules instead —
// open on a chord tone, move mostly by step, arc up then back down, and land
// on a chord tone. The step is taken from the letter itself rather than from a
// generator, which is what lets free mode take the same walk one key at a time
// without knowing the word in advance.

const clampIndex = (index: number): number =>
  Math.min(PITCHES.length - 1, Math.max(0, index));

const isChordTone = (index: number, chord: Chord): boolean =>
  chord.classes.includes(PENTATONIC[index % PENTATONIC.length]!);

/** Which notes of the pool the chord contains. Never empty, for any triad. */
export function chordToneIndices(chord: Chord): number[] {
  return PITCHES.map((_, i) => i).filter((i) => isChordTone(i, chord));
}

/** The nearest note that sits inside the chord. */
export function settle(index: number, chord: Chord): number {
  for (let step = 0; step < PITCHES.length; step += 1) {
    for (const candidate of [index - step, index + step]) {
      const clamped = clampIndex(candidate);
      if (isChordTone(clamped, chord)) return clamped;
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
export function resolveFrom(previous: number, chord: Chord): number {
  for (const offset of [-1, 1, -2, 2, 0]) {
    const candidate = clampIndex(previous + offset);
    if (isChordTone(candidate, chord)) return candidate;
  }

  // At the very bottom of the range under a chord that shares only two notes
  // with the pool, there is nothing within a step to land on, and returning
  // `previous` left the line hanging unresolved. Take the nearest one instead:
  // a third is still a consonant leap, and arriving matters more than the step.
  return settle(previous, chord);
}

/** How far, and which way, one letter moves the line. */
const STEPS = [1, 1, 2, 1, 0, 1, 2];

export function stepTo(previous: number, char: string, rising: boolean): number {
  const code = char.toLowerCase().charCodeAt(0);
  const step = STEPS[code % STEPS.length]!;
  // lean with the arc three times out of four, so the shape holds but the
  // letters still get to argue with it
  const direction = code % 4 === 0 ? -1 : 1;

  return clampIndex(previous + (rising ? direction : -direction) * step);
}

/** Where a line starts: a chord tone in the middle of the range. */
export const openingNote = (word: string, chord: Chord): number =>
  settle(PENTATONIC.length + (seedOf(word) % PENTATONIC.length), chord);

/**
 * The melodic line a word plays when it is typed correctly, one note per
 * letter. Mistyped letters leave the line rather than joining it, which is
 * what makes a clean word sound more resolved than a scrambled one.
 */
export function phraseFor(word: string, chord: Chord): number[] {
  const letters = [...word];
  const length = Math.max(letters.length, 1);

  let index = openingNote(word, chord);
  const indices = [index];

  for (let note = 1; note < length; note += 1) {
    index = stepTo(index, letters[note] ?? "a", note < length / 2);
    indices.push(index);
  }

  // the last note resolves, so finishing a word feels like an arrival
  if (indices.length > 1) {
    indices[indices.length - 1] = resolveFrom(indices[indices.length - 2]!, chord);
  }

  return indices.map((i) => PITCHES[i]!);
}

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
