export type ScoreRoundingMode = 'two_decimals' | 'one_decimal' | 'nearest_whole';
export type TieRankingMode = 'standard_competition' | 'dense';
export type MissingScorePolicy = 'exclude_from_weight' | 'treat_pending_as_zero_on_compute';
export type AssessmentScoreStatus = 'pending' | 'scored' | 'absent' | 'exempt';

export interface GradingBandRule {
  id?: string;
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
  gradePoint: number;
  isPassing: boolean;
}

export interface AssessmentComponentSpec {
  id: string;
  name: string;
  categoryName: string;
  isExam: boolean;
  maxScore: number;
  weightPercentage: number;
}

export interface StudentComponentScoreInput {
  component: AssessmentComponentSpec;
  score: number | null;
  status: AssessmentScoreStatus;
}

export interface ComputedSubjectItemResult {
  componentId: string;
  componentName: string;
  categoryName: string;
  isExam: boolean;
  rawScore: number | null;
  maxScore: number;
  weightPercentage: number;
  weightedContribution: number;
  status: AssessmentScoreStatus;
}

export interface ComputedSubjectOutcome {
  caScore: number;
  examScore: number;
  totalScore: number;
  maxPossibleScore: number;
  percentageScore: number;
  grade: string;
  remark: string;
  gradePoint: number;
  isPassing: boolean;
  items: ComputedSubjectItemResult[];
  hasPendingComponents: boolean;
}

