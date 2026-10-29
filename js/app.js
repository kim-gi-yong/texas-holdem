/**
 * Texas Hold'em Poker - Game Application
 * Phase 5: AI Bot Intelligence & Sound Effects
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

// 기본 베팅 금액
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
  // audio 태그에 실제 유효한 src가 있으면 직접 재생
  if (audioEl && audioEl.src && audioEl.src.length > 5 && !audioEl.src.endsWith('/')) {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => playSynthesizedSound(soundId));
  } else {
    // 오디오 파일이 없거나 빈 URL일 때 Web Audio API로 짤랑/스윽/승리음 즉석 합성 재생
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
      // 칩 짤랑이는 금속성 사운드 (Two metallic chip clinks)
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
      // 카드를 스윽 딜링/뒤집는 마찰음
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
      // 승리 팡파레 (경쾌한 4음 아르페지오: C5 -> E5 -> G5 -> C6)
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
    // Non-blocking fallback
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
    { id: 'bot3', name: 'Bot 3', isHuman: false, chips: 1000, hand: [], isFolded: false, seatId: 'seat-bot-3' }
  ],
  pot: 0,
  currentRound: 'preflop', // 'preflop' -> 'flop' -> 'turn' -> 'river' -> 'showdown'
  isBettingInProgress: false
};

// ==========================================================================
// 4. 카드 덱 생성 및 셔플 (Deck & Shuffle)
// ==========================================================================

/**
 * 52장의 트럼프 카드 덱 생성 함수
 * @returns {Array} 52장의 카드 객체 배열
 */
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

/**
 * Fisher-Yates 알고리즘을 사용한 카드 덱 무작위 셔플 함수
 * @param {Array} deck - 셔플할 카드 덱
 * @returns {Array} 섞인 카드 덱
 */
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ==========================================================================
// 5. 프리플롭(Pre-flop) 홀 카드 딜링 시스템
// ==========================================================================

/**
 * 지연 함수 (자연스러운 봇 턴 및 연출용)
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 게임 시작 및 초기 2장 카드 분배 로직
 */
function dealHoleCards() {
  console.log('==============================================');
  console.log('🃏 새 게임 시작 (Round: Pre-flop) - 카드 딜링');
  console.log('==============================================');

  playSound('sound-card');

  // 1. 52장 덱 생성 및 셔플
  const newDeck = createDeck();
  gameState.deck = shuffleDeck(newDeck);
  gameState.pot = 0;
  gameState.communityCards = [];
  gameState.currentRound = 'preflop';
  gameState.isBettingInProgress = false;

  console.log(`[덱 준비] 52장 트럼프 카드 덱 생성 및 셔플 완료! 남은 카드: ${gameState.deck.length}장`);

  // 2. 플레이어 핸드 및 폴드 상태 초기화
  gameState.players.forEach(player => {
    player.hand = [];
    player.isFolded = false;
    // 칩 부족 시 기본 $1,000 충전
    if (player.chips < DEFAULT_BET_AMOUNT) {
      player.chips = 1000;
    }
  });

  // 좌석 UI의 Folded 및 액션 태그 초기화
  document.querySelectorAll('.seat').forEach(seat => {
    seat.classList.remove('folded', 'winner-glow', 'active-turn');
    const existingTag = seat.querySelector('.seat-action-tag');
    if (existingTag) existingTag.remove();
  });

  // 3. 텍사스 홀덤 정통 방식: 각 플레이어에게 1장씩 2회 순환 딜링 (총 2장씩 배분)
  for (let round = 1; round <= 2; round++) {
    for (const player of gameState.players) {
      const card = gameState.deck.pop();
      player.hand.push(card);
    }
  }

  // 4. 딜링 결과 콘솔 로그 출력
  const humanPlayer = gameState.players.find(p => p.isHuman);
  console.log(`[내 패 확인] ${humanPlayer.name}의 홀 카드: [ ${humanPlayer.hand.map(c => c.toString()).join(', ')} ]`);

  gameState.players.filter(p => !p.isHuman).forEach(bot => {
    console.log(`[봇 패 배분] ${bot.name}에게 2장의 카드가 배분되었습니다.`);
  });

  // 5. 화면(DOM) 렌더링 업데이트
  renderTable();
  hideGameModal();
  updateActionButtonsLabel();
}

