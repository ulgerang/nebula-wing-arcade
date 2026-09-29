import {
  COLORS,
  ENEMY_CONFIG,
  FIXED_STEP,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_FRAME_DELTA,
  WAVES
} from './config';
import { allEnemiesDefeated, calculateScore, circlesOverlap, clamp, ComboTracker, lerp, loseLife, normalizeName, qualifiesForHighScore, sortHighScores, validateWaveData } from './core';
import { AudioManager } from './audio';
import { AssetLoader } from './assets';
import { InputManager } from './input';
import { StorageManager } from './storage';
import type {
  Enemy,
  GameSnapshot,
  GameStateName,
  Particle,
  Projectile,
  ScorePopup,
  SaveData,
  Settings,
  WaveDefinition
} from './types';

type UiListener = (snapshot: GameSnapshot) => void;
type LoadingListener = (progress: number, message: string) => void;

interface Player {
  x: number;
  y: number;
  lives: number;
  fireCooldown: number;
  visible: boolean;
  invulnerableUntil: number;
  respawnAt: number;
}

type VfxRow = 0 | 1 | 2 | 3;

interface SpriteEffect {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
  row: VfxRow;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets = new AssetLoader();
  private readonly storage = new StorageManager();
  private readonly save: SaveData;
  private readonly input: InputManager;
  private readonly audio: AudioManager;
  private readonly combo = new ComboTracker();
  private readonly playerBullets: Projectile[] = [];
  private readonly enemyBullets: Projectile[] = [];
  private readonly particles: Particle[] = [];
  private readonly spriteEffects: SpriteEffect[] = [];
  private readonly scorePopups: ScorePopup[] = [];
  private readonly stars = Array.from({ length: 80 }, (_, index) => ({
    x: (index * 137.7) % LOGICAL_WIDTH,
    y: (index * 73.9) % LOGICAL_HEIGHT,
    size: 1 + (index % 3) * 0.5,
    speed: 5 + (index % 5) * 4,
    alpha: 0.18 + (index % 4) * 0.12
  }));
  private enemies: Enemy[] = [];
  private state: GameStateName = 'Loading';
  private uiListener: UiListener | null = null;
  private loadingListener: LoadingListener | null = null;
  private animationHandle = 0;
  private lastFrameTime = 0;
  private accumulator = 0;
  private gameTime = 0;
  private visualTime = 0;
  private waveElapsed = 0;
  private waveClearTimer = 0;
  private waveClearStarted = false;
  private bonusElapsed = 0;
  private bonusKilled = 0;
  private bonusPerfectBonus = 0;
  private pausedFrom: 'Playing' | 'Bonus' = 'Playing';
  private formationTime = 0;
  private attackTimer = 2.5;
  private waveIndex = 0;
  private score = 0;
  private lastRunScore = 0;
  private lastRunStage = 1;
  private lastDivePattern: WaveDefinition['attackPattern'] | null = null;
  private nextEnemyId = 1;
  private screenShakeTimer = 0;
  private hitFlashTimer = 0;
  private redVignetteTimer = 0;
  private resultSaved = false;
  private highScorePersisted = false;
  private stageClearAvailable = false;
  private bonusPlayed = false;
  private readonly player: Player = {
    x: LOGICAL_WIDTH / 2,
    y: LOGICAL_HEIGHT - 54,
    lives: 3,
    fireCooldown: 0,
    visible: true,
    invulnerableUntil: 0,
    respawnAt: 0
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;
    this.canvas.width = LOGICAL_WIDTH;
    this.canvas.height = LOGICAL_HEIGHT;
    this.save = this.storage.load();
    this.audio = new AudioManager(this.save.settings);
    this.input = new InputManager(canvas, () => this.handleAutoPause());
    this.input.setKeyBindings(this.save.settings.keyBindings);
  }

  setUiListener(listener: UiListener): void {
    this.uiListener = listener;
  }

  setLoadingListener(listener: LoadingListener): void {
    this.loadingListener = listener;
  }

  start(): void {
    this.loadingListener?.(0.04, '게임 시스템을 준비하는 중');
    this.animationHandle = window.requestAnimationFrame((time) => this.frame(time));
    void this.prepareAssets();
  }

