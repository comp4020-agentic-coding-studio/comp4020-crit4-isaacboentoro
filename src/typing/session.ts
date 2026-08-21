// Typing state. No DOM, no audio, no tally of how well you're doing — the
// session only knows what is on screen and what you've pressed so far.

const CORPUS = [
  "morning", "river", "slow", "glass", "amber", "quiet", "north", "linen",
  "harbour", "candle", "field", "paper", "salt", "willow", "drift", "copper",
  "storm", "orchard", "lantern", "gravel", "hollow", "meadow", "tide", "birch",
  "shadow", "signal", "velvet", "marble", "cinder", "ripple", "thistle", "dusk",
  "fathom", "kettle", "murmur", "pebble", "rafter", "sable", "timber", "wander",
  "ember", "frost", "garden", "honey", "island", "junction", "kindle", "lull",
  "mantle", "nettle", "opal", "prairie", "quill", "rustle", "summit", "trellis",
  "umber", "vessel", "weather", "yarrow", "zephyr", "anchor", "bramble", "clover",
];

/** Words kept ahead of the caret, so the line never runs out mid-flow. */
const LOOKAHEAD = 60;
/** Words kept behind it, so the DOM doesn't grow without bound. */
const TRAIL = 12;

export interface Session {
  /** The words on screen, oldest first. */
  words: string[];
  /** What the player actually typed for each word, aligned with `words`. */
  typed: string[];
  /** Index of the word the caret is in. */
  index: number;
  /** Gaps between recent keystrokes, in milliseconds. */
  intervals: number[];
  lastPressAt: number;
}

const pick = (): string => CORPUS[Math.floor(Math.random() * CORPUS.length)]!;

export function createSession(): Session {
  const words = Array.from({ length: LOOKAHEAD }, pick);
  return {
    words,
    typed: words.map(() => ""),
    index: 0,
    intervals: [],
    lastPressAt: 0,
  };
}

/** Top up ahead of the caret and drop what has scrolled well behind it. */
function refill(session: Session): void {
  while (session.words.length - session.index < LOOKAHEAD) {
    session.words.push(pick());
    session.typed.push("");
  }

  if (session.index > TRAIL * 2) {
    const drop = session.index - TRAIL;
    session.words.splice(0, drop);
    session.typed.splice(0, drop);
    session.index -= drop;
  }
}

function recordCadence(session: Session, now: number): void {
  if (session.lastPressAt > 0) {
    const gap = now - session.lastPressAt;
    // a pause to think isn't a tempo change, so cap what one gap can say
    session.intervals.push(Math.min(gap, 1200));
    if (session.intervals.length > 12) session.intervals.shift();
  }
  session.lastPressAt = now;
}

export interface Press {
  /** The character the player pressed. */
  char: string;
  /** Whether it was the character the word wanted next. */
  matched: boolean;
  /** True when this press finished a word. */
  wordComplete: boolean;
}

/** A printable keystroke. A space finishes the current word. */
export function press(session: Session, char: string, now: number): Press {
  recordCadence(session, now);

  if (char === " ") {
    session.index += 1;
    refill(session);
    return { char, matched: true, wordComplete: true };
  }

  const word = session.words[session.index] ?? "";
  const at = session.typed[session.index]!.length;
  session.typed[session.index] += char;

  return { char, matched: word[at] === char, wordComplete: false };
}

/** Backspace. Steps back into the previous word once this one is empty. */
export function back(session: Session, now: number): boolean {
  recordCadence(session, now);

  const current = session.typed[session.index]!;
  if (current.length > 0) {
    session.typed[session.index] = current.slice(0, -1);
    return true;
  }

  if (session.index > 0) {
    session.index -= 1;
    return true;
  }

  return false;
}

export type CharState = "hit" | "bent" | "extra" | "pending";

export interface RenderedChar {
  char: string;
  state: CharState;
}

/** How one word should be drawn: typed characters, then whatever is left. */
export function renderWord(session: Session, wordIndex: number): RenderedChar[] {
  const word = session.words[wordIndex] ?? "";
  const typed = session.typed[wordIndex] ?? "";
  const out: RenderedChar[] = [];

  for (const [i, char] of [...typed].entries()) {
    if (i >= word.length) out.push({ char, state: "extra" });
    else out.push({ char, state: word[i] === char ? "hit" : "bent" });
  }

  for (const char of word.slice(typed.length)) {
    out.push({ char, state: "pending" });
  }

  return out;
}
