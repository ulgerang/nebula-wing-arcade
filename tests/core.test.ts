import { describe, expect, it } from 'vitest';
import { ComboTracker, calculateScore, normalizeName, parseStoredSave, validateWaveData } from '../src/core';
import { WAVES } from '../src/config';

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
});
