/**
 * Texas Hold'em Poker - Game Application
 * Phase 6: Horizontal Oval Table, Custom Raise Slider & ALL-IN Mind Games
 */

// ==========================================================================
// 1. 카드 데이터 상수 정의
// ==========================================================================
const SUITS = [
  { name: 'spades', symbol: '♠', color: 'black' },
  { name: 'hearts', symbol: '♥', color: 'red' },
  { name: 'diamonds', symbol: '♦', color: 'red' },
  { name: 'clubs', symbol: '♣', color: 'black' }
];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 기본 베팅 및 블라인드 규칙 상수
const SMALL_BLIND = 25;
const BIG_BLIND = 50;
const DEFAULT_BET_AMOUNT = 50;
const TURN_TIME_LIMIT = 20; // 각 턴당 기본 20초 시간 제한
const TIME_BANK_BONUS = 15; // 시간 연장(Time Bank) 버튼 클릭 시 +15초 추가

// ==========================================================================
// 2. 사운드 이펙트 시스템 (베팅 금액 비례 묵직한 저주파 '툭, 촥' & 턴 타이머 SFX)
// ==========================================================================
let audioContext = null;
let isAudioUnlocked = false;
let tickToggleState = false;
const actionTagTimers = [];
let turnTimerInterval = null;
let sitOutAutoFoldTimeout = null;
let currentTableScale = 1; // 모바일 화면 맞춤 테이블 스케일 (데스크톱 = 1)
let isGameStarted = false; // 'Tap to Start' 터치 이후에만 true
let isScaleUpdateScheduled = false; // 깜빡거림 방지 requestAnimationFrame 플래그
const TABLE_BASE_WIDTH = 880;
const TABLE_BASE_HEIGHT = 520;
let turnTimerState = {
  endTime: 0,
  totalMs: 20000,
  barEl: null,
  badgeEl: null,
  seatEl: null,
  isHumanTurn: false
};

/**
 * 브라우저 오토플레이 방지 정책(Autoplay Policy)을 통과하기 위해
 * 사용자의 첫 버튼 클릭(칩 구매, 첫 베팅 등) 시 AudioContext를 즉시 깨우고 활성화하는 함수
 */
function unlockAudioContext() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    if (!isAudioUnlocked && audioContext) {
      const silentBuffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      isAudioUnlocked = true;
    }

    return audioContext;
  } catch (err) {
    return null;
  }
}

function getAudioContext() {
  return unlockAudioContext();
}

/**
 * 사운드 이펙트 재생 함수 (베팅 금액에 비례해 볼륨과 파형 두께가 동적으로 변화)
 * @param {'sound-bet' | 'sound-check' | 'sound-fold' | 'sound-allin' | 'sound-card' | 'sound-win' | 'sound-tick'} soundId
 * @param {number} amount - 베팅/콜/레이즈 금액 (기본값 50)
 */
function playSound(soundId, amount = 50) {
  try {
    unlockAudioContext();
    const audioEl = document.getElementById(soundId);
    if (audioEl && audioEl.src && audioEl.src.length > 5 && !audioEl.src.endsWith('/')) {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => playSynthesizedSound(soundId, amount));
    } else {
      playSynthesizedSound(soundId, amount);
    }
  } catch (err) {
    playSynthesizedSound(soundId, amount);
  }
}

/**
 * 브라우저 내장 Web Audio API 고품질 카지노 사운드 합성기
 * - sound-bet: 고주파 '피악' 소리를 완전히 배제하고, 저주파 대역(65Hz~420Hz)의 묵직한 '툭, 촥' 사운드 구현
 *              베팅 금액(amount)이 커질수록 볼륨(gain)이 커지고 오실레이터 파형이 굵어지며(sine -> triangle/sawtooth) 칩 낙하 밀도가 증가
 * - sound-check: 테이블을 가볍게 두드리는 묵직한 저음 '툭-툭' 노크 사운드
 * - sound-tick: 남은 시간 3초 이하일 때 울리는 긴장감 넘치는 '째깍째깍' 시계 초침 사운드
 */
function playSynthesizedSound(type, amount = 50) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'sound-bet') {
      // 베팅 금액($25 ~ $2,500+)을 0.0 ~ 1.0 강도(intensity)로 로그 정규화
      const safeAmt = Math.max(25, Number(amount) || 50);
      const intensity = Math.min(1, Math.max(0, Math.log10(safeAmt / 25) / Math.log10(2500 / 25)));

      // 금액에 비례하는 동적 볼륨(0.24 -> 0.62) 및 파형 두께(칩 낙하 횟수 2회 -> 5회)
      const masterGainVal = 0.24 + intensity * 0.38;
      const dropCount = 2 + Math.floor(intensity * 3); // 소액은 '툭-촥'(2타), 고액 레이즈는 묵직한 다중 '쿵-촥-촥'(5타)
      const baseFreq = 135 - intensity * 38; // 금액이 클수록 주파수가 더 낮고 묵직해짐 (135Hz -> 97Hz)

      for (let i = 0; i < dropCount; i++) {
        const startOffset = i * (0.045 - intensity * 0.008);
        const t0 = now + startOffset;
        const dropDur = 0.12 + intensity * 0.06;

        // 1) 묵직한 '툭' (저주파 펠트 타격음 - 금액이 클수록 파형이 굵어짐)
        const thudOsc = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thudOsc.type = intensity >= 0.45 ? 'triangle' : 'sine';
        const startFreq = Math.max(65, baseFreq - i * 8);
        thudOsc.frequency.setValueAtTime(startFreq, t0);
        thudOsc.frequency.exponentialRampToValueAtTime(34, t0 + dropDur);

        const layerVol = masterGainVal * (i === 0 ? 1.0 : 0.78);
        thudGain.gain.setValueAtTime(0.001, t0);
        thudGain.gain.linearRampToValueAtTime(layerVol, t0 + 0.006);
        thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + dropDur);

        thudOsc.connect(thudGain);
        thudGain.connect(ctx.destination);
        thudOsc.start(t0);
        thudOsc.stop(t0 + dropDur + 0.01);

        // 고액 베팅($200 이상)일 때 파형을 더 굵고 풍성하게 만드는 서브 하모닉 레이어 추가
        if (intensity > 0.25) {
          const fatOsc = ctx.createOscillator();
          const fatFilter = ctx.createBiquadFilter();
          const fatGain = ctx.createGain();
          fatOsc.type = 'sawtooth';
          fatOsc.frequency.setValueAtTime(startFreq * 0.75, t0);
          fatOsc.frequency.exponentialRampToValueAtTime(28, t0 + dropDur);

          fatFilter.type = 'lowpass';
          fatFilter.frequency.setValueAtTime(180 + intensity * 140, t0);

          fatGain.gain.setValueAtTime(0.001, t0);
          fatGain.gain.linearRampToValueAtTime(layerVol * (0.35 + intensity * 0.45), t0 + 0.008);
          fatGain.gain.exponentialRampToValueAtTime(0.001, t0 + dropDur);

          fatOsc.connect(fatFilter);
          fatFilter.connect(fatGain);
          fatGain.connect(ctx.destination);
          fatOsc.start(t0);
          fatOsc.stop(t0 + dropDur + 0.01);
        }

        // 2) 묵직한 '촥' (저중역 클레이 칩 마찰음 - 고주파 완전 제거, 240Hz~480Hz 로우패스/밴드패스)
        const chwakDur = 0.095 + intensity * 0.045;
        const bufLen = Math.floor(ctx.sampleRate * chwakDur);
        const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let s = 0; s < bufLen; s++) {
          const env = Math.pow(1 - s / bufLen, 1.4);
          data[s] = (Math.random() * 2 - 1) * env;
        }

        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;

        const chipFilter = ctx.createBiquadFilter();
        chipFilter.type = 'bandpass';
        chipFilter.Q.setValueAtTime(1.4 - intensity * 0.5, t0); // 금액이 클수록 대역폭이 넓고 굵어짐
        chipFilter.frequency.setValueAtTime(380 - intensity * 90, t0);
        chipFilter.frequency.exponentialRampToValueAtTime(180, t0 + chwakDur);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.001, t0);
        noiseGain.gain.linearRampToValueAtTime(layerVol * 0.85, t0 + 0.01);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + chwakDur);

        noiseSrc.connect(chipFilter);
        chipFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseSrc.start(t0);
        noiseSrc.stop(t0 + chwakDur + 0.01);
      }
    } else if (type === 'sound-check') {
      // 체크(CHECK): 테이블 우드/펠트를 가볍게 두 번 두드리는 낮고 묵직한 '툭-툭' 노크음
      [0, 0.075].forEach((offset, idx) => {
        const t0 = now + offset;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(idx === 0 ? 118 : 104, t0);
        osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.07);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(0.22, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.075);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.08);
      });
    } else if (type === 'sound-tick') {
      // 3초 이하 임박 타이머: 긴장감 있는 '째깍(Tick-Tock)' 시계 초침 사운드
      tickToggleState = !tickToggleState;
      const tickFreq = tickToggleState ? 620 : 480;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(tickFreq, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.045);

      filter.type = 'bandpass';
      filter.Q.setValueAtTime(3.0, now);
      filter.frequency.setValueAtTime(tickFreq, now);

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.28, now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.052);
    } else if (type === 'sound-fold') {
      // 폴드(FOLD): 카드가 '슥~' 하고 펠트 테이블을 스치는 가벼운 마찰 사운드
      const duration = 0.22;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.Q.setValueAtTime(2.2, now);
      bandpass.frequency.setValueAtTime(850, now);
      bandpass.frequency.exponentialRampToValueAtTime(260, now + duration);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.03);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      whiteNoise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + duration);

      const swishOsc = ctx.createOscillator();
      const swishGain = ctx.createGain();
      swishOsc.type = 'sine';
      swishOsc.frequency.setValueAtTime(260, now);
      swishOsc.frequency.exponentialRampToValueAtTime(85, now + 0.18);
      swishGain.gain.setValueAtTime(0.14, now);
      swishGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      swishOsc.connect(swishGain);
      swishGain.connect(ctx.destination);
      swishOsc.start(now);
      swishOsc.stop(now + 0.19);
    } else if (type === 'sound-allin') {
      // 올인(ALL-IN): 묵직하게 '쾅!' 터지는 임팩트 + 웅장한 카지노 알람/브라스 사운드
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.55);
      subGain.gain.setValueAtTime(0.52, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.60);

      const boomDur = 0.35;
      const boomBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * boomDur), ctx.sampleRate);
      const boomData = boomBuf.getChannelData(0);
      for (let i = 0; i < boomData.length; i++) {
        boomData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / boomData.length, 1.5);
      }
      const boomNoise = ctx.createBufferSource();
      boomNoise.buffer = boomBuf;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(420, now);
      lowpass.frequency.exponentialRampToValueAtTime(65, now + boomDur);
      const boomNoiseGain = ctx.createGain();
      boomNoiseGain.gain.setValueAtTime(0.42, now);
      boomNoiseGain.gain.exponentialRampToValueAtTime(0.001, now + boomDur);
      boomNoise.connect(lowpass);
      lowpass.connect(boomNoiseGain);
      boomNoiseGain.connect(ctx.destination);
      boomNoise.start(now);
      boomNoise.stop(now + boomDur);

      const alarmPulses = [
        { start: 0.04, f1: 220, f2: 329.63, dur: 0.24 },
        { start: 0.28, f1: 261.63, f2: 392.00, dur: 0.44 }
      ];
      alarmPulses.forEach(({ start, f1, f2, dur }) => {
        [f1, f1 * 1.5, f2].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = idx === 1 ? 'sawtooth' : 'triangle';
          const t0 = now + start;
          osc.frequency.setValueAtTime(freq * 0.92, t0);
          osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.07);
          g.gain.setValueAtTime(0.001, t0);
          g.gain.linearRampToValueAtTime(idx === 1 ? 0.12 : 0.18, t0 + 0.025);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + dur + 0.02);
        });
      });
    } else if (type === 'sound-card') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.09);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } else if (type === 'sound-win') {
      const notes = [261.63, 329.63, 392.00, 523.25];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.11;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.24, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.42);
      });
    }
  } catch (err) {
    // Non-blocking
  }
}

