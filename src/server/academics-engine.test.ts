import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSimpleTabularPdf,
  computeStudentSubjectResult,
  evaluatePromotionCandidate,
  rankScores,
  roundAcademicScore,
  validateAssessmentWeights,
  validateComponentScoreInput,
  validateGradingBands,
  type GradingBandRule,
} from './academics-engine.ts';

const STANDARD_BANDS: GradingBandRule[] = [
  { minScore: 70, maxScore: 100, grade: 'A', remark: 'Excellent', gradePoint: 4.0, isPassing: true },
  { minScore: 60, maxScore: 69.99, grade: 'B', remark: 'Very Good', gradePoint: 3.5, isPassing: true },
  { minScore: 50, maxScore: 59.99, grade: 'C', remark: 'Credit', gradePoint: 3.0, isPassing: true },
  { minScore: 45, maxScore: 49.99, grade: 'D', remark: 'Pass', gradePoint: 2.0, isPassing: true },
  { minScore: 0, maxScore: 44.99, grade: 'F', remark: 'Fail', gradePoint: 0.0, isPassing: false },
];

test('validateAssessmentWeights enforces active 100% total and detects overflow', () => {
  const valid = validateAssessmentWeights([
    { name: 'CA 1', weightPercentage: 20, isActive: true },
    { name: 'CA 2', weightPercentage: 20, isActive: true },
    { name: 'Exam', weightPercentage: 60, isActive: true },
  ]);
  assert.equal(valid.ok, true);
  assert.equal(valid.totalWeight, 100);

  const overflow = validateAssessmentWeights([
    { name: 'CA 1', weightPercentage: 50, isActive: true },
    { name: 'Exam', weightPercentage: 60, isActive: true },
  ]);
  assert.equal(overflow.ok, false);
  assert.match(overflow.error ?? '', /exceeds 100%/i);

  const incomplete = validateAssessmentWeights([
    { name: 'CA 1', weightPercentage: 30, isActive: true },
    { name: 'Exam', weightPercentage: 50, isActive: true },
  ]);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.error ?? '', /must equal 100%/i);
});

test('validateComponentScoreInput rejects out-of-range scores and keeps missing scores NULL', () => {
  const pending = validateComponentScoreInput({ score: null, status: 'pending', maxScore: 20 });
  assert.equal(pending.ok, true);
  assert.equal(pending.normalizedScore, null);

  const over = validateComponentScoreInput({ score: 25, status: 'scored', maxScore: 20 });
  assert.equal(over.ok, false);

  const absent = validateComponentScoreInput({ score: 0, status: 'absent', maxScore: 20 });
  assert.equal(absent.ok, true);
  assert.equal(absent.normalizedScore, 0);
});

test('validateGradingBands rejects overlapping bounds, gaps, and duplicate grade labels', () => {
  assert.equal(validateGradingBands(STANDARD_BANDS, true).ok, true);

  const overlapping = validateGradingBands([
    { minScore: 70, maxScore: 100, grade: 'A', remark: 'Excellent', gradePoint: 4, isPassing: true },
    { minScore: 0, maxScore: 72, grade: 'F', remark: 'Fail', gradePoint: 0, isPassing: false },
  ]);
  assert.equal(overlapping.ok, false);
  assert.match(overlapping.error ?? '', /Overlapping/i);

  const gap = validateGradingBands([
    { minScore: 70, maxScore: 100, grade: 'A', remark: 'Excellent', gradePoint: 4, isPassing: true },
    { minScore: 0, maxScore: 50, grade: 'F', remark: 'Fail', gradePoint: 0, isPassing: false },
  ]);
  assert.equal(gap.ok, false);
  assert.match(gap.error ?? '', /Gap detected/i);

  const duplicate = validateGradingBands([
    { minScore: 50, maxScore: 100, grade: 'A', remark: 'Pass', gradePoint: 4, isPassing: true },
    { minScore: 0, maxScore: 49, grade: 'A', remark: 'Duplicate', gradePoint: 0, isPassing: false },
  ]);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error ?? '', /Duplicate/i);
});

