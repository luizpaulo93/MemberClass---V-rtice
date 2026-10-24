import { EnemArea, Simulado, SimuladoSubmission } from '../types';

export interface TriAnchorPoint {
  hits: number;
  min: number;
  mean: number;
  max: number;
}

/**
 * Reference tables calibrated from INEP / ENEM 2025 Microdata (0 to 45 hits)
 * for each of the 4 knowledge areas:
 * - MT: Matemática e suas Tecnologias
 * - CN: Ciências da Natureza e suas Tecnologias
 * - CH: Ciências Humanas e suas Tecnologias
 * - LC: Linguagens, Códigos e suas Tecnologias
 */
const ENEM_2025_ANCHORS: Record<EnemArea, TriAnchorPoint[]> = {
  MT: [
    { hits: 0, min: 318.4, mean: 326.0, max: 334.2 },
    { hits: 5, min: 336.8, mean: 372.5, max: 438.0 },
    { hits: 10, min: 365.4, mean: 478.2, max: 568.9 },
    { hits: 15, min: 452.1, mean: 584.6, max: 658.4 },
    { hits: 20, min: 558.7, mean: 662.3, max: 718.5 },
    { hits: 25, min: 642.0, mean: 724.8, max: 769.2 },
    { hits: 30, min: 712.5, mean: 778.4, max: 816.0 },
    { hits: 35, min: 776.2, mean: 829.5, max: 864.8 },
    { hits: 40, min: 842.0, mean: 886.7, max: 918.5 },
    { hits: 43, min: 904.5, mean: 929.8, max: 951.2 },
    { hits: 45, min: 961.9, mean: 968.7, max: 975.6 },
  ],
  CN: [
    { hits: 0, min: 315.0, mean: 324.2, max: 332.8 },
    { hits: 5, min: 341.2, mean: 379.4, max: 439.6 },
    { hits: 10, min: 368.0, mean: 468.5, max: 544.2 },
    { hits: 15, min: 455.8, mean: 548.9, max: 612.4 },
    { hits: 20, min: 538.4, mean: 609.7, max: 659.8 },
    { hits: 25, min: 604.2, mean: 658.4, max: 698.5 },
    { hits: 30, min: 658.9, mean: 703.2, max: 739.6 },
    { hits: 35, min: 709.5, mean: 748.8, max: 784.2 },
    { hits: 40, min: 764.8, mean: 798.5, max: 834.0 },
    { hits: 43, min: 814.2, mean: 836.0, max: 856.4 },
    { hits: 45, min: 858.0, mean: 863.2, max: 868.4 },
  ],
  CH: [
    { hits: 0, min: 306.5, mean: 314.8, max: 323.0 },
    { hits: 5, min: 328.5, mean: 368.0, max: 429.4 },
    { hits: 10, min: 358.2, mean: 451.4, max: 528.6 },
    { hits: 15, min: 439.5, mean: 524.8, max: 588.2 },
    { hits: 20, min: 512.0, mean: 581.6, max: 632.5 },
    { hits: 25, min: 574.6, mean: 629.4, max: 671.8 },
    { hits: 30, min: 628.5, mean: 673.8, max: 711.4 },
    { hits: 35, min: 679.2, mean: 719.5, max: 754.8 },
    { hits: 40, min: 734.0, mean: 769.2, max: 802.6 },
    { hits: 43, min: 784.5, mean: 808.4, max: 827.0 },
    { hits: 45, min: 831.0, mean: 835.1, max: 839.2 },
  ],
  LC: [
    { hits: 0, min: 298.0, mean: 306.4, max: 315.2 },
    { hits: 5, min: 319.8, mean: 361.2, max: 421.0 },
    { hits: 10, min: 352.0, mean: 442.6, max: 516.4 },
    { hits: 15, min: 431.2, mean: 512.5, max: 571.8 },
    { hits: 20, min: 501.4, mean: 564.8, max: 612.0 },
    { hits: 25, min: 558.2, mean: 608.6, max: 648.4 },
    { hits: 30, min: 608.9, mean: 649.5, max: 685.2 },
    { hits: 35, min: 656.4, mean: 692.4, max: 726.0 },
    { hits: 40, min: 708.5, mean: 741.8, max: 774.5 },
    { hits: 43, min: 758.2, mean: 782.0, max: 803.4 },
    { hits: 45, min: 810.4, mean: 814.5, max: 818.6 },
  ],
};

/**
 * Interpolates the ENEM 2025 [min, mean, max] TRI score bounds for an arbitrary
 * hit count (0..questionCount) in a given knowledge area.
 */
