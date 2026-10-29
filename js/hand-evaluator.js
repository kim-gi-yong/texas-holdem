/**
 * Texas Hold'em Poker - Hand Evaluator Engine
 * 7장의 카드(손패 2장 + 커뮤니티 5장) 중 최상의 5장 조합을 찾아 10단계 족보 판정 및 승자 결정
 */

// 족보 등급 상수 (1 ~ 10)
const HAND_RANKS = {
  HIGH_CARD: { rank: 1, name: 'High Card', korean: '하이 카드' },
  ONE_PAIR: { rank: 2, name: 'One Pair', korean: '원 페어' },
  TWO_PAIR: { rank: 3, name: 'Two Pair', korean: '투 페어' },
  THREE_OF_A_KIND: { rank: 4, name: 'Three of a Kind', korean: '트리플' },
  STRAIGHT: { rank: 5, name: 'Straight', korean: '스트레이트' },
  FLUSH: { rank: 6, name: 'Flush', korean: '플러쉬' },
  FULL_HOUSE: { rank: 7, name: 'Full House', korean: '풀 하우스' },
  FOUR_OF_A_KIND: { rank: 8, name: 'Four of a Kind', korean: '포카드' },
  STRAIGHT_FLUSH: { rank: 9, name: 'Straight Flush', korean: '스트레이트 플러쉬' },
  ROYAL_FLUSH: { rank: 10, name: 'Royal Flush', korean: '로열 스트레이트 플러쉬' }
};

/**
 * 7장에서 5장을 뽑는 조합(Combination, 7C5 = 21) 생성 함수
 */
function getCombinations(array, k = 5) {
  const result = [];

  function backtrack(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * 5장의 카드를 평가하여 족보 및 점수 벡터를 반환하는 함수
 * @param {Array} cards - 5장의 카드 객체 배열 [{ suit, rank, value }, ...]
 * @returns {Object} 족보 평가 객체
 */
function evaluate5Cards(cards) {
  // 1. 카드 숫자(value) 기준 내림차순 정렬
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit.name);

  // 2. 플러쉬(Flush) 판정: 5장 모두 같은 문양
  const isFlush = suits.every(s => s === suits[0]);

  // 3. 스트레이트(Straight) 판정 (A-2-3-4-5 백스트레이트/휠 포함)
  let isStraight = false;
  let straightHigh = 0;

  // 일반 스트레이트 (5장 연속)
  const isNormalStraight = values.every((v, idx) => idx === 0 || v === values[idx - 1] - 1);
  if (isNormalStraight) {
    isStraight = true;
    straightHigh = values[0];
  } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    // A-2-3-4-5 Wheel (Ace is low, high card is 5)
    isStraight = true;
    straightHigh = 5;
  }

  // 4. 숫자 빈도수(Count) 그룹핑
  const countMap = {};
  for (const v of values) {
    countMap[v] = (countMap[v] || 0) + 1;
  }

  // 빈도수 많은 순서 -> 같은 빈도수면 카드 value 높은 순서 정렬
  const countGroups = Object.keys(countMap)
    .map(Number)
    .map(val => ({ val, count: countMap[val] }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  const counts = countGroups.map(g => g.count);
  const groupValues = countGroups.map(g => g.val);

  // 5. 10단계 족보 판정

  // 10. 로열 스트레이트 플러쉬 (Royal Flush)
  if (isFlush && isStraight && straightHigh === 14) {
    return {
      rankInfo: HAND_RANKS.ROYAL_FLUSH,
      score: [HAND_RANKS.ROYAL_FLUSH.rank, 14],
      description: 'A-K-Q-J-10 로열 플러쉬',
      bestCards: sorted
    };
  }

  // 9. 스트레이트 플러쉬 (Straight Flush)
  if (isFlush && isStraight) {
    return {
      rankInfo: HAND_RANKS.STRAIGHT_FLUSH,
      score: [HAND_RANKS.STRAIGHT_FLUSH.rank, straightHigh],
      description: `${straightHigh} 하이 스트레이트 플러쉬`,
      bestCards: sorted
    };
  }

  // 8. 포카드 (Four of a Kind)
  if (counts[0] === 4) {
    return {
      rankInfo: HAND_RANKS.FOUR_OF_A_KIND,
      score: [HAND_RANKS.FOUR_OF_A_KIND.rank, groupValues[0], groupValues[1]],
      description: `포카드 (${groupValues[0]} x 4)`,
      bestCards: sorted
    };
  }

  // 7. 풀하우스 (Full House)
  if (counts[0] === 3 && counts[1] === 2) {
    return {
      rankInfo: HAND_RANKS.FULL_HOUSE,
      score: [HAND_RANKS.FULL_HOUSE.rank, groupValues[0], groupValues[1]],
      description: `풀하우스 (${groupValues[0]} 트리플 & ${groupValues[1]} 페어)`,
      bestCards: sorted
    };
  }

  // 6. 플러쉬 (Flush)
  if (isFlush) {
    return {
      rankInfo: HAND_RANKS.FLUSH,
      score: [HAND_RANKS.FLUSH.rank, ...values],
      description: `플러쉬 (${sorted[0].rank} 하이)`,
      bestCards: sorted
    };
  }

  // 5. 스트레이트 (Straight)
  if (isStraight) {
    return {
      rankInfo: HAND_RANKS.STRAIGHT,
      score: [HAND_RANKS.STRAIGHT.rank, straightHigh],
      description: `스트레이트 (${straightHigh} 하이)`,
      bestCards: sorted
    };
  }

  // 4. 트리플 (Three of a Kind)
  if (counts[0] === 3) {
    return {
      rankInfo: HAND_RANKS.THREE_OF_A_KIND,
      score: [HAND_RANKS.THREE_OF_A_KIND.rank, groupValues[0], groupValues[1], groupValues[2]],
      description: `트리플 (${groupValues[0]} x 3)`,
      bestCards: sorted
    };
  }

  // 3. 투 페어 (Two Pair)
  if (counts[0] === 2 && counts[1] === 2) {
    return {
      rankInfo: HAND_RANKS.TWO_PAIR,
      score: [HAND_RANKS.TWO_PAIR.rank, groupValues[0], groupValues[1], groupValues[2]],
      description: `투 페어 (${groupValues[0]}, ${groupValues[1]})`,
      bestCards: sorted
    };
  }

  // 2. 원 페어 (One Pair)
  if (counts[0] === 2) {
    return {
      rankInfo: HAND_RANKS.ONE_PAIR,
      score: [HAND_RANKS.ONE_PAIR.rank, groupValues[0], groupValues[1], groupValues[2], groupValues[3]],
      description: `원 페어 (${groupValues[0]} 페어)`,
      bestCards: sorted
    };
  }

  // 1. 하이 카드 (High Card)
  return {
    rankInfo: HAND_RANKS.HIGH_CARD,
    score: [HAND_RANKS.HIGH_CARD.rank, ...values],
    description: `하이 카드 (${sorted[0].rank} 하이)`,
    bestCards: sorted
  };
}

/**
 * 점수 배열(score vector) 사전식 비교 함수
 * @param {Array} a - Score Array [rank, kicker1, kicker2, ...]
 * @param {Array} b - Score Array [rank, kicker1, kicker2, ...]
 * @returns {number} 1 (a 승), -1 (b 승), 0 (무승부)
 */
function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const valA = a[i] || 0;
    const valB = b[i] || 0;
    if (valA > valB) return 1;
    if (valA < valB) return -1;
  }
  return 0;
}

