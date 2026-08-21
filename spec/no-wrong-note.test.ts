import { describe, expect, it } from "vitest";

import {
  bpmFromIntervals,
  charToFreq,
  flat,
  MAX_BPM,
  MIN_BPM,
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
