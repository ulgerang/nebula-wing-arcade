import './styles.css';
import { DEFAULT_SETTINGS } from './config';
import { Game } from './game';
import type { GameSnapshot, Settings } from './types';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game-canvas');
const overlayElement = document.querySelector<HTMLDivElement>('#screen-overlay');
const liveStatusElement = document.querySelector<HTMLParagraphElement>('#live-status');

if (!canvasElement || !overlayElement || !liveStatusElement) {
  throw new Error('Game shell is incomplete');
}

const canvas = canvasElement;
const overlay = overlayElement;
const liveStatus = liveStatusElement;

if (!window.requestAnimationFrame || !canvas.getContext('2d')) {
  overlay.innerHTML = '<div class="screen-card"><h1>지원되지 않는 브라우저</h1><p>Canvas와 최신 브라우저 기능이 필요합니다.</p></div>';
} else {
  const game = new Game(canvas);
  let lastSnapshot: GameSnapshot | null = game.getSnapshot();
  let pendingBinding: keyof Settings['keyBindings'] | null = null;

  game.setLoadingListener((progress, message) => {
    if (lastSnapshot?.state !== 'Loading') return;
    overlay.innerHTML = `
      <div class="screen-card loading-card">
        <p class="eyebrow">NEBULA WING</p>
        <h1>시스템 부팅</h1>
        <p class="loading-message">${escapeHtml(message)}</p>
        <div class="progress-track" aria-label="로딩 진행률"><span style="width:${Math.round(progress * 100)}%"></span></div>
        <p class="progress-value">${Math.round(progress * 100)}%</p>
      </div>`;
    liveStatus.textContent = `로딩 ${Math.round(progress * 100)}퍼센트: ${message}`;
  });

  game.setUiListener((snapshot) => {
    const preserveSettings = lastSnapshot?.state === snapshot.state && snapshot.state === 'Settings';
    if (snapshot.state !== 'Settings') pendingBinding = null;
    lastSnapshot = snapshot;
    renderOverlay(snapshot, preserveSettings, pendingBinding);
  });

  overlay.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-action]') : null;
    const action = target?.dataset.action;
    if (!action) return;
    if (action === 'bind-key') {
      const binding = target?.dataset.binding as keyof Settings['keyBindings'] | undefined;
      if (binding && binding in DEFAULT_SETTINGS.keyBindings) {
        pendingBinding = binding;
        target.textContent = '키를 누르세요 · Esc 취소';
      }
      return;
    }
    if (action === 'reset-keys') {
      pendingBinding = null;
      game.updateSettings({ keyBindings: { ...DEFAULT_SETTINGS.keyBindings } });
      return;
    }
    if (action === 'start') game.beginRun();
    if (action === 'continue') game.continueGame();
    if (action === 'restart') game.restartRun();
    if (action === 'title') game.returnToTitle();
    if (action === 'results') game.showResults();
    if (action === 'settings') game.openSettings();
    if (action === 'close-settings') game.closeSettings();
    if (action === 'bonus') game.beginBonusStage();
    canvas.focus({ preventScroll: true });
  });

  overlay.addEventListener('keydown', (event) => {
    if (!pendingBinding) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      pendingBinding = null;
      if (lastSnapshot) syncSettings(lastSnapshot, pendingBinding);
      return;
    }
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta' || event.key === 'Dead' || event.key === 'Process') return;
    const key = event.key === ' ' ? ' ' : event.key.toLowerCase();
    const binding = pendingBinding;
    pendingBinding = null;
    const currentBindings = lastSnapshot?.settings.keyBindings ?? DEFAULT_SETTINGS.keyBindings;
    game.updateSettings({ keyBindings: { ...currentBindings, [binding]: key } });
  });

  overlay.addEventListener('input', (event) => {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    const setting = target?.dataset.setting as keyof Settings | undefined;
    if (!target || !setting) return;
    if (setting === 'bgmVolume' || setting === 'sfxVolume') game.updateSettings({ [setting]: Number(target.value) });
  });

  overlay.addEventListener('change', (event) => {
    const target = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target : null;
    const setting = target?.dataset.setting as keyof Settings | undefined;
    if (!target || !setting) return;
    if (setting === 'screenShake' || setting === 'reducedFlash') {
      game.updateSettings({ [setting]: target instanceof HTMLInputElement ? target.checked : false });
    }
    if (setting === 'colorTheme' && target instanceof HTMLSelectElement) {
      game.updateSettings({ colorTheme: target.value === 'high-contrast' ? 'high-contrast' : 'default' });
    }
  });

  overlay.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || form.dataset.action !== 'highscore') return;
    event.preventDefault();
    const input = form.elements.namedItem('highscore-name');
    if (input instanceof HTMLInputElement) game.submitHighScore(input.value);
  });

  game.start();
  window.addEventListener('beforeunload', () => game.dispose());
}

