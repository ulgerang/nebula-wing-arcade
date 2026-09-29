import type { EnemyType, SaveData, Settings, WaveDefinition } from './types';
import waveData from '../data/waves.json';

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;
export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.25;
export const INPUT_BUFFER_MS = 100;

export const COLORS = {
  background: '#050817',
  backgroundGlow: '#0b1536',
  text: '#e9f7ff',
  muted: '#86a4bd',
  player: '#5ff3d1',
  playerGlow: '#b9fff0',
  playerBullet: '#75fff0',
  enemyBullet: '#ff9b4a',
  scout: '#ff5b8d',
  hunter: '#a887ff',
  bruiser: '#ffcf5a',
  carrier: '#ff725e',
  bonus: '#69d7ff',
  danger: '#ff5e6a',
  good: '#9cff7c'
} as const;

export const ENEMY_CONFIG: Record<EnemyType, { hp: number; score: number; color: string; radius: number }> = {
  scout: { hp: 1, score: 50, color: COLORS.scout, radius: 15 },
  hunter: { hp: 1, score: 100, color: COLORS.hunter, radius: 16 },
  bruiser: { hp: 2, score: 200, color: COLORS.bruiser, radius: 20 },
  carrier: { hp: 3, score: 500, color: COLORS.carrier, radius: 24 },
  bonusDrone: { hp: 1, score: 100, color: COLORS.bonus, radius: 14 }
};

export const DEFAULT_SETTINGS: Settings = {
  bgmVolume: 0.18,
  sfxVolume: 0.32,
  screenShake: true,
  reducedFlash: false,
  colorTheme: 'default',
  keyBindings: {
    left: '',
    right: '',
    fire: '',
    pause: ''
  }
};

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  highScores: [],
  settings: DEFAULT_SETTINGS
};

export const WAVES: WaveDefinition[] = waveData as WaveDefinition[];