// ==========================================================================
// 3. 게임 상태 관리 (Game State)
// ==========================================================================
const gameState = {
  deck: [],
  communityCards: [],
  // 테이블 시계 방향 좌석 순서:
  // Player 1 (하단 중앙) -> Bot 5 (하단 좌측) -> Bot 1 (좌측) -> Bot 2 (상단 좌측) -> Bot 3 (상단 우측) -> Bot 4 (우측)
  players: [
    { id: 'player1', name: 'PLAYER 1', isHuman: true, chips: 1000, hand: [], isFolded: false, seatId: 'seat-player-1' },
    { id: 'bot5', name: 'Bot 5', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-5' },
    { id: 'bot1', name: 'Bot 1', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-1' },
    { id: 'bot2', name: 'Bot 2', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-2' },
    { id: 'bot3', name: 'Bot 3', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-3' },
    { id: 'bot4', name: 'Bot 4', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-4' }
  ],
  pot: 0,
  dealerIndex: 4, // 첫 판에 PLAYER 1(index 0)이 빅 블라인드(BB)가 되어 프리플롭 체크(CHECK)를 바로 경험할 수 있도록 설정
  sbIndex: 5,     // 스몰 블라인드(SB) 위치 (Bot 4)
  bbIndex: 0,     // 빅 블라인드(BB) 위치 (PLAYER 1)
  currentRound: 'preflop', // 'preflop' -> 'flop' -> 'turn' -> 'river' -> 'showdown'
  currentBet: BIG_BLIND,
  roundBets: {},  // 플레이어별 해당 라운드 베팅 누적액
  hasBotRaisedThisStreet: false,
  selectedBuyIn: 1000, // 환전소(Buy-in) 선택 금액
  isSeated: false,     // 바이인 완료 후 착석 여부
  isBettingInProgress: false,
  isPlayerAllIn: false,
  timeBankUsedThisHand: false, // 한 핸드(판)당 1회 시간 연장(+15초) 사용 여부
  consecutiveTimeouts: 0,      // 연속 타임아웃 횟수 (2회 연속 시 자리 비움 전환)
  isSittingOut: false,         // 자리 비움(Sit-Out) 모드 여부
  rejoinNextHand: false,       // '다시 시작하기' 클릭 후 다음 판 즉시 복귀 예약 여부
  autoNextHandTimer: null      // 자리 비움 중 봇들끼리 다음 판 자동 진행 타이머
};

// ==========================================================================
// 4. 카드 덱 생성 및 셔플 (Deck & Shuffle)
// ==========================================================================

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit: suit,
        rank: rank,
        value: RANK_VALUES[rank],
        id: `${suit.name}-${rank}`,
        toString() {
          return `${this.suit.symbol}${this.rank}`;
        }
      });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ==========================================================================
// 4-1. 입체 칩 탑(Stack) 생성 및 날아가는 칩 애니메이션 시스템
// ==========================================================================

/**
 * 소지금에 맞춰 산더미처럼 수북하게 쌓인 3D 카지노 칩 탑(Stack) HTML 생성
 * 같은 금액이라도 고액권 1~2개로 끝나지 않고, 여러 단위($1000, $500, $100, $50, $10)로 잘게 쪼개어
 * 웅장하고 풍성한 다중 칩 타워(최대 4~5컬럼, 컬럼당 최대 8~9개 적층)를 형성하도록 고도화
 */
function generateChipStackHTML(amount) {
  if (amount <= 0) return '';

  const chipList = [];
  let rem = amount;

  // 1) 고액($1000+)은 일부만 $1000/$500 칩으로 배정하고 나머지는 $100, $50, $10으로 잘게 쪼개어 칩 개수를 대폭 증폭
  if (rem >= 1500) {
    const c1000 = Math.min(4, Math.floor((rem * 0.35) / 1000));
    for (let i = 0; i < c1000; i++) chipList.push('chip-1000');
    rem -= c1000 * 1000;
  }

  if (rem >= 600) {
    const c500 = Math.min(5, Math.floor((rem * 0.4) / 500));
    for (let i = 0; i < c500; i++) chipList.push('chip-500');
    rem -= c500 * 500;
  }

  if (rem >= 150) {
    const c100 = Math.min(10, Math.floor((rem * 0.55) / 100));
    for (let i = 0; i < c100; i++) chipList.push('chip-100');
    rem -= c100 * 100;
  }

  if (rem >= 50) {
    const c50 = Math.min(10, Math.floor((rem * 0.65) / 50));
    for (let i = 0; i < c50; i++) chipList.push('chip-50');
    rem -= c50 * 50;
  }

  if (rem > 0) {
    const c10 = Math.min(10, Math.max(2, Math.ceil(rem / 10)));
    for (let i = 0; i < c10; i++) chipList.push('chip-10');
  }

  // 기본 $1,000 바이인 기준 최소 22개 이상의 칩이 수북하게 쌓이도록 밀도 보강
  const targetMinChips = amount >= 2000 ? 30 : amount >= 1000 ? 24 : amount >= 300 ? 16 : Math.max(5, Math.ceil(amount / 15));
  const fillerClasses = ['chip-100', 'chip-50', 'chip-10'];
  let fillerIdx = 0;
  while (chipList.length < targetMinChips) {
    chipList.push(fillerClasses[fillerIdx % fillerClasses.length]);
    fillerIdx++;
  }

  // 1열당 최대 8개씩 최대 4개 컬럼으로 산더미처럼 분할
  const columns = [];
  const colSize = 8;
  for (let i = 0; i < chipList.length; i += colSize) {
    columns.push(chipList.slice(i, i + colSize));
    if (columns.length >= 4) break;
  }

  let html = '<div class="chip-stack-container">';
  columns.forEach(col => {
    html += '<div class="chip-column">';
    col.forEach(cls => {
      html += `<span class="stacked-chip ${cls}"></span>`;
    });
    html += '</div>';
  });
  html += '</div>';

  return html;
}

/**
 * 칩이 묵직하고 풍성하게 날아가는 이동 애니메이션 함수 (1.5x 크기 반영)
 */
function animateFlyingChips(fromEl, toEl, count = 5, chipClass = 'chip-50', callback = null) {
  if (!fromEl || !toEl) {
    if (callback) callback();
    return;
  }

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  if (fromRect.width === 0 || toRect.width === 0) {
    if (callback) callback();
    return;
  }

  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  const container = document.body;
  const chipCount = Math.max(4, count);

  for (let i = 0; i < chipCount; i++) {
    const chip = document.createElement('div');
    chip.className = `flying-chip ${chipClass}`;

    const randSpreadX = (Math.random() - 0.5) * 22;
    const randSpreadY = (Math.random() - 0.5) * 16;

    chip.style.left = `${startX + randSpreadX - 16}px`;
    chip.style.top = `${startY + randSpreadY - 10}px`;

    container.appendChild(chip);

    const delayMs = i * 38;
    const duration = 430;

    setTimeout(() => {
      chip.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${duration}ms ease`;
      const targetDX = (endX - startX) + (Math.random() - 0.5) * 20;
      const targetDY = (endY - startY) + (Math.random() - 0.5) * 14;
      const randRot = (Math.random() - 0.5) * 180;
      chip.style.transform = `translate(${targetDX}px, ${targetDY}px) scale(0.95) rotate(${randRot}deg)`;
    }, delayMs);

    setTimeout(() => {
      chip.remove();
      if (i === chipCount - 1 && callback) {
        callback();
      }
    }, delayMs + duration + 50);
  }
}

// ==========================================================================
// 5. 게임 상태 완벽 리셋 및 딜링 시스템
// ==========================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 딜러(D), 스몰 블라인드(SB), 빅 블라인드(BB) 럭셔리 토큰 뱃지 렌더링
 */
function renderBlindBadges() {
  document.querySelectorAll('.blind-badge-slot').forEach(slot => {
    slot.innerHTML = '';
  });

  const dealerPlayer = gameState.players[gameState.dealerIndex];
  const sbPlayer = gameState.players[gameState.sbIndex];
  const bbPlayer = gameState.players[gameState.bbIndex];

  const setBadge = (player, text, className, title) => {
    if (!player) return;
    const seatEl = document.getElementById(player.seatId);
    if (!seatEl) return;
    const slot = seatEl.querySelector('.blind-badge-slot');
    if (slot) {
      slot.innerHTML = `<span class="blind-badge ${className}" title="${title}">${text}</span>`;
    }
  };

  setBadge(dealerPlayer, 'D', 'badge-dealer', '딜러 (Dealer)');
  setBadge(sbPlayer, 'SB', 'badge-sb', `스몰 블라인드 (Small Blind $${SMALL_BLIND})`);
  setBadge(bbPlayer, 'BB', 'badge-bb', `빅 블라인드 (Big Blind $${BIG_BLIND})`);
}

/**
 * 실전 20초 턴 타이머 & 타임 뱅크(+15초) & 자리 비움(Sit-Out) 제어 시스템
 * - 현재 턴인 플레이어 프로필 하단에 빨간색 프로그레스 바(Progress Bar)와 남은 초(s) 배지를 표시
 * - 플레이어 턴일 때 '⏱ 시간 연장 (+15초)' 버튼을 판당 딱 1회 눌러 남은 시간을 즉시 +15초 연장 가능
 * - 남은 시간이 3초 이하가 되면 테두리 적색 점멸 및 '째깍째깍' 시계 소리(sound-tick) 재생
 * - 2번 연속 타임아웃 발생 시 자리 비움(Sit-Out) 모드로 전환되어 0.1초 만에 즉시 자동 폴드 처리 및 봇들끼리 무한 진행
 */
function stopTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  if (sitOutAutoFoldTimeout) {
    clearTimeout(sitOutAutoFoldTimeout);
    sitOutAutoFoldTimeout = null;
  }
  turnTimerState.barEl = null;
  turnTimerState.badgeEl = null;
  turnTimerState.seatEl = null;
  turnTimerState.isHumanTurn = false;
  document.querySelectorAll('.seat').forEach(seat => {
    seat.classList.remove('active-turn', 'timer-urgent');
  });
  document.querySelectorAll('.turn-timer-track, .turn-timer-badge').forEach(el => el.remove());
  updateTimeBankButtonDOM();
}

function startTurnTimer(player, onTimeoutCallback = null) {
  stopTurnTimer();
  if (!player || player.isFolded || gameState.currentRound === 'showdown') return;

  const seatEl = document.getElementById(player.seatId);
  if (!seatEl) return;

  const pillEl = seatEl.querySelector('.player-info-pill') || seatEl;
  seatEl.classList.add('active-turn');

  const trackEl = document.createElement('div');
  trackEl.className = 'turn-timer-track';
  const barEl = document.createElement('div');
  barEl.className = 'turn-timer-bar';
  trackEl.appendChild(barEl);

  const badgeEl = document.createElement('span');
  badgeEl.className = 'turn-timer-badge';
  badgeEl.textContent = `${TURN_TIME_LIMIT}s`;

  pillEl.appendChild(trackEl);
  pillEl.appendChild(badgeEl);

  const totalMs = TURN_TIME_LIMIT * 1000;
  turnTimerState = {
    endTime: Date.now() + totalMs,
    totalMs: totalMs,
    barEl: barEl,
    badgeEl: badgeEl,
    seatEl: seatEl,
    isHumanTurn: Boolean(player.isHuman)
  };
  updateTimeBankButtonDOM();

  let lastTickHalfSec = -1;

  turnTimerInterval = setInterval(() => {
    const remainingMs = Math.max(0, turnTimerState.endTime - Date.now());
    const pct = Math.min(100, (remainingMs / turnTimerState.totalMs) * 100);
    const remainingSec = Math.ceil(remainingMs / 1000);

    if (turnTimerState.barEl) {
      turnTimerState.barEl.style.width = `${pct.toFixed(1)}%`;
    }
    if (turnTimerState.badgeEl) {
      turnTimerState.badgeEl.textContent = `${remainingSec}s`;
    }

    // 남은 시간이 3초 이하일 때 긴장감 있는 '째깍째깍' 사운드 & 적색 긴급 점멸
    if (remainingMs <= 3000 && remainingMs > 0) {
      seatEl.classList.add('timer-urgent');
      const halfSecBucket = Math.floor(remainingMs / 500);
      if (halfSecBucket !== lastTickHalfSec) {
        lastTickHalfSec = halfSecBucket;
        playSound('sound-tick');
      }
    } else {
      seatEl.classList.remove('timer-urgent');
    }

    if (remainingMs <= 0) {
      stopTurnTimer();
      if (typeof onTimeoutCallback === 'function') {
        onTimeoutCallback();
      }
    }
  }, 100);
}

/**
 * ⏱ 시간 연장 (+15초) 타임 뱅크 버튼 클릭 핸들러 (한 핸드당 딱 1회 사용 가능)
 */
function extendTurnTimer() {
  if (!turnTimerInterval || !turnTimerState.isHumanTurn) return;
  if (gameState.timeBankUsedThisHand || gameState.isBettingInProgress || gameState.currentRound === 'showdown') {
    return;
  }

  gameState.timeBankUsedThisHand = true;
  gameState.consecutiveTimeouts = 0;

  const bonusMs = TIME_BANK_BONUS * 1000;
  turnTimerState.endTime += bonusMs;
  turnTimerState.totalMs += bonusMs;

  if (turnTimerState.seatEl) {
    turnTimerState.seatEl.classList.remove('timer-urgent');
  }

  const remainingMs = Math.max(0, turnTimerState.endTime - Date.now());
  const pct = Math.min(100, (remainingMs / turnTimerState.totalMs) * 100);
  const remainingSec = Math.ceil(remainingMs / 1000);

  if (turnTimerState.barEl) {
    turnTimerState.barEl.style.width = `${pct.toFixed(1)}%`;
  }
  if (turnTimerState.badgeEl) {
    turnTimerState.badgeEl.textContent = `${remainingSec}s`;
  }

  playSound('sound-check', 0);
  updateTimeBankButtonDOM();
  console.log(`⏱ [타임 뱅크 발동] 현재 턴 남은 시간에 +${TIME_BANK_BONUS}초가 즉시 추가되었습니다! (남은 시간: ${remainingSec}초)`);
}

/**
 * 타임 뱅크 버튼의 텍스트 및 활성/비활성 UI 상태 동기화
 */
function updateTimeBankButtonDOM() {
  const timeBankBtn = document.getElementById('btn-time-bank');
  if (!timeBankBtn) return;

  const textEl = timeBankBtn.querySelector('.btn-text');
  const subEl = timeBankBtn.querySelector('.btn-subtext');

  if (gameState.timeBankUsedThisHand) {
    timeBankBtn.disabled = true;
    timeBankBtn.classList.add('timebank-used');
    timeBankBtn.style.opacity = '0.45';
    timeBankBtn.style.pointerEvents = 'none';
    if (textEl) textEl.textContent = '⏱ 연장 사용됨';
    if (subEl) subEl.textContent = '이번 핸드 소진 (판당 1회)';
  } else {
    timeBankBtn.classList.remove('timebank-used');
    if (textEl) textEl.textContent = '⏱ 시간 연장';
    if (subEl) subEl.textContent = `+${TIME_BANK_BONUS}초 (판당 1회)`;
    const canUseNow = Boolean(
      turnTimerInterval &&
      turnTimerState.isHumanTurn &&
      !gameState.isBettingInProgress &&
      gameState.currentRound !== 'showdown' &&
      !gameState.isSittingOut
    );
    timeBankBtn.disabled = !canUseNow;
    timeBankBtn.style.opacity = canUseNow ? '1' : '0.55';
    timeBankBtn.style.pointerEvents = canUseNow ? 'auto' : 'none';
  }
}

/**
 * 2회 연속 타임아웃 발생 시 자리 비움(Sit-Out) 모드 진입 및 중앙 대형 복귀 팝업 표시
 */
function enterSitOutMode() {
  if (gameState.isSittingOut) return;
  gameState.isSittingOut = true;
  gameState.rejoinNextHand = false;

  const sitoutOverlay = document.getElementById('sitout-overlay');
  if (sitoutOverlay) {
    sitoutOverlay.classList.add('active');
    sitoutOverlay.style.display = 'flex';
  }
  console.log('💤 [자리 비움(Sit-Out) 전환] 2회 연속 타임아웃이 발생하여 자리 비움 모드로 전환되었습니다. 봇들끼리 막힘없이 게임을 속행합니다.');
}

/**
 * '▶ 다시 시작하기 (게임 참여)' 버튼 클릭 시 자리 비움 해제 및 다음 판부터 즉시 정상 참여
 */
function handleImBackClick() {
  unlockAudioContext();
  playSound('sound-check', 0);

  gameState.isSittingOut = false;
  gameState.consecutiveTimeouts = 0;
  gameState.rejoinNextHand = true;

  const sitoutOverlay = document.getElementById('sitout-overlay');
  if (sitoutOverlay) {
    sitoutOverlay.classList.remove('active');
    sitoutOverlay.style.display = 'none';
  }

  console.log('▶ [게임 복귀 완료] 자리 비움(Sit-Out) 모드가 해제되었습니다! 다음 판(Next Hand)부터 즉시 카드를 받고 베팅에 참여합니다.');

  // 현재 쇼다운 정산 모달이 떠 있는 상태라면 기다리지 않고 즉시 새 판을 시작
  if (gameState.currentRound === 'showdown' && !gameState.isBettingInProgress) {
    if (gameState.autoNextHandTimer) {
      clearTimeout(gameState.autoNextHandTimer);
      gameState.autoNextHandTimer = null;
    }
    hideGameModal();
    const human = gameState.players.find(p => p.isHuman);
    if (human && human.chips < BIG_BLIND) {
      showBuyInModal(true);
    } else {
      startNextHand();
    }
  }
}

/**
 * 내 턴(PLAYER 1) 20초 타이머 시작 및 시간 초과 시 Auto-Check / Auto-Fold + 연속 2회 시 자리 비움 처리
 */
function startHumanTurnTimer() {
  const human = gameState.players.find(p => p.isHuman);
  if (!human || human.isFolded || gameState.currentRound === 'showdown' || !gameState.isSeated) return;

  // 자리 비움(Sit-Out) 상태일 때는 20초 타이머를 돌리지 않고 0.1초(100ms) 만에 즉시 자동 폴드 처리!
  if (gameState.isSittingOut) {
    disableActionButtons(true);
    if (sitOutAutoFoldTimeout) clearTimeout(sitOutAutoFoldTimeout);
    sitOutAutoFoldTimeout = setTimeout(() => {
      sitOutAutoFoldTimeout = null;
      if (gameState.currentRound !== 'showdown' && !human.isFolded) {
        console.log('⚡ [자리 비움(Sit-Out) 자동 폴드] 0.1초 만에 즉시 자동 폴드 처리되어 봇들끼리 게임을 진행합니다.');
        executeHumanFold(true, true);
      }
    }, 100);
    return;
  }

  startTurnTimer(human, () => {
    if (gameState.isBettingInProgress || gameState.currentRound === 'showdown') return;

    const playerSoFar = gameState.roundBets[human.id] || 0;
    const needed = Math.max(0, gameState.currentBet - playerSoFar);

    closeRaisePanel();

    // 연속 타임아웃 횟수 증가 및 2회 연속 시 자리 비움(Sit-Out) 모드 전환
    gameState.consecutiveTimeouts += 1;
    console.log(`⏰ [${TURN_TIME_LIMIT}초 타임아웃 발생] 연속 타임아웃 횟수: ${gameState.consecutiveTimeouts}회`);

    if (gameState.consecutiveTimeouts >= 2) {
      enterSitOutMode();
    }

    if (needed === 0) {
      console.log(`⏰ [${TURN_TIME_LIMIT}초 시간 초과] 추가 베팅 금액이 $0이므로 자동 체크(Auto-Check)를 수행합니다.`);
      handlePlayerBet(0, false, 'call', true);
    } else {
      console.log(`⏰ [${TURN_TIME_LIMIT}초 시간 초과] 콜 금액($${needed}) 지불 시간이 만료되어 자동 폴드(Auto-Fold) 처리됩니다.`);
      executeHumanFold(true, false);
    }
  });
}

/**
 * 플레이어가 폴드(수동/타임아웃/자리비움)한 뒤 남은 봇들끼리 현재 라운드 및 남은 스트리트(Flop -> Turn -> River -> Showdown)를 끝까지 진행
 */
async function runBotOnlyRemainingStreets() {
  gameState.isBettingInProgress = true;
  disableActionButtons(true);

  try {
    // 1. 현재 스트리트에서 아직 행동하지 않은 봇들의 베팅 진행
    await runAIBotBettingLoop(gameState.currentBet, false);
    await delay(280);

    let activePlayers = gameState.players.filter(p => !p.isFolded);
    if (activePlayers.length <= 1) {
      gameState.currentRound = 'showdown';
      gameState.isBettingInProgress = false;
      await runShowdown();
      return;
    }

    // 2. 남은 스트리트(preflop -> flop -> turn -> river)를 순서대로 오픈하며 봇들끼리 베팅 진행
    while (gameState.currentRound !== 'showdown') {
      gameState.roundBets = {};
      gameState.currentBet = 0;
      gameState.hasBotRaisedThisStreet = false;

      if (gameState.currentRound === 'preflop') {
        dealFlopCards();
        gameState.currentRound = 'flop';
      } else if (gameState.currentRound === 'flop') {
        dealTurnCard();
        gameState.currentRound = 'turn';
      } else if (gameState.currentRound === 'turn') {
        dealRiverCard();
        gameState.currentRound = 'river';
      } else if (gameState.currentRound === 'river') {
        gameState.currentRound = 'showdown';
        break;
      }

      await delay(320);
      await runAIBotBettingLoop(0, false);
      await delay(260);

      activePlayers = gameState.players.filter(p => !p.isFolded);
      if (activePlayers.length <= 1) {
        gameState.currentRound = 'showdown';
        break;
      }
    }

    gameState.isBettingInProgress = false;
    await runShowdown();
  } catch (err) {
    console.error('[Bot Loop Recovery]', err);
    gameState.isBettingInProgress = false;
    gameState.currentRound = 'showdown';
    await runShowdown();
  }
}

/**
 * 플레이어 폴드 실행 (수동 폴드 버튼, 20초 타이머 만료 자동 폴드, 자리 비움 0.1초 즉시 폴드 공용)
 */
async function executeHumanFold(isAutoTimeout = false, isSitOutFold = false) {
  if (gameState.isBettingInProgress || gameState.currentRound === 'showdown') return;
  stopTurnTimer();
  closeRaisePanel();

  if (!isAutoTimeout) {
    gameState.consecutiveTimeouts = 0;
  }

  const human = gameState.players.find(p => p.isHuman);
  if (!human || human.isFolded) return;

  human.isFolded = true;
  playSound('sound-fold');
  const seatEl = document.getElementById(human.seatId);
  if (seatEl) {
    seatEl.classList.add('folded');
    const foldTagText = isSitOutFold ? 'SIT-OUT FOLD' : (isAutoTimeout ? 'TIME OUT FOLD' : 'FOLD');
    showSeatActionTag(seatEl, foldTagText, 'tag-fold');
  }

  // 플레이어가 폴드한 후 멈추지 않고 남은 봇들끼리 남은 스트리트와 쇼다운을 끝까지 진행
  await runBotOnlyRemainingStreets();
}

/**
 * 다음 판 시작을 위한 모든 상태 및 UI 완전 리셋
 */
function resetAllGameState() {
  console.log('--- 🔄 [State Reset] 모든 게임 상태 변수 및 UI를 초기화합니다. ---');

  stopTurnTimer();
  if (gameState.autoNextHandTimer) {
    clearTimeout(gameState.autoNextHandTimer);
    gameState.autoNextHandTimer = null;
  }
  gameState.isBettingInProgress = false;
  gameState.isPlayerAllIn = false;
  gameState.timeBankUsedThisHand = false;
  gameState.rejoinNextHand = false;
  gameState.currentRound = 'preflop';
  gameState.pot = 0;
  gameState.currentBet = BIG_BLIND;
  gameState.roundBets = {};
  gameState.hasBotRaisedThisStreet = false;
  gameState.communityCards = [];
  updateTimeBankButtonDOM();

  gameState.players.forEach(player => {
    player.hand = [];
    player.isFolded = false;
    gameState.roundBets[player.id] = 0;
    if (player.chips < BIG_BLIND) {
      if (!player.isHuman) {
        player.chips = gameState.selectedBuyIn || 1000;
      }
    }
  });

  const human = gameState.players.find(p => p.isHuman);
  if (human && human.chips < BIG_BLIND && gameState.isSeated) {
    showBuyInModal(true);
    return;
  }

  disableActionButtons(false);
  hideGameModal();
  closeRaisePanel();

  document.querySelectorAll('.seat').forEach(seat => {
    seat.classList.remove('folded', 'winner-glow', 'active-turn', 'timer-urgent');
  });
  clearAllActionTags();

  resetCommunityCards();
  renderBotCards();
  updatePotDOM();
  gameState.players.forEach(p => updatePlayerChipsDOM(p.id));
}

/**
 * 게임 시작 및 초기 2장 카드 분배 로직 + 텍사스 홀덤 SB/BB 블라인드 자동 베팅
 */
function dealHoleCards() {
  if (!gameState.isSeated) {
    showBuyInModal(false);
    return;
  }

  console.log('==============================================');
  console.log('🃏 새 게임 시작 (Round: Pre-flop) - 블라인드 및 카드 딜링');
  console.log('==============================================');

  playSound('sound-card');
  resetAllGameState();

  const human = gameState.players.find(p => p.isHuman);
  if (human && human.chips < BIG_BLIND && gameState.isSeated) {
    return;
  }

  // 1. 블라인드 포지션 계산 및 배지 렌더링
  gameState.sbIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  gameState.bbIndex = (gameState.dealerIndex + 2) % gameState.players.length;
  renderBlindBadges();

  const potEl = document.getElementById('pot-display');

  // 2. 스몰 블라인드(SB)와 빅 블라인드(BB) 자동 판돈 징수 및 칩 이동 애니메이션
  const sbPlayer = gameState.players[gameState.sbIndex];
  const bbPlayer = gameState.players[gameState.bbIndex];

  const sbAmount = Math.min(sbPlayer.chips, SMALL_BLIND);
  executeBet(sbPlayer.id, sbAmount);
  gameState.roundBets[sbPlayer.id] = sbAmount;
  const sbSeat = document.getElementById(sbPlayer.seatId);
  if (sbSeat) {
    showSeatActionTag(sbSeat, `SB $${sbAmount}`, 'tag-sb');
    if (potEl) animateFlyingChips(sbSeat, potEl, 3, 'chip-10');
  }

  const bbAmount = Math.min(bbPlayer.chips, BIG_BLIND);
  executeBet(bbPlayer.id, bbAmount);
  gameState.roundBets[bbPlayer.id] = bbAmount;
  const bbSeat = document.getElementById(bbPlayer.seatId);
  if (bbSeat) {
    showSeatActionTag(bbSeat, `BB $${bbAmount}`, 'tag-bb');
    if (potEl) animateFlyingChips(bbSeat, potEl, 4, 'chip-50');
  }

  playSound('sound-bet', bbAmount);

  console.log(`[홀덤 룰: 블라인드 자동 징수 완료]`);
  console.log(`  - 딜러(D): ${gameState.players[gameState.dealerIndex].name}`);
  console.log(`  - 스몰 블라인드(SB): ${sbPlayer.name} $${sbAmount}`);
  console.log(`  - 빅 블라인드(BB): ${bbPlayer.name} $${bbAmount}`);
  console.log(`  - 시작 누적 팟(TOTAL POT): $${gameState.pot}`);

  // 3. 52장 트럼프 덱 생성 및 셔플 후 플레이어들에게 2장씩 카드 분배
  const newDeck = createDeck();
  gameState.deck = shuffleDeck(newDeck);
  console.log(`[덱 준비] 52장 트럼프 카드 덱 생성 및 셔플 완료! 남은 카드: ${gameState.deck.length}장`);

  for (let round = 1; round <= 2; round++) {
    for (const player of gameState.players) {
      const card = gameState.deck.pop();
      player.hand.push(card);
    }
  }

  const humanPlayer = gameState.players.find(p => p.isHuman);
  console.log(`[내 패 확인] ${humanPlayer.name}의 홀 카드: [ ${humanPlayer.hand.map(c => c.toString()).join(', ')} ]`);

  renderPlayerHand();
  renderBotCards();
  disableActionButtons(false);
  updateActionButtonsLabel();
  startHumanTurnTimer();
}

// ==========================================================================
// 6. 베팅 시스템 (Call, Custom Raise, ALL-IN) & AI 봇 턴 루프
// ==========================================================================

function executeBet(playerId, amount) {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player || player.chips < amount) return false;

  player.chips -= amount;
  gameState.pot += amount;

  updatePlayerChipsDOM(playerId);
  updatePotDOM();

  return true;
}

/**
 * 통합 플레이어 베팅 핸들러 (Call, Raise, All-In 지원)
 * @param {number} amount - 베팅 또는 레이즈 목표 금액
 * @param {boolean} isAllIn - 올인 여부
 * @param {'call' | 'raise' | 'allin'} actionType
 * @param {boolean} isAutoTimeout - 타이머 만료로 인한 자동 체크 여부
 */
async function handlePlayerBet(amount, isAllIn = false, actionType = 'call', isAutoTimeout = false) {
  if (gameState.isBettingInProgress) {
    console.log('[Notice] 현재 베팅 턴이 진행 중입니다. 잠시만 기다려 주세요.');
    return;
  }

  if (gameState.currentRound === 'showdown') {
    console.log('[Notice] 게임이 종료되었습니다. Next Hand 버튼을 눌러주세요.');
    return;
  }

  const human = gameState.players.find(p => p.isHuman);
  if (!human || human.chips <= 0) {
    console.warn('소지 칩이 부족합니다.');
    return;
  }

  stopTurnTimer();
  if (!isAutoTimeout) {
    gameState.consecutiveTimeouts = 0;
  }
  gameState.isBettingInProgress = true;
  gameState.isPlayerAllIn = isAllIn;
  disableActionButtons(true);
  closeRaisePanel();

  const humanSeat = document.getElementById(human.seatId);
  const potEl = document.getElementById('pot-display');
  const playerSoFar = gameState.roundBets[human.id] || 0;
  let betToDeduct = 0;

  if (actionType === 'allin') {
    betToDeduct = human.chips;
    executeBet(human.id, betToDeduct);
    gameState.roundBets[human.id] = playerSoFar + betToDeduct;
    gameState.currentBet = Math.max(gameState.currentBet, gameState.roundBets[human.id]);
    playSound('sound-allin', betToDeduct);
    if (humanSeat && potEl) animateFlyingChips(humanSeat, potEl, 10, 'chip-1000');
    if (humanSeat) showSeatActionTag(humanSeat, `ALL-IN $${betToDeduct.toLocaleString()}`, 'tag-allin');
    console.log(`[🔥 ALL-IN] ${human.name}이(가) 전재산 $${betToDeduct.toLocaleString()}을 올인했습니다!!`);
  } else if (actionType === 'raise') {
    // 맞춤형 슬라이더로 설정한 목표 금액
    const targetRaise = amount;
    betToDeduct = Math.min(human.chips, Math.max(0, targetRaise - playerSoFar));
    executeBet(human.id, betToDeduct);
    gameState.roundBets[human.id] = playerSoFar + betToDeduct;
    gameState.currentBet = Math.max(gameState.currentBet, gameState.roundBets[human.id]);
    const isNowAllIn = human.chips === 0;
    playSound(isNowAllIn ? 'sound-allin' : 'sound-bet', betToDeduct);
    const chipFlyCount = Math.min(9, Math.max(5, Math.ceil(betToDeduct / 100) + 3));
    if (humanSeat && potEl) animateFlyingChips(humanSeat, potEl, chipFlyCount, 'chip-500');
    if (humanSeat) {
      showSeatActionTag(
        humanSeat,
        isNowAllIn ? `ALL-IN $${betToDeduct.toLocaleString()}` : `RAISE $${targetRaise.toLocaleString()}`,
        isNowAllIn ? 'tag-allin' : 'tag-raise'
      );
    }
    console.log(`[내 RAISE] ${human.name}이(가) $${targetRaise.toLocaleString()}으로 레이즈했습니다! (추가 베팅: $${betToDeduct.toLocaleString()}, 잔액: $${human.chips.toLocaleString()})`);
  } else {
    // CALL 또는 CHECK (필요 금액에 따라 동적 분기)
    const needed = Math.max(0, gameState.currentBet - playerSoFar);
    betToDeduct = Math.min(human.chips, needed);
    if (betToDeduct > 0) {
      executeBet(human.id, betToDeduct);
      gameState.roundBets[human.id] = playerSoFar + betToDeduct;
      const isNowAllIn = human.chips === 0;
      playSound(isNowAllIn ? 'sound-allin' : 'sound-bet', betToDeduct);
      const chipFlyCount = Math.min(7, Math.max(4, Math.ceil(betToDeduct / 100) + 2));
      if (humanSeat && potEl) animateFlyingChips(humanSeat, potEl, chipFlyCount, 'chip-100');
      if (humanSeat) {
        showSeatActionTag(
          humanSeat,
          isNowAllIn ? `ALL-IN $${betToDeduct.toLocaleString()}` : `CALL $${betToDeduct.toLocaleString()}`,
          isNowAllIn ? 'tag-allin' : 'tag-call'
        );
      }
      console.log(`[내 CALL] ${human.name}이(가) $${betToDeduct.toLocaleString()}을 콜했습니다! (잔액: $${human.chips.toLocaleString()})`);
    } else {
      // CHECK: 추가 베팅액 없이 무료로 다음 턴 넘기기 + 묵직한 체크 노크 사운드
      playSound('sound-check', 0);
      if (humanSeat) showSeatActionTag(humanSeat, 'CHECK', 'tag-check');
      console.log(`[내 CHECK] ${human.name}이(가) 체크(Check)하여 턴을 넘겼습니다.`);
    }
  }

  // 2. AI 봇들 의사결정 및 눈치싸움 턴 루프 실행
  const targetBotCall = gameState.currentBet;
  await runAIBotBettingLoop(targetBotCall, isAllIn);

  await delay(400);

  // 3. 생존 플레이어 체크
  const activePlayers = gameState.players.filter(p => !p.isFolded);
  if (activePlayers.length <= 1) {
    console.log('[부전승] 모든 봇이 기권(Fold)하여 플레이어가 즉시 승리했습니다!');
    gameState.currentRound = 'showdown';
    await runShowdown();
    return;
  }

  // 4. 올인(ALL-IN) 상황인 경우: 보드 카드를 연속으로 런아웃(Runout) 오픈 후 쇼다운!
  if (isAllIn || human.chips === 0) {
    console.log('--- 🔥 [ALL-IN RUNOUT] 모든 카드를 차례대로 오픈하고 쇼다운으로 직행합니다! ---');
    await runAllInBoardRunout();
    return;
  }

  // 4.5. 내가 체크(또는 콜)했는데 뒤이어 봇이 레이즈(Raise)하여 내 추가 콜 금액이 발생한 경우:
  // 다음 라운드로 바로 넘어가지 않고 내게 CALL / FOLD 응답 기회 + 15초 턴 타이머 부여
  const humanRoundBetAfterBots = gameState.roundBets[human.id] || 0;
  if (gameState.currentBet > humanRoundBetAfterBots && human.chips > 0) {
    const extraNeeded = gameState.currentBet - humanRoundBetAfterBots;
    console.log(`[봇 레이즈 발생] 봇의 레이즈로 인해 플레이어에게 추가 콜 금액($${extraNeeded}) 응답 턴이 돌아왔습니다.`);
    updateActionButtonsLabel();
    gameState.isBettingInProgress = false;
    disableActionButtons(false);
    startHumanTurnTimer();
    return;
  }

  // 5. 다음 라운드로 진행 (새 스트리트 시작: 아무도 베팅하지 않은 0원 상태로 리셋 -> CHECK 버튼 활성화)
  gameState.roundBets = {};
  gameState.currentBet = 0;
  gameState.hasBotRaisedThisStreet = false;

  if (gameState.currentRound === 'preflop') {
    dealFlopCards();
    gameState.currentRound = 'flop';
  } else if (gameState.currentRound === 'flop') {
    dealTurnCard();
    gameState.currentRound = 'turn';
  } else if (gameState.currentRound === 'turn') {
    dealRiverCard();
    gameState.currentRound = 'river';
  } else if (gameState.currentRound === 'river') {
    gameState.currentRound = 'showdown';
    await runShowdown();
  }

  updateActionButtonsLabel();
  gameState.isBettingInProgress = false;

  if (gameState.currentRound !== 'showdown') {
    disableActionButtons(false);
    startHumanTurnTimer();
  }
}

/**
 * 봇들이 AI 지능(Hand Equity + Pot Odds + Bluffing)으로 Raise / Call / Fold 의사결정하는 턴 루프
 */
async function runAIBotBettingLoop(targetBetAmount, isPlayerAllIn = false) {
  const bots = gameState.players.filter(p => !p.isHuman);

  console.log(`--- 🤖 AI 봇 의사결정 턴 시작 (Round: ${gameState.currentRound}, Target Bet: $${targetBetAmount}, Pot: $${gameState.pot}, All-in: ${isPlayerAllIn}) ---`);

  for (const bot of bots) {
    if (bot.isFolded) continue;

    const botSoFar = gameState.roundBets[bot.id] || 0;
    const currentTarget = gameState.currentBet;

    // 이미 이번 스트리트에서 봇이 레이즈했고 해당 봇이 최고 베팅액을 맞춘 상태라면 스킵
    if (gameState.hasBotRaisedThisStreet && botSoFar >= currentTarget && currentTarget > 0) {
      continue;
    }

    const seatEl = document.getElementById(bot.seatId);
    const potEl = document.getElementById('pot-display');

    // 봇의 턴에서도 15초 프로그레스 바 UI를 표시하며 사고 시간 연출
    startTurnTimer(bot, () => {
      bot.isFolded = true;
    });

    await delay(520);
    stopTurnTimer();

    const neededForBot = Math.max(0, currentTarget - botSoFar);

    // 스마트 AI 엔진 호출 (현재 팟 크기 gameState.pot을 전달하여 Pot Odds 정밀 계산)
    const decision = window.AIBotEngine 
      ? window.AIBotEngine.decideBotAction(
          bot,
          gameState.communityCards,
          gameState.currentRound,
          neededForBot,
          isPlayerAllIn,
          gameState.pot
        )
      : { action: 'call', amount: neededForBot, reason: '기본 콜' };

    if (decision.action === 'fold') {
      if (neededForBot === 0) {
        // 콜 금액이 0원일 때는 폴드 대신 무료 체크 수행
        playSound('sound-check', 0);
        if (seatEl) showSeatActionTag(seatEl, 'CHECK', 'tag-check');
        console.log(`[봇 CHECK] ${bot.name}이(가) 체크했습니다.`);
      } else {
        bot.isFolded = true;
        playSound('sound-fold');
        if (seatEl) {
          seatEl.classList.add('folded');
          showSeatActionTag(seatEl, 'FOLD', 'tag-fold');
        }
        console.log(`[봇 FOLD] ${bot.name}이(가) 포기(Fold)했습니다. (${decision.reason})`);
      }
    } else if (decision.action === 'raise' && !gameState.hasBotRaisedThisStreet && !isPlayerAllIn) {
      const raiseAdd = Math.min(bot.chips, Math.max(DEFAULT_BET_AMOUNT, decision.amount || DEFAULT_BET_AMOUNT));
      const newBotTotal = botSoFar + raiseAdd;
      if (raiseAdd > neededForBot && executeBet(bot.id, raiseAdd)) {
        gameState.roundBets[bot.id] = newBotTotal;
        gameState.currentBet = Math.max(gameState.currentBet, newBotTotal);
        gameState.hasBotRaisedThisStreet = true;
        const isBotAllIn = bot.chips === 0;
        playSound(isBotAllIn ? 'sound-allin' : 'sound-bet', raiseAdd);
        const flyCount = Math.min(9, Math.max(5, Math.ceil(raiseAdd / 100) + 3));
        if (seatEl && potEl) animateFlyingChips(seatEl, potEl, flyCount, 'chip-500');
        if (seatEl) {
          showSeatActionTag(
            seatEl,
            isBotAllIn ? `ALL-IN $${raiseAdd.toLocaleString()}` : `RAISE $${gameState.currentBet.toLocaleString()}`,
            isBotAllIn ? 'tag-allin' : 'tag-raise'
          );
        }
        console.log(`[봇 RAISE] ${bot.name}이(가) $${gameState.currentBet}으로 판돈을 올렸습니다! (${decision.reason})`);
      } else {
        const callAmt = Math.min(bot.chips, neededForBot);
        if (callAmt > 0) {
          executeBet(bot.id, callAmt);
          gameState.roundBets[bot.id] = botSoFar + callAmt;
          const isBotAllIn = bot.chips === 0;
          playSound(isBotAllIn ? 'sound-allin' : 'sound-bet', callAmt);
          const flyCount = Math.min(7, Math.max(4, Math.ceil(callAmt / 100) + 2));
          if (seatEl && potEl) animateFlyingChips(seatEl, potEl, flyCount, 'chip-50');
          if (seatEl) {
            showSeatActionTag(
              seatEl,
              isBotAllIn ? `ALL-IN $${callAmt.toLocaleString()}` : `CALL $${callAmt.toLocaleString()}`,
              isBotAllIn ? 'tag-allin' : 'tag-call'
            );
          }
        } else {
          playSound('sound-check', 0);
          if (seatEl) showSeatActionTag(seatEl, 'CHECK', 'tag-check');
        }
      }
    } else {
      const callAmt = Math.min(bot.chips, neededForBot);
      if (callAmt > 0) {
        executeBet(bot.id, callAmt);
        gameState.roundBets[bot.id] = botSoFar + callAmt;
        const isBotAllIn = bot.chips === 0;
        playSound(isBotAllIn ? 'sound-allin' : 'sound-bet', callAmt);
        const flyCount = Math.min(7, Math.max(4, Math.ceil(callAmt / 100) + 2));
        if (seatEl && potEl) animateFlyingChips(seatEl, potEl, flyCount, 'chip-50');
        if (seatEl) {
          showSeatActionTag(
            seatEl,
            isBotAllIn ? `ALL-IN $${callAmt.toLocaleString()}` : `CALL $${callAmt.toLocaleString()}`,
            isBotAllIn ? 'tag-allin' : 'tag-call'
          );
        }
        console.log(`[봇 CALL] ${bot.name}이(가) $${callAmt}을 콜했습니다. (${decision.reason})`);
      } else {
        // 0원 콜은 체크(CHECK)로 표기
        playSound('sound-check', 0);
        if (seatEl) showSeatActionTag(seatEl, 'CHECK', 'tag-check');
        console.log(`[봇 CHECK] ${bot.name}이(가) 체크했습니다. (${decision.reason})`);
      }
    }
  }

  console.log(`[베팅 완료] 라운드 베팅 종료! 총 누적 팟(TOTAL POT): $${gameState.pot.toLocaleString()}`);
}

/**
 * 올인 시 남은 커뮤니티 카드를 차례로 오픈하고 쇼다운을 실행하는 런아웃(Runout) 함수
 */
async function runAllInBoardRunout() {
  if (gameState.currentRound === 'preflop') {
    await delay(600);
    dealFlopCards();
    await delay(600);
    dealTurnCard();
    await delay(600);
    dealRiverCard();
  } else if (gameState.currentRound === 'flop') {
    await delay(600);
    dealTurnCard();
    await delay(600);
    dealRiverCard();
  } else if (gameState.currentRound === 'turn') {
    await delay(600);
    dealRiverCard();
  }

  gameState.currentRound = 'showdown';
  await delay(700);
  await runShowdown();
}

/**
 * RAISE 또는 ALL-IN 발생 시 칩을 세게 내려친 듯 테이블 전체를 '드르륵' 흔드는 화면 진동 효과
 */
function triggerTableImpactShake(isHeavy = false) {
  const tableEl = document.querySelector('.poker-table') || document.getElementById('game-container');
  if (!tableEl) return;

  tableEl.classList.remove('table-shake', 'table-shake-heavy');
  void tableEl.offsetWidth; // 리플로우 강제 실행으로 연속 레이즈/올인 시에도 즉시 재진동
  const shakeClass = isHeavy ? 'table-shake-heavy' : 'table-shake';
  tableEl.classList.add(shakeClass);

  setTimeout(() => {
    tableEl.classList.remove('table-shake', 'table-shake-heavy');
  }, 460);
}

/**
 * 화면에 남아있는 모든 액션 폭발 팝업(.seat-action-tag)과 예약 타이머를 즉시 제거하는 클린업 함수
 */
function clearAllActionTags() {
  while (actionTagTimers.length > 0) {
    clearTimeout(actionTagTimers.pop());
  }
  document.querySelectorAll('.seat-action-tag').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
    el.remove();
  });
}

/**
 * 베팅을 한 플레이어의 현재 위치(x, y)와 테이블 정중앙(TOTAL POT) 위치를 계산한 뒤,
 * 카드나 프로필에 겹치지 않는 '딱 그 둘 사이의 빈 공간(허공)'에
 * 거대한 코믹스 스타일 폭발(Starburst) 이펙트를 터뜨리고 1.5초 뒤 DOM에서 완전히 삭제(remove)하는 함수
 */
function showSeatActionTag(seatEl, text, className) {
  if (!seatEl) return;

  const feltEl = document.querySelector('.table-felt');
  const potEl = document.getElementById('pot-display');
  if (!feltEl) return;

  const seatId = seatEl.id || 'seat-unknown';

  // SB/BB 동시 표시를 제외한 일반 베팅 액션 시, 이전 턴의 폭발 잔상이 화면에 쌓여 카드를 가리지 않도록 즉시 정리
  if (className !== 'tag-bb') {
    feltEl.querySelectorAll('.seat-action-tag').forEach(el => {
      if (className === 'tag-sb' || !el.classList.contains('tag-sb')) {
        el.remove();
      }
    });
  } else {
    feltEl.querySelectorAll(`.seat-action-tag[data-seat-id="${seatId}"]`).forEach(el => el.remove());
  }

  const pillEl = seatEl.querySelector('.player-info-pill') || seatEl;
  const feltRect = feltEl.getBoundingClientRect();
  const pillRect = pillEl.getBoundingClientRect();
  const potRect = potEl ? potEl.getBoundingClientRect() : null;

  // 모바일 스케일(transform: scale) 보정: 화면 좌표를 테이블 내부(비스케일) 좌표로 환산
  const sc = currentTableScale > 0 ? currentTableScale : 1;
  const feltW = feltRect.width / sc;
  const feltH = feltRect.height / sc;

  let targetX = feltW * 0.5;
  let targetY = feltH * 0.5;

  if (feltRect.width > 0 && pillRect.width > 0) {
    // 1) 액션을 취한 플레이어 프로필 중심 좌표 (테이블 펠트 내부 기준)
    const playerX = ((pillRect.left + pillRect.width / 2) - feltRect.left) / sc;
    const playerY = ((pillRect.top + pillRect.height / 2) - feltRect.top) / sc;

    // 2) 테이블 정중앙 TOTAL POT 중심 좌표 (테이블 펠트 내부 기준)
    const potX = (potRect && potRect.width > 0)
      ? ((potRect.left + potRect.width / 2) - feltRect.left) / sc
      : feltW / 2;
    const potY = (potRect && potRect.height > 0)
      ? ((potRect.top + potRect.height / 2) - feltRect.top) / sc
      : feltH * 0.34;

    // 3) 플레이어(x, y)와 TOTAL POT(potX, potY) 딱 그 둘 사이의 빈 공간(허공) 중점 계산
    targetX = playerX + (potX - playerX) * 0.52;
    targetY = playerY + (potY - playerY) * 0.52;

    // 내 자리(PLAYER 1)는 정중앙 수직선상에 내 홀 카드 2장(#player-slots)이 놓여 있으므로
    // 내 카드와 커뮤니티 카드 사이의 우측 빈 펠트 허공으로 살짝 비켜서 카드 가림을 100% 방지
    if (seatId === 'seat-player-1') {
      targetX = playerX + (potX - playerX) * 0.5 + Math.min(feltW * 0.22, 96);
      targetY = playerY + (potY - playerY) * 0.54;
    }

    // 좌우 테이블 림 밖으로 잘리지 않도록 안전 여백 클램핑
    const padX = Math.min(feltW * 0.18, 84);
    const padY = 48;
    targetX = Math.max(padX, Math.min(feltW - padX, targetX));
    targetY = Math.max(padY, Math.min(feltH - padY, targetY));
  }

  const isHeavyImpact = className === 'tag-raise' || className === 'tag-allin';
  const tag = document.createElement('div');
  tag.className = `seat-action-tag comic-starburst ${className}${isHeavyImpact ? ' impact-burst-200' : ''}`;
  tag.dataset.seatId = seatId;
  tag.style.left = `${Math.round(targetX)}px`;
  tag.style.top = `${Math.round(targetY)}px`;

  const displayLabel = className === 'tag-allin' && !text.endsWith('!') ? `${text}!` : text;
  tag.innerHTML = `<span class="bubble-label" data-text="${displayLabel}">${displayLabel}</span>`;

  feltEl.appendChild(tag);

  // RAISE나 ALL-IN이 터질 때는 테이블 전체가 '드르륵' 흔들리는 타격감 연출
  if (isHeavyImpact) {
    triggerTableImpactShake(className === 'tag-allin');
  }

  // CSS 애니메이션 종료(1.5초)에 맞춰 요소를 화면(DOM)에서 완전히 삭제하는 이중 클린업 로직
  const removeTagFromDOM = () => {
    if (tag && tag.parentNode) {
      tag.parentNode.removeChild(tag);
    }
    if (tag && typeof tag.remove === 'function') {
      tag.remove();
    }
  };

  tag.addEventListener('animationend', removeTagFromDOM, { once: true });
  const cleanupTimer = setTimeout(removeTagFromDOM, 1500);
  actionTagTimers.push(cleanupTimer);
}

// ==========================================================================
// 7. 맞춤형 레이즈 슬라이더 UI 패널 제어
// ==========================================================================

function openRaisePanel() {
  if (gameState.isBettingInProgress || gameState.currentRound === 'showdown') return;

  const human = gameState.players.find(p => p.isHuman);
  if (!human || human.chips <= 0) return;

  const panel = document.getElementById('raise-slider-panel');
  const slider = document.getElementById('raise-slider');
  const minLabel = document.getElementById('raise-min-val');
  const maxLabel = document.getElementById('raise-max-val');
  const amountText = document.getElementById('raise-amount-text');

  if (!panel || !slider) return;

  // 최소 레이즈 금액: 빅 블라인드의 2배 이상 ($100), 최대: 내 남은 전재산
  const minRaiseAllowed = Math.max(BIG_BLIND * 2, gameState.currentBet * 2);
  const minRaise = Math.min(human.chips, minRaiseAllowed);
  const maxRaise = human.chips;

  slider.min = minRaise;
  slider.max = maxRaise;
  slider.step = 25;
  slider.value = minRaise;

  if (minLabel) minLabel.textContent = `$${minRaise.toLocaleString()}`;
  if (maxLabel) maxLabel.textContent = `$${maxRaise.toLocaleString()}`;
  if (amountText) amountText.textContent = `$${minRaise.toLocaleString()}`;

  panel.style.display = 'flex';
}

function closeRaisePanel() {
  const panel = document.getElementById('raise-slider-panel');
  if (panel) panel.style.display = 'none';
}

function confirmCustomRaise() {
  const slider = document.getElementById('raise-slider');
  if (!slider) return;

  const amount = parseInt(slider.value, 10);
  const human = gameState.players.find(p => p.isHuman);
  const isAllIn = (human && amount >= human.chips);

  closeRaisePanel();
  handlePlayerBet(amount, isAllIn, isAllIn ? 'allin' : 'raise');
}

function setRaisePreset(multiplier) {
  const human = gameState.players.find(p => p.isHuman);
  const slider = document.getElementById('raise-slider');
  const amountText = document.getElementById('raise-amount-text');
  if (!human || !slider) return;

  const minRaise = parseInt(slider.min, 10) || Math.max(BIG_BLIND * 2, 100);
  let targetVal = minRaise;

  if (multiplier === '2x') {
    targetVal = minRaise;
  } else if (multiplier === '3x') {
    targetVal = Math.max(minRaise, BIG_BLIND * 3);
  } else if (multiplier === 'pot') {
    targetVal = Math.max(minRaise, gameState.pot);
  } else if (multiplier === 'all') {
    targetVal = human.chips;
  }

  targetVal = Math.min(human.chips, Math.max(minRaise, targetVal));
  slider.value = targetVal;
  if (amountText) amountText.textContent = `$${targetVal.toLocaleString()}`;
}

// ==========================================================================
// 8. 커뮤니티 카드 오픈 (Flop, Turn, River)
// ==========================================================================

function dealFlopCards() {
  console.log('--- 🎴 [단계: 플롭(Flop)] 커뮤니티 카드 3장 오픈 ---');
  clearAllActionTags();
  playSound('sound-card');

  const flopCards = [
    gameState.deck.pop(),
    gameState.deck.pop(),
    gameState.deck.pop()
  ];

  gameState.communityCards.push(...flopCards);
  console.log(`[플롭 오픈] 공개된 커뮤니티 카드 3장: [ ${flopCards.map(c => c.toString()).join(', ')} ] (남은 덱: ${gameState.deck.length}장)`);

  const flopSlots = [
    document.querySelector('#community-slots [data-slot="flop-1"]'),
    document.querySelector('#community-slots [data-slot="flop-2"]'),
    document.querySelector('#community-slots [data-slot="flop-3"]')
  ];

  flopCards.forEach((card, index) => {
    const slot = flopSlots[index];
    if (slot) {
      slot.classList.add('has-card');
      slot.innerHTML = createCardFrontHTML(card);
    }
  });
}

function dealTurnCard() {
  console.log('--- 🎴 [단계: 턴(Turn)] 4번째 커뮤니티 카드 오픈 ---');
  clearAllActionTags();
  playSound('sound-card');

  const turnCard = gameState.deck.pop();
  gameState.communityCards.push(turnCard);
  console.log(`[턴 오픈] 공개된 4번째 카드: [ ${turnCard.toString()} ] (남은 덱: ${gameState.deck.length}장)`);

  const turnSlot = document.querySelector('#community-slots [data-slot="turn"]');
  if (turnSlot) {
    turnSlot.classList.add('has-card');
    turnSlot.innerHTML = createCardFrontHTML(turnCard);
  }
}

function dealRiverCard() {
  console.log('--- 🎴 [단계: 리버(River)] 5번째(마지막) 커뮤니티 카드 오픈 ---');
  clearAllActionTags();
  playSound('sound-card');

  const riverCard = gameState.deck.pop();
  gameState.communityCards.push(riverCard);
  console.log(`[리버 오픈] 공개된 5번째 카드: [ ${riverCard.toString()} ] (남은 덱: ${gameState.deck.length}장)`);

  const riverSlot = document.querySelector('#community-slots [data-slot="river"]');
  if (riverSlot) {
    riverSlot.classList.add('has-card');
    riverSlot.innerHTML = createCardFrontHTML(riverCard);
  }
}

// ==========================================================================
// 9. 쇼다운 (Showdown) 및 승패 판독/정산 처리
// ==========================================================================

async function runShowdown() {
  console.log('==============================================');
  console.log('🏆 [쇼다운(Showdown)] 봇 패 공개 및 승패 판독');
  console.log('==============================================');

  stopTurnTimer();
  clearAllActionTags();
  revealActiveBotCards();
  playSound('sound-card');

  const activePlayers = gameState.players.filter(p => !p.isFolded);

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const totalPot = gameState.pot;
    winner.chips += totalPot;

    const potEl = document.getElementById('pot-display');
    const winnerSeat = document.getElementById(winner.seatId);
    if (potEl && winnerSeat) {
      animateFlyingChips(potEl, winnerSeat, 8, 'chip-1000');
    }

    gameState.pot = 0;
    updatePlayerChipsDOM(winner.id);
    updatePotDOM();

    if (winnerSeat) winnerSeat.classList.add('winner-glow');

    await delay(750);
    playSound('sound-win');
    showWinnerModal([winner], {
      rankInfo: { name: 'Fold Out Win', korean: '기권승' },
      description: '상대방 전원 폴드로 팟 독식!',
      bestCards: winner.hand || []
    }, totalPot);
    return;
  }

  if (!window.HandEvaluator) {
    console.error('HandEvaluator 모듈이 로드되지 않았습니다.');
    return;
  }

  const outcome = window.HandEvaluator.determineWinner(activePlayers, gameState.communityCards);
  const totalPot = gameState.pot;

  console.log('--- 📊 살아있는 참가자 족보 판독 결과 ---');
  outcome.allResults.forEach((res, idx) => {
    console.log(`${idx + 1}위: ${res.player.name} -> ${res.handResult.rankInfo.name} (${res.handResult.rankInfo.korean}) [${res.handResult.description}]`);
  });

  const winners = outcome.winners;
  const winningHand = outcome.winningHand;
  const splitAmount = Math.floor(totalPot / winners.length);

  const potEl = document.getElementById('pot-display');
  winners.forEach(winner => {
    winner.chips += splitAmount;
    const winnerSeat = document.getElementById(winner.seatId);
    if (potEl && winnerSeat) {
      animateFlyingChips(potEl, winnerSeat, 8, 'chip-1000');
    }
    updatePlayerChipsDOM(winner.id);

    if (winnerSeat) winnerSeat.classList.add('winner-glow');
  });

  gameState.pot = 0;
  updatePotDOM();

  await delay(800);
  playSound('sound-win');
  showWinnerModal(winners, winningHand, totalPot);
}

function revealActiveBotCards() {
  const bots = gameState.players.filter(p => !p.isHuman);

  bots.forEach(bot => {
    const seatEl = document.getElementById(bot.seatId);
    if (!seatEl || bot.hand.length < 2) return;

    if (!bot.isFolded) {
      const botCardsContainer = seatEl.querySelector('.bot-cards');
      if (botCardsContainer) {
        console.log(`[봇 패 공개] ${bot.name}의 홀 카드: [ ${bot.hand.map(c => c.toString()).join(', ')} ]`);
        botCardsContainer.innerHTML = `
          ${createCardFrontHTML(bot.hand[0], 'card-tilt-left')}
          ${createCardFrontHTML(bot.hand[1], 'card-tilt-right')}
        `;
      }
    }
  });
}

function showWinnerModal(winners, winningHand, wonPot) {
  const modalEl = document.getElementById('game-modal');
  const titleEl = document.getElementById('modal-title');
  const handRankEl = document.getElementById('modal-hand-rank');
  const handDetailEl = document.getElementById('modal-hand-detail');
  const bestCardsEl = document.getElementById('modal-best-cards');
  const potValEl = document.getElementById('modal-pot-val');
  const potLabelEl = document.querySelector('.modal-pot-label');
  const nextHandBtn = document.getElementById('next-hand-btn') || document.getElementById('btn-next-hand');

  const winnerNames = winners.map(w => w.name).join(', ');
  const winTitle = winners.length > 1 ? `${winnerNames} 공동 승리! 🏆` : `${winnerNames} 승리! 🏆`;

  const koreanRank = winningHand?.rankInfo?.korean || '승리';
  const englishRank = winningHand?.rankInfo?.name || '';
  const rankDisplay = englishRank && englishRank !== koreanRank
    ? `${koreanRank} (${englishRank})`
    : koreanRank;

  const descDisplay = winningHand?.description || '';

  if (titleEl) titleEl.textContent = winTitle;
  if (handRankEl) handRankEl.textContent = rankDisplay;
  if (handDetailEl) handDetailEl.textContent = descDisplay;
  if (potLabelEl) potLabelEl.textContent = 'TOTAL WINNER POT';
  if (potValEl) potValEl.textContent = `+$${wonPot.toLocaleString()}`;

  // 승리 조합 5장(또는 홀 카드) 시각화 렌더링
  if (bestCardsEl) {
    bestCardsEl.innerHTML = '';
    const cardsToRender = winningHand?.bestCards || (winners[0]?.hand || []);
    if (cardsToRender && cardsToRender.length > 0) {
      cardsToRender.forEach(card => {
        bestCardsEl.innerHTML += createCardFrontHTML(card);
      });
      bestCardsEl.style.display = 'flex';
    } else {
      bestCardsEl.style.display = 'none';
    }
  }

  if (modalEl) {
    modalEl.classList.add('active');
    modalEl.style.display = 'flex';
  }

  if (nextHandBtn) {
    nextHandBtn.style.display = 'block';
    nextHandBtn.onclick = () => {
      if (gameState.autoNextHandTimer) {
        clearTimeout(gameState.autoNextHandTimer);
        gameState.autoNextHandTimer = null;
      }
      hideGameModal();
      const human = gameState.players.find(p => p.isHuman);
      if (human && human.chips < BIG_BLIND) {
        showBuyInModal(true);
      } else {
        startNextHand();
      }
    };
  }

  console.log(`[정산 완료] ${winTitle} | ${winSubtitle} | 획득 상금: $${wonPot.toLocaleString()}`);

  // 자리 비움(Sit-Out) 상태이거나 '▶ 다시 시작하기'를 눌러 다음 판 복귀가 예약된 경우,
  // 게임 루프가 멈추지 않도록 1.5초 후 자동으로 다음 판(Next Hand)을 시작
  if (gameState.isSittingOut || gameState.rejoinNextHand) {
    if (gameState.autoNextHandTimer) clearTimeout(gameState.autoNextHandTimer);
    gameState.autoNextHandTimer = setTimeout(() => {
      gameState.autoNextHandTimer = null;
      if (gameState.currentRound === 'showdown') {
        hideGameModal();
        const human = gameState.players.find(p => p.isHuman);
        if (human && human.chips < BIG_BLIND) {
          showBuyInModal(true);
        } else {
          startNextHand();
        }
      }
    }, 1500);
  }
}

function hideGameModal() {
  const modalEl = document.getElementById('game-modal');
  if (modalEl) {
    modalEl.classList.remove('active');
    modalEl.style.display = 'none';
  }

  document.querySelectorAll('.seat.winner-glow').forEach(el => {
    el.classList.remove('winner-glow');
  });
}

function startNextHand() {
  console.log('--- 🔄 [Next Hand] 딜러 버튼을 시계방향으로 회전하고 새로운 판을 시작합니다! ---');
  gameState.dealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  dealHoleCards();
}

// ==========================================================================
// 10. DOM 렌더링 도우미 함수
// ==========================================================================

const SUIT_IMAGE_CODE_MAP = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C'
};

/**
 * 스페이드(♠), 클로버(♣), 하트(♥), 다이아몬드(♦) 고해상도 벡터 SVG 생성
 * 작은 화면에서도 스페이드(뾰족한 잎 1개)와 클로버(둥근 세잎클로버 3잎)가 100% 명확히 구분되도록 정밀 설계
 */
function getSuitSVG(suitName, svgClass = 'suit-svg') {
  switch (suitName) {
    case 'spades':
      // 뾰족한 상단 창끝과 하단 둥근 심장부 + 삼각형 기둥이 선명한 스페이드
      return `<svg class="${svgClass} svg-spades" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="currentColor" d="M50 4 C33 27 8 46 8 65 C8 79 19 86 30 86 C38 86 43 81 46 75 L46 77 C44 86 39 92 31 96 L69 96 C61 92 56 86 54 77 L54 75 C57 81 62 86 70 86 C81 86 92 79 92 65 C92 46 67 27 50 4 Z"/>
      </svg>`;
    case 'clubs':
      // 상단/좌측/우측 3개의 독립된 둥근 잎(세잎클로버)과 하단 줄기가 뚜렷하게 분리된 클로버
      return `<svg class="${svgClass} svg-clubs" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle fill="currentColor" cx="50" cy="26" r="20"/>
        <circle fill="currentColor" cx="25" cy="56" r="20"/>
        <circle fill="currentColor" cx="75" cy="56" r="20"/>
        <path fill="currentColor" d="M40 48 L60 48 L55 74 C57 84 63 91 71 96 L29 96 C37 91 43 84 45 74 Z"/>
      </svg>`;
    case 'hearts':
      // 깊게 파인 상단 골과 매끈한 하단 꼭짓점을 가진 선명한 카지노 하트 (#E91010)
      return `<svg class="${svgClass} svg-hearts" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="currentColor" d="M50 93 C46 89 8 59 8 33 C8 16 21 6 34 6 C43 6 48 12 50 18 C52 12 57 6 66 6 C79 6 92 16 92 33 C92 59 54 89 50 93 Z"/>
      </svg>`;
    case 'diamonds':
    default:
      // 날렵하고 대칭적인 정통 카지노 다이아몬드 (#E91010)
      return `<svg class="${svgClass} svg-diamonds" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="currentColor" d="M50 4 C61 24 76 39 92 50 C76 61 61 76 50 96 C39 76 24 61 8 50 C24 39 39 24 50 4 Z"/>
      </svg>`;
  }
}

/**
 * J, Q, K 클래식 바이스클(Bicycle) 스타일 상하 180도 대칭(Double-Headed) 귀족 일러스트 SVG Data URI 생성
 * 네트워크 지연 시에도 즉시 렌더링되며, 상하 대칭 귀족 일러스트와 문양이 액자 내부를 꽉 채우도록 설계
 */
function getBicycleCourtDataURI(rank, suitName) {
  const isRed = suitName === 'hearts' || suitName === 'diamonds';
  const suitColor = isRed ? '#E91010' : '#141414';

  let suitPipPath = '';
  if (suitName === 'spades') {
    suitPipPath = 'M26 12 C19 22 10 30 10 38 C10 44 15 47 20 47 C23 47 25 45 26 42 C25 46 23 49 20 51 L32 51 C29 49 27 46 26 42 C27 45 29 47 32 47 C37 47 42 44 42 38 C42 30 33 22 26 12 Z';
  } else if (suitName === 'clubs') {
    suitPipPath = 'M26 14 A7 7 0 1 0 26 28 A7 7 0 1 0 26 14 M17 26 A7 7 0 1 0 17 40 A7 7 0 1 0 17 26 M35 26 A7 7 0 1 0 35 40 A7 7 0 1 0 35 26 M23 30 L29 30 L28 43 L33 50 L19 50 L24 43 Z';
  } else if (suitName === 'hearts') {
    suitPipPath = 'M26 49 C24 47 10 35 10 24 C10 16 16 12 21 12 C24 12 25 15 26 18 C27 15 28 12 31 12 C36 12 42 16 42 24 C42 35 28 47 26 49 Z';
  } else {
    suitPipPath = 'M26 11 C31 20 37 26 43 31 C37 36 31 42 26 51 C21 42 15 36 9 31 C15 26 21 20 26 11 Z';
  }

  // 계급별 왕관/모자 및 귀족 상징물(검/장미/할버드) 벡터 그래픽
  let crownAndHeadSVG = '';
  if (rank === 'K') {
    crownAndHeadSVG = `
      <!-- King Crown -->
      <path d="M58 34 L64 12 L78 24 L90 10 L102 24 L114 10 L126 24 L138 12 L144 34 Z" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <rect x="58" y="32" width="86" height="8" rx="2" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <circle cx="72" cy="36" r="2.2" fill="#D91414"/><circle cx="101" cy="36" r="2.5" fill="#163E8C"/><circle cx="130" cy="36" r="2.2" fill="#D91414"/>
      <!-- Sword / Halberd -->
      <path d="M162 18 L168 18 L166 95 L160 95 Z" fill="#E2E8F0" stroke="#141414" stroke-width="1.8"/>
      <rect x="152" y="88" width="24" height="5" rx="2" fill="#F2C12E" stroke="#141414" stroke-width="1.8"/>
      <!-- King Hair & Beard -->
      <path d="M56 40 C48 54 50 74 60 82 L142 82 C152 74 154 54 146 40 Z" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <path d="M68 40 C68 68 80 86 101 86 C122 86 134 68 134 40 Z" fill="#FDFBF4" stroke="#141414" stroke-width="2"/>
      <!-- Beard & Mustache -->
      <path d="M72 68 C76 86 88 94 101 94 C114 94 126 86 130 68 C120 72 110 74 101 74 C92 74 82 72 72 68 Z" fill="#F8FAFC" stroke="#141414" stroke-width="1.8"/>
      <path d="M84 65 Q101 59 118 65" fill="none" stroke="#141414" stroke-width="2.2"/>
    `;
  } else if (rank === 'Q') {
    crownAndHeadSVG = `
      <!-- Queen Veil & Coronet -->
      <path d="M52 38 C42 60 44 84 56 96 L146 96 C158 84 160 60 150 38 Z" fill="#F8FAFC" stroke="#141414" stroke-width="2"/>
      <path d="M62 34 L70 15 L85 26 L101 12 L117 26 L132 15 L140 34 Z" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <rect x="62" y="32" width="78" height="7" rx="2" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <!-- Queen Hair & Face -->
      <path d="M60 39 C55 58 60 78 72 86 L130 86 C142 78 147 58 142 39 Z" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <path d="M72 39 C72 66 83 84 101 84 C119 84 130 66 130 39 Z" fill="#FDFBF4" stroke="#141414" stroke-width="2"/>
      <!-- Tudor Rose Emblem -->
      <circle cx="158" cy="76" r="12" fill="#D91414" stroke="#141414" stroke-width="1.8"/>
      <circle cx="158" cy="76" r="5" fill="#F2C12E" stroke="#141414" stroke-width="1.4"/>
    `;
  } else {
    crownAndHeadSVG = `
      <!-- Jack Aristocrat Cap -->
      <path d="M54 36 C50 18 76 12 110 14 C138 15 152 24 146 36 Z" fill="#D91414" stroke="#141414" stroke-width="2"/>
      <rect x="60" y="31" width="82" height="7" rx="2" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <!-- Halberd Spear -->
      <path d="M164 12 L172 28 L164 44 L158 28 Z" fill="#F2C12E" stroke="#141414" stroke-width="1.8"/>
      <line x1="164" y1="44" x2="164" y2="98" stroke="#141414" stroke-width="3"/>
      <!-- Jack Curled Hair & Face -->
      <path d="M58 38 C50 56 54 76 68 84 L134 84 C148 76 152 56 144 38 Z" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
      <path d="M72 38 C72 65 83 82 101 82 C119 82 130 65 130 38 Z" fill="#FDFBF4" stroke="#141414" stroke-width="2"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice">
    <defs>
      <clipPath id="topHalfClip">
        <rect x="0" y="0" width="200" height="150"/>
      </clipPath>
      <g id="courtHalf" clip-path="url(#topHalfClip)">
        <!-- Suit Pip inside frame top-left -->
        <path d="${suitPipPath}" fill="${suitColor}"/>
        <!-- Royal Robes & Patterned Tunic -->
        <path d="M8 150 C12 106 42 88 101 88 C160 88 190 106 192 150 Z" fill="#D91414" stroke="#141414" stroke-width="2.2"/>
        <path d="M28 150 C34 112 58 92 101 92 C144 92 168 112 174 150 Z" fill="#163E8C" stroke="#141414" stroke-width="2"/>
        <!-- Gold Brocade Center Plastron -->
        <polygon points="72,92 130,92 146,150 56,150" fill="#F2C12E" stroke="#141414" stroke-width="2"/>
        <polygon points="86,102 101,116 116,102 101,88" fill="#D91414" stroke="#141414" stroke-width="1.5"/>
        <polygon points="86,130 101,144 116,130 101,116" fill="#163E8C" stroke="#141414" stroke-width="1.5"/>
        <!-- Royal Collar -->
        <path d="M64 86 Q101 102 138 86 L132 96 Q101 110 70 96 Z" fill="#FFFFFF" stroke="#141414" stroke-width="1.8"/>
        ${crownAndHeadSVG}
        <!-- Classic Engraving Facial Features -->
        <circle cx="89" cy="52" r="2.3" fill="#141414"/>
        <circle cx="113" cy="52" r="2.3" fill="#141414"/>
        <path d="M82 46 Q89 43 95 46" fill="none" stroke="#141414" stroke-width="1.8"/>
        <path d="M107 46 Q113 43 120 46" fill="none" stroke="#141414" stroke-width="1.8"/>
        <path d="M101 48 L98 60 L104 61" fill="none" stroke="#141414" stroke-width="1.8"/>
        <path d="M93 69 Q101 72 109 69" fill="none" stroke="#D91414" stroke-width="2"/>
      </g>
    </defs>
    <rect width="200" height="300" fill="#FDFBF4"/>
    <use href="#courtHalf"/>
    <use href="#courtHalf" transform="rotate(180 100 150)"/>
    <!-- Center Symmetry Divider Line -->
    <line x1="0" y1="150" x2="200" y2="150" stroke="#141414" stroke-width="2.2"/>
    <line x1="0" y1="150" x2="200" y2="150" stroke="#F2C12E" stroke-width="1"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createCardFrontHTML(card, extraClass = '') {
  const isRed = card.suit.color === 'red' || card.suit.name === 'hearts' || card.suit.name === 'diamonds';
  const colorClass = isRed ? 'card-red' : 'card-black';
  const isFaceCard = ['J', 'Q', 'K'].includes(card.rank);
  const isAce = card.rank === 'A';
  const isTen = card.rank === '10';
  const pipCount = parseInt(card.rank, 10);

  const cornerSuitSVG = getSuitSVG(card.suit.name, 'suit-svg corner-suit-svg');
  const centerSuitSVG = getSuitSVG(card.suit.name, 'suit-svg center-suit-svg');
  const pipSuitSVG = getSuitSVG(card.suit.name, 'suit-svg pip-suit-svg');

  let centerArtHTML = '';

  if (isFaceCard) {
    // 1. J, Q, K 코트(페이스) 카드:
    // 내부 검은색 선 액자(royal-court-frame) 안에 표준 52장 덱 상하 대칭 귀족 일러스트가 여백 없이 꽉 차도록 렌더링
    const suitCode = SUIT_IMAGE_CODE_MAP[card.suit.name] || 'S';
    const cdnImageUrl = `https://deckofcardsapi.com/static/img/${card.rank}${suitCode}.png`;
    const fallbackDataUri = getBicycleCourtDataURI(card.rank, card.suit.name);
    centerArtHTML = `
      <div class="card-center card-center-royal">
        <div class="royal-court-frame" style="background-image: url('${cdnImageUrl}'), url('${fallbackDataUri}');"></div>
      </div>
    `;
  } else if (isAce) {
    // 2. 에이스 (A) 카드: 정중앙 대형 고해상도 SVG 문양 1개 & 골드 메달리온
    centerArtHTML = `
      <div class="card-center card-center-ace">
        <div class="ace-medallion">
          <div class="card-jumbo-suit">${centerSuitSVG}</div>
        </div>
      </div>
    `;
  } else if (!isNaN(pipCount) && pipCount >= 2 && pipCount <= 10) {
    // 3. 숫자 카드 (2 ~ 10): 숫자 개수만큼 고해상도 SVG 문양(Pip)을 생성하여 정통 트럼프 카드 배열(상단 정방향 / 하단 180도 대칭) 구현
    let pipsHTML = '';
    for (let i = 1; i <= pipCount; i++) {
      pipsHTML += `<div class="card-pip pip-${i}">${pipSuitSVG}</div>`;
    }
    centerArtHTML = `
      <div class="card-center card-pips-grid pips-${pipCount}">
        ${pipsHTML}
      </div>
    `;
  }

  const tierClass = isAce
    ? 'card-tier-ace card-tier-high'
    : isFaceCard
      ? `card-tier-royal card-tier-high rank-${card.rank}`
      : `card-tier-number rank-${card.rank}`;

  const tenClass = isTen ? 'rank-is-ten' : '';

  return `
    <div class="playing-card ${colorClass} suit-${card.suit.name} ${tierClass} ${tenClass} ${extraClass}" title="${card.suit.symbol}${card.rank}">
      <div class="card-corner top-left">
        <span class="card-rank">${card.rank}</span>
        <span class="card-mini-suit">${cornerSuitSVG}</span>
      </div>
      ${centerArtHTML}
      <div class="card-corner bottom-right">
        <span class="card-rank">${card.rank}</span>
        <span class="card-mini-suit">${cornerSuitSVG}</span>
      </div>
    </div>
  `;
}

function updatePlayerChipsDOM(playerId) {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  const seatEl = document.getElementById(player.seatId);
  if (seatEl) {
    const chipsEl = seatEl.querySelector('.player-chips');
    if (chipsEl) chipsEl.textContent = `$${player.chips.toLocaleString()}`;

    const stackEl = seatEl.querySelector('.seat-chip-stack');
    if (stackEl) {
      stackEl.innerHTML = generateChipStackHTML(player.chips);
    }
  }
}

function updatePotDOM() {
  const potEl = document.getElementById('pot-amount');
  const potDisplayEl = document.getElementById('pot-display');
  const potStackEl = document.getElementById('stack-pot');

  if (potEl) {
    potEl.textContent = `$${gameState.pot.toLocaleString()}`;
  }

  if (potStackEl) {
    potStackEl.innerHTML = generateChipStackHTML(gameState.pot);
  }

  if (potDisplayEl) {
    potDisplayEl.classList.remove('pot-pulse');
    void potDisplayEl.offsetWidth;
    potDisplayEl.classList.add('pot-pulse');
  }
}

/**
 * 하단 콜/체크 버튼 라벨 및 스타일 동적 전환 로직
 * 추가 필요 베팅 금액이 0원이면 녹색 'CHECK (체크/넘기기)'로 전환
 */
function updateActionButtonsLabel() {
  const callBtn = document.getElementById('btn-call');
  const callText = document.querySelector('#btn-call .btn-text');
  const callSubtext = document.querySelector('#btn-call .btn-subtext');
  if (!callBtn || !callText || !callSubtext) return;

  const human = gameState.players.find(p => p.isHuman);
  const playerSoFar = (human && gameState.roundBets[human.id]) || 0;
  const needed = !gameState.isSeated ? 0 : Math.max(0, gameState.currentBet - playerSoFar);

  if (gameState.currentRound === 'showdown') {
    callText.textContent = 'END';
    callSubtext.textContent = '게임 종료';
    callBtn.classList.remove('btn-mode-check', 'btn-mode-call');
    return;
  }

  if (needed === 0) {
    // 추가 베팅액이 0원일 때: 선명한 녹색 CHECK (체크/넘기기) 버튼으로 전환
    callText.textContent = 'CHECK';
    callSubtext.textContent = '체크 / 넘기기 ($0)';
    callBtn.classList.add('btn-mode-check');
    callBtn.classList.remove('btn-mode-call');
    callBtn.setAttribute('aria-label', '체크 (넘기기)');
  } else {
    // 상대의 베팅/레이즈를 받아야 할 때: CALL 버튼으로 전환
    callText.textContent = 'CALL';
    callSubtext.textContent = `콜 ($${needed.toLocaleString()}) / 받기`;
    callBtn.classList.remove('btn-mode-check');
    callBtn.classList.add('btn-mode-call');
    callBtn.setAttribute('aria-label', `콜 ($${needed.toLocaleString()})`);
  }
}

function disableActionButtons(disabled) {
  const callBtn = document.getElementById('btn-call');
  const foldBtn = document.getElementById('btn-fold');
  const raiseBtn = document.getElementById('btn-raise');
  const allinBtn = document.getElementById('btn-allin');

  [callBtn, foldBtn, raiseBtn, allinBtn].forEach(btn => {
    if (btn) {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.6' : '1';
      btn.style.pointerEvents = disabled ? 'none' : 'auto';
    }
  });
  updateTimeBankButtonDOM();
}

function renderTable() {
  renderBlindBadges();
  renderPlayerHand();
  renderBotCards();
  resetCommunityCards();
  updatePotDOM();
  gameState.players.forEach(p => updatePlayerChipsDOM(p.id));
}

function renderPlayerHand() {
  const humanPlayer = gameState.players.find(p => p.isHuman);
  const playerSlots = document.querySelectorAll('#player-slots .player-card-slot');

  if (!humanPlayer || !playerSlots || playerSlots.length < 2) return;

  humanPlayer.hand.forEach((card, index) => {
    const slot = playerSlots[index];
    slot.classList.add('has-card');
    slot.innerHTML = createCardFrontHTML(card);
  });
}

function renderBotCards() {
  const bots = gameState.players.filter(p => !p.isHuman);

  bots.forEach(bot => {
    const seatEl = document.getElementById(bot.seatId);
    if (!seatEl) return;

    const botCardsContainer = seatEl.querySelector('.bot-cards');
    if (botCardsContainer) {
      botCardsContainer.innerHTML = `
        <div class="card-facedown card-tilt-left" title="${bot.name} Card 1">
          <div class="card-inner-pattern">♠</div>
        </div>
        <div class="card-facedown card-tilt-right" title="${bot.name} Card 2">
          <div class="card-inner-pattern">♦</div>
        </div>
      `;
    }
  });
}

function resetCommunityCards() {
  const communitySlots = document.querySelectorAll('#community-slots .card-slot');
  communitySlots.forEach((slot) => {
    slot.classList.remove('has-card');
    slot.innerHTML = `<span class="slot-watermark">?</span>`;
  });
}

// ==========================================================================
// 11. 이벤트 바인딩 및 초기화
// ==========================================================================

function setupEventListeners() {
  const foldBtn = document.getElementById('btn-fold');
  const callBtn = document.getElementById('btn-call');
  const raiseBtn = document.getElementById('btn-raise');
  const allinBtn = document.getElementById('btn-allin');
  const timeBankBtn = document.getElementById('btn-time-bank');
  const imBackBtn = document.getElementById('btn-im-back');
  const nextHandBtn = document.getElementById('next-hand-btn') || document.getElementById('btn-next-hand');

  // 맞춤형 레이즈 슬라이더 UI 이벤트
  const raiseSlider = document.getElementById('raise-slider');
  const raiseAmountText = document.getElementById('raise-amount-text');
  const raiseCancelBtn = document.getElementById('btn-raise-cancel');
  const raiseConfirmBtn = document.getElementById('btn-raise-confirm');

  if (foldBtn) {
    foldBtn.addEventListener('click', () => {
      unlockAudioContext();
      console.log('[Action] Fold 버튼 클릭');
      executeHumanFold(false, false);
    });
  }

  if (callBtn) {
    callBtn.addEventListener('click', () => {
      unlockAudioContext();
      handlePlayerBet(DEFAULT_BET_AMOUNT, false, 'call', false);
    });
  }

  // ⏱ 시간 연장 (+15초 / 판당 1회) 버튼
  if (timeBankBtn) {
    timeBankBtn.addEventListener('click', () => {
      unlockAudioContext();
      extendTurnTimer();
    });
  }

  // ▶ 다시 시작하기 (게임 참여) 버튼 (자리 비움 복귀)
  if (imBackBtn) {
    imBackBtn.addEventListener('click', () => {
      handleImBackClick();
    });
  }

  // RAISE 버튼: 슬라이더 패널 오픈
  if (raiseBtn) {
    raiseBtn.addEventListener('click', () => {
      unlockAudioContext();
      playSound('sound-check');
      openRaisePanel();
    });
  }

  // ALL-IN 버튼: 전재산 올인 베팅
  if (allinBtn) {
    allinBtn.addEventListener('click', () => {
      unlockAudioContext();
      const human = gameState.players.find(p => p.isHuman);
      if (!human || human.chips <= 0) return;
      handlePlayerBet(human.chips, true, 'allin');
    });
  }

  // 레이즈 슬라이더 변경 감지
  if (raiseSlider && raiseAmountText) {
    raiseSlider.addEventListener('input', (e) => {
      raiseAmountText.textContent = `$${parseInt(e.target.value, 10).toLocaleString()}`;
    });
  }

  // 레이즈 취소
  if (raiseCancelBtn) {
    raiseCancelBtn.addEventListener('click', closeRaisePanel);
  }

  // 레이즈 확인
  if (raiseConfirmBtn) {
    raiseConfirmBtn.addEventListener('click', confirmCustomRaise);
  }

  // 프리셋 버튼들 (2X, 3X, POT, MAX)
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.target.dataset.preset;
      setRaisePreset(preset);
    });
  });

  // 다음 판 버튼
  if (nextHandBtn) {
    nextHandBtn.addEventListener('click', startNextHand);
  }
}

function centerTableScroll(isSmooth = false) {
  // flexbox 중앙 정렬 체제로 전환되어 화면 깜빡거림(Flickering)을 유발하는 불필요한 scrollTo 동작 방지
}

// ==========================================================================
// 12. 환전소 (Buy-in Modal) 및 리바이(Re-buy) 시스템
// ==========================================================================

function showBuyInModal(isRebuy = false) {
  const modalEl = document.getElementById('buyin-modal');
  const titleEl = document.getElementById('buyin-title');
  const subtitleEl = document.getElementById('buyin-subtitle');
  const confirmBtn = document.getElementById('btn-buyin-confirm');
  const summaryAmountEl = document.getElementById('buyin-selected-amount');

  if (isRebuy) {
    if (titleEl) titleEl.textContent = '리바이(Re-buy) 환전소';
    if (subtitleEl) subtitleEl.textContent = '칩이 모두 소진되었습니다! 재충전 후 테이블에 복귀하세요.';
    if (confirmBtn) {
      const btnSpan = confirmBtn.querySelector('span');
      if (btnSpan) btnSpan.textContent = '칩 재구매하고 복귀하기';
    }
  } else {
    if (titleEl) titleEl.textContent = 'CASINO CASHIER';
    if (subtitleEl) subtitleEl.textContent = '테이블에 입장할 바이인(Buy-in) 칩을 선택하세요';
    if (confirmBtn) {
      const btnSpan = confirmBtn.querySelector('span');
      if (btnSpan) btnSpan.textContent = '칩 구매하고 테이블 앉기';
    }
  }

  gameState.selectedBuyIn = gameState.selectedBuyIn || 1000;
  if (summaryAmountEl) {
    summaryAmountEl.textContent = `$${gameState.selectedBuyIn.toLocaleString()}`;
  }

  document.querySelectorAll('.buyin-card').forEach(card => {
    const amt = parseInt(card.dataset.amount, 10);
    if (amt === gameState.selectedBuyIn) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  if (modalEl) {
    modalEl.classList.add('active');
    modalEl.style.display = 'flex';
  }
}

function hideBuyInModal() {
  const modalEl = document.getElementById('buyin-modal');
  if (modalEl) {
    modalEl.classList.remove('active');
    modalEl.style.display = 'none';
  }
}

function setupBuyInEvents() {
  const cards = document.querySelectorAll('.buyin-card');
  const summaryAmountEl = document.getElementById('buyin-selected-amount');
  const confirmBtn = document.getElementById('btn-buyin-confirm');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const amount = parseInt(card.dataset.amount, 10) || 1000;
      gameState.selectedBuyIn = amount;
      if (summaryAmountEl) {
        summaryAmountEl.textContent = `$${amount.toLocaleString()}`;
      }
      playSound('sound-bet');
    });
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      playSound('sound-bet');
      const buyInAmount = gameState.selectedBuyIn || 1000;
      const human = gameState.players.find(p => p.isHuman);
      if (human) {
        human.chips = buyInAmount;
      }

      gameState.players.forEach(p => {
        if (!p.isHuman && p.chips < BIG_BLIND) {
          p.chips = buyInAmount;
        }
        updatePlayerChipsDOM(p.id);
      });

      gameState.isSeated = true;
      hideBuyInModal();

      dealHoleCards();
      centerTableScroll();
    });
  }
}