export function getEnem2025TriBounds(
  area: EnemArea,
  correctCount: number,
  questionCount: number
): { min: number; mean: number; max: number } {
  const safeTotal = Math.max(1, questionCount);
  const safeHits = Math.max(0, Math.min(safeTotal, correctCount));
  const scaledHits = (safeHits / safeTotal) * 45;

  const table = ENEM_2025_ANCHORS[area] || ENEM_2025_ANCHORS.MT;

  if (scaledHits <= table[0].hits) {
    return { min: table[0].min, mean: table[0].mean, max: table[0].max };
  }
  const last = table[table.length - 1];
  if (scaledHits >= last.hits) {
    return { min: last.min, mean: last.mean, max: last.max };
  }

  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (scaledHits >= a.hits && scaledHits <= b.hits) {
      const t = (scaledHits - a.hits) / Math.max(0.0001, b.hits - a.hits);
      return {
        min: Number((a.min + (b.min - a.min) * t).toFixed(1)),
        mean: Number((a.mean + (b.mean - a.mean) * t).toFixed(1)),
        max: Number((a.max + (b.max - a.max) * t).toFixed(1)),
      };
    }
  }

  return { min: last.min, mean: last.mean, max: last.max };
}

export type ItemDifficultyTier = 'easy' | 'medium' | 'hard';

export interface CalibratedQuestionItem {
  index: number; // 0-based
  questionNumber: number; // 1-based
  officialAnswer: string;
  rawHitCount: number; // number of completed students who hit this item
  rawHitPercent: number; // 0..100 across completed students
  empiricalHitRate: number; // 0..1 across class
  difficultyB: number; // logit difficulty parameter b_i
  tier: ItemDifficultyTier;
}

export interface StudentSimuladoEvaluation {
  simuladoId: string;
  userId: string;
  questionCount: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  accuracyPercent: number;
  coherencePercent: number; // 0..100 Pedagogical Coherence (computed when resultsReleased is true)
  triScore: number; // Calibrated ENEM 2025 TRI Score (computed when resultsReleased is true)
  triBounds: { min: number; mean: number; max: number };
  easyCorrect: number;
  easyTotal: number;
  mediumCorrect: number;
  mediumTotal: number;
  hardCorrect: number;
  hardTotal: number;
  questionBreakdown: {
    questionNumber: number;
    marked: string;
    official: string;
    isCorrect: boolean;
    tier: ItemDifficultyTier;
    empiricalHitRate: number;
  }[];
}

export interface ClassSimuladoSummary {
  simuladoId: string;
  isCalibrated: boolean;
  completedCount: number;
  inProgressCount: number;
  meanTriScore: number;
  meanCoherencePercent: number;
  meanAccuracyPercent: number;
  meanCorrectCount: number;
  items: CalibratedQuestionItem[];
  evaluationsByUserId: Record<string, StudentSimuladoEvaluation>;
}

// Per-simulado memoization cache so unchanged simulados never re-run calibration
const cohortEvaluationCache = new Map<
  string,
  { signature: string; summary: ClassSimuladoSummary }
>();

/**
 * Evaluates a Simulado cohort.
 * - Performance rule: When `simulado.resultsReleased` is FALSE, skips heavy TRI & Guttman
 *   coherence calculations so the app never overloads while exams are ongoing. Only fast O(Q)
 *   raw hit counting is performed.
 * - Recalibration rule: When `simulado.resultsReleased` is TRUE, calibrates item difficulties,
 *   Pedagogical Coherence, and TRI scores across ALL completed submissions of this simulado.
 *   Whenever a new delivery (`status === 'completed'`) arrives for this simulado, the signature
 *   changes and all students' TRI and Coherence in this simulado are automatically recalibrated.
 */