// ==========================================================================
// 6. 베팅 시스템 (Betting System) & AI 봇 자동 턴 루프
// ==========================================================================

/**
 * 플레이어 개별 베팅 처리 함수
 * @param {string} playerId - 플레이어 ID
 * @param {number} amount - 베팅 금액
 */
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
 * 'CALL(체크/받기)' 버튼 클릭 시 실행되는 핸들러
 */
async function handlePlayerCall() {
  if (gameState.isBettingInProgress) {
    console.log('[Notice] 현재 베팅 턴이 진행 중입니다. 잠시만 기다려 주세요.');
    return;
  }

  if (gameState.currentRound === 'showdown') {
    console.log('[Notice] 게임이 종료되었습니다. Next Hand 버튼을 눌러주세요.');
    return;
  }

  gameState.isBettingInProgress = true;
  disableActionButtons(true);

  // 1. Player 1 베팅 실행 ($50)
  const human = gameState.players.find(p => p.isHuman);
  executeBet(human.id, DEFAULT_BET_AMOUNT);
  playSound('sound-bet');
  console.log(`[내 베팅] ${human.name}이(가) CALL을 선택하여 $${DEFAULT_BET_AMOUNT}을 베팅했습니다! (잔액: $${human.chips.toLocaleString()})`);

  // 2. AI 봇들(Bot 1, 2, 3) 지능형 자동 턴 루프 실행
  await runAIBotBettingLoop();

  // 3. 베팅 한 바퀴 완료 후 현재 라운드에 맞춰 다음 단계 진행!
  await delay(400);

  // 폴드하지 않고 살아남은 플레이어 수 확인
  const activePlayers = gameState.players.filter(p => !p.isFolded);
  if (activePlayers.length <= 1) {
    // 봇들이 모두 폴드하여 나 혼자 남은 경우 즉시 승리!
    console.log('[부전승] 모든 봇이 폴드하여 플레이어가 즉시 승리했습니다!');
    gameState.currentRound = 'showdown';
    await runShowdown();
  } else {
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
async function runAIBotBettingLoop() {
  const bots = gameState.players.filter(p => !p.isHuman);

  console.log(`--- 🤖 AI 봇 의사결정 턴 시작 (Round: ${gameState.currentRound}) ---`);

  for (const bot of bots) {
    // 이미 폴드한 봇은 건너뜀
    if (bot.isFolded) {
      continue;
    }

    await delay(450);

    const seatEl = document.getElementById(bot.seatId);
    if (seatEl) seatEl.classList.add('active-turn');

    // AI 엔진 호출
    const decision = window.AIBotEngine 
      ? window.AIBotEngine.decideBotAction(bot, gameState.communityCards, gameState.currentRound, DEFAULT_BET_AMOUNT)
      : { action: 'call', amount: DEFAULT_BET_AMOUNT, reason: '기본 콜' };

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
      console.log(`[봇 RAISE] ${bot.name}이(가) 판돈을 $${decision.amount}으로 올렸습니다! (${decision.reason})`);
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
 * 봇 좌석 상단에 액션 뱃지(RAISE, CALL, FOLD)를 띄우는 함수
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
// 7. 커뮤니티 카드 오픈 (Flop, Turn, River)
// ==========================================================================

/**
 * 플롭(Flop): 커뮤니티 카드 1, 2, 3번 오픈
 */
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

/**
 * 턴(Turn): 4번째 커뮤니티 카드 1장 오픈
 */
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

/**
 * 리버(River): 5번째 커뮤니티 카드 1장 오픈
 */
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
// 8. 쇼다운 (Showdown) 및 승패 판독/정산 처리
// ==========================================================================

/**
 * 쇼다운: 살아있는 봇들의 카드를 일제히 공개하고 승패 판독 및 점수 정산, 종료 모달 표시
 */
async function runShowdown() {
  console.log('==============================================');
  console.log('🏆 [쇼다운(Showdown)] 봇 패 공개 및 승패 판독');
  console.log('==============================================');

  // 1. 폴드하지 않은 봇들의 손패를 일제히 앞면으로 뒤집어서 렌더링
  revealActiveBotCards();
  playSound('sound-card');

  // 2. 승패 판독 대상 선별 (폴드하지 않고 살아남은 참가자들)
  const activePlayers = gameState.players.filter(p => !p.isFolded);

  if (activePlayers.length === 1) {
    // 나 혼자 남은 경우 (봇들 전원 폴드)
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

  // 3. 2명 이상 생존 시 HandEvaluator 호출
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

  // 4. 점수 정산 로직: 승자에게 TOTAL POT 전액 지급
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

  // 5. 모달창 업데이트 및 오픈 & 승리 팡파레 재생!
  await delay(700);
  playSound('sound-win');
  showWinnerModal(winners, winningHand, totalPot);
}

/**
 * 봇들의 손패(홀 카드)를 앞면으로 공개 (폴드된 봇은 흐린 상태 유지)
 */
function revealActiveBotCards() {
  const bots = gameState.players.filter(p => !p.isHuman);

  bots.forEach(bot => {
    const seatEl = document.getElementById(bot.seatId);
    if (!seatEl || bot.hand.length < 2) return;

    // 폴드하지 않고 끝까지 살아남은 봇만 앞면 공개
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

/**
 * 승자 및 족보 결과 모달 표시
 */
function showWinnerModal(winners, winningHand, wonPot) {
  const modalEl = document.getElementById('game-modal');
  const titleEl = document.getElementById('modal-title');
  const subtitleEl = document.querySelector('.modal-subtitle');
  const potValEl = document.getElementById('modal-pot-val');
  const potLabelEl = document.querySelector('.modal-pot-label');

  const winnerNames = winners.map(w => w.name).join(', ');
  const winTitle = winners.length > 1 ? `${winnerNames} 공동 승리! 🏆` : `${winnerNames} 승리! 🏆`;
  const winSubtitle = `족보: ${winningHand.rankInfo.name} (${winningHand.rankInfo.korean})`;

  if (titleEl) titleEl.textContent = winTitle;
  if (subtitleEl) subtitleEl.textContent = winSubtitle;
  if (potLabelEl) potLabelEl.textContent = 'WINNER POT';
  if (potValEl) potValEl.textContent = `+$${wonPot.toLocaleString()}`;

  if (modalEl) {
    modalEl.classList.remove('hidden');
  }

  console.log(`[정산 완료] ${winTitle} | ${winSubtitle} | 획득 상금: $${wonPot.toLocaleString()}`);
}

/**
 * 게임 종료 모달 숨김
 */
function hideGameModal() {
  const modalEl = document.getElementById('game-modal');
  if (modalEl) {
    modalEl.classList.add('hidden');
  }

  document.querySelectorAll('.seat.winner-glow').forEach(el => {
    el.classList.remove('winner-glow');
  });
}

// ==========================================================================
// 9. DOM 렌더링 도우미 함수
// ==========================================================================

/**
 * 트럼프 카드 앞면 HTML 생성 도우미
 * @param {Object} card - 카드 객체
 * @returns {string} 카드 앞면 HTML 마크업
 */
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

/**
 * 특정 플레이어의 소지금(Chips) DOM 업데이트
 */
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

/**
 * TOTAL POT DOM 업데이트 및 펄스 이펙트
 */
function updatePotDOM() {
  const potEl = document.getElementById('pot-amount');
  const potDisplayEl = document.getElementById('pot-display');

  if (potEl) {
    potEl.textContent = `$${gameState.pot.toLocaleString()}`;
  }

  if (potDisplayEl) {
    potDisplayEl.classList.remove('pot-pulse');
    void potDisplayEl.offsetWidth; // reflow
    potDisplayEl.classList.add('pot-pulse');
  }
}

/**
 * 현재 라운드에 따른 베팅 버튼 서브텍스트 라벨 업데이트
 */
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

/**
 * 베팅 액션 버튼 활성/비활성 제어
 */
function disableActionButtons(disabled) {
  const callBtn = document.getElementById('btn-call');
  const foldBtn = document.getElementById('btn-fold');
  const raiseBtn = document.getElementById('btn-raise');

  [callBtn, foldBtn, raiseBtn].forEach(btn => {
    if (btn) {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.6' : '1';
      btn.style.pointerEvents = disabled ? 'none' : 'auto';
    }
  });
}

/**
 * 테이블 전체 UI 초기화 렌더링
 */
function renderTable() {
  renderPlayerHand();
  renderBotCards();
  resetCommunityCards();
  updatePotDOM();
  gameState.players.forEach(p => updatePlayerChipsDOM(p.id));
}

/**
 * 내 자리(PLAYER 1) 손패 앞면 렌더링
 */
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

/**
 * 봇 3명의 카드는 뒷면으로 유지
 */
function renderBotCards() {
  const bots = [
    { id: 'seat-bot-1', name: 'Bot 1' },
    { id: 'seat-bot-2', name: 'Bot 2' },
    { id: 'seat-bot-3', name: 'Bot 3' }
  ];

  bots.forEach(botInfo => {
    const seatEl = document.getElementById(botInfo.id);
    if (!seatEl) return;

    const botCardsContainer = seatEl.querySelector('.bot-cards');
    if (botCardsContainer) {
      botCardsContainer.innerHTML = `
        <div class="card-facedown card-tilt-left" title="${botInfo.name} Card 1">
          <div class="card-inner-pattern">♠</div>
        </div>
        <div class="card-facedown card-tilt-right" title="${botInfo.name} Card 2">
          <div class="card-inner-pattern">♦</div>
        </div>
      `;
    }
  });
}

/**
 * 커뮤니티 카드 5장 슬롯 초기화 (모두 '?' 덮임)
 */
function resetCommunityCards() {
  const communitySlots = document.querySelectorAll('#community-slots .card-slot');
  communitySlots.forEach((slot) => {
    slot.classList.remove('has-card');
    slot.innerHTML = `<span class="slot-watermark">?</span>`;
  });
}

// ==========================================================================
// 10. 이벤트 바인딩 및 게임 초기화
// ==========================================================================

/**
 * UI 조작 버튼 이벤트 등록
 */
function setupEventListeners() {
  const foldBtn = document.getElementById('btn-fold');
  const callBtn = document.getElementById('btn-call');
  const raiseBtn = document.getElementById('btn-raise');
  const nextHandBtn = document.getElementById('btn-next-hand');

  if (foldBtn) {
    foldBtn.addEventListener('click', () => {
      console.log('[Action] Fold 버튼 클릭: 이번 판을 포기(다이)합니다.');
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
      handlePlayerCall();
    });
  }

  if (raiseBtn) {
    raiseBtn.addEventListener('click', () => {
      console.log('[Action] Raise 버튼 클릭');
      handlePlayerCall();
    });
  }

  if (nextHandBtn) {
    nextHandBtn.addEventListener('click', () => {
      console.log('[Next Hand] 다음 판을 시작합니다.');
      dealHoleCards();
    });
  }
}

/**
 * 게임 초기화 및 첫 게임 시작
 */
function initGame() {
  console.log('텍사스 홀덤 테이블 세팅 완료!');
  setupEventListeners();

  // 첫 라운드 프리플롭 딜링 시작
  dealHoleCards();
}

// DOM 로드 완료 후 게임 초기화 실행
document.addEventListener('DOMContentLoaded', initGame);
