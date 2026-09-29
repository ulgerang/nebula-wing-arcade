# Asset inventory

The MVP uses Canvas rendering and Web Audio synthesis. Generated sprite sheets are loaded by `src/assets.ts` and used by the game renderer when available; the original procedural visuals remain as a safe fallback.

| Asset group | Source | License or permission | Final build status |
|---|---|---|---|
| Current player, enemies, bullets, particles, background, HUD icons | `src/game.ts` canvas drawing | Original implementation | Included |
| Prepared player sprite sheet | `assets/generated/sprites/player/player_sheet.png` | Generated for this project with the built-in image generation tool | Loaded with fallback |
| Prepared enemy roster sprite sheet | `assets/generated/sprites/enemies/enemy_roster_sheet.png` | Generated for this project with the built-in image generation tool | Loaded with fallback |
| Prepared combat VFX sprite sheet | `assets/generated/sprites/vfx/combat_vfx_sheet.png` | Generated for this project with the built-in image generation tool | Loaded with fallback |
| Sprite frame layouts and usage notes | `assets/generated/metadata/*.json` | Project metadata | Included |
| Title and interface typography | System monospace fonts | Browser/system-provided | Included |
| BGM and gameplay sound effects | `src/audio.ts` Web Audio synthesis | Original implementation | Included |

## Generated asset layout

```text
assets/generated/
├─ metadata/
│  ├─ player_sheet.json
│  ├─ enemy_roster_sheet.json
│  └─ combat_vfx_sheet.json
├─ source/
│  ├─ player_idle_boost_sheet_raw.png
│  ├─ enemy_roster_sheet_raw.png
│  └─ combat_vfx_sheet_raw.png
└─ sprites/
   ├─ player/player_sheet.png       # 4 × 2, 444 × 444 cells
   ├─ enemies/enemy_roster_sheet.png # 5 × 2, 400 × 400 cells
   └─ vfx/combat_vfx_sheet.png      # 4 × 4, 320 × 320 cells
```

All prepared sheets are PNGs with an alpha channel and normalized integer cell sizes. See the matching metadata file before wiring a sheet into the loader. No third-party or trademarked game asset is bundled.
