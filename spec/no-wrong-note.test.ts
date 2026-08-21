import { describe, expect, it } from "vitest";

import {
  bpmFromIntervals,
  charToFreq,
  CHORDS,
  flat,
  chordForWord,
  chordToneIndices,
  MAX_BPM,
  MIN_BPM,
  phraseFor,
  PITCHES,
  resolveFrom,
  stepTo,
} from "../src/audio/music.ts";

// The spec line this file exists for: "there is no way to play it wrong — no
// score, no fail state". For a musical instrument that means the pitch set,
// not the UI: whatever a player presses, it has to land in key. Asserting it
// over the pure module means it survives a rewrite of the audio layer.

const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));

describe("no way to play it wrong", () => {
  it("maps every printable character into the pentatonic pool", () => {
    const allowed = new Set(PITCHES);

    for (const char of PRINTABLE) {
      expect(
        allowed.has(charToFreq(char)),
        `"${char}" sounded a pitch outside the scale — that is a wrong note`,
      ).toBe(true);
    }
  });

  it("gives the same character the same pitch every time", () => {
    for (const char of PRINTABLE) {
      expect(charToFreq(char)).toBe(charToFreq(char));
    }
  });

  it("treats case as the same note, so caps lock is not a mistake", () => {
    expect(charToFreq("a")).toBe(charToFreq("A"));
    expect(charToFreq("q")).toBe(charToFreq("Q"));
  });

  it("bends a mistyped note from below, not from nowhere", () => {
    const target = charToFreq("m");
    expect(flat(target)).toBeLessThan(target);
    expect(flat(target)).toBeGreaterThan(target * 0.9);
  });
});

// A word typed correctly should sound composed rather than scattered, so the
// phrase it plays is held to the rules that make it sound that way: in the
// pool, moving by step, and arriving somewhere the chord agrees with.

const WORDS = ["a", "to", "salt", "morning", "junction", "extraordinarily"];

