import type { Settings } from './types';

type SoundName = 'shoot' | 'hit' | 'strongHit' | 'playerHit' | 'combo' | 'menu' | 'clear';

export class AudioManager {
  private context: AudioContext | null = null;
  private musicTimer: number | null = null;
  private readonly musicVoices = new Set<OscillatorNode>();
  private musicKind: 'title' | 'play' | 'gameOver' | null = null;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.syncMusic();
  }

  unlock(): void {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextConstructor) return;
      this.context = new AudioContextConstructor();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().then(() => this.syncMusic()).catch(() => undefined);
    }
  }

  startMusic(kind: 'title' | 'play' | 'gameOver'): void {
    this.musicKind = kind;
    this.syncMusic();
  }

  private syncMusic(): void {
    if (this.settings.bgmVolume <= 0 || !this.context || this.context.state !== 'running' || !this.musicKind) {
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      this.stopMusicVoices();
      return;
    }
    if (this.musicTimer !== null) return;
    const kind = this.musicKind;
    const melody = kind === 'title' ? [220, 277, 330, 277] : kind === 'gameOver' ? [196, 165, 147, 110] : [262, 330, 392, 330];
    let index = 0;
    this.musicTimer = window.setInterval(() => {
      const frequency = melody[index % melody.length];
      index += 1;
      this.tone(frequency, 0.18, this.settings.bgmVolume * 0.32, 'triangle', 1, true);
    }, 360);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicKind = null;
    this.stopMusicVoices();
  }

  private stopMusicVoices(): void {
    for (const voice of this.musicVoices) {
      try {
        voice.stop();
      } catch {
        // The sound may already have ended between frames.
      }
    }
    this.musicVoices.clear();
  }

  play(sound: SoundName): void {
    this.unlock();
    if (!this.context || this.settings.sfxVolume <= 0) return;
    const presets: Record<SoundName, { frequency: number; duration: number; wave: OscillatorType; bend?: number }> = {
      shoot: { frequency: 620, duration: 0.06, wave: 'square', bend: 0.72 },
      hit: { frequency: 220, duration: 0.11, wave: 'sawtooth', bend: 1.6 },
      strongHit: { frequency: 110, duration: 0.22, wave: 'sawtooth', bend: 0.55 },
      playerHit: { frequency: 90, duration: 0.3, wave: 'square', bend: 0.4 },
      combo: { frequency: 880, duration: 0.14, wave: 'triangle', bend: 1.5 },
      menu: { frequency: 440, duration: 0.08, wave: 'triangle', bend: 1.2 },
      clear: { frequency: 523, duration: 0.4, wave: 'triangle', bend: 1.9 }
    };
    const preset = presets[sound];
    this.tone(preset.frequency, preset.duration, this.settings.sfxVolume, preset.wave, preset.bend);
  }

  private tone(frequency: number, duration: number, volume: number, wave: OscillatorType, bend = 1, music = false): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * bend), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.12), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    if (music) {
      this.musicVoices.add(oscillator);
      oscillator.addEventListener('ended', () => this.musicVoices.delete(oscillator), { once: true });
    }
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