export function roundAcademicScore(value: number, mode: ScoreRoundingMode = 'two_decimals'): number {
  if (!Number.isFinite(value)) return 0;
  if (mode === 'nearest_whole') return Math.round(value);
  if (mode === 'one_decimal') return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function validateDateRange(startDate: string, endDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function validateComponentScoreInput(params: {
  score: number | null;
  status: AssessmentScoreStatus;
  maxScore: number;
}): { ok: boolean; error?: string; normalizedScore: number | null } {
  const { score, status, maxScore } = params;
  if (status === 'pending' || status === 'exempt') {
    return { ok: true, normalizedScore: null };
  }
  if (status === 'absent') {
    if (score !== null && score !== 0) {
      return { ok: false, error: 'Absent status cannot carry a non-zero score.', normalizedScore: null };
    }
    return { ok: true, normalizedScore: 0 };
  }
  if (score === null || !Number.isFinite(score)) {
    return { ok: false, error: 'Scored entry requires a numeric score value.', normalizedScore: null };
  }
  if (score < 0) {
    return { ok: false, error: 'Score cannot be negative.', normalizedScore: null };
  }
  if (score > maxScore) {
    return { ok: false, error: `Score (${score}) exceeds component maximum (${maxScore}).`, normalizedScore: null };
  }
  return { ok: true, normalizedScore: score };
}

export function validateAssessmentWeights(
  components: Array<{ id?: string; name: string; weightPercentage: number; isActive?: boolean }>,
  requireExact100 = true,
): { ok: boolean; totalWeight: number; error?: string } {
  const active = components.filter((c) => c.isActive !== false);
  const totalWeight = roundAcademicScore(
    active.reduce((sum, item) => sum + Number(item.weightPercentage || 0), 0),
    'two_decimals',
  );
  if (active.length === 0) {
    return { ok: false, totalWeight: 0, error: 'At least one active assessment component is required.' };
  }
  for (const c of active) {
    if (!Number.isFinite(c.weightPercentage) || c.weightPercentage <= 0 || c.weightPercentage > 100) {
      return { ok: false, totalWeight, error: `Component "${c.name}" weight must be between 0 and 100.` };
    }
  }
  if (totalWeight > 100.001) {
    return {
      ok: false,
      totalWeight,
      error: `Total assessment weight (${totalWeight}%) exceeds 100%.`,
    };
  }
  if (requireExact100 && Math.abs(totalWeight - 100) > 0.01) {
    return {
      ok: false,
      totalWeight,
      error: `Total active assessment weights must equal 100% (currently ${totalWeight}%).`,
    };
  }
  return { ok: true, totalWeight };
}

export function validateGradingBands(
  bands: GradingBandRule[],
  requireFullCoverage = true,
): { ok: boolean; error?: string; sortedBands: GradingBandRule[] } {
  if (!bands.length) {
    return { ok: false, error: 'Grading system requires at least one grading band.', sortedBands: [] };
  }

  const seenGrades = new Set<string>();
  const normalized = bands.map((b) => ({
    ...b,
    grade: b.grade.trim().toUpperCase(),
    remark: b.remark.trim(),
    minScore: Number(b.minScore),
    maxScore: Number(b.maxScore),
    gradePoint: Number(b.gradePoint),
  }));

  for (const band of normalized) {
    if (!band.grade) {
      return { ok: false, error: 'Every grading band must define a grade label.', sortedBands: [] };
    }
    if (seenGrades.has(band.grade)) {
      return { ok: false, error: `Duplicate grade label detected: "${band.grade}".`, sortedBands: [] };
    }
    seenGrades.add(band.grade);

    if (
      !Number.isFinite(band.minScore) ||
      !Number.isFinite(band.maxScore) ||
      band.minScore < 0 ||
      band.maxScore > 100 ||
      band.minScore > band.maxScore
    ) {
      return {
        ok: false,
        error: `Invalid score bounds (${band.minScore}–${band.maxScore}) on grade "${band.grade}".`,
        sortedBands: [],
      };
    }
  }

  const sorted = [...normalized].sort((a, b) => a.minScore - b.minScore);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.minScore <= prev.maxScore) {
      return {
        ok: false,
        error: `Overlapping score ranges between "${prev.grade}" (${prev.minScore}–${prev.maxScore}) and "${curr.grade}" (${curr.minScore}–${curr.maxScore}).`,
        sortedBands: [],
      };
    }
    if (requireFullCoverage && curr.minScore - prev.maxScore > 1.0001) {
      return {
        ok: false,
        error: `Gap detected in grading scale between "${prev.grade}" (max ${prev.maxScore}) and "${curr.grade}" (min ${curr.minScore}).`,
        sortedBands: [],
      };
    }
  }

  if (requireFullCoverage) {
    if (sorted[0].minScore > 0) {
      return { ok: false, error: 'Grading scale must start at 0 for full 0–100 coverage.', sortedBands: [] };
    }
    if (sorted[sorted.length - 1].maxScore < 100) {
      return { ok: false, error: 'Grading scale must extend up to 100 for full 0–100 coverage.', sortedBands: [] };
    }
  }

  return { ok: true, sortedBands: [...sorted].sort((a, b) => b.minScore - a.minScore) };
}

export function resolveGradeForScore(
  percentageScore: number,
  bands: GradingBandRule[],
): GradingBandRule {
  const clamped = Math.max(0, Math.min(100, percentageScore));
  const ordered = [...bands].sort((a, b) => b.minScore - a.minScore);
  for (const band of ordered) {
    if (clamped >= band.minScore && clamped <= band.maxScore) {
      return band;
    }
  }
  // Fallback for fractional values between integer boundaries (e.g. 69.5 between 60-69 and 70-100)
  for (let i = 0; i < ordered.length; i++) {
    if (clamped >= ordered[i].minScore) {
      return ordered[i];
    }
  }
  return ordered[ordered.length - 1] ?? {
    minScore: 0,
    maxScore: 100,
    grade: 'N/A',
    remark: 'Unmapped',
    gradePoint: 0,
    isPassing: false,
  };
}