export function evaluateSimuladoCohort(
  simulado: Simulado,
  submissions: SimuladoSubmission[]
): ClassSimuladoSummary {
  const qCount = Math.max(1, simulado.questionCount);
  const completedSubs: SimuladoSubmission[] = [];
  let inProgressCount = 0;

  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i];
    if (s.simuladoId !== simulado.id) continue;
    if (s.status === 'completed') {
      completedSubs.push(s);
    } else if (s.status === 'in_progress') {
      inProgressCount += 1;
    }
  }

  // Sort completed submissions deterministically by userId for cache key stability
  completedSubs.sort((a, b) => a.userId.localeCompare(b.userId));

  const shouldCalculateTri = Boolean(simulado.resultsReleased);
  const completedSig = completedSubs
    .map((s) => `${s.userId}:${s.answersString}`)
    .join('|');
  const signature = `${simulado.id}::${simulado.area}::${qCount}::${simulado.answerKey}::${shouldCalculateTri}::${inProgressCount}::${completedSig}`;

  const cached = cohortEvaluationCache.get(simulado.id);
  if (cached && cached.signature === signature) {
    return cached.summary;
  }

  // --- FAST LIGHTWEIGHT MODE (WHEN NOTAS TRI ARE NOT RELEASED YET) ---
  if (!shouldCalculateTri) {
    const rawHitCounts = new Array<number>(qCount).fill(0);
    const evaluationsByUserId: Record<string, StudentSimuladoEvaluation> = {};

    for (const sub of completedSubs) {
      let correctCount = 0;
      let wrongCount = 0;
      let blankCount = 0;

      const questionBreakdown = Array.from({ length: qCount }, (_, idx) => {
        const marked = sub.answersString?.[idx] || '-';
        const official = simulado.answerKey?.[idx] || 'A';
        const isCorrect = marked === official;

        if (marked === '-' || !marked) {
          blankCount += 1;
        } else if (isCorrect) {
          correctCount += 1;
          rawHitCounts[idx] += 1;
        } else {
          wrongCount += 1;
        }

        return {
          questionNumber: idx + 1,
          marked,
          official,
          isCorrect,
          tier: 'medium' as ItemDifficultyTier,
          empiricalHitRate: 0.5,
        };
      });

      const accuracyPercent = Math.round((correctCount / qCount) * 100);
      evaluationsByUserId[sub.userId] = {
        simuladoId: simulado.id,
        userId: sub.userId,
        questionCount: qCount,
        correctCount,
        wrongCount,
        blankCount,
        accuracyPercent,
        coherencePercent: 0,
        triScore: 0,
        triBounds: { min: 300, mean: 500, max: 700 },
        easyCorrect: 0,
        easyTotal: 0,
        mediumCorrect: 0,
        mediumTotal: 0,
        hardCorrect: 0,
        hardTotal: 0,
        questionBreakdown,
      };
    }

    const basicItems: CalibratedQuestionItem[] = Array.from(
      { length: qCount },
      (_, idx) => {
        const rawPct =
          completedSubs.length > 0
            ? Math.round((rawHitCounts[idx] / completedSubs.length) * 100)
            : 0;
        return {
          index: idx,
          questionNumber: idx + 1,
          officialAnswer: simulado.answerKey?.[idx] || 'A',
          rawHitCount: rawHitCounts[idx],
          rawHitPercent: rawPct,
          empiricalHitRate: completedSubs.length > 0 ? rawPct / 100 : 0.5,
          difficultyB: 0,
          tier: 'medium',
        };
      }
    );

    const evalList = Object.values(evaluationsByUserId);
    const meanAccuracyPercent =
      evalList.length > 0
        ? Math.round(
            evalList.reduce((acc, e) => acc + e.accuracyPercent, 0) /
              evalList.length
          )
        : 0;
    const meanCorrectCount =
      evalList.length > 0
        ? Number(
            (
              evalList.reduce((acc, e) => acc + e.correctCount, 0) /
              evalList.length
            ).toFixed(1)
          )
        : 0;

    const lightweightSummary: ClassSimuladoSummary = {
      simuladoId: simulado.id,
      isCalibrated: false,
      completedCount: completedSubs.length,
      inProgressCount,
      meanTriScore: 0,
      meanCoherencePercent: 0,
      meanAccuracyPercent,
      meanCorrectCount,
      items: basicItems,
      evaluationsByUserId,
    };

    cohortEvaluationCache.set(simulado.id, {
      signature,
      summary: lightweightSummary,
    });
    return lightweightSummary;
  }

  // --- FULL COHORT TRI & PEDAGOGICAL COHERENCE CALIBRATION (WHEN RELEASED) ---
  // Recalibrates item difficulties, coherence, and TRI scores across all completed deliveries
  const rawHitCounts = new Array<number>(qCount).fill(0);
  completedSubs.forEach((sub) => {
    for (let i = 0; i < qCount; i++) {
      const marked = sub.answersString?.[i] || '-';
      const official = simulado.answerKey?.[i] || 'A';
      if (marked === official) {
        rawHitCounts[i] += 1;
      }
    }
  });

  // Gentle Bayesian prior (alpha = 1.2) so small cohorts are stable while every new delivery
  // shifts item difficulties and student scores toward the cohort's true empirical distribution
  const priorAlpha = 1.2;
  const itemsWithRawRate = Array.from({ length: qCount }, (_, i) => {
    const posRatio = qCount > 1 ? i / (qCount - 1) : 0.5;
    const wave = Math.sin((i + 1) * 2.1) * 0.14;
    const priorP = Math.max(
      0.22,
      Math.min(0.86, 0.76 - posRatio * 0.42 + wave)
    );
    const empiricalP =
      (rawHitCounts[i] + priorAlpha * priorP) /
      (completedSubs.length + priorAlpha);
    const clampedP = Math.max(0.06, Math.min(0.94, empiricalP));
    const difficultyB = -Math.log(clampedP / (1 - clampedP));
    const rawPct =
      completedSubs.length > 0
        ? Math.round((rawHitCounts[i] / completedSubs.length) * 100)
        : Math.round(clampedP * 100);
    return {
      index: i,
      questionNumber: i + 1,
      officialAnswer: simulado.answerKey?.[i] || 'A',
      rawHitCount: rawHitCounts[i],
      rawHitPercent: rawPct,
      empiricalHitRate: clampedP,
      difficultyB,
    };
  });

  // Classify items into Easy, Medium, Hard using cohort empirical hit rates and relative rank
  const sortedByHitRate = [...itemsWithRawRate].sort(
    (a, b) => b.empiricalHitRate - a.empiricalHitRate
  );
  const tierByIndex: Record<number, ItemDifficultyTier> = {};
  sortedByHitRate.forEach((item, rankIdx) => {
    const pct = qCount > 1 ? rankIdx / qCount : 0;
    if (item.empiricalHitRate >= 0.68 || pct < 0.34) {
      tierByIndex[item.index] = 'easy';
    } else if (item.empiricalHitRate >= 0.38 || pct < 0.72) {
      tierByIndex[item.index] = 'medium';
    } else {
      tierByIndex[item.index] = 'hard';
    }
  });

  const calibratedItems: CalibratedQuestionItem[] = itemsWithRawRate.map(
    (item) => ({
      ...item,
      tier: tierByIndex[item.index] || 'medium',
    })
  );

  // Precompute item discrimination weights based on empirical variance p*(1-p)
  const itemInformationWeights = calibratedItems.map((item) => {
    const p = item.empiricalHitRate;
    return Math.max(0.08, p * (1 - p) * 4); // peaks at 1.0 when p = 0.5
  });

  const evaluationsByUserId: Record<string, StudentSimuladoEvaluation> = {};

  completedSubs.forEach((sub) => {
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;

    let easyCorrect = 0;
    let easyTotal = 0;
    let mediumCorrect = 0;
    let mediumTotal = 0;
    let hardCorrect = 0;
    let hardTotal = 0;

    const hitIndices: number[] = [];
    const missIndices: number[] = [];

    const questionBreakdown = calibratedItems.map((item) => {
      const marked = sub.answersString?.[item.index] || '-';
      const official = item.officialAnswer;
      const isCorrect = marked === official;

      if (marked === '-' || !marked) {
        blankCount += 1;
      } else if (isCorrect) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }

      if (item.tier === 'easy') {
        easyTotal += 1;
        if (isCorrect) easyCorrect += 1;
      } else if (item.tier === 'medium') {
        mediumTotal += 1;
        if (isCorrect) mediumCorrect += 1;
      } else {
        hardTotal += 1;
        if (isCorrect) hardCorrect += 1;
      }

      if (isCorrect) {
        hitIndices.push(item.index);
      } else {
        missIndices.push(item.index);
      }

      return {
        questionNumber: item.questionNumber,
        marked,
        official,
        isCorrect,
        tier: item.tier,
        empiricalHitRate: item.empiricalHitRate,
      };
    });

    // 1. Guttman / 3PL Pedagogical Coherence calibrated across the cohort's empirical hit rates
    let coherentWeight = 0;
    let totalPairWeight = 0;

    if (hitIndices.length === qCount) {
      coherentWeight = 1;
      totalPairWeight = 1;
    } else if (hitIndices.length === 0) {
      coherentWeight = 0.5;
      totalPairWeight = 1;
    } else {
      for (const i of hitIndices) {
        const pHit = calibratedItems[i].empiricalHitRate;
        for (const j of missIndices) {
          const pMiss = calibratedItems[j].empiricalHitRate;
          const diff = Math.abs(pHit - pMiss);
          const weight = Math.max(0.04, diff);
          if (pHit >= pMiss - 0.015) {
            coherentWeight += weight;
            totalPairWeight += weight;
          } else {
            // Penalize inversions (missing cohort-easy item while hitting cohort-hard item)
            const inversionPenalty = weight * 1.35;
            totalPairWeight += inversionPenalty;
          }
        }
      }
    }

    const rawPairCoherence =
      totalPairWeight > 0 ? coherentWeight / totalPairWeight : 0.7;

    // 2. Tier monotonicity across Easy >= Medium >= Hard
    const easyRate = easyTotal > 0 ? easyCorrect / easyTotal : 1;
    const medRate = mediumTotal > 0 ? mediumCorrect / mediumTotal : 0.5;
    const hardRate = hardTotal > 0 ? hardCorrect / hardTotal : 0;

    let tierBonus = 0;
    if (easyRate >= medRate) tierBonus += 0.04;
    else tierBonus -= (medRate - easyRate) * 0.18;

    if (medRate >= hardRate) tierBonus += 0.03;
    else tierBonus -= (hardRate - medRate) * 0.22;

    const normalizedCoherence = Math.max(
      0.12,
      Math.min(0.99, rawPairCoherence + tierBonus)
    );
    const coherencePercent = Math.round(normalizedCoherence * 100);

    // 3. Empirical Item Information & Difficulty Alignment Factor
    // Rewards hitting high-discrimination easy/medium items calibrated by the cohort
    let studentInfoEarned = 0;
    let totalInfoPossible = 0;
    for (let idx = 0; idx < qCount; idx++) {
      const w =
        itemInformationWeights[idx] *
        (0.65 + 0.35 * calibratedItems[idx].empiricalHitRate);
      totalInfoPossible += w;
      if (questionBreakdown[idx].isCorrect) {
        studentInfoEarned += w;
      }
    }
    const rawRatio = correctCount / qCount;
    const infoRatio =
      totalInfoPossible > 0 ? studentInfoEarned / totalInfoPossible : rawRatio;
    const infoAlignment = Math.max(
      0,
      Math.min(1, 0.5 + (infoRatio - rawRatio) * 2.2)
    );

    // Composite calibration factor combining Pedagogical Coherence (75%) + Cohort Information Alignment (25%)
    const compositeCalibration =
      normalizedCoherence * 0.75 + infoAlignment * 0.25;

    // 4. Calibrate ENEM 2025 TRI Score within area bounds
    const triBounds = getEnem2025TriBounds(
      simulado.area,
      correctCount,
      qCount
    );

    let triScore = triBounds.mean;
    if (compositeCalibration >= 0.55) {
      const upFactor = Math.min(1, (compositeCalibration - 0.55) / 0.42);
      triScore = triBounds.mean + (triBounds.max - triBounds.mean) * upFactor;
    } else {
      const downFactor = Math.min(1, (0.55 - compositeCalibration) / 0.43);
      triScore = triBounds.mean - (triBounds.mean - triBounds.min) * downFactor;
    }

    triScore = Number(triScore.toFixed(1));
    const accuracyPercent = Math.round((correctCount / qCount) * 100);

    evaluationsByUserId[sub.userId] = {
      simuladoId: simulado.id,
      userId: sub.userId,
      questionCount: qCount,
      correctCount,
      wrongCount,
      blankCount,
      accuracyPercent,
      coherencePercent,
      triScore,
      triBounds,
      easyCorrect,
      easyTotal,
      mediumCorrect,
      mediumTotal,
      hardCorrect,
      hardTotal,
      questionBreakdown,
    };
  });

  // Class-level aggregates across completed submissions
  const completedEvals = completedSubs
    .map((s) => evaluationsByUserId[s.userId])
    .filter(Boolean);

  const meanTriScore =
    completedEvals.length > 0
      ? Number(
          (
            completedEvals.reduce((acc, e) => acc + e.triScore, 0) /
            completedEvals.length
          ).toFixed(1)
        )
      : 0;

  const meanCoherencePercent =
    completedEvals.length > 0
      ? Math.round(
          completedEvals.reduce((acc, e) => acc + e.coherencePercent, 0) /
            completedEvals.length
        )
      : 0;

  const meanAccuracyPercent =
    completedEvals.length > 0
      ? Math.round(
          completedEvals.reduce((acc, e) => acc + e.accuracyPercent, 0) /
            completedEvals.length
        )
      : 0;

  const meanCorrectCount =
    completedEvals.length > 0
      ? Number(
          (
            completedEvals.reduce((acc, e) => acc + e.correctCount, 0) /
            completedEvals.length
          ).toFixed(1)
        )
      : 0;

  const fullSummary: ClassSimuladoSummary = {
    simuladoId: simulado.id,
    isCalibrated: true,
    completedCount: completedSubs.length,
    inProgressCount,
    meanTriScore,
    meanCoherencePercent,
    meanAccuracyPercent,
    meanCorrectCount,
    items: calibratedItems,
    evaluationsByUserId,
  };

  cohortEvaluationCache.set(simulado.id, {
    signature,
    summary: fullSummary,
  });

  return fullSummary;
}

export function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
