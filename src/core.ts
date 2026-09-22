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
    const highScores = Array.isArray(candidate.highScores)
      ? candidate.highScores
          .filter((entry): entry is HighScoreEntry => {
            if (!entry || typeof entry !== 'object') return false;
            const value = entry as Partial<HighScoreEntry>;
            return typeof value.name === 'string' && typeof value.score === 'number' && typeof value.stage === 'number';
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
    const settings: Settings = {
      bgmVolume: clampNumber(settingsRecord.bgmVolume, DEFAULT_SAVE.settings.bgmVolume),
      sfxVolume: clampNumber(settingsRecord.sfxVolume, DEFAULT_SAVE.settings.sfxVolume),
      screenShake: typeof settingsRecord.screenShake === 'boolean' ? settingsRecord.screenShake : DEFAULT_SAVE.settings.screenShake,
      reducedFlash: typeof settingsRecord.reducedFlash === 'boolean' ? settingsRecord.reducedFlash : DEFAULT_SAVE.settings.reducedFlash,
      colorTheme: settingsRecord.colorTheme === 'high-contrast' ? 'high-contrast' : 'default',
      keyBindings: cloneDefaultSettings().keyBindings
    };

    return { version: 1, highScores: sortHighScores(highScores), settings };
  } catch {
    return { version: 1, highScores: [], settings: cloneDefaultSettings() };
  }
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

export function validateWaveData(waves: WaveDefinition[]): string[] {
  const errors: string[] = [];
  if (waves.length < 5) errors.push('최소 5개 웨이브가 필요합니다.');
  waves.forEach((wave, index) => {
    if (wave.stage < 1 || wave.wave < 1) errors.push(`웨이브 ${index + 1}: stage와 wave는 1 이상이어야 합니다.`);
    if (!wave.enemies.length) errors.push(`웨이브 ${wave.wave}: 적 정의가 비어 있습니다.`);
    wave.enemies.forEach((enemy) => {
      if (enemy.count < 1 || !Number.isFinite(enemy.spawnDelay) || enemy.spawnDelay < 0) {
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