export function computeStudentSubjectResult(params: {
  inputs: StudentComponentScoreInput[];
  bands: GradingBandRule[];
  roundingMode: ScoreRoundingMode;
  missingPolicy: MissingScorePolicy;
}): ComputedSubjectOutcome {
  const { inputs, bands, roundingMode, missingPolicy } = params;
  let caScore = 0;
  let examScore = 0;
  let maxPossibleScore = 0;
  let hasPendingComponents = false;
  const items: ComputedSubjectItemResult[] = [];

  for (const entry of inputs) {
    const { component, score, status } = entry;
    if (status === 'exempt') {
      items.push({
        componentId: component.id,
        componentName: component.name,
        categoryName: component.categoryName,
        isExam: component.isExam,
        rawScore: null,
        maxScore: component.maxScore,
        weightPercentage: component.weightPercentage,
        weightedContribution: 0,
        status: 'exempt',
      });
      continue;
    }

    if (status === 'pending') {
      hasPendingComponents = true;
      if (missingPolicy === 'exclude_from_weight') {
        items.push({
          componentId: component.id,
          componentName: component.name,
          categoryName: component.categoryName,
          isExam: component.isExam,
          rawScore: null,
          maxScore: component.maxScore,
          weightPercentage: component.weightPercentage,
          weightedContribution: 0,
          status: 'pending',
        });
        continue;
      }
    }

    const effectiveRaw = status === 'absent' || status === 'pending' ? 0 : (score ?? 0);
    const ratio = component.maxScore > 0 ? effectiveRaw / component.maxScore : 0;
    const weighted = roundAcademicScore(ratio * component.weightPercentage, roundingMode);
    maxPossibleScore += component.weightPercentage;

    if (component.isExam) {
      examScore += weighted;
    } else {
      caScore += weighted;
    }

    items.push({
      componentId: component.id,
      componentName: component.name,
      categoryName: component.categoryName,
      isExam: component.isExam,
      rawScore: status === 'pending' ? null : effectiveRaw,
      maxScore: component.maxScore,
      weightPercentage: component.weightPercentage,
      weightedContribution: weighted,
      status,
    });
  }

  const totalScore = roundAcademicScore(caScore + examScore, roundingMode);
  const roundedCa = roundAcademicScore(caScore, roundingMode);
  const roundedExam = roundAcademicScore(examScore, roundingMode);
  const roundedMax = roundAcademicScore(maxPossibleScore, roundingMode);
  const percentageScore =
    roundedMax > 0
      ? roundAcademicScore((totalScore / roundedMax) * 100, roundingMode)
      : 0;

  const band = resolveGradeForScore(percentageScore, bands);

  return {
    caScore: roundedCa,
    examScore: roundedExam,
    totalScore,
    maxPossibleScore: roundedMax,
    percentageScore,
    grade: band.grade,
    remark: band.remark,
    gradePoint: band.gradePoint,
    isPassing: band.isPassing,
    items,
    hasPendingComponents,
  };
}

export function rankScores<T extends { id: string; score: number }>(
  entries: T[],
  mode: TieRankingMode = 'standard_competition',
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const positions = new Map<string, number>();

  let currentRank = 0;
  let lastScore: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (lastScore === null || Math.abs(item.score - lastScore) > 0.0001) {
      currentRank = mode === 'standard_competition' ? i + 1 : currentRank + 1;
      lastScore = item.score;
    }
    positions.set(item.id, currentRank);
  }
  return positions;
}

export function evaluatePromotionCandidate(params: {
  averageScore: number;
  subjectsPassed: number;
  subjectsTotal: number;
  minAverage: number;
  minPassSubjects: number;
}): {
  recommendation: 'recommended_promote' | 'recommended_retain' | 'requires_review';
  reason: string;
} {
  const { averageScore, subjectsPassed, subjectsTotal, minAverage, minPassSubjects } = params;
  if (subjectsTotal === 0) {
    return {
      recommendation: 'requires_review',
      reason: 'No computed or published academic subjects found for this session.',
    };
  }
  const effectiveMinPass = Math.min(minPassSubjects, subjectsTotal);
  if (averageScore >= minAverage && subjectsPassed >= effectiveMinPass) {
    return {
      recommendation: 'recommended_promote',
      reason: `Average (${averageScore}%) meets threshold (${minAverage}%) and passed ${subjectsPassed}/${subjectsTotal} subjects.`,
    };
  }
  if (averageScore >= minAverage - 5 || subjectsPassed >= Math.max(1, effectiveMinPass - 1)) {
    return {
      recommendation: 'requires_review',
      reason: `Borderline performance (${averageScore}% avg, ${subjectsPassed}/${subjectsTotal} passed); requires administrative review.`,
    };
  }
  return {
    recommendation: 'recommended_retain',
    reason: `Below institutional threshold (${averageScore}% < ${minAverage}% avg or ${subjectsPassed} < ${effectiveMinPass} passed).`,
  };
}

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

