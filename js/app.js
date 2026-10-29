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

// 기본 베팅 단위
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
  players: [
    { id: 'player1', name: 'PLAYER 1', isHuman: true, chips: 1000, hand: [], isFolded: false, seatId: 'seat-player-1' },
    { id: 'bot1', name: 'Bot 1', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-1' },
    { id: 'bot2', name: 'Bot 2', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-2' },
    { id: 'bot3', name: 'Bot 3', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-3' },
    { id: 'bot4', name: 'Bot 4', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-4' },
    { id: 'bot5', name: 'Bot 5', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-5' }
  ],
  pot: 0,
  currentRound: 'preflop', // 'preflop' -> 'flop' -> 'turn' -> 'river' -> 'showdown'
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
// 5. 게임 상태 완벽 리셋 및 딜링 시스템
// ==========================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 다음 판 시작을 위한 모든 상태 및 UI 완전 리셋
 */
function resetAllGameState() {
  console.log('--- 🔄 [State Reset] 모든 게임 상태 변수 및 UI를 0으로 초기화합니다. ---');

  gameState.isBettingInProgress = false;
  gameState.isPlayerAllIn = false;
  gameState.currentRound = 'preflop';
  gameState.pot = 0;
  gameState.communityCards = [];

  gameState.players.forEach(player => {
    player.hand = [];
    player.isFolded = false;
    if (player.chips < DEFAULT_BET_AMOUNT) {
      player.chips = 1000;
    }
  });

  disableActionButtons(false);
  updateActionButtonsLabel();
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
 * 게임 시작 및 초기 2장 카드 분배 로직
 */
function dealHoleCards() {
  console.log('==============================================');
  console.log('🃏 새 게임 시작 (Round: Pre-flop) - 카드 딜링');
  console.log('==============================================');

  playSound('sound-card');
  resetAllGameState();

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

  gameState.players.filter(p => !p.isHuman).forEach(bot => {
    console.log(`[봇 패 배분] ${bot.name}에게 2장의 카드가 배분되었습니다.`);
  });

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
 * @param {number} amount - 베팅 금액
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
  if (!human || human.chips < amount) {
    console.warn('소지 칩이 부족합니다.');
    return;
  }

  gameState.isBettingInProgress = true;
  gameState.isPlayerAllIn = isAllIn;
  disableActionButtons(true);
  closeRaisePanel();

  // 1. 플레이어 베팅 실행
  executeBet(human.id, amount);
  playSound('sound-bet');

  const humanSeat = document.getElementById(human.seatId);
  if (actionType === 'allin') {
    if (humanSeat) showSeatActionTag(humanSeat, `🔥 ALL-IN $${amount.toLocaleString()}`, 'tag-allin');
    console.log(`[🔥 ALL-IN] ${human.name}이(가) 전재산 $${amount.toLocaleString()}을 올인했습니다!!`);
  } else if (actionType === 'raise') {
    if (humanSeat) showSeatActionTag(humanSeat, `RAISE $${amount.toLocaleString()}`, 'tag-raise');
    console.log(`[내 RAISE] ${human.name}이(가) $${amount.toLocaleString()}으로 레이즈했습니다! (잔액: $${human.chips.toLocaleString()})`);
  } else {
    if (humanSeat) showSeatActionTag(humanSeat, `CALL $${amount.toLocaleString()}`, 'tag-call');
    console.log(`[내 CALL] ${human.name}이(가) $${amount.toLocaleString()}을 콜했습니다! (잔액: $${human.chips.toLocaleString()})`);
  }

  // 2. AI 봇들(Bot 1, 2, 3) 의사결정 및 눈치싸움 턴 루프 실행
  await runAIBotBettingLoop(amount, isAllIn);

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

  // 5. 일반 라운드 진행
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
 * 봇들(Bot 1, Bot 2, Bot 3)이 AI 지능으로 Raise / Call / Fold 의사결정하는 턴 루프
 */
async function runAIBotBettingLoop(targetBetAmount, isPlayerAllIn = false) {
  const bots = gameState.players.filter(p => !p.isHuman);

  console.log(`--- 🤖 AI 봇 의사결정 턴 시작 (Round: ${gameState.currentRound}, Target Bet: $${targetBetAmount}, All-in: ${isPlayerAllIn}) ---`);

  for (const bot of bots) {
    if (bot.isFolded) continue;

    await delay(450);

    const seatEl = document.getElementById(bot.seatId);
    if (seatEl) seatEl.classList.add('active-turn');

    // AI 엔진 호출 (플레이어의 올인 여부 및 베팅액 전달)
    const decision = window.AIBotEngine 
      ? window.AIBotEngine.decideBotAction(bot, gameState.communityCards, gameState.currentRound, targetBetAmount, isPlayerAllIn)
      : { action: 'call', amount: targetBetAmount, reason: '기본 콜' };

    if (decision.action === 'fold') {
      bot.isFolded = true;
      if (seatEl) {
        seatEl.classList.add('folded');
        showSeatActionTag(seatEl, 'FOLD', 'tag-fold');
      }
      console.log(`[봇 FOLD] ${bot.name}이(가) 포기(Fold)했습니다. (${decision.reason})`);
    } else if (decision.action === 'raise') {
      executeBet(bot.id, decision.amount);
      playSound('sound-bet');
      if (seatEl) showSeatActionTag(seatEl, `RAISE $${decision.amount}`, 'tag-raise');
      console.log(`[봇 RAISE] ${bot.name}이(가) $${decision.amount}으로 판돈을 올렸습니다! (${decision.reason})`);
    } else {
      executeBet(bot.id, decision.amount);
      playSound('sound-bet');
      if (seatEl) showSeatActionTag(seatEl, `CALL $${decision.amount}`, 'tag-call');
      console.log(`[봇 CALL] ${bot.name}이(가) $${decision.amount}을 콜했습니다. (${decision.reason})`);
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
 * 봇 좌석 상단에 액션 뱃지를 띄우는 함수
 */
function showSeatActionTag(seatEl, text, className) {
  const oldTag = seatEl.querySelector('.seat-action-tag');
  if (oldTag) oldTag.remove();

  const tag = document.createElement('div');
  tag.className = `seat-action-tag ${className}`;
  tag.textContent = text;
  seatEl.appendChild(tag);
}

// ==========================================================================
// 7. 맞춤형 레이즈 슬라이더 UI 패널 제어
// ==========================================================================

function openRaisePanel() {
  if (gameState.isBettingInProgress || gameState.currentRound === 'showdown') return;

  const human = gameState.players.find(p => p.isHuman);
  if (!human) return;

  const panel = document.getElementById('raise-slider-panel');
  const slider = document.getElementById('raise-slider');
  const minLabel = document.getElementById('raise-min-val');
  const maxLabel = document.getElementById('raise-max-val');
  const amountText = document.getElementById('raise-amount-text');

  if (!panel || !slider) return;

  // 최소 레이즈 금액: $100 (또는 남은 칩), 최대: 내 남은 칩 전액
  const minRaise = Math.min(human.chips, DEFAULT_BET_AMOUNT * 2);
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

  let targetVal = DEFAULT_BET_AMOUNT * 2;

  if (multiplier === '2x') {
    targetVal = DEFAULT_BET_AMOUNT * 2;
  } else if (multiplier === '3x') {
    targetVal = DEFAULT_BET_AMOUNT * 3;
  } else if (multiplier === 'pot') {
    targetVal = Math.max(DEFAULT_BET_AMOUNT * 2, gameState.pot);
  } else if (multiplier === 'all') {
    targetVal = human.chips;
  }

  targetVal = Math.min(human.chips, Math.max(DEFAULT_BET_AMOUNT * 2, targetVal));
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
    gameState.pot = 0;
    updatePlayerChipsDOM(winner.id);
    updatePotDOM();

    const seatEl = document.getElementById(winner.seatId);
    if (seatEl) seatEl.classList.add('winner-glow');

    await delay(700);
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

  winners.forEach(winner => {
    winner.chips += splitAmount;
    updatePlayerChipsDOM(winner.id);

    const seatEl = document.getElementById(winner.seatId);
    if (seatEl) seatEl.classList.add('winner-glow');
  });

  gameState.pot = 0;
  updatePotDOM();

  await delay(700);
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
          <div class="playing-card suit-${bot.hand[0].suit.name} card-tilt-left" title="${bot.hand[0].suit.name} ${bot.hand[0].rank}">
            <div class="card-corner top-left">
              <span class="card-rank">${bot.hand[0].rank}</span>
              <span class="card-mini-suit">${bot.hand[0].suit.symbol}</span>
            </div>
            <div class="card-center-suit">${bot.hand[0].suit.symbol}</div>
            <div class="card-corner bottom-right">
              <span class="card-rank">${bot.hand[0].rank}</span>
              <span class="card-mini-suit">${bot.hand[0].suit.symbol}</span>
            </div>
          </div>
          <div class="playing-card suit-${bot.hand[1].suit.name} card-tilt-right" title="${bot.hand[1].suit.name} ${bot.hand[1].rank}">
            <div class="card-corner top-left">
              <span class="card-rank">${bot.hand[1].rank}</span>
              <span class="card-mini-suit">${bot.hand[1].suit.symbol}</span>
            </div>
            <div class="card-center-suit">${bot.hand[1].suit.symbol}</div>
            <div class="card-corner bottom-right">
              <span class="card-rank">${bot.hand[1].rank}</span>
              <span class="card-mini-suit">${bot.hand[1].suit.symbol}</span>
            </div>
          </div>
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
    nextHandBtn.onclick = startNextHand;
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
  console.log('--- 🔄 [Next Hand] 모든 카드를 비우고 새로운 판을 시작합니다! ---');
  dealHoleCards();
}

// ==========================================================================
// 10. DOM 렌더링 도우미 함수
// ==========================================================================

function createCardFrontHTML(card) {
  return `
    <div class="playing-card suit-${card.suit.name}" title="${card.suit.name} ${card.rank}">
      <div class="card-corner top-left">
        <span class="card-rank">${card.rank}</span>
        <span class="card-mini-suit">${card.suit.symbol}</span>
      </div>
      <div class="card-center-suit">${card.suit.symbol}</div>
      <div class="card-corner bottom-right">
        <span class="card-rank">${card.rank}</span>
        <span class="card-mini-suit">${card.suit.symbol}</span>
      </div>
    </div>
  `;
}

function updatePlayerChipsDOM(playerId) {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  if (playerId === 'player1') {
    const chipsEl = document.getElementById('player-chips');
    if (chipsEl) chipsEl.textContent = `$${player.chips.toLocaleString()}`;
  } else {
    const seatEl = document.getElementById(player.seatId);
    if (seatEl) {
      const chipsEl = seatEl.querySelector('.player-chips');
      if (chipsEl) chipsEl.textContent = `$${player.chips.toLocaleString()}`;
    }
  }
}

function updatePotDOM() {
  const potEl = document.getElementById('pot-amount');
  const potDisplayEl = document.getElementById('pot-display');

  if (potEl) {
    potEl.textContent = `$${gameState.pot.toLocaleString()}`;
  }

  if (potDisplayEl) {
    potDisplayEl.classList.remove('pot-pulse');
    void potDisplayEl.offsetWidth;
    potDisplayEl.classList.add('pot-pulse');
  }
}

function updateActionButtonsLabel() {
  const callSubtext = document.querySelector('#btn-call .btn-subtext');
  if (!callSubtext) return;

  switch (gameState.currentRound) {
    case 'preflop':
      callSubtext.textContent = '체크 / 받기 (플롭)';
      break;
    case 'flop':
      callSubtext.textContent = '체크 / 받기 (턴)';
      break;
    case 'turn':
      callSubtext.textContent = '체크 / 받기 (리버)';
      break;
    case 'river':
      callSubtext.textContent = '체크 / 쇼다운';
      break;
    case 'showdown':
      callSubtext.textContent = '게임 종료';
      break;
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

function initGame() {
  console.log('텍사스 홀덤 6인용 테이블 세팅 완료!');
  setupEventListeners();
  dealHoleCards();
  centerTableScroll();
}

document.addEventListener('DOMContentLoaded', initGame);
window.addEventListener('resize', centerTableScroll);