function renderOverlay(snapshot: GameSnapshot, preserveSettings = false, pendingBinding: keyof Settings['keyBindings'] | null = null): void {
  liveStatus.textContent = statusFor(snapshot);
  if (snapshot.state === 'Loading') return;
  if (snapshot.state === 'Settings' && preserveSettings) {
    syncSettings(snapshot, pendingBinding);
    return;
  }
  if (snapshot.state === 'Playing') {
    overlay.className = 'screen-overlay empty';
    overlay.innerHTML = '';
    return;
  }

  overlay.className = 'screen-overlay';
  if (snapshot.state === 'Title') {
    overlay.innerHTML = `
      <div class="screen-card title-card">
        <p class="eyebrow">2D FIXED SCREEN ARCADE</p>
        <h1>NEBULA WING</h1>
        <p class="tagline">편대를 읽고, 다이브를 피하고, 최고 점수를 갱신하세요.</p>
        <button class="primary-button" data-action="start">START <span>ENTER</span></button>
        <button class="secondary-button settings-button" data-action="settings">설정</button>
        <div class="controls-grid" aria-label="조작 안내">
          <span><b>A / D</b> 또는 <b>← / →</b></span><span>좌우 이동</span>
          <span><b>SPACE / Z</b></span><span>자동 연사</span>
          <span><b>ESC / P</b></span><span>일시정지</span>
        </div>
        <p class="microcopy">첫 30초 안에 기본 조작을 익힐 수 있습니다.</p>
      </div>`;
    return;
  }

  if (snapshot.state === 'Paused') {
    overlay.innerHTML = `
      <div class="screen-card compact-card">
        <p class="eyebrow">GAME PAUSED</p>
        <h1>일시정지</h1>
        <p class="tagline">적, 탄환, 타이머와 오디오가 멈췄습니다.</p>
        <div class="button-stack">
          <button class="primary-button" data-action="continue">계속하기 <span>ESC</span></button>
          <button class="secondary-button" data-action="restart">재시작 <span>R</span></button>
          <button class="secondary-button" data-action="title">타이틀로 돌아가기 <span>T</span></button>
        </div>
      </div>`;
    return;
  }

  if (snapshot.state === 'Settings') {
    overlay.innerHTML = `
      <div class="screen-card settings-card">
        <p class="eyebrow">SYSTEM OPTIONS</p>
        <h1>설정</h1>
        <div class="settings-list">
          <label for="bgm-volume">BGM 볼륨 <output data-output="bgmVolume">${Math.round(snapshot.settings.bgmVolume * 100)}%</output></label>
          <input id="bgm-volume" type="range" min="0" max="1" step="0.01" value="${snapshot.settings.bgmVolume}" data-setting="bgmVolume" />
          <label for="sfx-volume">효과음 볼륨 <output data-output="sfxVolume">${Math.round(snapshot.settings.sfxVolume * 100)}%</output></label>
          <input id="sfx-volume" type="range" min="0" max="1" step="0.01" value="${snapshot.settings.sfxVolume}" data-setting="sfxVolume" />
          <label class="check-row"><input type="checkbox" data-setting="screenShake" ${snapshot.settings.screenShake ? 'checked' : ''} /> 화면 흔들림</label>
          <label class="check-row"><input type="checkbox" data-setting="reducedFlash" ${snapshot.settings.reducedFlash ? 'checked' : ''} /> 플래시 효과 줄이기</label>
          <label for="color-theme">탄환 색상 테마</label>
          <select id="color-theme" data-setting="colorTheme">
            <option value="default" ${snapshot.settings.colorTheme === 'default' ? 'selected' : ''}>기본</option>
            <option value="high-contrast" ${snapshot.settings.colorTheme === 'high-contrast' ? 'selected' : ''}>고대비</option>
          </select>
          <p class="binding-heading">추가 키 지정</p>
          ${renderBindingRow('left', '왼쪽 이동', snapshot.settings.keyBindings.left)}
          ${renderBindingRow('right', '오른쪽 이동', snapshot.settings.keyBindings.right)}
          ${renderBindingRow('fire', '발사', snapshot.settings.keyBindings.fire)}
          ${renderBindingRow('pause', '일시정지', snapshot.settings.keyBindings.pause)}
          <p class="binding-hint">A / D, 방향키, Space / Z, Esc / P는 항상 사용할 수 있습니다.</p>
          <button class="secondary-button reset-keys-button" data-action="reset-keys">추가 키 초기화</button>
        </div>
        <button class="primary-button" data-action="close-settings">저장하고 돌아가기 <span>ESC</span></button>
      </div>`;
    return;
  }

  if (snapshot.state === 'GameOver') {
    overlay.innerHTML = `
      <div class="screen-card compact-card">
        <p class="eyebrow danger-text">SIGNAL LOST</p>
        <h1>GAME OVER</h1>
        <p class="result-line">SCORE <strong>${formatScore(snapshot.lastRunScore)}</strong></p>
        <p class="result-line">STAGE <strong>${snapshot.lastRunStage}</strong></p>
        <div class="button-stack">
          <button class="primary-button" data-action="results">결과 보기 <span>ENTER</span></button>
          <button class="secondary-button" data-action="restart">즉시 재시작 <span>R</span></button>
          <button class="secondary-button" data-action="title">타이틀로 돌아가기 <span>T</span></button>
        </div>
      </div>`;
    return;
  }

  if (snapshot.state === 'Result') {
    const highScoreSection = snapshot.highScoreSaved
      ? snapshot.highScorePersisted
        ? '<p class="saved-message">하이스코어가 저장되었습니다.</p>'
        : '<p class="saved-message">이번 세션 하이스코어에 등록했습니다. 브라우저 저장은 다시 시도합니다.</p>'
      : snapshot.qualifiesForHighScore
        ? `<form class="highscore-form" data-action="highscore">
            <label for="highscore-name">하이스코어 등록 <span>영문 대문자 3자리</span></label>
            <input id="highscore-name" name="highscore-name" maxlength="3" minlength="3" pattern="[A-Za-z]{3}" value="AAA" autocomplete="off" aria-label="하이스코어 이름" />
            <button class="primary-button" type="submit">저장 <span>ENTER</span></button>
          </form>`
        : '<p class="saved-message">이번 점수는 하이스코어 목록에 등록되지 않았습니다.</p>';
    const rows = snapshot.highScores.length > 0
      ? snapshot.highScores.map((entry, index) => `<li><span>${String(index + 1).padStart(2, '0')} ${escapeHtml(entry.name)}</span><strong>${formatScore(entry.score)}</strong></li>`).join('')
      : '<li class="empty-score">아직 등록된 점수가 없습니다.</li>';
    overlay.innerHTML = `
      <div class="screen-card result-card">
        <div>
          <p class="eyebrow">MISSION REPORT</p>
          <h1>RESULT</h1>
          <p class="result-line">SCORE <strong>${formatScore(snapshot.lastRunScore)}</strong></p>
          <p class="result-line">REACHED STAGE <strong>${snapshot.lastRunStage}</strong></p>
          ${highScoreSection}
          <div class="button-row">
            <button class="primary-button" data-action="restart">다시 플레이 <span>ENTER</span></button>
            ${snapshot.stageClearAvailable ? '<button class="secondary-button" data-action="bonus">보너스 도전</button>' : ''}
            <button class="secondary-button" data-action="title">타이틀</button>
          </div>
        </div>
        <div class="scoreboard">
          <p class="eyebrow">LOCAL TOP 10</p>
          <ol>${rows}</ol>
        </div>
      </div>`;
    const input = overlay.querySelector<HTMLInputElement>('#highscore-name');
    input?.focus({ preventScroll: true });
    input?.select();
  }
}