test('computeStudentSubjectResult handles CA + Exam weighting, rounding, and exempt/pending policies', () => {
  const result = computeStudentSubjectResult({
    inputs: [
      {
        component: { id: 'c1', name: 'CA 1', categoryName: 'CA', isExam: false, maxScore: 20, weightPercentage: 20 },
        score: 16,
        status: 'scored',
      },
      {
        component: { id: 'c2', name: 'CA 2', categoryName: 'CA', isExam: false, maxScore: 20, weightPercentage: 20 },
        score: 14,
        status: 'scored',
      },
      {
        component: { id: 'e1', name: 'Exam', categoryName: 'Exam', isExam: true, maxScore: 60, weightPercentage: 60 },
        score: 48,
        status: 'scored',
      },
    ],
    bands: STANDARD_BANDS,
    roundingMode: 'two_decimals',
    missingPolicy: 'exclude_from_weight',
  });

  assert.equal(result.caScore, 30);
  assert.equal(result.examScore, 48);
  assert.equal(result.totalScore, 78);
  assert.equal(result.percentageScore, 78);
  assert.equal(result.grade, 'A');
  assert.equal(result.isPassing, true);

  // Exempt component is excluded from denominator when computing normalized percentage
  const exemptResult = computeStudentSubjectResult({
    inputs: [
      {
        component: { id: 'c1', name: 'CA 1', categoryName: 'CA', isExam: false, maxScore: 20, weightPercentage: 40 },
        score: null,
        status: 'exempt',
      },
      {
        component: { id: 'e1', name: 'Exam', categoryName: 'Exam', isExam: true, maxScore: 60, weightPercentage: 60 },
        score: 45,
        status: 'scored',
      },
    ],
    bands: STANDARD_BANDS,
    roundingMode: 'one_decimal',
    missingPolicy: 'exclude_from_weight',
  });
  assert.equal(exemptResult.maxPossibleScore, 60);
  assert.equal(exemptResult.percentageScore, 75);
  assert.equal(exemptResult.grade, 'A');
});

test('rankScores supports standard competition (1,1,3) and dense (1,1,2) tie handling', () => {
  const entries = [
    { id: 's1', score: 92 },
    { id: 's2', score: 92 },
    { id: 's3', score: 85 },
  ];

  const standard = rankScores(entries, 'standard_competition');
  assert.equal(standard.get('s1'), 1);
  assert.equal(standard.get('s2'), 1);
  assert.equal(standard.get('s3'), 3);

  const dense = rankScores(entries, 'dense');
  assert.equal(dense.get('s1'), 1);
  assert.equal(dense.get('s2'), 1);
  assert.equal(dense.get('s3'), 2);
});

test('evaluatePromotionCandidate classifies promote, review, and retain without auto-promoting', () => {
  const promote = evaluatePromotionCandidate({
    averageScore: 72,
    subjectsPassed: 8,
    subjectsTotal: 8,
    minAverage: 50,
    minPassSubjects: 5,
  });
  assert.equal(promote.recommendation, 'recommended_promote');

  const review = evaluatePromotionCandidate({
    averageScore: 47,
    subjectsPassed: 4,
    subjectsTotal: 8,
    minAverage: 50,
    minPassSubjects: 5,
  });
  assert.equal(review.recommendation, 'requires_review');

  const retain = evaluatePromotionCandidate({
    averageScore: 31,
    subjectsPassed: 2,
    subjectsTotal: 8,
    minAverage: 50,
    minPassSubjects: 5,
  });
  assert.equal(retain.recommendation, 'recommended_retain');
});

test('buildSimpleTabularPdf generates valid PDF 1.4 header, xref, and EOF', () => {
  const buf = buildSimpleTabularPdf({
    title: 'Sample Academy - Official Report Card',
    subtitle: '2026/2027 Academic Session | First Term',
    metaLines: ['Student: Jane Doe', 'Class: JSS 1A', 'Average: 78.5%'],
    columns: [
      { label: 'Subject', x: 45 },
      { label: 'Total', x: 300 },
      { label: 'Grade', x: 380 },
    ],
    rows: [['Mathematics', '78.5', 'A']],
    footerLines: ['Dave Timi EdTech Systems Academic Registry'],
  });
  const text = buf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.includes('xref\n'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.equal(roundAcademicScore(12.345, 'two_decimals'), 12.35);
});
