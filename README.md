# Type anything

A typing instrument for COMP4020 crit 4. Words scroll under a caret and every
key you press sounds a note, synthesized live in the browser with the Web Audio
API. It is not a typing test: there is no accuracy figure, no results screen and
no way to finish.

- **Every key is a note.** Pitches come from one fixed pentatonic pool, so
  nothing you press can be out of key.
- **A mistyped letter is a blue note.** It lands a semitone flat and bends home
  over a tenth of a second. Nothing ever turns red.
- **Finishing a word moves the harmony** one step through a four-chord loop.
- **Your typing cadence is the tempo.** The median gap between keystrokes sets
  the bpm of the backing pulse and opens the filter as you speed up.
- **Two people sound different** typing the same words, because rhythm, pauses
  and mistakes are all instrument controls.

Playable with a keyboard, or by tapping the page on a phone to bring up the
software keyboard.

## Where things are

- `src/audio/music.ts` --- the scale, the chord loop and the cadence-to-tempo
  maths. Pure functions, no Web Audio, so they can be tested.
- `src/audio/engine.ts` --- the AudioContext, the voices and the backing pulse.
- `src/typing/session.ts` --- what is on screen and what has been typed. Keeps
  no tally of how well you are doing.
- `src/main.ts` --- keyboard, touch and rendering.
- `spec/no-wrong-note.test.ts` --- asserts the "no way to play it wrong" spec
  line against the pitch set.

## Running it

```sh
mise install       # supported path: install the template's Node and pnpm
pnpm install
pnpm dev             # local dev server
pnpm check           # most of what CI runs (links, secrets and deploy are CI-only)
pnpm check:evidence  # the process-evidence check CI runs before you ship
pnpm build           # produce dist/ (what gets deployed)

# reproduce CI's links check before you push
pnpm dlx linkinator ./dist --silent --skip "^https?://(?!localhost|127)"
```

`mise` is the course's recommended runtime manager. If you use another manager
or the official installers, that is fine: provide the Node and pnpm versions in
`mise.toml`, then run the same commands. Tutor support reproduces runtime
problems with mise.

## What's here

- `src/` --- the prototype (see above).
- `mise.toml` --- the tested Node and pnpm versions.
- `spec/` --- what the checks are for (`README.md`), the shipped invariants
  (`invariants.test.ts`), the course's crit-4 contract (`instrument.test.ts`)
  and this prototype's own (`no-wrong-note.test.ts`).
- `CLAUDE.md` --- orients whoever works in this repo, you or a coding agent:
  what the checks mean and how to work here. Yours to grow.
- `PROCESS.md` --- the process overview, with cited commits;
  `pnpm check:evidence` verifies the citations resolve.
- `reflections/crit-4.md` --- this week's reflection.
- `.github/workflows/checks.yml` --- the CI sensors that run on every push once
  your repo is public, and the GitHub Pages deploy.
- `.githooks/pre-commit` --- blocks any commit that contains something shaped
  like an API key, so your COMP4020 key can't end up in a public repo. Installed
  automatically by `pnpm install`.

Built with Astro, which builds to plain HTML/CSS/JS and deploys to GitHub
Pages.
