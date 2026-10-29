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

// ==========================================================================
// 2. 사운드 이펙트 시스템 (Audio System & Web Audio Synth Fallback)
// ==========================================================================
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * 사운드 이펙트 재생 함수
 * @param {'sound-bet' | 'sound-card' | 'sound-win'} soundId
 */
function playSound(soundId) {
  const audioEl = document.getElementById(soundId);
  if (audioEl && audioEl.src && audioEl.src.length > 5 && !audioEl.src.endsWith('/')) {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => playSynthesizedSound(soundId));
  } else {
    playSynthesizedSound(soundId);
  }
}

/**
 * 브라우저 내장 Web Audio API 사운드 합성기
 */
function playSynthesizedSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'sound-bet') {
      [0, 0.05].forEach((d, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(idx === 0 ? 1900 : 2500, now + d);
        gain.gain.setValueAtTime(0.18, now + d);
        gain.gain.exponentialRampToValueAtTime(0.001, now + d + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + d);
        osc.stop(now + d + 0.12);
      });
    } else if (type === 'sound-card') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'sound-win') {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.11;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.38);
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
  isPlayerAllIn: false
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
 * 소지금에 맞춰 입체적인 칩 탑(3D Stack) HTML 생성
 * $10, $50, $100, $500, $1000 단위별 색상 분기
 */
