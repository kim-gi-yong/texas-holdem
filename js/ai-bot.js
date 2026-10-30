/**
 * Texas Hold'em Poker - Smart AI Bot Betting Intelligence Engine
 * - 프리플롭 손패 확률(Hand Equity) 및 쓰레기 패(2-7, 3-8 등) 칼폴드 필터링
 * - 포스트플롭 7장 족보 + 아웃츠(Outs: 플러쉬/스트레이트 드로우) 기반 승률 산출
 * - 팟 오즈(Pot Odds = 콜 금액 / (현재 팟 + 콜 금액)) 대비 기대승률(EV) 정밀 비교
 * - 패가 좋거나 팟(TOTAL POT)이 클 때 공격적 레이즈 및 보드 텍스처 기반 전략적 블러핑 수행
 */

// 봇 고유 성향 정의 (5인 봇 개성 및 블러핑/어그레션 가중치)
const BOT_PERSONALITIES = {
  bot1: { name: 'Bot 1', style: 'Aggressive', equityBoost: 0.05, raiseAggression: 0.22, bluffFreq: 0.18 }, // 공격적 배짱파
  bot2: { name: 'Bot 2', style: 'Tight',      equityBoost: -0.04, raiseAggression: -0.05, bluffFreq: 0.05 }, // 신중한 타이트파
  bot3: { name: 'Bot 3', style: 'Loose',      equityBoost: 0.04, raiseAggression: 0.10, bluffFreq: 0.14 }, // 끈질긴 루즈파
  bot4: { name: 'Bot 4', style: 'Maniac',     equityBoost: 0.07, raiseAggression: 0.28, bluffFreq: 0.25 }, // 변칙적 공격/블러핑파
  bot5: { name: 'Bot 5', style: 'Calculated', equityBoost: 0.0,  raiseAggression: 0.08, bluffFreq: 0.10 }  // 수학적 팟오즈 계산파
};

/**
 * 봇의 현재 턴 액션(Raise / Call / Fold)을 결정하는 메인 AI 지능 함수
 * @param {Object} bot - 봇 객체 ({ id, name, chips, hand, isFolded, ... })
 * @param {Array} communityCards - 현재 오픈된 커뮤니티 카드 배열 (0~5장)
 * @param {string} round - 현재 게임 단계 ('preflop', 'flop', 'turn', 'river')
 * @param {number} targetBet - 현재 봇이 콜하기 위해 추가로 내야 하는 금액 (neededForBot)
 * @param {boolean} isPlayerAllIn - 플레이어가 올인했는지 여부
 * @param {number} currentPot - 현재 테이블 중앙의 TOTAL POT 금액
 * @returns {Object} { action: 'raise'|'call'|'fold', amount: number, reason: string }
 */
function decideBotAction(bot, communityCards = [], round = 'preflop', targetBet = 50, isPlayerAllIn = false, currentPot = 100) {
  if (bot.isFolded || !bot.hand || bot.hand.length < 2) {
    return { action: 'fold', amount: 0, reason: '이미 폴드함' };
  }

  const callAmount = Math.min(bot.chips, Math.max(0, targetBet));
  const effectivePot = Math.max(75, currentPot || 75);
  const personality = BOT_PERSONALITIES[bot.id] || BOT_PERSONALITIES.bot5;

  // 1. 팟 오즈(Pot Odds) 계산: 내가 투자해야 할 콜 금액 / (현재 팟 + 콜 금액)
  // 예: 팟이 $200이고 콜 금액이 $50이면 potOdds = 50 / 250 = 0.20 (최소 20% 이상의 승률 필요)
  const potOdds = callAmount > 0 ? callAmount / (effectivePot + callAmount) : 0;

  // 2. 프리플롭 / 포스트플롭 분기
  if (round === 'preflop' || communityCards.length === 0) {
    return decidePreflopSmart(bot, callAmount, effectivePot, potOdds, isPlayerAllIn, personality);
  }

  return decidePostflopSmart(bot, communityCards, round, callAmount, effectivePot, potOdds, isPlayerAllIn, personality);
}

/**
 * 프리플롭(Pre-flop) 손패 2장 정밀 분석 (쓰레기 패 초반 과감한 폴드 & 빅팟/강패 공격적 레이즈)
 */
