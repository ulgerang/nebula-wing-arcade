import { DEFAULT_SAVE, ENEMY_CONFIG } from './config';
import type { EnemyType, HighScoreEntry, SaveData, Settings, WaveDefinition } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function calculateScore(type: EnemyType, isDive: boolean, comboMultiplier = 1): number {
  const base = ENEMY_CONFIG[type].score;
  const diveMultiplier = isDive ? 2 : 1;
  return Math.round(base * diveMultiplier * comboMultiplier);
}

export function circlesOverlap(
  firstX: number,
  firstY: number,
  firstRadius: number,
  secondX: number,
  secondY: number,
  secondRadius: number
): boolean {
  const radius = firstRadius + secondRadius;
  const dx = firstX - secondX;
  const dy = firstY - secondY;
  return dx * dx + dy * dy <= radius * radius;
}

export function loseLife(lives: number): number {
  return Math.max(0, Math.floor(lives) - 1);
}

export function allEnemiesDefeated(enemies: ReadonlyArray<{ state: string }>): boolean {
  return enemies.length > 0 && enemies.every((enemy) => enemy.state === 'dead');
}

export function sortHighScores(entries: HighScoreEntry[]): HighScoreEntry[] {
  return [...entries]
    .sort((a, b) => b.score - a.score || b.stage - a.stage || a.date.localeCompare(b.date))
    .slice(0, 10);
}

export function qualifiesForHighScore(score: number, entries: HighScoreEntry[]): boolean {
  return entries.length < 10 || score > (entries[entries.length - 1]?.score ?? 0);
}

export function normalizeName(name: string): string {
  const normalized = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  return normalized.padEnd(3, 'A');
}

export function cloneDefaultSettings(): Settings {
  return {
    ...DEFAULT_SAVE.settings,
    keyBindings: { ...DEFAULT_SAVE.settings.keyBindings }
  };
}

export function parseStoredSave(raw: string | null): SaveData {
  if (!raw) {
    return { version: 1, highScores: [], settings: cloneDefaultSettings() };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('save is not an object');
    const candidate = parsed as Partial<SaveData>;
    if (candidate.version !== 1) throw new Error('unsupported save version');
    const highScores = Array.isArray(candidate.highScores)
      ? candidate.highScores
          .filter((entry): entry is HighScoreEntry => {
            if (!entry || typeof entry !== 'object') return false;
            const value = entry as Partial<HighScoreEntry>;
            return typeof value.name === 'string' && Number.isFinite(value.score) && Number.isFinite(value.stage);
          })
          .map((entry) => ({
            name: normalizeName(entry.name),
            score: Math.max(0, Math.floor(entry.score)),
            stage: Math.max(1, Math.floor(entry.stage)),
            date: typeof entry.date === 'string' ? entry.date : new Date().toISOString()
          }))
      : [];

    const candidateSettings = candidate.settings && typeof candidate.settings === 'object' ? candidate.settings : {};
    const settingsRecord = candidateSettings as Partial<Settings>;
    const savedBindings = settingsRecord.keyBindings && typeof settingsRecord.keyBindings === 'object'
      ? settingsRecord.keyBindings
      : {} as Partial<Settings['keyBindings']>;
    const settings: Settings = {
      bgmVolume: clampNumber(settingsRecord.bgmVolume, DEFAULT_SAVE.settings.bgmVolume),
      sfxVolume: clampNumber(settingsRecord.sfxVolume, DEFAULT_SAVE.settings.sfxVolume),
      screenShake: typeof settingsRecord.screenShake === 'boolean' ? settingsRecord.screenShake : DEFAULT_SAVE.settings.screenShake,
      reducedFlash: typeof settingsRecord.reducedFlash === 'boolean' ? settingsRecord.reducedFlash : DEFAULT_SAVE.settings.reducedFlash,
      colorTheme: settingsRecord.colorTheme === 'high-contrast' ? 'high-contrast' : 'default',
      keyBindings: {
        left: parseKeyBinding(savedBindings.left),
        right: parseKeyBinding(savedBindings.right),
        fire: parseKeyBinding(savedBindings.fire),
        pause: parseKeyBinding(savedBindings.pause)
      }
    };

    return { version: 1, highScores: sortHighScores(highScores), settings };
  } catch {
    return { version: 1, highScores: [], settings: cloneDefaultSettings() };
  }
}

function parseKeyBinding(value: unknown): string {
  if (typeof value !== 'string' || value.length > 24) return '';
  if (value === ' ') return value;
  const key = value.toLowerCase();
  if (key.length === 1 || ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'escape', 'enter', 'tab', 'backspace', 'delete'].includes(key)) {
    return key;
  }
  return '';
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

export function validateWaveData(waves: WaveDefinition[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(waves) || waves.length < 5) {
    errors.push('최소 5개 웨이브가 필요합니다.');
    return errors;
  }
  const formations = new Set(['V_SHAPE', 'GRID', 'DIAMOND']);
  const patterns = new Set(['SWOOP', 'DIAGONAL']);
  const enemyTypes = new Set(['scout', 'hunter', 'bruiser', 'carrier', 'bonusDrone']);
  waves.forEach((wave, index) => {
    if (!wave || !Number.isInteger(wave.stage) || !Number.isInteger(wave.wave) || wave.stage < 1 || wave.wave < 1) {
      errors.push(`웨이브 ${index + 1}: stage와 wave는 1 이상의 정수여야 합니다.`);
    }
    if (!formations.has(wave.formation)) errors.push(`웨이브 ${index + 1}: 편대 형식이 올바르지 않습니다.`);
    if (!patterns.has(wave.attackPattern)) errors.push(`웨이브 ${index + 1}: 공격 패턴이 올바르지 않습니다.`);
    if (!Array.isArray(wave.enemies) || wave.enemies.length === 0) {
      errors.push(`웨이브 ${index + 1}: 적 정의가 비어 있습니다.`);
      return;
    }
    wave.enemies.forEach((enemy) => {
      if (!enemyTypes.has(enemy.type) || !Number.isInteger(enemy.count) || enemy.count < 1 || !Number.isFinite(enemy.spawnDelay) || enemy.spawnDelay < 0) {
        errors.push(`웨이브 ${wave.wave}: 적 수와 spawnDelay가 올바르지 않습니다.`);
      }
    });
    if (!Number.isFinite(wave.clearBonus) || wave.clearBonus < 0) errors.push(`웨이브 ${wave.wave}: clearBonus가 올바르지 않습니다.`);
  });
  return errors;
}

export class ComboTracker {
  count = 0;
  multiplier = 1;
  timeSinceKill = Number.POSITIVE_INFINITY;

  advance(deltaSeconds: number): void {
    this.timeSinceKill += deltaSeconds;
    if (this.timeSinceKill >= 2 && this.count > 0) this.reset();
  }

  registerKill(): { count: number; multiplier: number; milestoneBonus: number } {
    this.count += 1;
    this.multiplier = Math.min(5, 1 + Math.floor(this.count / 3));
    this.timeSinceKill = 0;
    return {
      count: this.count,
      multiplier: this.multiplier,
      milestoneBonus: this.count === 10 ? 1_000 : 0
    };
  }

  reset(): void {
    this.count = 0;
    this.multiplier = 1;
    this.timeSinceKill = Number.POSITIVE_INFINITY;
  }
}
