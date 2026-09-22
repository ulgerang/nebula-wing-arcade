export type GameStateName = 'Loading' | 'Title' | 'Playing' | 'Paused' | 'Bonus' | 'GameOver' | 'Result';

export type EnemyType = 'scout' | 'hunter' | 'bruiser' | 'carrier' | 'bonusDrone';

export type DivePattern = 'SWOOP' | 'DIAGONAL';

export interface Settings {
  bgmVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  reducedFlash: boolean;
  colorTheme: 'default' | 'high-contrast';
  keyBindings: {
    left: string;
    right: string;
    fire: string;
    pause: string;
  };
}

export interface HighScoreEntry {
  name: string;
  score: number;
  stage: number;
  date: string;
}

export interface SaveData {
  version: 1;
  highScores: HighScoreEntry[];
  settings: Settings;
}

export interface WaveEnemyDefinition {
  type: EnemyType;
  count: number;
  spawnDelay: number;
}

export interface WaveDefinition {
  stage: number;
  wave: number;
  formation: 'V_SHAPE' | 'GRID' | 'DIAMOND';
  enemies: WaveEnemyDefinition[];
  attackPattern: DivePattern;
  clearBonus: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  state: 'entering' | 'formation' | 'dive' | 'dead';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  score: number;
  formationIndex: number;
  formationName: WaveDefinition['formation'];
  divePattern: DivePattern;
  diveElapsed: number;
  diveDuration: number;
  diveStartX: number;
  diveStartY: number;
  diveTargetX: number;
  fireCooldown: number;
  hitFlash: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  radius: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

export interface GameSnapshot {
  state: GameStateName;
  score: number;
  stage: number;
  wave: number;
  lives: number;
  comboCount: number;
  comboMultiplier: number;
  highScore: number;
  highScores: HighScoreEntry[];
  qualifiesForHighScore: boolean;
  lastRunScore: number;
  lastRunStage: number;
}