/**
 * 7장의 카드 중 가장 높은 5장 조합의 족보를 판정하는 함수
 * @param {Array} sevenCards - 손패 2장 + 커뮤니티 5장 (총 7장)
 * @returns {Object} 최고 족보 결과 객체
 */
function evaluate7Cards(sevenCards) {
  if (!sevenCards || sevenCards.length < 5) return null;

  // 7C5 = 21개의 모든 5장 조합 생성
  const combinations = getCombinations(sevenCards, 5);

  let bestHand = null;

  for (const combo of combinations) {
    const evalResult = evaluate5Cards(combo);
    if (!bestHand || compareScores(evalResult.score, bestHand.score) > 0) {
      bestHand = evalResult;
    }
  }

  return bestHand;
}

/**
 * 모든 플레이어의 손패와 커뮤니티 카드를 비교하여 승자 및 족보를 판별하는 함수
 * @param {Array} players - 플레이어 목록 [{ id, name, hand, ... }, ...]
 * @param {Array} communityCards - 커뮤니티 카드 5장
 * @returns {Object} { winners, winningHand, allResults }
 */
function determineWinner(players, communityCards) {
  const results = [];

  for (const player of players) {
    const total7Cards = [...player.hand, ...communityCards];
    const bestHand = evaluate7Cards(total7Cards);

    results.push({
      player,
      handResult: bestHand,
      score: bestHand.score
    });
  }

  // 점수 내림차순 정렬
  results.sort((a, b) => compareScores(b.score, a.score));

  // 1등 점수
  const topScore = results[0].score;

  // 동점자(Split Pot) 고려
  const winners = results.filter(r => compareScores(r.score, topScore) === 0);

  return {
    winners: winners.map(w => w.player),
    winningHand: results[0].handResult,
    topResult: results[0],
    allResults: results
  };
}

// 전역(window) 객체에 익스포트하여 어디서든 사용 가능하게 등록
window.HandEvaluator = {
  HAND_RANKS,
  evaluate5Cards,
  evaluate7Cards,
  determineWinner,
  compareScores
};
