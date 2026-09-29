import playerSheetUrl from '../assets/generated/sprites/player/player_sheet.png';
import enemySheetUrl from '../assets/generated/sprites/enemies/enemy_roster_sheet.png';
import vfxSheetUrl from '../assets/generated/sprites/vfx/combat_vfx_sheet.png';
import playerMetadata from '../assets/generated/metadata/player_sheet.json';
import enemyMetadata from '../assets/generated/metadata/enemy_roster_sheet.json';
import vfxMetadata from '../assets/generated/metadata/combat_vfx_sheet.json';

export type SpriteSheetKey = 'player' | 'enemy' | 'vfx';

interface SpriteSheetGrid {
  columns: number;
  rows: number;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
}

interface SpriteSheetEntry {
  key: SpriteSheetKey;
  label: string;
  url: string;
  grid: SpriteSheetGrid;
}

interface LoadedSpriteSheet extends SpriteSheetGrid {
  image: HTMLImageElement;
}

export interface AssetLoadResult {
  failed: SpriteSheetKey[];
}

const SHEET_ENTRIES: readonly SpriteSheetEntry[] = [
  {
    key: 'player',
    label: '플레이어 스프라이트',
    url: playerSheetUrl,
    grid: playerMetadata.grid
  },
  {
    key: 'enemy',
    label: '적 스프라이트',
    url: enemySheetUrl,
    grid: enemyMetadata.grid
  },
  {
    key: 'vfx',
    label: '전투 VFX',
    url: vfxSheetUrl,
    grid: vfxMetadata.grid
  }
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = '';
      reject(new Error(`Asset load timed out: ${url}`));
    }, 10_000);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Asset load failed: ${url}`));
    };
    image.src = url;
  });
}

export class AssetLoader {
  private readonly loaded = new Map<SpriteSheetKey, LoadedSpriteSheet>();
  private loadPromise: Promise<AssetLoadResult> | null = null;

  async load(onProgress: (progress: number, message: string) => void): Promise<AssetLoadResult> {
    if (this.loadPromise) {
      const cached = await this.loadPromise;
      onProgress(1, '이미지 리소스 캐시를 사용합니다');
      return cached;
    }
    this.loadPromise = this.loadUncached(onProgress);
    return this.loadPromise;
  }

  private async loadUncached(onProgress: (progress: number, message: string) => void): Promise<AssetLoadResult> {
    const failed: SpriteSheetKey[] = [];
    let completed = 0;
    await Promise.all(SHEET_ENTRIES.map(async (entry) => {
      try {
        const image = await loadImage(entry.url);
        this.loaded.set(entry.key, { ...entry.grid, image });
        completed += 1;
        onProgress(completed / SHEET_ENTRIES.length, `${entry.label} 준비 완료`);
      } catch {
        failed.push(entry.key);
        completed += 1;
        onProgress(completed / SHEET_ENTRIES.length, `${entry.label} 로드 실패 — 기본 그래픽 사용`);
      }
    }));
    return { failed };
  }

  has(key: SpriteSheetKey): boolean {
    return this.loaded.has(key);
  }

  drawFrame(
    context: CanvasRenderingContext2D,
    key: SpriteSheetKey,
    frameIndex: number,
    x: number,
    y: number,
    size: number,
    alpha = 1
  ): boolean {
    const sheet = this.loaded.get(key);
    if (!sheet) return false;
    const clampedFrame = Math.min(Math.max(Math.floor(frameIndex), 0), sheet.frameCount - 1);
    const sourceX = (clampedFrame % sheet.columns) * sheet.frameWidth;
    const sourceY = Math.floor(clampedFrame / sheet.columns) * sheet.frameHeight;
    context.save();
    context.globalAlpha *= alpha;
    context.drawImage(
      sheet.image,
      sourceX,
      sourceY,
      sheet.frameWidth,
      sheet.frameHeight,
      x - size / 2,
      y - size / 2,
      size,
      size
    );
    context.restore();
    return true;
  }
}
