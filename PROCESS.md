# Process overview

## What I built

A typing instrument. Words scroll under a caret, every key you press sounds a
note synthesized live with the Web Audio API, finishing a word moves the harmony
one step through a four-chord loop, and the median gap between your keystrokes
sets the tempo of a backing pulse. It looks like a typing test and deliberately
is not one: there is no accuracy figure, no results screen and no way to finish.

![The opening screen: a large "Type anything", one line of invitation, and dim
words waiting under a caret](docs/cold.png)

## The moments that mattered

### The page made sound and the spec stayed red

`spec/instrument.test.ts` reads `dist/**/*.js` and looks for `AudioContext`.
The page worked in the browser, but Astro had inlined the whole script into
`index.html`, so `dist/` shipped no `.js` at all and the test was still red.
The obvious move was to keep adding code until the file crossed Astro's inline
threshold on its own. That would have passed by accident and broken again later,
so I changed the build instead: `vite.build.assetsInlineLimit: 0`, which makes
the artifact the spec reads the same artifact the page runs. The test went green
on a file I could point at, and the reason is a comment in the config rather
than a fact I have to remember
([`79ee5f1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-isaacboentoro/commit/79ee5f1)).

### Turning a judged spec line into a checkable one

"There is no way to play it wrong --- no score, no fail state" reads like
something only the crit can judge. For an instrument it isn't: it is a claim
about the pitch set. So the scale, the chord loop and the cadence maths went
into `src/audio/music.ts` as pure functions with no `AudioContext` import ---
jsdom has none, so that separation is what makes the claim testable at all ---
and `spec/no-wrong-note.test.ts` now walks every printable ASCII character and
fails if any of them sounds a pitch outside the scale
([`b57e492`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-isaacboentoro/commit/b57e492)).

### The screenshot that contradicted the code

The code said a mistyped letter is a blue note. The rendered page said
otherwise: amber with an underline, which is what a spell-checker looks like,
and anyone typing their own words instead of the prompt saw a screen full of
them. I only caught it by looking at a headless-Chromium screenshot rather than
the diff. The fix was amber italic --- same information, read as variation
instead of error
([`829c0ea`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-isaacboentoro/commit/829c0ea)).

![Mid-play: typed letters bright, bent notes in amber italic, tempo reading 159
bpm](docs/playing.png)

The same session found something the harness had to carry: the screenshot rig
cannot emulate `pointer: coarse`, so a media query I had written for phones was
untestable. I deleted the branch rather than ship one I had not seen, and wrote
the rule down with the other two that cost time this week
([`87998c0`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-isaacboentoro/commit/87998c0)).

### Deriving the harmony instead of listing it

Free typing needed a chord for any word a stranger might type, and the obvious
answer --- a lookup table, or a hash into a fixed progression --- would have
been arbitrary the moment anyone asked why. So the rule is the one a musician
uses: every letter already names a note, and a word's chord is the triad
containing the most of them. The triads are stacked out of the scale rather
than listed, so there is no table of music anywhere in the repo and any word in
any language gets a chord.

What told me it was right was reading a sentence's worth of output rather than
the code: `the quick brown fox jumps over a lazy dog` plays C G C Dm Em Am Dm F
Am, a progression the player wrote by choosing words
([`180d608`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-isaacboentoro/commit/180d608)).

The same test file caught two bugs the code read as correct on the way there:
the final note of a phrase could still leap a third, and at the bottom of the
range under a chord sharing only two notes with the scale, a line failed to
resolve at all and just stopped. Both were invisible in review and both failed
the moment the rules were written down as assertions.

![Free mode: no prompt, just what has been typed, with the chord the last word
chose](docs/free.png)
