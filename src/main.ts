import { playChord, playNote, playUndo, setMuted, setTempo, unlock } from "./audio/engine.ts";
import {
  bassOf,
  bpmFromIntervals,
  brightnessFromBpm,
  charToFreq,
  type Chord,
  chordForWord,
  flat,
  openingNote,
  phraseFor,
  PITCHES,
  resolveFrom,
  stepTo,
  voicing,
} from "./audio/music.ts";
import { back, createSession, type Mode, press, renderWord } from "./typing/session.ts";

/** Narrowing a module-level const doesn't reach into the handlers below, so
 * the null check has to happen where the element is bound. */
function must<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`the instrument is missing ${selector}`);
  return found;
}

const stage = must<HTMLElement>("#stage");
const keys = must<HTMLInputElement>("#keys");
const tempo = must<HTMLElement>("#tempo");
const hint = must<HTMLElement>("#hint");
const chordLabel = must<HTMLElement>("#chord");
const mute = must<HTMLButtonElement>("#mute");
const modeButton = must<HTMLButtonElement>("#mode");

let session = createSession();

/** How much of the word list is drawn: enough to read ahead, not the whole tail. */
const BEHIND = 6;
const AHEAD = 28;

function draw(): void {
  const from = Math.max(0, session.index - BEHIND);
  const to = Math.min(session.words.length, session.index + AHEAD);
  const line = document.createDocumentFragment();

  for (let w = from; w < to; w += 1) {
    const word = document.createElement("span");
    word.className = "word";
    if (w < session.index) word.classList.add("done");

    const caretAt = session.typed[w]!.length;
    for (const [i, { char, state }] of renderWord(session, w).entries()) {
      const glyph = document.createElement("span");
      glyph.className = `ch ${state}`;
      if (w === session.index && i === caretAt) glyph.classList.add("caret");
      glyph.textContent = char;
      word.append(glyph);
    }

    // the caret sits past the last letter once a word is fully typed
    if (w === session.index && caretAt >= renderWord(session, w).length) {
      const tail = document.createElement("span");
      tail.className = "ch pending caret";
      tail.textContent = " ";
      word.append(tail);
    }

    line.append(word);
  }

  stage.replaceChildren(line);
}

let started = false;

function begin(): void {
  unlock();
  if (started) return;
  started = true;
  hint.classList.add("gone");
  document.body.classList.add("playing");
}

function readTempo(): void {
  const bpm = bpmFromIntervals(session.intervals);
  setTempo(bpm, brightnessFromBpm(bpm));
  tempo.textContent = `${bpm} bpm`;
}

function pulse(state: string): void {
  document.body.dataset["last"] = state;
}

/** The chord sounding now — chosen by the word before this one. */
let chord: Chord = chordForWord("");
/** Where the melody line currently sits, which is all free mode needs to know. */
let line = openingNote("", chord);

function showChord(): void {
  chordLabel.textContent = chord.name;
}

function handleChar(char: string): void {
  begin();

  const word = session.words[session.index] ?? "";
  const typed = session.typed[session.index] ?? "";
  const at = typed.length;
  const result = press(session, char, performance.now());

  if (result.wordComplete) {
    // the word you just finished names the chord that follows it, and the line
    // comes to rest on a note that chord contains
    chord = chordForWord(session.mode === "free" ? typed : word);
    line = resolveFrom(line, chord);
    playChord(voicing(chord), bassOf(chord), PITCHES[line]!);
    showChord();
    pulse("word");
  } else if (session.mode === "free") {
    // no word known in advance, so the line walks one letter at a time — the
    // same rules the composed phrase is built from, applied live
    line = stepTo(line, char, at % 8 < 4);
    playNote(PITCHES[line]!);
    pulse("hit");
  } else {
    const phrase = phraseFor(word, chord);
    // typed correctly, the letter takes its place in the word's composed line;
    // mistyped, it steps off the line onto the note its own letter names, a
    // semitone flat and bending home — a blue note, not a buzzer
    const onLine = result.matched && at < phrase.length;
    const freq = onLine ? phrase[at]! : charToFreq(char);
    if (onLine) line = PITCHES.indexOf(freq);
    playNote(freq, result.matched ? undefined : flat(freq));
    pulse(result.matched ? "hit" : "bent");
  }

  readTempo();
  draw();
}

function handleBack(): void {
  begin();
  if (back(session, performance.now())) {
    playUndo();
    pulse("undo");
  }
  readTempo();
  draw();
}

// Desktop: the keydown carries the character, so take it and stop the browser
// scrolling on space.
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "Backspace") {
    event.preventDefault();
    handleBack();
    return;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    handleChar(event.key);
  }
});

// Phones: the software keyboard reports "Unidentified" on keydown, so the real
// character only shows up here. The hidden input exists to summon that keyboard.
keys.addEventListener("beforeinput", (event) => {
  const input = event as InputEvent;
  if (input.inputType === "deleteContentBackward") {
    input.preventDefault();
    handleBack();
    return;
  }

  if (input.inputType.startsWith("insert") && input.data) {
    input.preventDefault();
    for (const char of input.data) handleChar(char);
  }
});

// Any tap is both the audio-unlock gesture and the request for a keyboard.
document.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("button, a")) return;
  keys.focus();
  unlock();
});

function switchTo(mode: Mode): void {
  session = createSession(mode);
  chord = chordForWord("");
  line = openingNote("", chord);
  modeButton.textContent = mode === "free" ? "free" : "words";
  modeButton.setAttribute("aria-pressed", String(mode === "free"));
  document.body.dataset["mode"] = mode;
  showChord();
  readTempo();
  draw();
  keys.focus();
}

modeButton.addEventListener("click", () => {
  switchTo(session.mode === "free" ? "prompt" : "free");
});

mute.addEventListener("click", () => {
  const next = mute.getAttribute("aria-pressed") !== "true";
  mute.setAttribute("aria-pressed", String(next));
  mute.textContent = next ? "sound off" : "sound on";
  setMuted(next);
});

keys.focus();
showChord();
readTempo();
draw();
