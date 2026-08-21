import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Checkable lines from this week's spec (crits/04-instrument): sound made live
// by Web Audio, not played back from a file, and no pre-recorded <audio>/<video>
// standing in for the instrument. Everything else in the spec ("expressive",
// "a stranger can play it uninstructed", "no way to play it wrong") is judged
// live at the crit, not by a test.
const DIST = resolve("dist");

function files(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const shipped = files();
const scripts = shipped
  .filter((path) => path.endsWith(".js"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const pages = shipped
  .filter((path) => path.endsWith(".html"))
  .map((path) => new JSDOM(readFileSync(path, "utf8")).window.document);

describe("an instrument", () => {
  it("uses the Web Audio API to synthesize sound client-side", () => {
    expect(
      scripts,
      "no AudioContext found in the shipped JS — sound should be synthesized live, not played back",
    ).toMatch(/AudioContext/);
  });

  it("does not ship a pre-recorded track as the instrument", () => {
    for (const doc of pages) {
      const media = doc.querySelectorAll("audio[src], video[src]");
      expect(
        media.length,
        "the spec calls for sound made live by the player, not a pre-recorded file",
      ).toBe(0);
    }
  });
});