describe("a correctly typed word plays a phrase", () => {
  it("stays inside the pentatonic pool", () => {
    const allowed = new Set(PITCHES);

    for (const word of WORDS) {
      for (const chord of CHORDS) {
        for (const freq of phraseFor(word, chord)) {
          expect(allowed.has(freq), `"${word}" left the scale`).toBe(true);
        }
      }
    }
  });

  it("gives one note per letter", () => {
    for (const word of WORDS) {
      expect(phraseFor(word, CHORDS[0]!)).toHaveLength(Math.max(word.length, 1));
    }
  });

  it("plays the same line for the same word under the same chord", () => {
    expect(phraseFor("morning", CHORDS[2]!)).toEqual(phraseFor("morning", CHORDS[2]!));
  });

  it("writes a different line under a different chord", () => {
    const lines = CHORDS.map((chord) => phraseFor("junction", chord).join());
    expect(new Set(lines).size).toBeGreaterThan(1);
  });

  it("moves by step, never by a leap you have to catch up with", () => {
    // a third is the widest jump allowed, and only where a resolution needs it
    for (const word of WORDS) {
      for (const chord of CHORDS) {
        const degrees = phraseFor(word, chord).map((freq) => PITCHES.indexOf(freq));

        for (let i = 1; i < degrees.length; i += 1) {
          const leap = Math.abs(degrees[i]! - degrees[i - 1]!);
          expect(leap, `"${word}" leapt ${leap} degrees mid-word`).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("scatters more when the word is typed wrong than when it is typed right", () => {
    // the point of the phrase: the composed line should be smoother than the
    // letter-by-letter notes a scrambled attempt would sound
    const word = "extraordinarily";
    const spread = (freqs: number[]): number => {
      const degrees = freqs.map((freq) => PITCHES.indexOf(freq));
      let total = 0;
      for (let i = 1; i < degrees.length; i += 1) {
        total += Math.abs(degrees[i]! - degrees[i - 1]!);
      }
      return total / (degrees.length - 1);
    };

    const played = spread(phraseFor(word, CHORDS[0]!));
    const scattered = spread([...word].map(charToFreq));

    expect(played).toBeLessThan(scattered);
  });
});

describe("cadence reads as tempo", () => {
  it("stays inside the musical range however fast or slow you type", () => {
    for (const gap of [1, 10, 60, 120, 400, 5000, 60000]) {
      const bpm = bpmFromIntervals([gap, gap, gap]);
      expect(bpm).toBeGreaterThanOrEqual(MIN_BPM);
      expect(bpm).toBeLessThanOrEqual(MAX_BPM);
    }
  });

  it("has a tempo before anyone has typed anything", () => {
    expect(bpmFromIntervals([])).toBe(MIN_BPM);
  });

  it("reads faster typing as a faster tempo", () => {
    expect(bpmFromIntervals([100, 100, 100])).toBeGreaterThan(
      bpmFromIntervals([300, 300, 300]),
    );
  });

  it("ignores one long pause instead of collapsing the tempo", () => {
    const steady = [120, 120, 120, 120, 120];
    expect(bpmFromIntervals([...steady, 9000])).toBe(bpmFromIntervals(steady));
  });
});

// Free mode has no prompt, so every key is correct by definition and the line
// has to hold together without knowing the word in advance.

describe("free mode walks the same line one key at a time", () => {
  const TYPED = "hello there this is whatever i felt like typing";

  it("never leaves the pool, whatever is typed", () => {
    let line = 0;
    for (const [i, char] of [...TYPED].entries()) {
      line = stepTo(line, char, i % 8 < 4);
      expect(PITCHES[line]).toBeDefined();
    }
  });

  it("moves by step, so a live walk is as smooth as a composed phrase", () => {
    let line = 7;
    for (const [i, char] of [...TYPED].entries()) {
      const next = stepTo(line, char, i % 8 < 4);
      expect(Math.abs(next - line)).toBeLessThanOrEqual(2);
      line = next;
    }
  });

  it("comes to rest on a note the chord contains", () => {
    for (const chord of CHORDS) {
      for (let line = 0; line < PITCHES.length; line += 1) {
        const landing = resolveFrom(line, chord);
        expect(chordToneIndices(chord)).toContain(landing);
        expect(Math.abs(landing - line)).toBeLessThanOrEqual(3);
      }
    }
  });
});

// Any word at all has to yield a chord — that is what makes free mode possible
// without a dictionary in the bundle.

describe("every word carries a chord", () => {
  const WORDS_IN_THE_WILD = [
    "hello",
    "a",
    "the",
    "antidisestablishmentarianism",
    "xyz",
    "COMP4020",
    "ok!!!",
    "café",
    "日本語",
    "",
  ];

  it("names one for anything you can type", () => {
    for (const word of WORDS_IN_THE_WILD) {
      const chord = chordForWord(word);
      expect(chord.semitones, `"${word}" got no chord`).toHaveLength(3);
      expect(chord.name).toMatch(/^[A-G]#?m?$/);
    }
  });

  it("builds only triads the key actually contains", () => {
    const scale = new Set([0, 2, 3, 5, 7, 8, 10]);
    for (const chord of CHORDS) {
      for (const pitch of chord.classes) {
        expect(scale.has(pitch), `${chord.name} used a note outside the key`).toBe(true);
      }
    }
  });

  it("leaves every chord some of the melody pool to agree with", () => {
    for (const chord of CHORDS) {
      expect(chordToneIndices(chord).length, `${chord.name} shares nothing with the scale`)
        .toBeGreaterThan(0);
    }
  });

  it("gives the same word the same chord every time", () => {
    expect(chordForWord("morning").name).toBe(chordForWord("morning").name);
  });

  it("does not collapse every word onto one chord", () => {
    const words = "the quick brown fox jumps over a lazy dog and then some".split(" ");
    const names = new Set(words.map((word) => chordForWord(word).name));
    expect(names.size).toBeGreaterThan(2);
  });
});