/**
 * Generates a valid, standards-compliant PDF 1.4 binary buffer with clean typography,
 * institutional header rules, and crisp tabular rows using zero external PDF dependencies.
 */
export function buildSimpleTabularPdf(params: {
  title: string;
  subtitle: string;
  metaLines: string[];
  columns: Array<{ label: string; x: number }>;
  rows: string[][];
  footerLines: string[];
}): Buffer {
  const lines: string[] = [];
  const pushText = (text: string, x: number, y: number, size = 10, bold = false) => {
    lines.push('BT');
    lines.push(`/${bold ? 'F2' : 'F1'} ${size} Tf`);
    lines.push(`1 0 0 1 ${x} ${y} Tm`);
    lines.push(`(${escapePdfText(text)}) Tj`);
    lines.push('ET');
  };

  // Top Navy Brand Rule
  lines.push('0.06 0.09 0.16 rg');
  lines.push('40 785 515 4 re f');
  lines.push('0.15 0.39 0.92 rg');
  lines.push('40 782 140 3 re f');

  lines.push('0 0 0 rg');
  let y = 762;
  pushText(params.title.slice(0, 90), 40, y, 15, true);
  y -= 16;
  pushText(params.subtitle.slice(0, 105), 40, y, 10, false);
  y -= 18;

  for (const meta of params.metaLines.slice(0, 8)) {
    pushText(meta.slice(0, 105), 40, y, 9, false);
    y -= 13;
  }

  y -= 8;
  lines.push('0.92 0.94 0.97 rg');
  lines.push(`40 ${y - 4} 515 18 re f`);
  lines.push('0.06 0.09 0.16 rg');
  for (const col of params.columns) {
    pushText(col.label, col.x, y + 1, 9, true);
  }
  y -= 20;

  lines.push('0.1 0.12 0.18 rg');
  const maxRows = Math.min(params.rows.length, 32);
  for (let i = 0; i < maxRows; i++) {
    const row = params.rows[i];
    if (i % 2 === 1) {
      lines.push('0.97 0.98 0.99 rg');
      lines.push(`40 ${y - 4} 515 16 re f`);
      lines.push('0.1 0.12 0.18 rg');
    }
    for (let c = 0; c < params.columns.length; c++) {
      const cell = row[c] ?? '';
      pushText(cell.slice(0, 34), params.columns[c].x, y, 8.5, false);
    }
    y -= 16;
    if (y < 95) break;
  }

  y = Math.min(y - 12, 84);
  lines.push('0.8 0.84 0.9 RG 0.5 w');
  lines.push(`40 ${y + 12} m 555 ${y + 12} l S`);
  lines.push('0.2 0.25 0.35 rg');
  for (const footer of params.footerLines.slice(0, 4)) {
    pushText(footer.slice(0, 110), 40, y, 8.5, false);
    y -= 12;
  }

  const streamContent = lines.join('\n');
  const streamLen = Buffer.byteLength(streamContent, 'latin1');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  const header = '%PDF-1.4\n';
  let body = '';
  const offsets: number[] = [0];
  let cursor = Buffer.byteLength(header, 'latin1');

  for (const obj of objects) {
    offsets.push(cursor);
    body += obj;
    cursor += Buffer.byteLength(obj, 'latin1');
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'latin1');
}
