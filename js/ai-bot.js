/**
 * Texas Hold'em Poker - AI Bot Betting Intelligence Engine
 * 봇들이 자신의 손패 2장과 바닥의 커뮤니티 카드를 분석하여 Raise, Call, Fold를 지능적으로 결정
 */

// 봇 고유 성향 정의
const BOT_PERSONALITIES = {
  bot1: { name: 'Bot 1', style: 'Aggressive', raiseChanceBoost: 0.15, foldChanceBoost: -0.1 }, // 공격적
  bot2: { name: 'Bot 2', style: 'Tight', raiseChanceBoost: -0.05, foldChanceBoost: 0.15 },    // 신중/타이트
  bot3: { name: 'Bot 3', style: 'Loose', raiseChanceBoost: 0.05, foldChanceBoost: -0.15 }     // 루즈/콜러
};

/**
 * 봇의 현재 턴 액션(Raise / Call / Fold)을 계산하는 메인 AI 지능 함수
 * @param {Object} bot - 봇 객체 ({ id, name, chips, hand, isFolded, ... })
 * @param {Array} communityCards - 현재 오픈된 커뮤니티 카드 배열 (0~5장)
 * @param {string} round - 현재 게임 단계 ('preflop', 'flop', 'turn', 'river')
 * @param {number} baseBet - 기준 콜 금액 ($50)
 * @returns {Object} { action: 'raise'|'call'|'fold', amount: number, reason: string }
 */
function decideBotAction(bot, communityCards, round, baseBet = 50) {
  // 이미 폴드한 상태인 경우
  if (bot.isFolded) {
    return { action: 'fold', amount: 0, reason: '이미 폴드함' };
  }

  // 칩이 부족한 경우 남은 전액 올인 처리
  if (bot.chips <= baseBet) {
    return { action: 'call', amount: bot.chips, reason: '남은 칩 올인 콜' };
  }

  const personality = BOT_PERSONALITIES[bot.id] || { raiseChanceBoost: 0, foldChanceBoost: 0 };

  // =========================================================================
  // 1. 프리플롭 (Pre-flop: 손패 2장만 있는 상태) AI 의사결정
  // =========================================================================
  if (round === 'preflop' || communityCards.length === 0) {
    return evaluatePreflop(bot, baseBet, personality);
  }

  // =========================================================================
  // 2. 포스트플롭 (Post-flop: 플롭, 턴, 리버 - 커뮤니티 카드 3~5장 결합) AI 의사결정
  // =========================================================================
  return evaluatePostflop(bot, communityCards, round, baseBet, personality);
}

/**
 * 프리플롭 손패 2장 강도 분석
 */
function evaluatePreflop(bot, baseBet, personality) {
  const [c1, c2] = bot.hand;
  const isPocketPair = c1.value === c2.value;
  const isSuited = c1.suit.name === c2.suit.name;
  const isConnected = Math.abs(c1.value - c2.value) === 1;
  const highVal = Math.max(c1.value, c2.value);
  const lowVal = Math.min(c1.value, c2.value);

  // 1) 프리미엄 포켓 페어 (10-10, JJ, QQ, KK, AA)
  if (isPocketPair && highVal >= 10) {
    const raiseAmount = Math.min(bot.chips, baseBet * 2);
    return {
      action: 'raise',
      amount: raiseAmount,
      reason: `프리미엄 포켓 페어(${c1.rank}-${c2.rank})로 강력 레이즈!`
    };
  }

  // 2) 중하위 포켓 페어 (2-2 ~ 9-9)
  if (isPocketPair) {
    // 공격적 성향이면 가끔 레이즈
    if (Math.random() < 0.35 + personality.raiseChanceBoost) {
      return { action: 'raise', amount: baseBet * 2, reason: `포켓 페어(${c1.rank}-${c2.rank}) 레이즈` };
    }
    return { action: 'call', amount: baseBet, reason: `포켓 페어(${c1.rank}-${c2.rank}) 셋 노림 콜` };
  }

  // 3) 강력한 하이 카드 (A-K, A-Q, K-Q, A-J)
  if (highVal === 14 && lowVal >= 10) {
    if (Math.random() < 0.6 + personality.raiseChanceBoost) {
      return { action: 'raise', amount: baseBet * 2, reason: `빅 브로드웨이 핸드(${c1.rank}-${c2.rank}) 레이즈` };
    }
    return { action: 'call', amount: baseBet, reason: `빅 브로드웨이 핸드(${c1.rank}-${c2.rank}) 콜` };
  }

  // 4) 수티드/커넥터 (A-x 수티드, K-J, 10-J, 9-10 등)
  if (isSuited || (isConnected && lowVal >= 7)) {
    return { action: 'call', amount: baseBet, reason: `발전 가능성 있는 핸드(${c1.rank}-${c2.rank}) 콜` };
  }

  // 5) 약한 비연계 잡패 (2-7, 3-8, 4-9 등)
  if (highVal < 9 && !isSuited) {
    const foldChance = 0.55 + personality.foldChanceBoost;
    if (Math.random() < foldChance) {
      return { action: 'fold', amount: 0, reason: `약한 손패(${c1.rank}-${c2.rank})로 무리하지 않고 폴드` };
    }
    return { action: 'call', amount: baseBet, reason: `블러핑 시도 또는 운 시험 콜` };
  }

  // 기본은 콜
  return { action: 'call', amount: baseBet, reason: `보통 손패(${c1.rank}-${c2.rank})로 관망 콜` };
}

