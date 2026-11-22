import crypto from 'node:crypto';

export type CbtQuestionType = 'mcq' | 'true_false' | 'short_answer' | 'essay';

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const copy = [...items];
  const digest = crypto.createHash('sha256').update(seed).digest();
  let state = digest.readUInt32BE(0) || 1;

  for (let i = copy.length - 1; i > 0; i--) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = Math.abs(state) % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export interface ObjectiveEvaluationResult {
  isAutoGradable: boolean;
  isCorrect: boolean | null;
  marksAwarded: number;
}

export function evaluateObjectiveQuestionAnswer(params: {
  questionType: CbtQuestionType;
  correctAnswer: string;
  studentAnswer: string;
  marks: number;
  negativeMarks: number;
}): ObjectiveEvaluationResult {
  const { questionType, correctAnswer, studentAnswer, marks, negativeMarks } = params;

  if (questionType === 'essay') {
    return {
      isAutoGradable: false,
      isCorrect: null,
      marksAwarded: 0,
    };
  }

  const trimmedStudent = (studentAnswer ?? '').trim();
  const trimmedCorrect = (correctAnswer ?? '').trim();

  if (!trimmedStudent) {
    return {
      isAutoGradable: true,
      isCorrect: false,
      marksAwarded: 0,
    };
  }

  let matched = false;
  if (questionType === 'mcq' || questionType === 'true_false') {
    matched = trimmedStudent.toLowerCase() === trimmedCorrect.toLowerCase();
  } else if (questionType === 'short_answer') {
    // Support pipe-separated accepted answers (e.g. "Abuja|FCT Abuja")
    const accepted = trimmedCorrect
      .split('|')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    matched = accepted.includes(trimmedStudent.toLowerCase());
  }

  if (matched) {
    return {
      isAutoGradable: true,
      isCorrect: true,
      marksAwarded: Math.round(marks * 100) / 100,
    };
  }

  const penalty = negativeMarks > 0 ? -Math.round(negativeMarks * 100) / 100 : 0;
  return {
    isAutoGradable: true,
    isCorrect: false,
    marksAwarded: penalty,
  };
}

export function computeCbtAttemptTotals(params: {
  items: Array<{
    questionType: CbtQuestionType;
    maxMarks: number;
    marksAwarded: number;
  }>;
  passMarkPercent: number;
}): {
  objectiveScore: number;
  manualScore: number;
  totalScore: number;
  maxScore: number;
  percentageScore: number;
  passed: boolean;
} {
  let objectiveScore = 0;
  let manualScore = 0;
  let maxScore = 0;

  for (const item of params.items) {
    maxScore += Math.max(0, Number(item.maxMarks || 0));
    if (item.questionType === 'essay') {
      manualScore += Number(item.marksAwarded || 0);
    } else {
      objectiveScore += Number(item.marksAwarded || 0);
    }
  }

  const rawTotal = Math.max(0, objectiveScore + manualScore);
  const roundedObj = Math.round(objectiveScore * 100) / 100;
  const roundedManual = Math.round(manualScore * 100) / 100;
  const totalScore = Math.round(rawTotal * 100) / 100;
  const roundedMax = Math.round(maxScore * 100) / 100;
  const percentageScore =
    roundedMax > 0 ? Math.round((totalScore / roundedMax) * 10000) / 100 : 0;

  return {
    objectiveScore: roundedObj,
    manualScore: roundedManual,
    totalScore,
    maxScore: roundedMax,
    percentageScore,
    passed: percentageScore >= params.passMarkPercent,
  };
}

export function isCbtAttemptExpired(expiresAtIso: string, nowMs?: number): boolean {
  const exp = Date.parse(expiresAtIso);
  if (!Number.isFinite(exp)) return true;
  return (nowMs ?? Date.now()) > exp;
}
