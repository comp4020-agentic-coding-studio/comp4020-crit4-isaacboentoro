import { describe, expect, it } from "vitest";

import {
  bpmFromIntervals,
  charToFreq,
  CHORDS,
  flat,
  MAX_BPM,
  MIN_BPM,
  phraseFor,
  PITCHES,
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
      for (const [chord] of CHORDS.entries()) {
        for (const freq of phraseFor(word, chord)) {
          expect(allowed.has(freq), `"${word}" left the scale`).toBe(true);
        }
      }
    }
  });

  it("gives one note per letter", () => {
    for (const word of WORDS) {
      expect(phraseFor(word, 0)).toHaveLength(Math.max(word.length, 1));
    }
  });

  it("plays the same line for the same word under the same chord", () => {
    expect(phraseFor("morning", 2)).toEqual(phraseFor("morning", 2));
  });

  it("writes a different line under a different chord", () => {
    const lines = CHORDS.map((_, chord) => phraseFor("junction", chord).join());
    expect(new Set(lines).size).toBeGreaterThan(1);
  });

  it("moves by step, never by a leap you have to catch up with", () => {
    for (const word of WORDS) {
      for (const [chord] of CHORDS.entries()) {
        const degrees = phraseFor(word, chord).map((freq) => PITCHES.indexOf(freq));

        for (let i = 1; i < degrees.length; i += 1) {
          const leap = Math.abs(degrees[i]! - degrees[i - 1]!);
          expect(leap, `"${word}" leapt ${leap} degrees mid-word`).toBeLessThanOrEqual(2);
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

    const played = spread(phraseFor(word, 0));
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
