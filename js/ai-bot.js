/**
 * Texas Hold'em Poker - AI Bot Betting Intelligence Engine
 * 봇들이 자신의 손패 2장과 바닥의 커뮤니티 카드를 분석하여 Raise, Call, Fold를 지능적으로 결정
 * 플레이어의 거대한 레이즈 및 올인(ALL-IN)에 맞선 심리전/눈치싸움 로직 탑재
 */

// 봇 고유 성향 정의 (5인 봇 개성 설정)
const BOT_PERSONALITIES = {
  bot1: { name: 'Bot 1', style: 'Aggressive', raiseChanceBoost: 0.15, foldChanceBoost: -0.1 }, // 공격적 배짱파
  bot2: { name: 'Bot 2', style: 'Tight', raiseChanceBoost: -0.08, foldChanceBoost: 0.2 },      // 신중한 타이트파
  bot3: { name: 'Bot 3', style: 'Loose', raiseChanceBoost: 0.05, foldChanceBoost: -0.15 },    // 끈질긴 루즈파
  bot4: { name: 'Bot 4', style: 'Maniac', raiseChanceBoost: 0.20, foldChanceBoost: -0.20 },    // 변칙적 올인/블러핑파
  bot5: { name: 'Bot 5', style: 'Calculated', raiseChanceBoost: 0.0, foldChanceBoost: 0.05 }   // 수학적 확률 계산파
};

/**
 * 봇의 현재 턴 액션(Raise / Call / Fold)을 계산하는 메인 AI 지능 함수
 * @param {Object} bot - 봇 객체 ({ id, name, chips, hand, isFolded, ... })
 * @param {Array} communityCards - 현재 오픈된 커뮤니티 카드 배열 (0~5장)
 * @param {string} round - 현재 게임 단계 ('preflop', 'flop', 'turn', 'river')
 * @param {number} targetBet - 맞춰야 할 베팅 금액
 * @param {boolean} isPlayerAllIn - 플레이어가 올인했는지 여부
 * @returns {Object} { action: 'raise'|'call'|'fold', amount: number, reason: string }
 */
function decideBotAction(bot, communityCards, round, targetBet = 50, isPlayerAllIn = false) {
  // 이미 폴드한 상태인 경우
  if (bot.isFolded) {
    return { action: 'fold', amount: 0, reason: '이미 폴드함' };
  }

  const callAmount = Math.min(bot.chips, targetBet);
  const personality = BOT_PERSONALITIES[bot.id] || { raiseChanceBoost: 0, foldChanceBoost: 0 };

  // =========================================================================
  // 0. 올인(ALL-IN) 또는 거대한 레이즈 직면 시 눈치싸움 (Huge Bet / All-in Reaction)
  // =========================================================================
  if (isPlayerAllIn || targetBet >= 250 || targetBet >= bot.chips * 0.4) {
    return evaluateFacingHugeBet(bot, communityCards, round, callAmount, isPlayerAllIn, personality);
  }

  // 칩이 부족한 경우 남은 전액 올인 콜
  if (bot.chips <= targetBet) {
    return { action: 'call', amount: bot.chips, reason: '남은 칩 올인 콜' };
  }

  // =========================================================================
  // 1. 프리플롭 (Pre-flop: 손패 2장만 있는 상태) AI 의사결정
  // =========================================================================
  if (round === 'preflop' || communityCards.length === 0) {
    return evaluatePreflop(bot, targetBet, personality);
  }

  // =========================================================================
  // 2. 포스트플롭 (Post-flop: 플롭, 턴, 리버 - 커뮤니티 카드 3~5장 결합) AI 의사결정
  // =========================================================================
  return evaluatePostflop(bot, communityCards, round, targetBet, personality);
}

/**
 * 플레이어의 거대한 레이즈 또는 올인(ALL-IN) 직면 시 봇의 눈치싸움 로직
 */
