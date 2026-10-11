# Facet

A browser puzzle of cut stones and stored pressure. Swap neighboring gems to make lines of three or more. Every clear strains the stones beside it. At three strain, a stone becomes flawed: the next clear beside it pulls it into the chain for double points.

Four in a line make a brilliant, five make a prism, and intersecting lines make a star. Reach the level target to continue with a fresh bench; the round ends when no productive swap remains.

## Run

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

The development server prints its address. To build the self-contained static site:

```sh
npm run build
npm run preview
```

Serve `dist/` from any static server, at the origin root or a subdirectory. All paths are relative. No backend, external downloads, credentials, or asset-generation tools are needed to build or play.

## Controls

- Mouse, pen, or touch: hold a gem, carry it onto a neighbor, and release. You can also tap a gem, then tap its neighbor. Returning to the selected cell withdraws the offer.
- Every menu has touch targets; PAUSE sits beside the board and BACK is on the instructions page.
- ↑ / ↓: menu selection; Enter / Space: choose.
- Escape / P: pause or resume. Escape also leaves instructions and the finished round.
- M: mute all sound. Audio unlocks on the first interaction.
- Backquote: engine diagnostics.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests exercise the game through the Simple 2D engine with a counted clock and native canvas, plus pure rule and input transitions. State and the debug surface are exported from `src/game.ts`; the engine owns frame timing, pointer mapping, input, audio, loading, canvas fitting, diagnostics, and recording.

## Original assets

The committed `public/assets/` collection contains 85 sprites and animation frames, four authored particle systems, nine event sounds with an eight-rung synthesized clear ladder and sampled glass body, and two original music pieces with MIDI scores. Each kind has its own silhouette and crown facets; separate PNGs carry every strain state.

`tools/produce-assets.py` documents the one-time authoring process using draw, draw-sheet, particle-2d, sfx-synth, sfx-sample, and music. It is never invoked by the build. Art is rendered as crisp pixel sprites, effects are simulated with the particle runtime, and file-backed audio plays through the engine's cue bus. Browser replay and screenshots live in `showcase/`; `tools/capture.mjs` captures them against a running development server using the project's Playwright.