function generateChipStackHTML(amount) {
  if (amount <= 0) return '';

  const denoms = [
    { value: 1000, cls: 'chip-1000' },
    { value: 500, cls: 'chip-500' },
    { value: 100, cls: 'chip-100' },
    { value: 50, cls: 'chip-50' },
    { value: 10, cls: 'chip-10' }
  ];

  const chipList = [];
  let rem = amount;

  for (const d of denoms) {
    if (rem >= d.value) {
      const count = Math.min(5, Math.floor(rem / d.value));
      for (let i = 0; i < count; i++) {
        chipList.push(d.cls);
      }
      rem -= count * d.value;
    }
  }

  if (chipList.length === 0 && amount > 0) {
    chipList.push('chip-50');
  }

  // 1열당 4개씩 최대 3개 컬럼으로 칩 탑 분할
  const columns = [];
  const colSize = 4;
  for (let i = 0; i < chipList.length; i += colSize) {
    columns.push(chipList.slice(i, i + colSize));
    if (columns.length >= 3) break;
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
 * 칩이 부드럽게 날아가는 이동 애니메이션 함수
 * @param {HTMLElement} fromEl - 출발 엘리먼트
 * @param {HTMLElement} toEl - 도착 엘리먼트
 * @param {number} count - 날아가는 칩 개수
 * @param {string} chipClass - 칩 색상 클래스
 * @param {Function} callback - 완료 콜백
 */
function animateFlyingChips(fromEl, toEl, count = 3, chipClass = 'chip-50', callback = null) {
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

  for (let i = 0; i < count; i++) {
    const chip = document.createElement('div');
    chip.className = `flying-chip ${chipClass}`;

    const randSpreadX = (Math.random() - 0.5) * 16;
    const randSpreadY = (Math.random() - 0.5) * 12;

    chip.style.left = `${startX + randSpreadX - 11}px`;
    chip.style.top = `${startY + randSpreadY - 7}px`;

    container.appendChild(chip);

    const delayMs = i * 45;
    const duration = 440;

    setTimeout(() => {
      chip.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${duration}ms ease`;
      const targetDX = (endX - startX) + (Math.random() - 0.5) * 16;
      const targetDY = (endY - startY) + (Math.random() - 0.5) * 10;
      const randRot = (Math.random() - 0.5) * 200;
      chip.style.transform = `translate(${targetDX}px, ${targetDY}px) scale(0.9) rotate(${randRot}deg)`;
    }, delayMs);

    setTimeout(() => {
      chip.remove();
      if (i === count - 1 && callback) {
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
 * 다음 판 시작을 위한 모든 상태 및 UI 완전 리셋
 */
function resetAllGameState() {
  console.log('--- 🔄 [State Reset] 모든 게임 상태 변수 및 UI를 초기화합니다. ---');

  gameState.isBettingInProgress = false;
  gameState.isPlayerAllIn = false;
  gameState.currentRound = 'preflop';
  gameState.pot = 0;
  gameState.currentBet = BIG_BLIND;
  gameState.roundBets = {};
  gameState.hasBotRaisedThisStreet = false;
  gameState.communityCards = [];

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
    seat.classList.remove('folded', 'winner-glow', 'active-turn');
    const existingTag = seat.querySelector('.seat-action-tag');
    if (existingTag) existingTag.remove();
  });

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
    if (potEl) animateFlyingChips(sbSeat, potEl, 2, 'chip-10');
  }

  const bbAmount = Math.min(bbPlayer.chips, BIG_BLIND);
  executeBet(bbPlayer.id, bbAmount);
  gameState.roundBets[bbPlayer.id] = bbAmount;
  const bbSeat = document.getElementById(bbPlayer.seatId);
  if (bbSeat) {
    showSeatActionTag(bbSeat, `BB $${bbAmount}`, 'tag-bb');
    if (potEl) animateFlyingChips(bbSeat, potEl, 2, 'chip-50');
  }

  playSound('sound-bet');

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
 */
async function handlePlayerBet(amount, isAllIn = false, actionType = 'call') {
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
    playSound('sound-bet');
    if (humanSeat && potEl) animateFlyingChips(humanSeat, potEl, 5, 'chip-1000');
    if (humanSeat) showSeatActionTag(humanSeat, `🔥 ALL-IN $${betToDeduct.toLocaleString()}`, 'tag-allin');
    console.log(`[🔥 ALL-IN] ${human.name}이(가) 전재산 $${betToDeduct.toLocaleString()}을 올인했습니다!!`);
  } else if (actionType === 'raise') {
    // 맞춤형 슬라이더로 설정한 목표 금액
    const targetRaise = amount;
    betToDeduct = Math.min(human.chips, Math.max(0, targetRaise - playerSoFar));
    executeBet(human.id, betToDeduct);
    gameState.roundBets[human.id] = playerSoFar + betToDeduct;
    gameState.currentBet = Math.max(gameState.currentBet, gameState.roundBets[human.id]);
    playSound('sound-bet');
    if (humanSeat && potEl) animateFlyingChips(humanSeat, potEl, 3, 'chip-500');
    if (humanSeat) showSeatActionTag(humanSeat, `RAISE $${targetRaise.toLocaleString()}`, 'tag-raise');
    console.log(`[내 RAISE] ${human.name}이(가) $${targetRaise.toLocaleString()}으로 레이즈했습니다! (추가 베팅: $${betToDeduct.toLocaleString()}, 잔액: $${human.chips.toLocaleString()})`);
  } else {
    // CALL 또는 CHECK (필요 금액에 따라 동적 분기)
    const needed = Math.max(0, gameState.currentBet - playerSoFar);
    betToDeduct = Math.min(human.chips, needed);
    if (betToDeduct > 0) {
      executeBet(human.id, betToDeduct);
      gameState.roundBets[human.id] = playerSoFar + betToDeduct;
      playSound('sound-bet');
      if (humanSeat && potEl) animateFlyingChips(humanSeat, potEl, 2, 'chip-100');
      if (humanSeat) showSeatActionTag(humanSeat, `CALL $${betToDeduct.toLocaleString()}`, 'tag-call');
      console.log(`[내 CALL] ${human.name}이(가) $${betToDeduct.toLocaleString()}을 콜했습니다! (잔액: $${human.chips.toLocaleString()})`);
    } else {
      // CHECK: 추가 베팅액 없이 무료로 다음 턴 넘기기
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
  // 다음 라운드로 바로 넘어가지 않고 내게 CALL / FOLD 응답 기회를 줌
  const humanRoundBetAfterBots = gameState.roundBets[human.id] || 0;
  if (gameState.currentBet > humanRoundBetAfterBots && human.chips > 0) {
    const extraNeeded = gameState.currentBet - humanRoundBetAfterBots;
    console.log(`[봇 레이즈 발생] 봇의 레이즈로 인해 플레이어에게 추가 콜 금액($${extraNeeded}) 응답 턴이 돌아왔습니다.`);
    updateActionButtonsLabel();
    gameState.isBettingInProgress = false;
    disableActionButtons(false);
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
  }
}

/**
 * 봇들이 AI 지능으로 Raise / Call / Fold 의사결정하는 턴 루프
 */
async function runAIBotBettingLoop(targetBetAmount, isPlayerAllIn = false) {
  const bots = gameState.players.filter(p => !p.isHuman);

  console.log(`--- 🤖 AI 봇 의사결정 턴 시작 (Round: ${gameState.currentRound}, Target Bet: $${targetBetAmount}, All-in: ${isPlayerAllIn}) ---`);

  for (const bot of bots) {
    if (bot.isFolded) continue;

    const botSoFar = gameState.roundBets[bot.id] || 0;
    const currentTarget = gameState.currentBet;

    // 이미 이번 스트리트에서 봇이 레이즈했고 해당 봇이 최고 베팅액을 맞춘 상태라면 스킵
    if (gameState.hasBotRaisedThisStreet && botSoFar >= currentTarget && currentTarget > 0) {
      continue;
    }

    await delay(450);

    const seatEl = document.getElementById(bot.seatId);
    const potEl = document.getElementById('pot-display');
    if (seatEl) seatEl.classList.add('active-turn');

    const neededForBot = Math.max(0, currentTarget - botSoFar);

    // AI 엔진 호출 (플레이어의 올인 여부 및 현재 맞춰야 할 베팅액 전달)
    const decision = window.AIBotEngine 
      ? window.AIBotEngine.decideBotAction(bot, gameState.communityCards, gameState.currentRound, neededForBot, isPlayerAllIn)
      : { action: 'call', amount: neededForBot, reason: '기본 콜' };

    if (decision.action === 'fold') {
      if (neededForBot === 0) {
        // 콜 금액이 0원일 때는 폴드 대신 무료 체크 수행
        if (seatEl) showSeatActionTag(seatEl, 'CHECK', 'tag-check');
        console.log(`[봇 CHECK] ${bot.name}이(가) 체크했습니다.`);
      } else {
        bot.isFolded = true;
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
        playSound('sound-bet');
        if (seatEl && potEl) animateFlyingChips(seatEl, potEl, 3, 'chip-500');
        if (seatEl) showSeatActionTag(seatEl, `RAISE $${gameState.currentBet}`, 'tag-raise');
        console.log(`[봇 RAISE] ${bot.name}이(가) $${gameState.currentBet}으로 판돈을 올렸습니다! (${decision.reason})`);
      } else {
        const callAmt = Math.min(bot.chips, neededForBot);
        if (callAmt > 0) {
          executeBet(bot.id, callAmt);
          gameState.roundBets[bot.id] = botSoFar + callAmt;
          playSound('sound-bet');
          if (seatEl && potEl) animateFlyingChips(seatEl, potEl, 2, 'chip-50');
          if (seatEl) showSeatActionTag(seatEl, `CALL $${callAmt}`, 'tag-call');
        } else {
          if (seatEl) showSeatActionTag(seatEl, 'CHECK', 'tag-check');
        }
      }
    } else {
      const callAmt = Math.min(bot.chips, neededForBot);
      if (callAmt > 0) {
        executeBet(bot.id, callAmt);
        gameState.roundBets[bot.id] = botSoFar + callAmt;
        playSound('sound-bet');
        if (seatEl && potEl) animateFlyingChips(seatEl, potEl, 2, 'chip-50');
        if (seatEl) showSeatActionTag(seatEl, `CALL $${callAmt}`, 'tag-call');
        console.log(`[봇 CALL] ${bot.name}이(가) $${callAmt}을 콜했습니다. (${decision.reason})`);
      } else {
        // 0원 콜은 체크(CHECK)로 표기
        if (seatEl) showSeatActionTag(seatEl, 'CHECK', 'tag-check');
        console.log(`[봇 CHECK] ${bot.name}이(가) 체크했습니다. (${decision.reason})`);
      }
    }

    setTimeout(() => {
      if (seatEl) seatEl.classList.remove('active-turn');
    }, 350);
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
 * 좌석 상단에 액션 뱃지를 띄우는 함수 (칩 아이콘 포함)
 */
function showSeatActionTag(seatEl, text, className) {
  const oldTag = seatEl.querySelector('.seat-action-tag');
  if (oldTag) oldTag.remove();

  const tag = document.createElement('div');
  tag.className = `seat-action-tag ${className}`;
  if (text.includes('$')) {
    tag.innerHTML = `<span class="casino-chip chip-xs"></span><span>${text}</span>`;
  } else {
    tag.textContent = text;
  }
  seatEl.appendChild(tag);
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
    showWinnerModal([winner], { rankInfo: { name: 'Fold Out Win', korean: '기권승' } }, totalPot);
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
  const subtitleEl = document.querySelector('.modal-subtitle');
  const potValEl = document.getElementById('modal-pot-val');
  const potLabelEl = document.querySelector('.modal-pot-label');
  const nextHandBtn = document.getElementById('next-hand-btn') || document.getElementById('btn-next-hand');

  const winnerNames = winners.map(w => w.name).join(', ');
  const winTitle = winners.length > 1 ? `${winnerNames} 공동 승리! 🏆` : `${winnerNames} 승리! 🏆`;
  const winSubtitle = `족보: ${winningHand.rankInfo.name} (${winningHand.rankInfo.korean})`;

  if (titleEl) titleEl.textContent = winTitle;
  if (subtitleEl) subtitleEl.textContent = winSubtitle;
  if (potLabelEl) potLabelEl.textContent = 'WINNER POT';
  if (potValEl) potValEl.textContent = `+$${wonPot.toLocaleString()}`;

  if (modalEl) {
    modalEl.classList.add('active');
    modalEl.style.display = 'flex';
  }

  if (nextHandBtn) {
    nextHandBtn.style.display = 'block';
    nextHandBtn.onclick = () => {
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
  const nextHandBtn = document.getElementById('next-hand-btn') || document.getElementById('btn-next-hand');

  // 맞춤형 레이즈 슬라이더 UI 이벤트
  const raiseSlider = document.getElementById('raise-slider');
  const raiseAmountText = document.getElementById('raise-amount-text');
  const raiseCancelBtn = document.getElementById('btn-raise-cancel');
  const raiseConfirmBtn = document.getElementById('btn-raise-confirm');

  if (foldBtn) {
    foldBtn.addEventListener('click', () => {
      console.log('[Action] Fold 버튼 클릭');
      const human = gameState.players.find(p => p.isHuman);
      human.isFolded = true;
      const seatEl = document.getElementById(human.seatId);
      if (seatEl) {
        seatEl.classList.add('folded');
        showSeatActionTag(seatEl, 'FOLD', 'tag-fold');
      }
      gameState.currentRound = 'showdown';
      runShowdown();
    });
  }

  if (callBtn) {
    callBtn.addEventListener('click', () => {
      handlePlayerBet(DEFAULT_BET_AMOUNT, false, 'call');
    });
  }

  // RAISE 버튼: 슬라이더 패널 오픈
  if (raiseBtn) {
    raiseBtn.addEventListener('click', () => {
      openRaisePanel();
    });
  }

  // ALL-IN 버튼: 전재산 올인 베팅
  if (allinBtn) {
    allinBtn.addEventListener('click', () => {
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
  setTimeout(() => {
    const container = document.getElementById('game-container');
    if (container && container.scrollWidth > container.clientWidth) {
      container.scrollTo({ left: (container.scrollWidth - container.clientWidth) / 2, behavior: isSmooth ? 'smooth' : 'auto' });
    }
    const scrollWidth = document.documentElement.scrollWidth || document.body.scrollWidth;
    const clientWidth = window.innerWidth;
    if (scrollWidth > clientWidth) {
      window.scrollTo({ left: (scrollWidth - clientWidth) / 2, behavior: isSmooth ? 'smooth' : 'auto' });
    }
  }, 100);
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

function initGame() {
  console.log('텍사스 홀덤 6인용 테이블 세팅 완료!');
  setupEventListeners();
  setupBuyInEvents();
  updateActionButtonsLabel();
  centerTableScroll();

  if (!gameState.isSeated) {
    showBuyInModal(false);
  } else {
    dealHoleCards();
  }
}

document.addEventListener('DOMContentLoaded', initGame);
window.addEventListener('resize', centerTableScroll);