  private async prepareAssets(): Promise<void> {
    let result: { failed: Array<'player' | 'enemy' | 'vfx'> };
    try {
      result = await this.assets.load((progress, message) => {
        this.loadingListener?.(0.12 + progress * 0.72, message);
      });
    } catch {
      result = { failed: ['player', 'enemy', 'vfx'] };
    }
    const errors = validateWaveData(WAVES);
    if (errors.length > 0) {
      this.loadingListener?.(1, errors.join(' '));
      return;
    }
    this.loadingListener?.(
      1,
      result.failed.length > 0 ? '일부 이미지 없이 기본 그래픽으로 실행합니다' : '준비 완료'
    );
    this.setState('Title');
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationHandle);
    this.input.dispose();
    this.audio.stopMusic();
  }

  getSnapshot(): GameSnapshot {
    const highScores = [...this.save.highScores];
    return {
      state: this.state,
      score: this.score,
      stage: WAVES[this.waveIndex]?.stage ?? this.lastRunStage,
      wave: WAVES[this.waveIndex]?.wave ?? this.waveIndex + 1,
      lives: this.player.lives,
      comboCount: this.combo.count,
      comboMultiplier: this.combo.multiplier,
      highScore: highScores[0]?.score ?? 0,
      highScores,
      settings: {
        ...this.save.settings,
        keyBindings: { ...this.save.settings.keyBindings }
      },
      qualifiesForHighScore: qualifiesForHighScore(this.lastRunScore || this.score, highScores),
      highScoreSaved: this.resultSaved,
      highScorePersisted: this.highScorePersisted,
      stageClearAvailable: this.stageClearAvailable,
      bonusPlayed: this.bonusPlayed,
      lastRunScore: this.lastRunScore,
      lastRunStage: this.lastRunStage
    };
  }

  beginRun(): void {
    this.audio.unlock();
    this.audio.play('menu');
    this.storage.retryPending();
    this.score = 0;
    this.lastRunScore = 0;
    this.lastRunStage = 1;
    this.waveIndex = 0;
    this.lastDivePattern = null;
    this.gameTime = 0;
    this.player.lives = 3;
    this.player.x = LOGICAL_WIDTH / 2;
    this.player.y = LOGICAL_HEIGHT - 54;
    this.player.visible = true;
    this.player.fireCooldown = 0;
    this.player.invulnerableUntil = 0;
    this.player.respawnAt = 0;
    this.combo.reset();
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.clearTransientObjects();
    this.resultSaved = false;
    this.highScorePersisted = false;
    this.stageClearAvailable = false;
    this.bonusPlayed = false;
    this.screenShakeTimer = 0;
    this.hitFlashTimer = 0;
    this.redVignetteTimer = 0;
    this.setState('Playing');
    this.loadWave(0);
  }

  openSettings(): void {
    if (this.state === 'Title') {
      this.audio.unlock();
      this.setState('Settings');
    }
  }

  closeSettings(): void {
    if (this.state === 'Settings') this.setState('Title');
  }

  updateSettings(changes: Partial<Settings>): void {
    const next: Settings = {
      ...this.save.settings,
      ...changes,
      keyBindings: { ...this.save.settings.keyBindings, ...(changes.keyBindings ?? {}) }
    };
    this.save.settings = next;
    this.audio.unlock();
    this.audio.updateSettings(next);
    this.input.setKeyBindings(next.keyBindings);
    if (this.state === 'Title') this.audio.startMusic('title');
    this.storage.saveSettings(this.save, next);
    this.notifyUi();
  }

  beginBonusStage(): void {
    if (this.state !== 'Result' || !this.stageClearAvailable || this.bonusPlayed) return;
    this.stageClearAvailable = false;
    this.bonusPlayed = true;
    this.combo.reset();
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.clearTransientObjects();
    this.screenShakeTimer = 0;
    this.hitFlashTimer = 0;
    this.redVignetteTimer = 0;
    this.player.visible = true;
    this.player.fireCooldown = 0;
    this.player.invulnerableUntil = Number.POSITIVE_INFINITY;
    this.player.respawnAt = Number.POSITIVE_INFINITY;
    this.bonusElapsed = 0;
    this.bonusKilled = 0;
    this.bonusPerfectBonus = 0;
    this.enemies = createBonusTargets();
    this.setState('Bonus');
  }

  continueGame(): void {
    if (this.state === 'Paused') {
      this.audio.unlock();
      this.setState(this.pausedFrom);
    }
  }

  restartRun(): void {
    this.beginRun();
  }

  returnToTitle(): void {
    this.enemies = [];
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.clearTransientObjects();
    this.score = 0;
    this.lastRunScore = 0;
    this.waveIndex = 0;
    this.player.lives = 3;
    this.player.visible = true;
    this.player.x = LOGICAL_WIDTH / 2;
    this.player.fireCooldown = 0;
    this.player.invulnerableUntil = 0;
    this.player.respawnAt = 0;
    this.screenShakeTimer = 0;
    this.hitFlashTimer = 0;
    this.redVignetteTimer = 0;
    this.stageClearAvailable = false;
    this.bonusPlayed = false;
    this.setState('Title');
  }

  showResults(): void {
    if (this.state === 'GameOver') this.setState('Result');
  }

  submitHighScore(name: string): void {
    if (this.state !== 'Result' || this.resultSaved || !this.qualifiesForLastRun()) return;
    const entry = {
      name: normalizeName(name),
      score: this.lastRunScore,
      stage: this.lastRunStage,
      date: new Date().toISOString()
    };
    const saved = this.storage.saveHighScore(this.save, entry);
    this.save.highScores = sortHighScores([...this.save.highScores, entry]);
    this.resultSaved = true;
    this.highScorePersisted = saved;
    this.audio.play('menu');
    this.notifyUi();
  }

  private frame(time: number): void {
    if (!this.lastFrameTime) this.lastFrameTime = time;
    const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, (time - this.lastFrameTime) / 1_000));
    this.lastFrameTime = time;
    if (this.state !== 'Paused') this.visualTime += delta;
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP) {
      this.update(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
    this.render(this.visualTime);
    this.animationHandle = window.requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  private update(delta: number): void {
    if (this.state !== 'Paused') this.updateTransientEffects(delta);

    if (this.input.consume('pause')) {
      if (this.state === 'Playing' || this.state === 'Bonus') {
        this.pausedFrom = this.state;
        this.setState('Paused');
      } else if (this.state === 'Paused') this.continueGame();
      else if (this.state === 'Settings') this.closeSettings();
    }

    if (this.state === 'Title') {
      if (this.input.consume('start')) this.beginRun();
      return;
    }
    if (this.state === 'Paused') {
      const resume = this.input.consume('start');
      if (resume) this.continueGame();
      if (this.input.consume('restart')) this.restartRun();
      if (this.input.consume('title')) this.returnToTitle();
      return;
    }
    if (this.state === 'Settings') {
      if (this.input.consume('pause') || this.input.consume('title') || this.input.consume('start')) this.closeSettings();
      return;
    }
    if (this.state === 'GameOver') {
      const showResults = this.input.consume('start');
      const restart = this.input.consume('restart');
      const title = this.input.consume('title');
      if (title) this.returnToTitle();
      else if (restart) this.restartRun();
      else if (showResults) this.showResults();
      return;
    }
    if (this.state === 'Result') {
      const start = this.input.consume('start');
      const restart = this.input.consume('restart');
      const title = this.input.consume('title');
      if (title) this.returnToTitle();
      else if (restart || (start && this.resultSaved)) this.beginRun();
      return;
    }
    if (this.state === 'Bonus') {
      this.gameTime += delta;
      this.updateBonus(delta);
      return;
    }
    if (this.state !== 'Playing') return;

    this.gameTime += delta;
    this.updatePlaying(delta);
  }

  private updatePlaying(delta: number): void {
    this.waveElapsed += delta;
    this.formationTime += delta;
    this.combo.advance(delta);
    this.updatePlayer(delta);
    this.updatePlayerBullets(delta);
    this.updateEnemies(delta);
    this.updateEnemyBullets(delta);
    this.updateParticles(delta);
    this.updateSpriteEffects(delta);
    this.updateScorePopups(delta);

    if (this.waveClearStarted) {
      this.waveClearTimer -= delta;
      if (this.waveClearTimer <= 0) {
        if (this.waveIndex >= WAVES.length - 1) {
          this.lastRunScore = this.score;
          this.lastRunStage = WAVES[this.waveIndex]?.stage ?? 1;
          this.stageClearAvailable = true;
          this.setState('Result');
        } else {
          this.loadWave(this.waveIndex + 1);
        }
      }
    } else if (allEnemiesDefeated(this.enemies)) {
      this.waveClearStarted = true;
      this.waveClearTimer = 2;
      const clearBonus = WAVES[this.waveIndex]?.clearBonus ?? 0;
      this.score += clearBonus;
      this.addPopup(LOGICAL_WIDTH / 2, 170, `WAVE CLEAR +${clearBonus}`, COLORS.good, 1.25);
      this.audio.play('clear');
      this.notifyUi();
    }
  }

  private updateBonus(delta: number): void {
    this.bonusElapsed += delta;
    this.updatePlayer(delta);
    this.updatePlayerBullets(delta);
    this.updateParticles(delta);
    this.updateSpriteEffects(delta);
    this.updateScorePopups(delta);
    const progress = clamp(this.bonusElapsed / 15, 0, 1);
    for (const target of this.enemies) {
      if (target.state === 'dead') continue;
      const path = (target.formationIndex % 2 === 0 ? 1 : -1) * 150;
      target.x = LOGICAL_WIDTH / 2 + Math.sin(this.bonusElapsed * 1.1 + target.formationIndex * 0.58) * (230 + path * 0.25);
      target.y = 90 + ((this.bonusElapsed * (55 + target.formationIndex * 2) + target.formationIndex * 74) % 300);
    }
    if (progress >= 1) {
      if (this.bonusKilled === this.enemies.length) {
        this.bonusPerfectBonus = 10_000;
        this.score += this.bonusPerfectBonus;
        this.addPopup(LOGICAL_WIDTH / 2, 170, 'PERFECT BONUS +10000', COLORS.good, 1.5);
      }
      this.lastRunScore = this.score;
      this.lastRunStage = 1;
      this.player.invulnerableUntil = 0;
      this.player.respawnAt = 0;
      this.enemies = [];
      this.setState('Result');
    }
  }

  private updatePlayer(delta: number): void {
    const now = this.gameTime;
    if (!this.player.visible) {
      if (this.player.lives > 0 && now >= this.player.respawnAt) {
        for (const bullet of this.enemyBullets) bullet.active = false;
        for (const bullet of this.playerBullets) bullet.active = false;
        this.player.visible = true;
        this.player.x = LOGICAL_WIDTH / 2;
      }
      return;
    }

    const axis = this.input.horizontalAxis();
    this.player.x = clamp(this.player.x + axis * 340 * delta, 30, LOGICAL_WIDTH - 30);
    this.player.fireCooldown -= delta;
    if (this.player.fireCooldown <= 0 && this.activePlayerBulletCount() < 2) {
      const firePressed = this.input.consume('fire');
      if (firePressed || this.input.isDown('fire')) {
        this.firePlayerBullet();
        this.player.fireCooldown = 0.22;
      }
    }
  }

  private firePlayerBullet(): void {
    const bullet = this.acquireProjectile(this.playerBullets, COLORS.playerBullet, 4);
    bullet.active = true;
    bullet.x = this.player.x;
    bullet.y = this.player.y - 20;
    bullet.vx = 0;
    bullet.vy = -720;
    this.audio.play('shoot');
  }

  private updatePlayerBullets(delta: number): void {
    for (const bullet of this.playerBullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      if (bullet.y < -20) {
        bullet.active = false;
        continue;
      }
      for (const enemy of this.enemies) {
        if (enemy.state === 'dead' || enemy.state === 'entering' && enemy.y < -10) continue;
        if (circlesOverlap(bullet.x, bullet.y, bullet.radius, enemy.x, enemy.y, enemyRadius(enemy.type))) {
          bullet.active = false;
          enemy.hp -= 1;
          enemy.hitFlash = 0.08;
          this.spawnBurst(enemy.x, enemy.y, ENEMY_CONFIG[enemy.type].color, 5, 0);
          if (enemy.hp <= 0) this.killEnemy(enemy);
          else this.audio.play('hit');
          break;
        }
      }
    }
  }

  private updateEnemies(delta: number): void {
    const wave = WAVES[this.waveIndex];
    if (!wave) return;
    const allEntered = this.enemies.every((enemy) => enemy.state !== 'entering');
    if (this.waveElapsed >= 2 && allEntered && !this.waveClearStarted) {
      this.attackTimer -= delta;
      if (this.attackTimer <= 0) {
        this.launchDives(wave);
        this.attackTimer = this.waveIndex === 0 ? 12 : Math.max(1.8, 3.4 - this.waveIndex * 0.22);
      }
    }

    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
      if (enemy.state === 'entering') {
        const entryProgress = clamp((this.waveElapsed - enemy.entryDelay) / 0.7, 0, 1);
        enemy.x = lerp(enemy.targetX, enemy.targetX, entryProgress);
        enemy.y = lerp(-55, enemy.targetY, easeOutCubic(entryProgress));
        if (entryProgress >= 1) enemy.state = 'formation';
        continue;
      }

      if (enemy.state === 'formation') {
        enemy.x = enemy.targetX + Math.sin(this.formationTime * 0.78 + enemy.formationIndex * 0.8) * 64;
        enemy.y = enemy.targetY + Math.sin(this.formationTime * 1.4 + enemy.formationIndex) * 5;
        enemy.fireCooldown -= delta;
        if (enemy.fireCooldown <= 0 && this.waveElapsed > 2.6) {
          this.fireEnemyBullet(enemy);
          enemy.fireCooldown = Math.max(1.1, 2.6 - this.waveIndex * 0.18 + (enemy.formationIndex % 3) * 0.3);
        }
        continue;
      }

      if (enemy.state === 'dive') {
        enemy.diveElapsed += delta;
        const progress = clamp(enemy.diveElapsed / enemy.diveDuration, 0, 1);
        if (enemy.divePattern === 'SWOOP') {
          enemy.x = enemy.diveStartX + Math.sin(progress * Math.PI * 1.4) * 120;
          enemy.y = enemy.diveStartY + progress * 660;
        } else {
          const side = enemy.diveStartX < LOGICAL_WIDTH / 2 ? -1 : 1;
          enemy.x = enemy.diveStartX + (enemy.diveTargetX - enemy.diveStartX) * progress + side * Math.sin(progress * Math.PI) * 140;
          enemy.y = enemy.diveStartY + progress * 650;
        }
        if (this.player.visible && circlesOverlap(enemy.x, enemy.y, enemyRadius(enemy.type), this.player.x, this.player.y, 13)) {
          this.hitPlayer();
          this.returnEnemyToFormation(enemy);
        } else if (progress >= 1) {
          this.returnEnemyToFormation(enemy);
        }
      }
    }
  }

  private launchDives(wave: WaveDefinition): void {
    const activeDives = this.enemies.filter((enemy) => enemy.state === 'dive').length;
    const maxDives = Math.min(3, 1 + Math.floor(this.waveIndex / 2));
    if (activeDives >= maxDives) return;
    const candidates = this.enemies.filter((enemy) => enemy.state === 'formation');
    if (candidates.length === 0) return;
    const selected = candidates[(this.waveIndex + Math.floor(this.formationTime)) % candidates.length];
    const pattern = this.lastDivePattern === wave.attackPattern
      ? (wave.attackPattern === 'SWOOP' ? 'DIAGONAL' : 'SWOOP')
      : wave.attackPattern;
    this.lastDivePattern = pattern;
    selected.state = 'dive';
    selected.divePattern = pattern;
    selected.diveElapsed = 0;
    selected.diveDuration = this.waveIndex === 0 ? 4.2 : 2.4 - Math.min(0.6, this.waveIndex * 0.1);
    selected.diveStartX = selected.x;
    selected.diveStartY = selected.y;
    selected.diveTargetX = this.player.x;
  }

  private returnEnemyToFormation(enemy: Enemy): void {
    enemy.state = 'formation';
    enemy.x = enemy.targetX;
    enemy.y = enemy.targetY;
    enemy.diveElapsed = 0;
  }

  private fireEnemyBullet(enemy: Enemy): void {
    if (!this.player.visible || this.activeEnemyBulletCount() >= 12) return;
    const bullet = this.acquireProjectile(this.enemyBullets, COLORS.enemyBullet, 5);
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    const speed = this.waveIndex === 0 ? 145 : 160 + this.waveIndex * 22;
    bullet.active = true;
    bullet.x = enemy.x;
    bullet.y = enemy.y + 12;
    bullet.vx = (dx / magnitude) * speed;
    bullet.vy = (dy / magnitude) * speed;
  }

  private updateEnemyBullets(delta: number): void {
    for (const bullet of this.enemyBullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      if (bullet.x < -20 || bullet.x > LOGICAL_WIDTH + 20 || bullet.y < -20 || bullet.y > LOGICAL_HEIGHT + 20) {
        bullet.active = false;
        continue;
      }
      if (this.player.visible && this.gameTime >= this.player.invulnerableUntil && circlesOverlap(bullet.x, bullet.y, bullet.radius, this.player.x, this.player.y, 11)) {
        bullet.active = false;
        this.hitPlayer();
      }
    }
  }

  private hitPlayer(): void {
    const now = this.gameTime;
    if (!this.player.visible || now < this.player.invulnerableUntil) return;
    this.player.lives = loseLife(this.player.lives);
    this.player.visible = false;
    this.player.invulnerableUntil = now + 2.5;
    this.player.respawnAt = now + 1;
    this.combo.reset();
    for (const bullet of this.enemyBullets) bullet.active = false;
    for (const bullet of this.playerBullets) bullet.active = false;
    this.redVignetteTimer = 0.45;
    this.screenShakeTimer = 0.08;
    this.audio.play('playerHit');
    this.spawnBurst(this.player.x, this.player.y, COLORS.danger, 18, 2);
    this.notifyUi();
    if (this.player.lives <= 0) {
      this.lastRunScore = this.score;
      this.lastRunStage = WAVES[this.waveIndex]?.stage ?? 1;
      this.setState('GameOver');
    }
  }

  private killEnemy(enemy: Enemy): void {
    enemy.state = 'dead';
    const score = calculateScore(enemy.type, enemy.diveElapsed > 0, this.combo.multiplier);
    this.score += score;
    const comboResult = this.combo.registerKill();
    if (comboResult.milestoneBonus > 0) {
      this.score += comboResult.milestoneBonus;
      this.addPopup(enemy.x, enemy.y - 22, `COMBO 10 +${comboResult.milestoneBonus}`, COLORS.good, 1.1);
      this.audio.play('combo');
    } else {
      this.addPopup(enemy.x, enemy.y - 20, `+${score}`, COLORS.text, 0.8);
    }
    const strongEnemy = enemy.type === 'bruiser' || enemy.type === 'carrier';
    this.spawnBurst(enemy.x, enemy.y, ENEMY_CONFIG[enemy.type].color, strongEnemy ? 14 : 8, strongEnemy ? 1 : 0);
    if (comboResult.milestoneBonus > 0) this.spawnSpriteEffect(enemy.x, enemy.y - 22, 3, 80, 0.5);
    this.audio.play(enemy.type === 'bruiser' || enemy.type === 'carrier' ? 'strongHit' : 'hit');
    if (enemy.type === 'bruiser' || enemy.type === 'carrier') this.screenShakeTimer = 0.08;
    if (this.state === 'Bonus') this.bonusKilled += 1;
    this.hitFlashTimer = 0.08;
    this.notifyUi();
  }

  private loadWave(index: number): void {
    const wave = WAVES[index];
    if (!wave) return;
    for (const bullet of this.playerBullets) bullet.active = false;
    for (const bullet of this.enemyBullets) bullet.active = false;
    this.waveIndex = index;
    this.waveElapsed = 0;
    this.waveClearTimer = 0;
    this.waveClearStarted = false;
    this.formationTime = 0;
    this.attackTimer = this.waveIndex === 0 ? 16 : 2.5;
    this.enemies = [];
    const total = wave.enemies.reduce((sum, definition) => sum + definition.count, 0);
    const slots = formationSlots(total, wave.formation);
    let slotIndex = 0;
    for (const definition of wave.enemies) {
      for (let count = 0; count < definition.count; count += 1) {
        const slot = slots[slotIndex] ?? { x: 480, y: 100 };
        const config = ENEMY_CONFIG[definition.type];
        this.enemies.push({
          id: this.nextEnemyId++,
          type: definition.type,
          state: 'entering',
          x: slot.x,
          y: -55,
          targetX: slot.x,
          targetY: slot.y,
          hp: config.hp,
          maxHp: config.hp,
          score: config.score,
          formationIndex: slotIndex,
          formationName: wave.formation,
          divePattern: wave.attackPattern,
          entryDelay: slotIndex * definition.spawnDelay,
          diveElapsed: 0,
          diveDuration: 2.4,
          diveStartX: slot.x,
          diveStartY: slot.y,
          diveTargetX: this.player.x,
          fireCooldown: (this.waveIndex === 0 ? 18 : 1.9) + slotIndex * 0.13,
          hitFlash: 0
        });
        slotIndex += 1;
      }
    }
    this.notifyUi();
  }

  private updateTransientEffects(delta: number): void {
    this.screenShakeTimer = Math.max(0, this.screenShakeTimer - delta);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);
    this.redVignetteTimer = Math.max(0, this.redVignetteTimer - delta);
  }

  private updateParticles(delta: number): void {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= delta;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 22 * delta;
    }
  }

  private updateSpriteEffects(delta: number): void {
    for (const effect of this.spriteEffects) {
      if (effect.life <= 0) continue;
      effect.life -= delta;
    }
  }

  private updateScorePopups(delta: number): void {
    for (const popup of this.scorePopups) {
      if (popup.life <= 0) continue;
      popup.life -= delta;
      popup.y -= 20 * delta;
    }
  }

  private spawnBurst(x: number, y: number, color: string, count: number, vfxRow: VfxRow): void {
    if (this.assets.has('vfx')) {
      const size = vfxRow === 0 ? 46 : vfxRow === 1 ? 88 : 76;
      const life = vfxRow === 0 ? 0.3 : vfxRow === 1 ? 0.48 : 0.42;
      this.spawnSpriteEffect(x, y, vfxRow, size, life);
      return;
    }
    for (let index = 0; index < count; index += 1) {
      let particle = this.particles.find((candidate) => candidate.life <= 0);
      if (!particle) {
        if (this.particles.length >= 300) continue;
        particle = { x, y, vx: 0, vy: 0, life: 0, maxLife: 0.5, size: 2, color };
        this.particles.push(particle);
      }
      const angle = (Math.PI * 2 * index) / count;
      const speed = 45 + (index % 4) * 18;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.life = 0.32 + (index % 3) * 0.1;
      particle.maxLife = 0.5;
      particle.size = 2 + (index % 3);
      particle.color = color;
    }
  }

  private spawnSpriteEffect(x: number, y: number, row: VfxRow, size: number, life: number): void {
    if (!this.assets.has('vfx')) return;
    let effect = this.spriteEffects.find((candidate) => candidate.life <= 0);
    if (!effect) {
      if (this.spriteEffects.length >= 30) return;
      effect = { x, y, life, maxLife: life, size, row };
      this.spriteEffects.push(effect);
    }
    Object.assign(effect, { x, y, life, maxLife: life, size, row });
  }

  private addPopup(x: number, y: number, text: string, color: string, life: number): void {
    let popup = this.scorePopups.find((candidate) => candidate.life <= 0);
    if (!popup) {
      if (this.scorePopups.length >= 30) return;
      popup = { x, y, text, life, maxLife: life, color };
      this.scorePopups.push(popup);
    }
    Object.assign(popup, { x, y, text, life, maxLife: life, color });
  }

  private acquireProjectile(pool: Projectile[], color: string, radius: number): Projectile {
    const existing = pool.find((projectile) => !projectile.active);
    if (existing) return existing;
    const projectile: Projectile = { x: 0, y: 0, vx: 0, vy: 0, active: false, radius, color };
    pool.push(projectile);
    return projectile;
  }

  private activePlayerBulletCount(): number {
    let active = 0;
    for (const bullet of this.playerBullets) if (bullet.active) active += 1;
    return active;
  }

  private activeEnemyBulletCount(): number {
    let active = 0;
    for (const bullet of this.enemyBullets) if (bullet.active) active += 1;
    return active;
  }

  private clearTransientObjects(): void {
    for (const particle of this.particles) particle.life = 0;
    for (const effect of this.spriteEffects) effect.life = 0;
    for (const popup of this.scorePopups) popup.life = 0;
  }

  private qualifiesForLastRun(): boolean {
    return qualifiesForHighScore(this.lastRunScore, this.save.highScores);
  }

  private handleAutoPause(): void {
    if (this.state === 'Playing' || this.state === 'Bonus') {
      this.pausedFrom = this.state;
      this.setState('Paused');
    }
  }

  private setState(next: GameStateName): void {
    if (this.state === next) return;
    this.input.clear();
    this.state = next;
    if (next === 'Title') {
      this.audio.stopMusic();
      this.audio.startMusic('title');
    } else if (next === 'Playing') {
      this.audio.stopMusic();
      this.audio.startMusic('play');
    } else if (next === 'Paused') {
      this.audio.stopMusic();
    } else if (next === 'Settings') {
      this.audio.stopMusic();
    } else if (next === 'Bonus') {
      this.audio.stopMusic();
      this.audio.startMusic('play');
    } else if (next === 'GameOver') {
      this.audio.stopMusic();
      this.audio.startMusic('gameOver');
    } else if (next === 'Result') {
      this.audio.stopMusic();
      this.resultSaved = false;
      this.highScorePersisted = false;
    }
    this.notifyUi();
  }

  private notifyUi(): void {
    this.uiListener?.(this.getSnapshot());
  }

  private render(timeSeconds: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.drawSpace(timeSeconds);
    const shakeX = this.screenShakeTimer > 0 && this.save.settings.screenShake ? (Math.random() - 0.5) * 7 : 0;
    const shakeY = this.screenShakeTimer > 0 && this.save.settings.screenShake ? (Math.random() - 0.5) * 5 : 0;
    ctx.translate(shakeX, shakeY);
    this.drawPlayfield();
    ctx.restore();
  }

  private drawSpace(timeSeconds: number): void {
    const gradient = this.ctx.createRadialGradient(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT * 0.38, 10, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT * 0.38, LOGICAL_WIDTH * 0.75);
    gradient.addColorStop(0, COLORS.backgroundGlow);
    gradient.addColorStop(1, COLORS.background);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    for (const star of this.stars) {
      const y = (star.y + timeSeconds * star.speed) % LOGICAL_HEIGHT;
      this.ctx.globalAlpha = star.alpha;
      this.ctx.fillStyle = COLORS.text;
      this.ctx.fillRect(star.x, y, star.size, star.size);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawPlayfield(): void {
    this.drawGrid();
    for (const enemy of this.enemies) {
      if (enemy.state !== 'dead') this.drawEnemy(enemy);
    }
    for (const bullet of this.playerBullets) {
      if (bullet.active) this.drawProjectile(bullet);
    }
    for (const bullet of this.enemyBullets) {
      if (bullet.active) this.drawProjectile(bullet);
    }
    this.drawParticles();
    this.drawSpriteEffects();
    if (this.player.visible) this.drawPlayer();
    this.drawScorePopups();
    this.drawHud();
    if (this.hitFlashTimer > 0 && !this.save.settings.reducedFlash) {
      this.ctx.fillStyle = `rgba(255,255,255,${this.hitFlashTimer * 3})`;
      this.ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }
    if (this.redVignetteTimer > 0) {
      const gradient = this.ctx.createRadialGradient(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, 120, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, 520);
      gradient.addColorStop(0, 'rgba(255,0,40,0)');
      gradient.addColorStop(1, `rgba(255,30,50,${this.redVignetteTimer * 0.34})`);
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }
  }

  private drawGrid(): void {
    this.ctx.strokeStyle = 'rgba(78, 124, 170, 0.08)';
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= LOGICAL_WIDTH; x += 80) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, LOGICAL_HEIGHT);
      this.ctx.stroke();
    }
    for (let y = 0; y <= LOGICAL_HEIGHT; y += 60) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(LOGICAL_WIDTH, y);
      this.ctx.stroke();
    }
  }

  private drawHud(): void {
    const font = '700 16px Consolas, monospace';
    this.ctx.font = font;
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = COLORS.text;
    this.ctx.fillText(`SCORE ${this.score.toString().padStart(7, '0')}`, 20, 16);
    this.ctx.fillStyle = COLORS.muted;
    this.ctx.fillText(`STAGE ${WAVES[this.waveIndex]?.stage ?? 1}  WAVE ${WAVES[this.waveIndex]?.wave ?? 1}/5`, 365, 16);
    this.ctx.textAlign = 'right';
    this.ctx.fillStyle = COLORS.text;
    this.ctx.fillText(`HI ${this.save.highScores[0]?.score?.toString().padStart(7, '0') ?? '0000000'}`, LOGICAL_WIDTH - 20, 16);
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = COLORS.player;
    this.ctx.fillText(`LIVES ${'◆'.repeat(Math.max(0, this.player.lives))}`, 20, LOGICAL_HEIGHT - 30);
    if (this.combo.count > 0) {
      this.ctx.textAlign = 'right';
      this.ctx.fillStyle = COLORS.good;
      const nextCount = this.combo.multiplier >= 5 ? 0 : 3 - (this.combo.count % 3);
      const nextStep = nextCount > 0 ? `  NEXT x${this.combo.multiplier + 1} IN ${nextCount}` : '';
      this.ctx.fillText(`COMBO ${this.combo.count}  x${this.combo.multiplier}${nextStep}`, LOGICAL_WIDTH - 20, LOGICAL_HEIGHT - 30);
      this.ctx.textAlign = 'left';
    }
    if (this.waveElapsed < 2 && this.state === 'Playing') {
      this.ctx.textAlign = 'center';
      this.ctx.font = '700 22px Consolas, monospace';
      this.ctx.fillStyle = COLORS.text;
      this.ctx.fillText(`WAVE ${WAVES[this.waveIndex]?.wave ?? 1}`, LOGICAL_WIDTH / 2, 92);
      this.ctx.font = '14px Consolas, monospace';
      this.ctx.fillStyle = COLORS.muted;
      this.ctx.fillText('READY', LOGICAL_WIDTH / 2, 124);
      this.ctx.textAlign = 'left';
    }
    if (this.waveClearStarted && this.state === 'Playing') {
      this.ctx.textAlign = 'center';
      this.ctx.font = '700 22px Consolas, monospace';
      this.ctx.fillStyle = COLORS.good;
      this.ctx.fillText('WAVE CLEAR', LOGICAL_WIDTH / 2, 92);
      this.ctx.textAlign = 'left';
    }
    if (this.state === 'Bonus') {
      this.ctx.textAlign = 'center';
      this.ctx.font = '700 22px Consolas, monospace';
      this.ctx.fillStyle = COLORS.bonus;
      this.ctx.fillText('BONUS RUN', LOGICAL_WIDTH / 2, 92);
      this.ctx.font = '14px Consolas, monospace';
      this.ctx.fillStyle = COLORS.text;
      this.ctx.fillText(`TIME ${(15 - this.bonusElapsed).toFixed(1)}`, LOGICAL_WIDTH / 2, 124);
      this.ctx.textAlign = 'left';
    }
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const blinking = this.state !== 'Bonus' && this.gameTime < this.player.invulnerableUntil && Math.floor(this.gameTime * 10) % 2 === 0;
    if (blinking) return;
    const animationFrame = Math.floor(this.gameTime * (1_000 / 120)) % 4;
    const recoveryFrame = this.gameTime < this.player.invulnerableUntil ? 4 : 0;
    if (
      this.save.settings.colorTheme === 'default' &&
      this.assets.drawFrame(ctx, 'player', recoveryFrame + animationFrame, this.player.x, this.player.y, 50)
    ) {
      return;
    }
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.fillStyle = COLORS.playerGlow;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(0, 5, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(17, 16);
    ctx.lineTo(5, 12);
    ctx.lineTo(0, 18);
    ctx.lineTo(-5, 12);
    ctx.lineTo(-17, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#10283c';
    ctx.fillRect(-4, -5, 8, 10);
    ctx.strokeStyle = COLORS.playerGlow;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawEnemy(enemy: Enemy): void {
    const ctx = this.ctx;
    const config = ENEMY_CONFIG[enemy.type];
    const enemyColor = this.save.settings.colorTheme === 'high-contrast' ? '#f5fbff' : config.color;
    const frameColumn = { scout: 0, hunter: 1, bruiser: 2, carrier: 3, bonusDrone: 4 }[enemy.type];
    const spriteSize = { scout: 52, hunter: 46, bruiser: 48, carrier: 56, bonusDrone: 52 }[enemy.type];
    if (
      this.save.settings.colorTheme === 'default' &&
      this.assets.drawFrame(
        ctx,
        'enemy',
        frameColumn + (enemy.hitFlash > 0 && !this.save.settings.reducedFlash ? 5 : 0),
        enemy.x,
        enemy.y,
        spriteSize,
        enemy.state === 'entering' ? 0.9 : 1
      )
    ) {
      this.drawEnemyHealthBar(enemy);
      return;
    }
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha = enemy.state === 'entering' ? 0.9 : 1;
    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : enemyColor;
    ctx.strokeStyle = '#07111e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (enemy.type === 'scout') {
      ctx.moveTo(0, -15);
      ctx.lineTo(15, 2);
      ctx.lineTo(9, 13);
      ctx.lineTo(0, 8);
      ctx.lineTo(-9, 13);
      ctx.lineTo(-15, 2);
    } else if (enemy.type === 'hunter') {
      ctx.moveTo(0, -17);
      ctx.lineTo(16, 8);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 16);
      ctx.lineTo(-7, 8);
      ctx.lineTo(-16, 8);
    } else if (enemy.type === 'bruiser') {
      ctx.rect(-18, -14, 36, 28);
      ctx.moveTo(-18, -14);
      ctx.lineTo(18, 14);
      ctx.moveTo(18, -14);
      ctx.lineTo(-18, 14);
    } else {
      ctx.arc(0, 0, config.radius, 0, Math.PI * 2);
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.moveTo(0, -22);
      ctx.lineTo(0, 22);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.drawEnemyHealthBar(enemy);
  }

  private drawEnemyHealthBar(enemy: Enemy): void {
    if (enemy.maxHp <= 1) return;
    this.ctx.fillStyle = '#07111e';
    this.ctx.fillRect(enemy.x - 16, enemy.y + 21, 32, 3);
    this.ctx.fillStyle = COLORS.good;
    this.ctx.fillRect(enemy.x - 16, enemy.y + 21, 32 * (enemy.hp / enemy.maxHp), 3);
  }

  private drawProjectile(projectile: Projectile): void {
    const ctx = this.ctx;
    const projectileColor = this.save.settings.colorTheme === 'high-contrast'
      ? projectile.color === COLORS.enemyBullet ? '#ffd166' : '#46dcff'
      : projectile.color;
    ctx.save();
    ctx.fillStyle = projectileColor;
    ctx.shadowColor = projectileColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    if (projectile.color === COLORS.enemyBullet) {
      ctx.moveTo(projectile.x, projectile.y - projectile.radius);
      ctx.lineTo(projectile.x + projectile.radius, projectile.y);
      ctx.lineTo(projectile.x, projectile.y + projectile.radius);
      ctx.lineTo(projectile.x - projectile.radius, projectile.y);
      ctx.closePath();
    } else {
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(): void {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      this.ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawSpriteEffects(): void {
    if (this.save.settings.reducedFlash) return;
    for (const effect of this.spriteEffects) {
      if (effect.life <= 0) continue;
      const progress = clamp(1 - effect.life / effect.maxLife, 0, 0.999);
      const frame = Math.min(3, Math.floor(progress * 4));
      const alpha = clamp((effect.life / effect.maxLife) * 1.5, 0.25, 1);
      this.assets.drawFrame(this.ctx, 'vfx', effect.row * 4 + frame, effect.x, effect.y, effect.size, alpha);
    }
  }

  private drawScorePopups(): void {
    this.ctx.textAlign = 'center';
    this.ctx.font = '700 13px Consolas, monospace';
    for (const popup of this.scorePopups) {
      if (popup.life <= 0) continue;
      this.ctx.globalAlpha = clamp(popup.life / popup.maxLife, 0, 1);
      this.ctx.fillStyle = popup.color;
      this.ctx.fillText(popup.text, popup.x, popup.y);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = 'left';
  }
}

function formationSlots(total: number, formation: WaveDefinition['formation']): Array<{ x: number; y: number }> {
  const slots: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < total; index += 1) {
    if (formation === 'V_SHAPE') {
      const row = Math.floor(index / 2);
      const side = index % 2 === 0 ? -1 : 1;
      slots.push({ x: LOGICAL_WIDTH / 2 + side * (50 + row * 42), y: 92 + row * 42 });
    } else if (formation === 'DIAMOND') {
      const ring = Math.floor(index / 4);
      const corner = index % 4;
      const points = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 }
      ];
      const point = points[corner];
      slots.push({ x: LOGICAL_WIDTH / 2 + point.x * (80 + ring * 38), y: 125 + point.y * (60 + ring * 34) + ring * 28 });
    } else {
      const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(total))));
      const rows = Math.ceil(total / columns);
      const column = index % columns;
      const row = Math.floor(index / columns);
      slots.push({
        x: LOGICAL_WIDTH / 2 + (column - (columns - 1) / 2) * 58,
        y: 86 + row * Math.min(44, 130 / Math.max(1, rows - 1))
      });
    }
  }
  return slots;
}

function enemyRadius(type: Enemy['type']): number {
  return ENEMY_CONFIG[type].radius;
}

function createBonusTargets(): Enemy[] {
  return Array.from({ length: 14 }, (_, index) => ({
    id: 10_000 + index,
    type: 'bonusDrone',
    state: 'formation',
    x: 480,
    y: 90,
    targetX: 480,
    targetY: 90,
    hp: 1,
    maxHp: 1,
    score: ENEMY_CONFIG.bonusDrone.score,
    formationIndex: index,
    formationName: 'GRID',
    divePattern: 'SWOOP',
    entryDelay: 0,
    diveElapsed: 0,
    diveDuration: 0,
    diveStartX: 480,
    diveStartY: 90,
    diveTargetX: 480,
    fireCooldown: Number.POSITIVE_INFINITY,
    hitFlash: 0
  }));
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}
