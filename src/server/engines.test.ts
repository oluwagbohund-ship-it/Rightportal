import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTeacherEditAttendanceWindow,
  computeAttendanceStats,
  escapeCsvCell,
  isQrSessionValid,
} from './attendance-engine.ts';
import {
  computeCbtAttemptTotals,
  evaluateObjectiveQuestionAnswer,
  isCbtAttemptExpired,
  seededShuffle,
} from './cbt-engine.ts';
import {
  computeAssignmentBalance,
  computeFeeDiscount,
  formatReceiptNumber,
  validatePaymentInput,
} from './finance-engine.ts';
import { detectTimetableSlotConflicts } from './timetable-engine.ts';

test('Attendance engine computes summary statistics and attendance rate accurately', () => {
  const stats = computeAttendanceStats(['present', 'present', 'late', 'absent', 'excused']);
  assert.equal(stats.totalMarked, 5);
  assert.equal(stats.present, 2);
  assert.equal(stats.late, 1);
  assert.equal(stats.absent, 1);
  assert.equal(stats.excused, 1);
  assert.equal(stats.attendedCount, 3);
  assert.equal(stats.attendanceRatePercent, 60);
});

test('QR session validator enforces active status and expiry time', () => {
  const future = new Date(Date.now() + 600_000).toISOString();
  const past = new Date(Date.now() - 10_000).toISOString();
  assert.equal(isQrSessionValid({ status: 'active', expiresAtIso: future }).valid, true);
  assert.equal(isQrSessionValid({ status: 'closed', expiresAtIso: future }).valid, false);
  assert.equal(isQrSessionValid({ status: 'active', expiresAtIso: past }).valid, false);
});

test('Teacher attendance edit window checks elapsed hours and CSV escapes formulas', () => {
  const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const old = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  assert.equal(canTeacherEditAttendanceWindow({ createdAtIso: recent, allowHours: 24 }).allowed, true);
  assert.equal(canTeacherEditAttendanceWindow({ createdAtIso: old, allowHours: 24 }).allowed, false);
  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  assert.equal(escapeCsvCell('Ada, Okafor'), '"Ada, Okafor"');
});

test('Finance engine computes discounts, partial balances, and validates overpayments', () => {
  const discPct = computeFeeDiscount({ baseAmount: 100000, discountType: 'percentage', value: 25 });
  assert.equal(discPct.discountAmount, 25000);
  assert.equal(discPct.netAmount, 75000);

  const partial = computeAssignmentBalance({ netAmount: 75000, verifiedPaidTotal: 30000 });
  assert.equal(partial.balanceDue, 45000);
  assert.equal(partial.status, 'partial');

  const overpay = validatePaymentInput({ amountPaid: 50000, balanceDue: 45000, allowPartialPayments: true });
  assert.equal(overpay.ok, false);

  const disallowPartial = validatePaymentInput({ amountPaid: 20000, balanceDue: 45000, allowPartialPayments: false });
  assert.equal(disallowPartial.ok, false);

  assert.equal(formatReceiptNumber({ prefix: 'RCP', sequence: 42, year: 2026 }), 'RCP-2026-00042');
});

test('CBT engine performs deterministic seeded shuffle, objective marking, negative marks, and totals', () => {
  const items = ['q1', 'q2', 'q3', 'q4', 'q5'];
  const first = seededShuffle(items, 'attempt-123');
  const second = seededShuffle(items, 'attempt-123');
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);

  const mcqRight = evaluateObjectiveQuestionAnswer({
    questionType: 'mcq',
    correctAnswer: 'B',
    studentAnswer: 'b',
    marks: 2,
    negativeMarks: 0.5,
  });
  assert.equal(mcqRight.isCorrect, true);
  assert.equal(mcqRight.marksAwarded, 2);

  const mcqWrong = evaluateObjectiveQuestionAnswer({
    questionType: 'mcq',
    correctAnswer: 'B',
    studentAnswer: 'A',
    marks: 2,
    negativeMarks: 0.5,
  });
  assert.equal(mcqWrong.isCorrect, false);
  assert.equal(mcqWrong.marksAwarded, -0.5);

  const shortAns = evaluateObjectiveQuestionAnswer({
    questionType: 'short_answer',
    correctAnswer: 'Abuja|FCT Abuja',
    studentAnswer: ' fct abuja ',
    marks: 3,
    negativeMarks: 0,
  });
  assert.equal(shortAns.isCorrect, true);
  assert.equal(shortAns.marksAwarded, 3);

  const totals = computeCbtAttemptTotals({
    items: [
      { questionType: 'mcq', maxMarks: 2, marksAwarded: 2 },
      { questionType: 'mcq', maxMarks: 2, marksAwarded: -0.5 },
      { questionType: 'essay', maxMarks: 6, marksAwarded: 5 },
    ],
    passMarkPercent: 60,
  });
  assert.equal(totals.objectiveScore, 1.5);
  assert.equal(totals.manualScore, 5);
  assert.equal(totals.totalScore, 6.5);
  assert.equal(totals.percentageScore, 65);
  assert.equal(totals.passed, true);
  assert.equal(isCbtAttemptExpired(new Date(Date.now() - 5000).toISOString()), true);
});

test('Timetable conflict detector prevents teacher, room, class, and break period overlaps', () => {
  const periods = [
    { id: 'p1', label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
    { id: 'p2', label: 'Short Break', startTime: '08:45', endTime: '09:05', isBreak: true },
  ];
  const existing = [
    {
      id: 'slot_1',
      timetableId: 'tt_jss1',
      classId: 'cls_jss1',
      className: 'JSS 1',
      armId: null,
      dayOfWeek: 'Monday' as const,
      periodId: 'p1',
      teacherId: 'tch_1',
      roomId: 'rm_1',
    },
  ];

  const teacherRoomConflict = detectTimetableSlotConflicts({
    candidate: {
      timetableId: 'tt_jss2',
      classId: 'cls_jss2',
      armId: null,
      dayOfWeek: 'Monday',
      periodId: 'p1',
      teacherId: 'tch_1',
      roomId: 'rm_1',
    },
    existingSlots: existing,
    periods,
  });
  assert.ok(teacherRoomConflict.some((c) => c.type === 'teacher_conflict'));
  assert.ok(teacherRoomConflict.some((c) => c.type === 'room_conflict'));

  const breakConflict = detectTimetableSlotConflicts({
    candidate: {
      timetableId: 'tt_jss2',
      classId: 'cls_jss2',
      armId: null,
      dayOfWeek: 'Monday',
      periodId: 'p2',
      teacherId: 'tch_2',
      roomId: 'rm_2',
    },
    existingSlots: existing,
    periods,
  });
  assert.ok(breakConflict.some((c) => c.type === 'break_period_conflict'));
});
