# Nebula Wing

Nebula Wing is a browser-only 2D fixed-screen arcade shooter built with TypeScript, Vite, and the HTML5 Canvas 2D API.

## Commands

Use Node.js with npm or pnpm:

```text
npm install
npm run dev
npm run test
npm run build
```

The development server uses `http://127.0.0.1:4173/`. The production output is written to `dist/` and contains only static files.

## Project structure

- `src/`: game state, input, rendering, audio, storage, and runtime code
- `data/`: data-driven wave definitions
- `assets/`: asset inventory and license/source records
- `tests/`: core score, combo, wave, and storage validation tests
- `scripts/`: build or verification helpers
- `SPEC.md`: product and technical specification
- `TASK.md`: implementation task breakdown and verification notes
- `ACCEPTANCE.md`: executable acceptance criteria and release gate

## Controls

- `A` / `D` or `Left` / `Right`: move
- `Space` or `Z`: fire; hold for automatic fire
- `Esc` or `P`: pause and resume
- `Enter`: start, view results, or restart after score submission
- `R`: restart from the pause or game-over screen
- `T`: return to the title from the pause screen