function decidePreflopSmart(bot, callAmount, effectivePot, potOdds, isPlayerAllIn, personality) {
  const [c1, c2] = bot.hand;
  const highVal = Math.max(c1.value, c2.value);
  const lowVal = Math.min(c1.value, c2.value);
  const isPocketPair = c1.value === c2.value;
  const isSuited = c1.suit.name === c2.suit.name;
  const gap = highVal - lowVal;

  // 프리플롭 손패 승률 기대치(Equity: 0.15 ~ 0.88) 산출
  const preflopEquity = calculatePreflopEquity(highVal, lowVal, isPocketPair, isSuited, gap);
  const adjustedEquity = Math.min(0.95, Math.max(0.05, preflopEquity + personality.equityBoost));

  // 쓰레기 패(Trash Hand) 판별: 2-7, 2-8, 3-8, 2-9, 3-9, 4-9 오프수트 등 연결성 없고 낮은 패
  const isTrashHand = !isPocketPair && (
    (!isSuited && highVal <= 9 && gap >= 3) ||
    (!isSuited && highVal <= 10 && lowVal <= 5 && gap >= 4) ||
    (isSuited && highVal <= 7 && gap >= 3) ||
    preflopEquity < 0.34
  );

  // [조건 1] 올인 또는 거대한 베팅 직면 시 (콜 금액이 내 칩의 35% 이상이거나 $250 이상)
  if (isPlayerAllIn || callAmount >= 250 || callAmount >= bot.chips * 0.35) {
    if ((isPocketPair && highVal >= 11) || (highVal === 14 && lowVal >= 13)) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `프리미엄 핸드(${c1.rank}-${c2.rank}, 승률 ${Math.round(preflopEquity * 100)}%)로 올인 승부 콜!`
      };
    }
    if (isPocketPair && highVal >= 9 && adjustedEquity >= potOdds + 0.12) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `상위 포켓 페어(${c1.rank}-${c2.rank})와 팟 오즈(${Math.round(potOdds * 100)}%)를 계산해 배짱 콜!`
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reason: `거대한 베팅 대비 손패(${c1.rank}-${c2.rank}) 기대승률이 부족해 초반 과감히 폴드`
    };
  }

  // [조건 2] 패가 쓰레기(2-7, 3-8 등)일 때: 내야 할 돈이 1원이라도 있으면 초반에 과감히 칼폴드!
  if (isTrashHand) {
    if (callAmount === 0) {
      // 무료 체크가 가능한 상황에서만 팟이 클 때 간헐적 스틸 블러핑, 아니면 체크
      if (effectivePot >= 150 && Math.random() < personality.bluffFreq * 0.6) {
        const stealRaise = Math.min(bot.chips, Math.max(50, Math.round((effectivePot * 0.5) / 25) * 25));
        return {
          action: 'raise',
          amount: stealRaise,
          reason: `약한 패(${c1.rank}-${c2.rank})지만 팟($${effectivePot}) 스틸을 노린 기습 블러핑 레이즈!`
        };
      }
      return {
        action: 'call',
        amount: 0,
        reason: `쓰레기 패(${c1.rank}-${c2.rank})지만 추가 비용이 $0이므로 무료 체크`
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reason: `하위 쓰레기 패(${c1.rank}-${c2.rank}, 기대치 ${Math.round(preflopEquity * 100)}%)로 칩 손실 방지를 위해 즉시 폴드`
    };
  }

  // [조건 3] 최상위 몬스터/프리미엄 패 (AA, KK, QQ, JJ, TT, AK, AQs, KQs): 공격적 밸류 레이즈!
  if (preflopEquity >= 0.64) {
    const potBasedRaise = Math.max(100, Math.round((effectivePot * (0.65 + personality.raiseAggression)) / 25) * 25);
    const raiseAmt = Math.min(bot.chips, Math.max(callAmount + 50, potBasedRaise));
    return {
      action: 'raise',
      amount: raiseAmt,
      reason: `강력한 프리플롭 핸드(${c1.rank}-${c2.rank}, 승률 ${Math.round(preflopEquity * 100)}%)로 주도권 장악 레이즈!`
    };
  }

  // [조건 4] 준수한 패 (중하위 포켓 페어, 수티드 커넥터, 브로드웨이 카드) + 팟이 클 때 공격적 레이즈
  const isBigPot = effectivePot >= 200;
  if (adjustedEquity >= 0.52 && (isBigPot || Math.random() < 0.35 + personality.raiseAggression)) {
    const raiseAmt = Math.min(bot.chips, Math.max(callAmount + 50, Math.round((effectivePot * 0.55) / 25) * 25));
    return {
      action: 'raise',
      amount: raiseAmt,
      reason: `양호한 손패(${c1.rank}-${c2.rank})와 커진 팟($${effectivePot})을 노려 공격적 레이즈!`
    };
  }

  // [조건 5] 팟 오즈(Pot Odds) 비교: 내 핸드 기대승률이 팟 오즈보다 낮으면 과감히 폴드
  if (callAmount > 0 && adjustedEquity < potOdds * 0.92) {
    // 단, 매니악/어그레시브 성향이 큰 팟을 보고 블러핑 레이즈를 치는 예외 케이스
    if (isBigPot && Math.random() < personality.bluffFreq) {
      const bluffAmt = Math.min(bot.chips, Math.max(callAmount + 50, Math.round((effectivePot * 0.6) / 25) * 25));
      return {
        action: 'raise',
        amount: bluffAmt,
        reason: `팟($${effectivePot})이 커진 틈을 노려 과감한 프리플롭 블러핑 레이즈!`
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reason: `팟 오즈(${Math.round(potOdds * 100)}%) 대비 손패(${c1.rank}-${c2.rank}) 승률이 불리하여 폴드`
    };
  }

  return {
    action: 'call',
    amount: callAmount,
    reason: `팟 오즈(${Math.round(potOdds * 100)}%) 대비 적정 기대승률(${Math.round(preflopEquity * 100)}%)로 플롭 확인 콜`
  };
}

/**
 * 포스트플롭(Flop / Turn / River) 족보 강도 + 드로우 아웃츠(Outs) + 팟 오즈(Pot Odds) 기반 정밀 의사결정
 */
function decidePostflopSmart(bot, communityCards, round, callAmount, effectivePot, potOdds, isPlayerAllIn, personality) {
  const allCards = [...bot.hand, ...communityCards];
  const evalResult = window.HandEvaluator
    ? window.HandEvaluator.evaluate7Cards(allCards)
    : { rankInfo: { rank: 1, korean: '하이 카드' }, score: [1, 10] };

  const handRank = evalResult ? evalResult.rankInfo.rank : 1;
  const rankName = evalResult ? evalResult.rankInfo.korean : '하이 카드';

  // 커뮤니티 카드 자체의 족보와 내 손패가 포함된 7장 족보를 비교하여 '내 손패 기여도' 파악
  const boardEval = (window.HandEvaluator && communityCards.length >= 3)
    ? window.HandEvaluator.evaluate7Cards(communityCards)
    : { rankInfo: { rank: 1 }, score: [1, 0] };
  const boardRank = boardEval ? boardEval.rankInfo.rank : 1;

  // 드로우 아웃츠(Outs: 플러쉬 드로우 9아웃츠, 양차 스트레이트 8아웃츠, 구멍차 4아웃츠 등) 계산
  const drawInfo = analyzeDrawsAndOuts(bot.hand, communityCards, round);

  // 종합 포스트플롭 승률(Equity: 0.05 ~ 0.98) 계산
  const postflopEquity = calculatePostflopEquity(bot.hand, communityCards, evalResult, boardRank, drawInfo, round);
  const adjustedEquity = Math.min(0.98, Math.max(0.04, postflopEquity + personality.equityBoost));
  const isBigPot = effectivePot >= 250;

  // [조건 1] 올인 또는 거대한 베팅 직면 시 (Pot Odds vs Hand Equity 정밀 대조)
  if (isPlayerAllIn || callAmount >= 250 || callAmount >= bot.chips * 0.4) {
    // 트리플(4) 이상이거나, 팟 오즈를 상회하는 강력한 투페어/강한 드로우
    if (handRank >= 4 || (handRank === 3 && adjustedEquity >= potOdds)) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `강력한 메이드 족보 [${rankName}] (승률 ${Math.round(postflopEquity * 100)}%)로 올인 승부 콜!`
      };
    }
    if (handRank === 2 && adjustedEquity >= potOdds + 0.08 && !isPlayerAllIn) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `상위 페어 [${rankName}]와 팟 오즈(${Math.round(potOdds * 100)}%) 계산 끝에 콜!`
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reason: `거대한 베팅(팟 오즈 ${Math.round(potOdds * 100)}%) 대비 [${rankName}] 승률(${Math.round(postflopEquity * 100)}%)이 낮아 과감히 폴드`
    };
  }

  // [조건 2] 투 페어 이상 강력한 메이드 핸드 (rank >= 3): 공격적 밸류 레이즈!
  if (handRank >= 3 && handRank > boardRank) {
    const raiseMultiplier = handRank >= 5 ? 0.85 : 0.65;
    const targetRaiseAdd = Math.max(50, Math.round((effectivePot * raiseMultiplier) / 25) * 25);
    const raiseAmt = Math.min(bot.chips, callAmount + targetRaiseAdd);

    if (Math.random() < 0.82 + personality.raiseAggression) {
      return {
        action: 'raise',
        amount: raiseAmt,
        reason: `강력한 족보 [${rankName}] 완성! 팟($${effectivePot})을 키우기 위해 공격적 레이즈!`
      };
    }
    return {
      action: 'call',
      amount: callAmount,
      reason: `강력한 족보 [${rankName}] 보유, 상대를 끌어들이는 트랩 콜/체크`
    };
  }

  // [조건 3] 원 페어 (rank === 2): 탑 페어/오버 페어 여부 및 팟 오즈 분석
  if (handRank === 2) {
    const pairVal = evalResult.score[1] || 0;
    const boardMaxVal = Math.max(...communityCards.map(c => c.value));
    const isTopOrOverPair = pairVal >= boardMaxVal && (bot.hand[0].value === pairVal || bot.hand[1].value === pairVal);

    if (isTopOrOverPair) {
      // 탑페어/오버페어 + 팟이 크거나 공격적 성향이면 밸류 레이즈
      if (isBigPot || Math.random() < 0.50 + personality.raiseAggression) {
        const raiseAmt = Math.min(bot.chips, callAmount + Math.max(50, Math.round((effectivePot * 0.55) / 25) * 25));
        return {
          action: 'raise',
          amount: raiseAmt,
          reason: `탑/오버 페어 [${rankName}] (승률 ${Math.round(postflopEquity * 100)}%)로 주도권 레이즈!`
        };
      }
      return {
        action: 'call',
        amount: callAmount,
        reason: `최상위 원 페어 [${rankName}]로 안정적 콜/체크`
      };
    }

    // 하위/중위 원 페어: 콜 금액이 0원이면 체크, 베팅이 들어왔으면 팟 오즈와 대조
    if (callAmount === 0) {
      if (isBigPot && Math.random() < personality.bluffFreq) {
        const probeBet = Math.min(bot.chips, Math.max(50, Math.round((effectivePot * 0.45) / 25) * 25));
        return {
          action: 'raise',
          amount: probeBet,
          reason: `팟($${effectivePot})이 커진 상황에서 [${rankName}]로 견제성 레이즈!`
        };
      }
      return { action: 'call', amount: 0, reason: `[${rankName}] 보유, 무료 체크로 다음 카드 확인` };
    }

    // 팟 오즈보다 기대승률이 떨어지거나 리버에서 무거운 베팅을 맞으면 폴드
    if (adjustedEquity < potOdds || (round === 'river' && callAmount >= effectivePot * 0.35)) {
      return {
        action: 'fold',
        amount: 0,
        reason: `낮은 원 페어 [${rankName}]로는 팟 오즈(${Math.round(potOdds * 100)}%)가 안 나와 폴드`
      };
    }

    return {
      action: 'call',
      amount: callAmount,
      reason: `원 페어 [${rankName}]와 드로우 아웃츠(${drawInfo.outs}장)를 계산해 팟 오즈 콜`
    };
  }

  // [조건 4] 하이 카드 (노메이드, rank === 1): 세미 블러핑, 순수 블러핑, 팟 오즈 드로우 콜, 또는 칼폴드
  // 4-1) 강한 드로우(플러쉬 드로우 / 양차 스트레이트 드로우: outs >= 8) 보유 시 세미 블러핑 또는 팟 오즈 콜
  if (drawInfo.outs >= 8 && round !== 'river') {
    if ((isBigPot || callAmount === 0) && Math.random() < 0.38 + personality.bluffFreq) {
      const semiBluffAmt = Math.min(bot.chips, callAmount + Math.max(50, Math.round((effectivePot * 0.55) / 25) * 25));
      return {
        action: 'raise',
        amount: semiBluffAmt,
        reason: `강력한 ${drawInfo.description}(아웃츠 ${drawInfo.outs}장, 승률 ${Math.round(drawInfo.drawEquity * 100)}%)를 믿고 공격적 세미 블러핑 레이즈!`
      };
    }
    if (adjustedEquity >= potOdds * 0.85) {
      return {
        action: 'call',
        amount: callAmount,
        reason: `${drawInfo.description}(아웃츠 ${drawInfo.outs}장) 확률이 팟 오즈(${Math.round(potOdds * 100)}%)보다 높아 콜!`
      };
    }
  }

  // 4-2) 팟에 돈이 많을 때(Big Pot) 또는 보드에 A/K 같은 위협적인 카드가 깔렸을 때 전략적 블러핑 레이즈!
  const hasScareBoard = communityCards.some(c => c.value >= 13) || boardRank >= 2;
  if (hasScareBoard && (isBigPot || callAmount <= 50) && Math.random() < personality.bluffFreq) {
    const bluffRaiseAmt = Math.min(bot.chips, callAmount + Math.max(75, Math.round((effectivePot * 0.6) / 25) * 25));
    return {
      action: 'raise',
      amount: bluffRaiseAmt,
      reason: `패는 하이 카드지만 커진 팟($${effectivePot})과 보드 위협 카드를 이용한 과감한 블러핑 레이즈!`
    };
  }

  // 4-3) 콜 금액이 0원(체크 가능)일 때는 공짜로 다음 카드를 봄
  if (callAmount === 0) {
    return {
      action: 'call',
      amount: 0,
      reason: `메이드 전이지만 추가 베팅액이 $0이므로 무료 체크(Check)`
    };
  }

  // 4-4) 그 외 가망 없는 하이 카드(쓰레기 패)는 돈을 내야 할 때 미련 없이 칼폴드!
  return {
    action: 'fold',
    amount: 0,
    reason: `노메이드 하이 카드(승률 ${Math.round(postflopEquity * 100)}% < 팟 오즈 ${Math.round(potOdds * 100)}%)로 즉시 폴드`
  };
}