/**
 * 모바일 뷰포트 맞춤: 화면 크기와 회전(가로/세로)에 따라 테이블 전체 스케일(--table-scale)을 자동 계산
 * 주소창 진동이나 미세한 픽셀 변화로 인한 무한 리사이즈 깜빡거림(Flickering)을 100% 방지
 */
function updateTableScale() {
  if (isScaleUpdateScheduled) return;
  isScaleUpdateScheduled = true;

  requestAnimationFrame(() => {
    isScaleUpdateScheduled = false;

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const isLandscape = vw > vh;

    // 데스크톱 (940px 이상 및 640px 이상)
    if (vw >= 940 && vh >= 640) {
      if (currentTableScale !== 1) {
        currentTableScale = 1;
        document.documentElement.style.setProperty('--table-scale', '1');
      }
      return;
    }

    // 모바일 가용 영역 계산 (하단 액션바 약 70px, 세로모드 상단 안내 약 30px 제외)
    const reservedH = isLandscape ? 68 : 98;
    const availableW = Math.max(280, vw - 6);
    const availableH = Math.max(200, vh - reservedH);

    let scale;
    if (isLandscape) {
      // 가로 모드: 화면에 시원하게 꽉 차도록 계산
      scale = Math.min(availableW / TABLE_BASE_WIDTH, availableH / TABLE_BASE_HEIGHT);
    } else {
      // 세로 모드: 너비를 화면 가득(98%) 채워 테이블이 콩알만 해지지 않도록 극대화
      const wScale = availableW / TABLE_BASE_WIDTH;
      const hScale = availableH / TABLE_BASE_HEIGHT;
      scale = Math.min(wScale, hScale * 1.08);
    }

    scale = Math.max(0.35, Math.min(1.2, scale));

    // 미세한 변화(0.01 이하)는 무시하여 모바일 주소창 진동 깜빡거림(Flickering) 완전 차단
    if (Math.abs(currentTableScale - scale) > 0.01) {
      currentTableScale = scale;
      document.documentElement.style.setProperty('--table-scale', scale.toFixed(4));
    }
  });
}

function initGame() {
  console.log('텍사스 홀덤 6인용 테이블 세팅 완료!');

  // 모바일 오디오 컨텍스트 정책: 사용자의 첫 화면 터치/클릭 시 즉시 활성화
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evtName => {
    document.addEventListener(evtName, () => {
      unlockAudioContext();
    }, { once: true, passive: true });
  });

  updateTableScale();
  setupEventListeners();
  setupBuyInEvents();
  updateActionButtonsLabel();

  if (!gameState.isSeated) {
    showBuyInModal(false);
  } else {
    dealHoleCards();
  }
}

document.addEventListener('DOMContentLoaded', initGame);
window.addEventListener('resize', updateTableScale);
window.addEventListener('orientationchange', () => {
  setTimeout(updateTableScale, 150);
});
