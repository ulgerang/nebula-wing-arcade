import { describe, expect, it, vi } from 'vitest';
import { allEnemiesDefeated, circlesOverlap, ComboTracker, calculateScore, loseLife, normalizeName, parseStoredSave, validateWaveData } from '../src/core';
import { WAVES } from '../src/config';
import { StorageManager } from '../src/storage';

describe('score and combo rules', () => {
  it('uses the specified base score and dive multiplier', () => {
    expect(calculateScore('scout', false)).toBe(50);
    expect(calculateScore('hunter', false)).toBe(100);
    expect(calculateScore('bruiser', false)).toBe(200);
    expect(calculateScore('scout', true)).toBe(100);
  });

  it('resets a combo after two seconds and grants the ten-kill milestone', () => {
    const combo = new ComboTracker();
    for (let index = 0; index < 9; index += 1) combo.registerKill();
    expect(combo.count).toBe(9);
    expect(combo.registerKill().milestoneBonus).toBe(1_000);
    combo.advance(2.01);
    expect(combo.count).toBe(0);
    expect(combo.multiplier).toBe(1);
  });

  it('clears combo progress when a hit resets it', () => {
    const combo = new ComboTracker();
    combo.registerKill();
    combo.registerKill();
    combo.reset();
    expect(combo.count).toBe(0);
    expect(combo.multiplier).toBe(1);
  });
});

describe('wave and save data validation', () => {
  it('accepts the five MVP waves', () => {
    expect(validateWaveData(WAVES)).toEqual([]);
  });

  it('falls back safely for malformed local storage data', () => {
    const save = parseStoredSave('{not-json');
    expect(save.version).toBe(1);
    expect(save.highScores).toEqual([]);
    expect(save.settings.bgmVolume).toBeGreaterThan(0);
  });

  it('normalizes score names to three uppercase letters', () => {
    expect(normalizeName('a-xy9')).toBe('AXY');
    expect(normalizeName('b')).toBe('BAA');
  });

  it('validates custom keyboard bindings and ignores legacy display labels', () => {
    const save = parseStoredSave(JSON.stringify({
      version: 1,
      highScores: [],
      settings: { keyBindings: { left: 'q', right: 'A / →', fire: ' ', pause: 'escape' } }
    }));
    expect(save.settings.keyBindings).toEqual({ left: 'q', right: '', fire: ' ', pause: 'escape' });
    expect(parseStoredSave('{"version":9}').settings.keyBindings.left).toBe('');
  });

  it('rejects invalid wave data with a readable validation result', () => {
    const invalid = WAVES.map((wave, index) => index === 0
      ? { ...wave, formation: 'CIRCLE' as never, enemies: [{ ...wave.enemies[0]!, type: 'unknown' as never, count: 0 }] }
      : wave);
    expect(validateWaveData(invalid)).toEqual(expect.arrayContaining([
      expect.stringContaining('편대 형식'),
      expect.stringContaining('적 수와 spawnDelay')
    ]));
  });
});

describe('collision and lives', () => {
  it('uses circle radii for collision and excludes separated objects', () => {
    expect(circlesOverlap(0, 0, 4, 7, 0, 3)).toBe(true);
    expect(circlesOverlap(0, 0, 4, 8, 0, 3)).toBe(false);
  });

  it('decrements lives once and clamps at zero', () => {
    expect(loseLife(3)).toBe(2);
    expect(loseLife(1)).toBe(0);
    expect(loseLife(0)).toBe(0);
  });

  it('starts a wave transition only after its non-empty enemy set is defeated', () => {
    expect(allEnemiesDefeated([])).toBe(false);
    expect(allEnemiesDefeated([{ state: 'dead' }, { state: 'formation' }])).toBe(false);
    expect(allEnemiesDefeated([{ state: 'dead' }, { state: 'dead' }])).toBe(true);
  });

  it('keeps settings in memory and retries a blocked storage write', () => {
    let blocked = true;
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        if (blocked) throw new Error('storage blocked');
        stored = value;
      }
    } as unknown as Storage;
    vi.stubGlobal('window', { localStorage: storage });
    try {
      const manager = new StorageManager();
      const save = manager.load();
      save.settings.sfxVolume = 0.61;
      expect(manager.saveSettings(save, save.settings)).toBe(false);
      expect(save.settings.sfxVolume).toBe(0.61);
      blocked = false;
      expect(manager.retryPending()).toBe(true);
      expect(JSON.parse(stored ?? '{}').settings.sfxVolume).toBe(0.61);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