/**
 * 프리플롭 2장 손패의 기초 승률(0.18 ~ 0.86) 계산
 */
function calculatePreflopEquity(highVal, lowVal, isPocketPair, isSuited, gap) {
  if (isPocketPair) {
    // 22(0.50) ~ AA(0.85)
    return 0.48 + ((highVal - 2) / 12) * 0.37;
  }

  let score = (highVal * 1.4 + lowVal * 0.8) / 31; // 기본 0.19 ~ 0.95 범위 정규화
  let equity = 0.20 + score * 0.38;

  if (isSuited) equity += 0.06;
  if (gap === 1) equity += 0.05;
  else if (gap === 2) equity += 0.025;
  else if (gap >= 4) equity -= 0.07;

  if (highVal === 14 && lowVal >= 10) equity += 0.08;
  if (highVal <= 8 && lowVal <= 4 && !isSuited) equity -= 0.08; // 2-7, 2-8, 3-8 등 최하위 패 페널티

  return Math.min(0.78, Math.max(0.16, equity));
}

/**
 * 포스트플롭 플러쉬/스트레이트/오버카드 드로우 아웃츠(Outs) 및 2-4 법칙 확률 계산
 */
function analyzeDrawsAndOuts(holeCards, communityCards, round) {
  const allCards = [...holeCards, ...communityCards];
  let outs = 0;
  const descriptions = [];

  // 1) 플러쉬 드로우 검사 (같은 문양 4장 = 남은 9장 아웃츠)
  const suitCounts = {};
  for (const c of allCards) {
    suitCounts[c.suit.name] = (suitCounts[c.suit.name] || 0) + 1;
  }
  const hasFlushDraw = Object.values(suitCounts).some(cnt => cnt === 4);
  if (hasFlushDraw) {
    outs += 9;
    descriptions.push('플러쉬 드로우');
  }

  // 2) 스트레이트 드로우 검사 (양차 8아웃츠 / 구멍차 4아웃츠)
  const uniqueVals = Array.from(new Set(allCards.map(c => c.value))).sort((a, b) => a - b);
  if (uniqueVals.includes(14)) uniqueVals.unshift(1); // A-2-3-4 백도어/휠 고려

  let maxFourSpanGap = 99;
  for (let i = 0; i <= uniqueVals.length - 4; i++) {
    const span = uniqueVals[i + 3] - uniqueVals[i];
    if (span < maxFourSpanGap) maxFourSpanGap = span;
  }

  if (maxFourSpanGap === 3) {
    outs += 8;
    descriptions.push('양차 스트레이트 드로우');
  } else if (maxFourSpanGap === 4) {
    outs += 4;
    descriptions.push('스트레이트 구멍차 드로우');
  }

  // 3) 보드 최고 숫자보다 높은 내 손패 오버카드 아웃츠
  const boardMax = communityCards.length > 0 ? Math.max(...communityCards.map(c => c.value)) : 0;
  const overcards = holeCards.filter(c => c.value > boardMax).length;
  if (overcards > 0 && outs < 8) {
    outs += overcards * 2;
  }

  // 홀덤 Rule of 2 and 4: 플롭에서는 아웃츠 * 4%, 턴에서는 아웃츠 * 2%
  const multiplier = round === 'flop' ? 0.04 : round === 'turn' ? 0.02 : 0;
  const drawEquity = Math.min(0.60, outs * multiplier);

  return {
    outs,
    drawEquity,
    description: descriptions.join(' + ') || '오버카드 드로우'
  };
}

