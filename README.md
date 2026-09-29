# Nebula Wing

Nebula Wing is a browser-only 2D arcade shooter built with TypeScript, Vite, and the HTML5 Canvas 2D API. The canvas uses a fixed 960×540 logical resolution and scales to a 16:9 desktop viewport.

## Live demo

Play the game on [GitHub Pages](https://ulgerang.github.io/nebula-wing-arcade/).

## Commands

Use Node.js with npm or pnpm:

```text
npm install
npm run dev
npm run test
npm run build
npm run preview
```

The development server uses `http://127.0.0.1:4173/`. The production build is written to `dist/` as static HTML, CSS, JavaScript, and image assets. Run `preview` after `build` to serve that output locally.

## Project structure

- `src/`: game state, input, rendering, audio, storage, and runtime code
- `data/`: data-driven wave definitions
- `assets/generated/`: generated sprite sheets and their metadata
- `assets/`: asset inventory and license/source records
- `tests/`: score, combo, collision, wave, and storage validation tests
- `scripts/`: build or verification helpers
- `SPEC.md`: product and technical specification
- `TASK.md`: implementation task breakdown and verification notes
- `ACCEPTANCE.md`: executable acceptance criteria and release gate

## Controls

- `A` / `D` or `Left` / `Right`: move
- `Space` or `Z`: fire; hold for automatic fire
- `Esc` or `P`: pause and resume
- `Enter`: start or view results
- `R`: restart from the pause or game-over screen
- `T`: return to the title from pause, game-over, or results

The Settings screen supports additional key bindings, separate BGM and sound-effect volume, reduced flashes, screen shake, and a high-contrast projectile palette. Settings and high scores are stored in `localStorage`; play remains available when browser storage is blocked. Audio is synthesized through Web Audio, so the build does not depend on audio files or autoplay before user input. Portrait layouts show a landscape-orientation prompt.