/**
 * 포스트플롭(Flop / Turn / River) 7장 족보 기반 AI 의사결정
 */
function evaluatePostflop(bot, communityCards, round, baseBet, personality) {
  const allCards = [...bot.hand, ...communityCards];
  const evalResult = window.HandEvaluator.evaluate7Cards(allCards);
  const handRank = evalResult ? evalResult.rankInfo.rank : 1;
  const rankName = evalResult ? evalResult.rankInfo.korean : '하이 카드';

  // 1) 최상위 및 중상위 메이드 족보 (투 페어, 트리플, 스트레이트, 플러쉬, 풀하우스, 포카드 이상: rank >= 3)
  if (handRank >= 3) {
    const raiseAmount = Math.min(bot.chips, baseBet * 2);
    // 80% 확률로 판돈 올리기 (Raise), 20%는 슬로우 플레이 (Call)
    if (Math.random() < 0.8 + personality.raiseChanceBoost) {
      return {
        action: 'raise',
        amount: raiseAmount,
        reason: `강력한 족보 [${rankName}] 완성! 적극적 레이즈(+$${raiseAmount})`
      };
    }
    return {
      action: 'call',
      amount: baseBet,
      reason: `강력한 족보 [${rankName}] 보유, 덫을 놓는 슬로우 콜`
    };
  }

  // 2) 원 페어 (rank === 2)
  if (handRank === 2) {
    // 탑 페어 이상(J, Q, K, A 페어)인 경우
    const topPairVal = evalResult.score[1] || 0;
    if (topPairVal >= 11) {
      if (Math.random() < 0.45 + personality.raiseChanceBoost) {
        return { action: 'raise', amount: baseBet * 2, reason: `높은 원 페어(${topPairVal} 페어)로 공격적 레이즈` };
      }
      return { action: 'call', amount: baseBet, reason: `탑 페어로 안정적 콜` };
    }

    // 낮은 원 페어
    if (round === 'river') {
      // 리버에서 너무 낮은 페어는 신중하게 대처
      if (Math.random() < 0.3 + personality.foldChanceBoost) {
        return { action: 'fold', amount: 0, reason: `낮은 원 페어로 리버 베팅에 부담을 느껴 폴드` };
      }
    }
    return { action: 'call', amount: baseBet, reason: `원 페어(${rankName})로 쇼다운 기대 콜` };
  }

  // 3) 노메이드 하이 카드 (rank === 1)
  // 리버(마지막) 단계에서 여전히 아무것도 안 맞은 경우 -> 대다수 폴드
  if (round === 'river') {
    const foldChance = 0.75 + personality.foldChanceBoost;
    if (Math.random() < foldChance) {
      return { action: 'fold', amount: 0, reason: `리버까지 족보 미완성(하이 카드)으로 포기(Fold)` };
    }
    return { action: 'call', amount: baseBet, reason: `하이 카드 블러핑 또는 미련 콜` };
  }

  // 플롭 or 턴인 경우: 드로우(플러쉬/스트레이트 가능성) 분석
  const hasDraw = checkPossibleDraw(allCards);
  if (hasDraw) {
    return { action: 'call', amount: baseBet, reason: `족보 발전 가능성(드로우)을 보고 콜` };
  }

  // 발전 가능성도 없고 낮은 하이 카드인 경우
  const foldChance = 0.5 + personality.foldChanceBoost;
  if (Math.random() < foldChance) {
    return { action: 'fold', amount: 0, reason: `가망 없는 하이 카드로 칩을 아끼기 위해 폴드` };
  }

  return { action: 'call', amount: baseBet, reason: `턴/리버 카드 확인을 위한 최소 베팅 콜` };
}

/**
 * 플러쉬 드로우(4장 같은 무늬) 또는 스트레이트 드로우(4장 연속 숫자)가 있는지 검사
 */
function checkPossibleDraw(cards) {
  // 1) 플러쉬 드로우 체크
  const suitCounts = {};
  for (const c of cards) {
    suitCounts[c.suit.name] = (suitCounts[c.suit.name] || 0) + 1;
    if (suitCounts[c.suit.name] >= 4) return true; // 플러쉬 드로우!
  }

  // 2) 스트레이트 드로우 체크
  const uniqueVals = Array.from(new Set(cards.map(c => c.value))).sort((a, b) => a - b);
  for (let i = 0; i <= uniqueVals.length - 4; i++) {
    if (uniqueVals[i + 3] - uniqueVals[i] <= 4) {
      return true; // 오픈엔디드 or 것샷 드로우
    }
  }

  return false;
}

// 전역 등록
window.AIBotEngine = {
  decideBotAction
};