function renderBindingRow(binding: keyof Settings['keyBindings'], label: string, value: string): string {
  return `<div class="binding-row"><span>${label}</span><button class="secondary-button" data-action="bind-key" data-binding="${binding}">${escapeHtml(formatBinding(value))}</button></div>`;
}

function syncSettings(snapshot: GameSnapshot, pendingBinding: keyof Settings['keyBindings'] | null): void {
  for (const setting of ['bgmVolume', 'sfxVolume'] as const) {
    const slider = overlay.querySelector<HTMLInputElement>(`[data-setting="${setting}"]`);
    const output = overlay.querySelector<HTMLOutputElement>(`[data-output="${setting}"]`);
    if (slider) slider.value = String(snapshot.settings[setting]);
    if (output) output.textContent = `${Math.round(snapshot.settings[setting] * 100)}%`;
  }
  const shake = overlay.querySelector<HTMLInputElement>('[data-setting="screenShake"]');
  const flash = overlay.querySelector<HTMLInputElement>('[data-setting="reducedFlash"]');
  const theme = overlay.querySelector<HTMLSelectElement>('[data-setting="colorTheme"]');
  if (shake) shake.checked = snapshot.settings.screenShake;
  if (flash) flash.checked = snapshot.settings.reducedFlash;
  if (theme) theme.value = snapshot.settings.colorTheme;
  for (const binding of Object.keys(snapshot.settings.keyBindings) as Array<keyof Settings['keyBindings']>) {
    const button = overlay.querySelector<HTMLButtonElement>(`[data-action="bind-key"][data-binding="${binding}"]`);
    if (button && pendingBinding !== binding) {
      button.textContent = formatBinding(snapshot.settings.keyBindings[binding]);
    }
  }
}

