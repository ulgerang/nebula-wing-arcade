import { DEFAULT_SAVE } from './config';
import { parseStoredSave, sortHighScores } from './core';
import type { HighScoreEntry, SaveData, Settings } from './types';

const STORAGE_KEY = 'nebula-wing-save-v1';

export class StorageManager {
  private readonly storage: Storage | null;
  private pendingSave: SaveData | null = null;

  constructor() {
    try {
      this.storage = window.localStorage;
    } catch {
      this.storage = null;
    }
  }

  load(): SaveData {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    return parseStoredSave(raw);
  }

  save(data: SaveData): boolean {
    const next: SaveData = {
      version: 1,
      highScores: sortHighScores(data.highScores),
      settings: {
        ...DEFAULT_SAVE.settings,
        ...data.settings,
        keyBindings: { ...DEFAULT_SAVE.settings.keyBindings, ...data.settings.keyBindings }
      }
    };
    try {
      if (!this.storage) throw new Error('localStorage unavailable');
      this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
      this.pendingSave = null;
      return true;
    } catch {
      this.pendingSave = next;
      return false;
    }
  }

  retryPending(): boolean {
    return this.pendingSave ? this.save(this.pendingSave) : true;
  }

  saveSettings(current: SaveData, settings: Settings): boolean {
    return this.save({ ...current, settings });
  }

  saveHighScore(current: SaveData, entry: HighScoreEntry): boolean {
    return this.save({ ...current, highScores: sortHighScores([...current.highScores, entry]) });
  }
}