/**
 * 포스트플롭 현재 완성된 족보 + 드로우 확률을 합산한 최종 기대승률(Equity) 산출
 */
function calculatePostflopEquity(holeCards, communityCards, evalResult, boardRank, drawInfo, round) {
  const handRank = evalResult ? evalResult.rankInfo.rank : 1;
  const primaryScore = (evalResult && evalResult.score && evalResult.score[1]) || 8;

  // 보드 자체에만 메이드된 족보이고 내 패가 전혀 기여하지 못한 경우
  const onlyOnBoard = handRank === boardRank && handRank >= 2 &&
    !holeCards.some(hc => communityCards.some(bc => bc.value === hc.value));

  let baseEquity = 0.15;
  if (handRank >= 7) baseEquity = 0.96;      // 풀하우스, 포카드, 스트레이트 플러쉬
  else if (handRank === 6) baseEquity = 0.90; // 플러쉬
  else if (handRank === 5) baseEquity = 0.85; // 스트레이트
  else if (handRank === 4) baseEquity = 0.78; // 트리플
  else if (handRank === 3) baseEquity = onlyOnBoard ? 0.30 : 0.70; // 투 페어
  else if (handRank === 2) {
    if (onlyOnBoard) {
      baseEquity = 0.22;
    } else {
      const boardMax = Math.max(...communityCards.map(c => c.value));
      baseEquity = primaryScore >= boardMax ? 0.58 : 0.38;
    }
  } else {
    // 하이 카드
    baseEquity = 0.12 + (Math.max(holeCards[0].value, holeCards[1].value) / 14) * 0.10;
  }

  // 플롭/턴에서는 드로우 성사 확률을 가산
  if (round !== 'river' && handRank <= 2) {
    baseEquity = Math.min(0.82, baseEquity + drawInfo.drawEquity * 0.85);
  }

  return baseEquity;
}

// 전역 등록
window.AIBotEngine = {
  decideBotAction
};