function formatBinding(value: string): string {
  if (!value) return '지정 안 됨';
  if (value === ' ') return 'Space';
  const arrows: Record<string, string> = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓' };
  return arrows[value] ?? value.toUpperCase();
}

function statusFor(snapshot: GameSnapshot): string {
  if (snapshot.state === 'Title') return '타이틀 화면. Enter로 게임을 시작할 수 있습니다.';
  if (snapshot.state === 'Playing') return `스테이지 ${snapshot.stage}, 웨이브 ${snapshot.wave}. 점수 ${snapshot.score}. 잔기 ${snapshot.lives}.`;
  if (snapshot.state === 'Paused') return '게임이 일시정지되었습니다.';
  if (snapshot.state === 'Settings') return '설정 화면. 변경 사항은 즉시 저장됩니다.';
  if (snapshot.state === 'Bonus') return '보너스 스테이지. 제한 시간 동안 이동 타깃을 격추하세요.';
  if (snapshot.state === 'GameOver') return '게임 오버. Enter로 결과를 확인할 수 있습니다.';
  if (snapshot.state === 'Result') return `결과 화면. 점수 ${snapshot.lastRunScore}.`;
  return '게임 로딩 중입니다.';
}

function formatScore(value: number): string {
  return value.toString().padStart(7, '0');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}