function evaluateFacingHugeBet(bot, communityCards, round, callAmount, isAllIn, personality) {
  // 프리플롭인 경우 (커뮤니티 카드가 없음)
  if (round === 'preflop' || communityCards.length === 0) {
    const [c1, c2] = bot.hand;
    const isPocketPair = c1.value === c2.value;
    const highVal = Math.max(c1.value, c2.value);

    // 프리미엄 몬스터 핸드 (AA, KK, QQ, AKs) -> 목숨 걸고 올인 콜!
    if ((isPocketPair && highVal >= 12) || (highVal === 14 && Math.min(c1.value, c2.value) === 13)) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `몬스터 패(${c1.rank}-${c2.rank})로 목숨 걸고 올인 콜!`
      };
    }

    // JJ, 10-10, AQ -> 공격적 봇은 가끔 배짱 콜, 그 외는 압도되어 폴드
    if (isPocketPair && highVal >= 10) {
      if (Math.random() < 0.4 + personality.raiseChanceBoost) {
        return { action: 'call', amount: callAmount, reason: `포켓 페어로 배짱 있게 올인 콜` };
      }
    }

    // 그 외는 거대한 올인에 겁을 먹고 폴드!
    return {
      action: 'fold',
      amount: 0,
      reason: `플레이어의 거대한 올인 액수에 겁을 먹고 카드를 접었습니다(Fold).`
    };
  }

  // 포스트플롭인 경우 (7장 족보 계산)
  const allCards = [...bot.hand, ...communityCards];
  const evalResult = window.HandEvaluator.evaluate7Cards(allCards);
  const handRank = evalResult ? evalResult.rankInfo.rank : 1;
  const rankName = evalResult ? evalResult.rankInfo.korean : '하이 카드';

  // 1) 강력한 족보 (트리플, 스트레이트, 플러쉬, 풀하우스 이상: rank >= 4)
  if (handRank >= 4) {
    return {
      action: 'call',
      amount: callAmount,
      reason: `강력한 족보 [${rankName}]로 승리를 확신하고 목숨 걸고 올인 콜!`
    };
  }

  // 2) 투 페어 (rank === 3)
  if (handRank === 3) {
    const callChance = 0.45 + personality.raiseChanceBoost;
    if (Math.random() < callChance) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `투 페어 [${rankName}]로 올인 승부에 도전(Call)`
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reason: `투 페어지만 올인 판돈이 너무 위험하여 신중히 폴드`
    };
  }

  // 3) 원 페어 (rank === 2)
  if (handRank === 2) {
    const callChance = 0.12 + personality.raiseChanceBoost;
    if (Math.random() < callChance) {
      return { action: 'call', amount: callAmount, reason: `높은 원 페어로 기적을 바라며 무모한 콜` };
    }
    return {
      action: 'fold',
      amount: 0,
      reason: `플레이어의 거대한 베팅에 원 페어로는 버틸 수 없어 포기(Fold)`
    };
  }

  // 4) 하이 카드 (rank === 1)
  return {
    action: 'fold',
    amount: 0,
    reason: `노메이드 하이 카드로 올인에 상대가 안 되어 즉시 폴드`
  };
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
  const effectiveBase = Math.max(50, baseBet);

  // 1) 최상위 및 중상위 메이드 족보 (투 페어 이상: rank >= 3)
  if (handRank >= 3) {
    const raiseAmount = Math.min(bot.chips, effectiveBase * 2);
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
      reason: `강력한 족보 [${rankName}] 보유, 슬로우 플레이 콜/체크`
    };
  }

  // 2) 원 페어 (rank === 2)
  if (handRank === 2) {
    const topPairVal = evalResult.score[1] || 0;
    if (topPairVal >= 11) {
      if (Math.random() < 0.45 + personality.raiseChanceBoost) {
        return { action: 'raise', amount: Math.min(bot.chips, effectiveBase * 2), reason: `높은 원 페어(${topPairVal} 페어)로 공격적 레이즈` };
      }
      return { action: 'call', amount: baseBet, reason: `탑 페어로 안정적 콜/체크` };
    }

    if (round === 'river' && baseBet > 0) {
      if (Math.random() < 0.35 + personality.foldChanceBoost) {
        return { action: 'fold', amount: 0, reason: `낮은 원 페어로 리버 베팅에 부담을 느껴 폴드` };
      }
    }
    return { action: 'call', amount: baseBet, reason: `원 페어(${rankName})로 쇼다운 기대 콜/체크` };
  }

  // 콜 금액이 0원(체크 가능)일 때는 하이 카드라도 포기하지 않고 무조건 무료 체크(Check)
  if (baseBet === 0) {
    return { action: 'call', amount: 0, reason: `추가 베팅액이 0원이므로 무료 체크(Check)` };
  }

  // 3) 노메이드 하이 카드 (rank === 1)
  if (round === 'river') {
    const foldChance = 0.8 + personality.foldChanceBoost;
    if (Math.random() < foldChance) {
      return { action: 'fold', amount: 0, reason: `리버까지 족보 미완성(하이 카드)으로 포기(Fold)` };
    }
    return { action: 'call', amount: baseBet, reason: `하이 카드 블러핑 또는 미련 콜` };
  }

  // 플롭 or 턴인 경우: 드로우 검사
  const hasDraw = checkPossibleDraw(allCards);
  if (hasDraw) {
    return { action: 'call', amount: baseBet, reason: `족보 발전 가능성(드로우)을 보고 콜` };
  }

  const foldChance = 0.55 + personality.foldChanceBoost;
  if (Math.random() < foldChance) {
    return { action: 'fold', amount: 0, reason: `가망 없는 하이 카드로 칩을 아끼기 위해 폴드` };
  }

  return { action: 'call', amount: baseBet, reason: `턴/리버 카드 확인을 위한 최소 베팅 콜` };
}

/**
 * 플러쉬 드로우 또는 스트레이트 드로우 여부 검사
 */
function checkPossibleDraw(cards) {
  const suitCounts = {};
  for (const c of cards) {
    suitCounts[c.suit.name] = (suitCounts[c.suit.name] || 0) + 1;
    if (suitCounts[c.suit.name] >= 4) return true;
  }

  const uniqueVals = Array.from(new Set(cards.map(c => c.value))).sort((a, b) => a - b);
  for (let i = 0; i <= uniqueVals.length - 4; i++) {
    if (uniqueVals[i + 3] - uniqueVals[i] <= 4) {
      return true;
    }
  }

  return false;
}

// 전역 등록
window.AIBotEngine = {
  decideBotAction
};
