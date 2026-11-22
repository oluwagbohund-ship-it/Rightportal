import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { buildSimpleTabularPdf } from '../../academics-engine.ts';
import { escapeCsvCell } from '../../attendance-engine.ts';
import { recordAuditLog } from '../../audit.ts';
import { saveValidatedFile } from '../../file-storage.ts';
import {
  computeAssignmentBalance,
  computeFeeDiscount,
  formatReceiptNumber,
  roundMoney,
  validatePaymentInput,
} from '../../finance-engine.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import {
  applyScholarshipDiscountSchema,
  assignStudentFeesSchema,
  createExpenseSchema,
  createFeeCategorySchema,
  createFeeStructureSchema,
  recordFeePaymentSchema,
  reversePaymentSchema,
  updateFinancialSettingsSchema,
  verifyOrRejectPaymentSchema,
} from '../../validation-v1.ts';

export const schoolFinanceRouter = Router();

function ensureFinancialSettings(schoolId: string) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO financial_settings (school_id) VALUES (?)').run(schoolId);
  return db
    .prepare('SELECT * FROM financial_settings WHERE school_id = ?')
    .get(schoolId) as {
    school_id: string;
    currency_code: string;
    currency_symbol: string;
    receipt_prefix: string;
    receipt_next_seq: number;
    allow_partial_payments: number;
    require_admin_verification: number;
    bank_payment_instructions: string;
  };
}

function recalculateFeeAssignment(schoolId: string, feeAssignmentId: string): void {
  const db = getDb();
  const assignment = db
    .prepare('SELECT id, base_amount, status FROM student_fee_assignments WHERE id = ? AND school_id = ?')
    .get(feeAssignmentId, schoolId) as { id: string; base_amount: number; status: string } | undefined;
  if (!assignment) return;

  const discounts = db
    .prepare("SELECT SUM(computed_discount) AS total FROM student_discounts_scholarships WHERE school_id = ? AND fee_assignment_id = ? AND status = 'active'")
    .get(schoolId, feeAssignmentId) as { total: number | null };

  const discountAmount = Math.min(assignment.base_amount, roundMoney(Number(discounts.total ?? 0)));
  const netAmount = roundMoney(Math.max(0, assignment.base_amount - discountAmount));

  const verifiedPayments = db
    .prepare("SELECT SUM(amount_paid) AS total FROM fee_payments WHERE school_id = ? AND fee_assignment_id = ? AND status = 'verified'")
    .get(schoolId, feeAssignmentId) as { total: number | null };

  const verifiedPaidTotal = roundMoney(Number(verifiedPayments.total ?? 0));
  const computed = computeAssignmentBalance({
    netAmount,
    verifiedPaidTotal,
    isWaived: assignment.status === 'waived',
  });

  db.prepare(`
    UPDATE student_fee_assignments
    SET discount_amount = ?, net_amount = ?, amount_paid = ?, balance_due = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? AND school_id = ?
  `).run(
    discountAmount,
    netAmount,
    computed.amountPaid,
    computed.balanceDue,
    computed.status,
    feeAssignmentId,
    schoolId,
  );
}

schoolFinanceRouter.get(
  '/finance/settings',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    res.json({ settings: ensureFinancialSettings(req.auth!.activeSchoolId!) });
  },
);

schoolFinanceRouter.put(
  '/finance/settings',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateFinancialSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid financial settings.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureFinancialSettings(schoolId);

    db.prepare(`
      UPDATE financial_settings SET
        currency_code = ?,
        currency_symbol = ?,
        receipt_prefix = ?,
        allow_partial_payments = ?,
        require_admin_verification = ?,
        bank_payment_instructions = ?,
        updated_at = datetime('now')
      WHERE school_id = ?
    `).run(
      parsed.data.currencyCode,
      parsed.data.currencySymbol,
      parsed.data.receiptPrefix.toUpperCase(),
      parsed.data.allowPartialPayments ? 1 : 0,
      parsed.data.requireAdminVerification ? 1 : 0,
      parsed.data.bankPaymentInstructions,
      schoolId,
    );

    res.json({ settings: ensureFinancialSettings(schoolId) });
  },
);

schoolFinanceRouter.get(
  '/finance/overview',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureFinancialSettings(schoolId);

    const billingTotals = db
      .prepare(`
        SELECT
          COUNT(*) AS assignments_count,
          COALESCE(SUM(net_amount), 0) AS total_billed,
          COALESCE(SUM(amount_paid), 0) AS total_collected,
          COALESCE(SUM(balance_due), 0) AS total_outstanding,
          COALESCE(SUM(discount_amount), 0) AS total_discounts
        FROM student_fee_assignments
        WHERE school_id = ?
      `)
      .get(schoolId) as {
      assignments_count: number;
      total_billed: number;
      total_collected: number;
      total_outstanding: number;
      total_discounts: number;
    };

    const pendingVerificationCount = (
      db
        .prepare("SELECT COUNT(*) AS count FROM fee_payments WHERE school_id = ? AND status = 'pending_verification'")
        .get(schoolId) as { count: number }
    ).count;

    const expenseTotals = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total_expenses, COUNT(*) AS count
        FROM school_expenses
        WHERE school_id = ? AND status != 'voided'
      `)
      .get(schoolId) as { total_expenses: number; count: number };

    const recentPayments = db
      .prepare(`
        SELECT
          fp.id, fp.receipt_number, fp.amount_paid, fp.payment_method, fp.payment_date, fp.status,
          s.admission_number, s.first_name, s.last_name, fs.name AS fee_name
        FROM fee_payments fp
        INNER JOIN students s ON s.id = fp.student_id
        INNER JOIN student_fee_assignments sfa ON sfa.id = fp.fee_assignment_id
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE fp.school_id = ?
        ORDER BY fp.created_at DESC
        LIMIT 10
      `)
      .all(schoolId);

    res.json({
      settings,
      totals: {
        ...billingTotals,
        total_expenses: roundMoney(expenseTotals.total_expenses),
        expenses_count: expenseTotals.count,
        net_position: roundMoney(billingTotals.total_collected - expenseTotals.total_expenses),
        pendingVerificationCount,
      },
      recentPayments,
    });
  },
);

// Fee Categories
schoolFinanceRouter.get(
  '/finance/categories',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const categories = db
      .prepare('SELECT * FROM fee_categories WHERE school_id = ? ORDER BY name ASC')
      .all(req.auth!.activeSchoolId!);
    res.json({ categories });
  },
);

schoolFinanceRouter.post(
  '/finance/categories',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createFeeCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid category.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const code = parsed.data.code.toUpperCase();
    const dup = db
      .prepare('SELECT id FROM fee_categories WHERE school_id = ? AND (UPPER(code) = ? OR LOWER(name) = LOWER(?))')
      .get(schoolId, code, parsed.data.name);
    if (dup) {
      res.status(409).json({ error: 'A fee category with this name or code already exists.' });
      return;
    }

    const id = `fcat_${crypto.randomUUID()}`;
    db.prepare('INSERT INTO fee_categories (id, school_id, name, code, description) VALUES (?, ?, ?, ?, ?)').run(
      id,
      schoolId,
      parsed.data.name,
      code,
      parsed.data.description,
    );
    res.status(201).json({ category: db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(id) });
  },
);

// Fee Structures
schoolFinanceRouter.get(
  '/finance/structures',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const structures = db
      .prepare(`
        SELECT
          fs.*, fc.name AS category_name, fc.code AS category_code,
          c.name AS class_name, trm.name AS term_name, ses.name AS session_name,
          (SELECT COUNT(*) FROM student_fee_assignments sfa WHERE sfa.fee_structure_id = fs.id) AS assigned_students_count
        FROM fee_structures fs
        INNER JOIN fee_categories fc ON fc.id = fs.fee_category_id
        LEFT JOIN school_classes c ON c.id = fs.class_id
        LEFT JOIN academic_terms trm ON trm.id = fs.academic_term_id
        LEFT JOIN academic_sessions ses ON ses.id = fs.academic_session_id
        WHERE fs.school_id = ?
        ORDER BY fs.created_at DESC
      `)
      .all(req.auth!.activeSchoolId!);
    res.json({ structures });
  },
);

schoolFinanceRouter.post(
  '/finance/structures',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createFeeStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid fee structure.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const cat = db
      .prepare('SELECT id FROM fee_categories WHERE id = ? AND school_id = ?')
      .get(parsed.data.feeCategoryId, schoolId);
    if (!cat) {
      res.status(404).json({ error: 'Fee category not found.' });
      return;
    }

    const id = `fstr_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO fee_structures (
        id, school_id, fee_category_id, academic_session_id, academic_term_id, class_id,
        name, amount, due_date, is_mandatory, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      schoolId,
      parsed.data.feeCategoryId,
      parsed.data.academicSessionId ?? null,
      parsed.data.academicTermId ?? null,
      parsed.data.classId ?? null,
      parsed.data.name,
      roundMoney(parsed.data.amount),
      parsed.data.dueDate,
      parsed.data.isMandatory ? 1 : 0,
      req.auth!.id,
    );

    res.status(201).json({ structure: db.prepare('SELECT * FROM fee_structures WHERE id = ?').get(id) });
  },
);

// Student Billing & Assignments
schoolFinanceRouter.get(
  '/finance/billing',
  requirePermission('school.finance.record'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';

    const conditions = ['sfa.school_id = ?'];
    const params: string[] = [schoolId];
    if (statusFilter && ['unpaid', 'partial', 'paid', 'waived'].includes(statusFilter)) {
      conditions.push('sfa.status = ?');
      params.push(statusFilter);
    }
    if (studentId) {
      conditions.push('sfa.student_id = ?');
      params.push(studentId);
    }

    const assignments = db
      .prepare(`
        SELECT
          sfa.*,
          s.admission_number, s.first_name, s.last_name,
          c.name AS class_name, fs.name AS fee_name, fc.name AS category_name,
          trm.name AS term_name
        FROM student_fee_assignments sfa
        INNER JOIN students s ON s.id = sfa.student_id
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        INNER JOIN fee_categories fc ON fc.id = fs.fee_category_id
        LEFT JOIN academic_terms trm ON trm.id = sfa.academic_term_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY sfa.balance_due DESC, s.last_name ASC
        LIMIT 250
      `)
      .all(...params);

    res.json({ assignments, settings: ensureFinancialSettings(schoolId) });
  },
);

schoolFinanceRouter.post(
  '/finance/billing/assign',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = assignStudentFeesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid billing request.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const structure = db
      .prepare('SELECT * FROM fee_structures WHERE id = ? AND school_id = ?')
      .get(parsed.data.feeStructureId, schoolId) as
      | {
          id: string;
          amount: number;
          class_id: string | null;
          academic_session_id: string | null;
          academic_term_id: string | null;
          due_date: string;
        }
      | undefined;

    if (!structure) {
      res.status(404).json({ error: 'Fee structure not found.' });
      return;
    }

    let targetStudentIds = parsed.data.studentIds ?? [];
    if (targetStudentIds.length === 0) {
      const targetClassId = parsed.data.classId ?? structure.class_id;
      const rows = targetClassId
        ? (db
            .prepare("SELECT id FROM students WHERE school_id = ? AND current_class_id = ? AND status = 'active'")
            .all(schoolId, targetClassId) as Array<{ id: string }>)
        : (db
            .prepare("SELECT id FROM students WHERE school_id = ? AND status = 'active'")
            .all(schoolId) as Array<{ id: string }>);
      targetStudentIds = rows.map((r) => r.id);
    }

    if (targetStudentIds.length === 0) {
      res.status(400).json({ error: 'No matching active students found to assign this fee.' });
      return;
    }

    let createdCount = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const stuId of targetStudentIds) {
        const stu = db.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').get(stuId, schoolId);
        if (!stu) continue;
        const exists = db
          .prepare('SELECT id FROM student_fee_assignments WHERE school_id = ? AND student_id = ? AND fee_structure_id = ?')
          .get(schoolId, stuId, structure.id);
        if (exists) continue;

        const base = roundMoney(structure.amount);
        const initialStatus = base === 0 ? 'paid' : 'unpaid';
        db.prepare(`
          INSERT INTO student_fee_assignments (
            id, school_id, student_id, fee_structure_id, academic_session_id, academic_term_id,
            base_amount, discount_amount, net_amount, amount_paid, balance_due, status, due_date, notes, assigned_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?)
        `).run(
          `sfa_${crypto.randomUUID()}`,
          schoolId,
          stuId,
          structure.id,
          structure.academic_session_id,
          structure.academic_term_id,
          base,
          base,
          base,
          initialStatus,
          parsed.data.dueDate || structure.due_date || '',
          parsed.data.notes,
          req.auth!.id,
        );
        createdCount++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to assign student fees.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.finance.fees_assigned',
      resourceType: 'fee_structure',
      resourceId: structure.id,
      outcome: 'success',
      metadata: { createdCount },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ createdCount });
  },
);

// Scholarships & Discounts
schoolFinanceRouter.get(
  '/finance/scholarships',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const discounts = db
      .prepare(`
        SELECT sds.*, s.admission_number, s.first_name, s.last_name, fs.name AS fee_name
        FROM student_discounts_scholarships sds
        INNER JOIN students s ON s.id = sds.student_id
        LEFT JOIN student_fee_assignments sfa ON sfa.id = sds.fee_assignment_id
        LEFT JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE sds.school_id = ?
        ORDER BY sds.created_at DESC
      `)
      .all(req.auth!.activeSchoolId!);
    res.json({ discounts });
  },
);

schoolFinanceRouter.post(
  '/finance/scholarships',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = applyScholarshipDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid discount request.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const assignment = db
      .prepare('SELECT id, student_id, academic_term_id, base_amount FROM student_fee_assignments WHERE id = ? AND student_id = ? AND school_id = ?')
      .get(parsed.data.feeAssignmentId, parsed.data.studentId, schoolId) as
      | { id: string; student_id: string; academic_term_id: string | null; base_amount: number }
      | undefined;

    if (!assignment) {
      res.status(404).json({ error: 'Student fee assignment not found.' });
      return;
    }

    const { discountAmount } = computeFeeDiscount({
      baseAmount: assignment.base_amount,
      discountType: parsed.data.discountType,
      value: parsed.data.value,
    });

    const id = `dsc_${crypto.randomUUID()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO student_discounts_scholarships (
          id, school_id, student_id, fee_assignment_id, academic_term_id, title,
          discount_type, value, computed_discount, reason, approved_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        schoolId,
        assignment.student_id,
        assignment.id,
        assignment.academic_term_id,
        parsed.data.title,
        parsed.data.discountType,
        parsed.data.value,
        discountAmount,
        parsed.data.reason,
        req.auth!.id,
      );
      recalculateFeeAssignment(schoolId, assignment.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to apply discount.' });
      return;
    }

    res.status(201).json({ id, computedDiscount: discountAmount });
  },
);

// Payment Recording, Verification, Rejection, Reversal & Receipt PDF
schoolFinanceRouter.get(
  '/finance/payments',
  requirePermission('school.finance.record'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';

    const payments = db
      .prepare(`
        SELECT
          fp.*, s.admission_number, s.first_name, s.last_name,
          fs.name AS fee_name, rec_u.full_name AS recorded_by_name, ver_u.full_name AS verified_by_name
        FROM fee_payments fp
        INNER JOIN students s ON s.id = fp.student_id
        INNER JOIN student_fee_assignments sfa ON sfa.id = fp.fee_assignment_id
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        LEFT JOIN users rec_u ON rec_u.id = fp.recorded_by_user_id
        LEFT JOIN users ver_u ON ver_u.id = fp.verified_by_user_id
        WHERE fp.school_id = ? ${statusFilter ? 'AND fp.status = ?' : ''}
        ORDER BY fp.created_at DESC
        LIMIT 250
      `)
      .all(...(statusFilter ? [schoolId, statusFilter] : [schoolId]));

    res.json({ payments, settings: ensureFinancialSettings(schoolId) });
  },
);

schoolFinanceRouter.post(
  '/finance/payments',
  requireCsrfCheck,
  requirePermission('school.finance.record'),
  (req: AuthenticatedRequest, res) => {
    const parsed = recordFeePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureFinancialSettings(schoolId);

    const assignment = db
      .prepare('SELECT id, student_id, academic_term_id, balance_due, status FROM student_fee_assignments WHERE id = ? AND student_id = ? AND school_id = ?')
      .get(parsed.data.feeAssignmentId, parsed.data.studentId, schoolId) as
      | { id: string; student_id: string; academic_term_id: string | null; balance_due: number; status: string }
      | undefined;

    if (!assignment) {
      res.status(404).json({ error: 'Student fee assignment not found.' });
      return;
    }

    const check = validatePaymentInput({
      amountPaid: parsed.data.amountPaid,
      balanceDue: assignment.balance_due,
      allowPartialPayments: settings.allow_partial_payments === 1,
    });
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    let proofFileId: string | null = null;
    if (parsed.data.proofFile) {
      const stuUser = db
        .prepare('SELECT user_id FROM students WHERE id = ? AND school_id = ?')
        .get(parsed.data.studentId, schoolId) as { user_id: string | null } | undefined;
      const stored = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId: stuUser?.user_id ?? null,
        category: 'student_document',
        originalName: parsed.data.proofFile.fileName,
        claimedMimeType: parsed.data.proofFile.mimeType,
        contentBase64: parsed.data.proofFile.contentBase64,
        visibility: 'private_tenant',
      });
      proofFileId = stored.id;
    }

    // Rule: Uploading proof NEVER auto-verifies a payment; bank transfer with proof defaults to pending_verification
    // unless authorized admin explicitly verifies immediate cash/POS entry.
    const canManage = req.auth!.permissions.includes('school.finance.manage');
    const shouldVerifyImmediately =
      canManage &&
      parsed.data.verifyImmediately &&
      (settings.require_admin_verification === 0 || !parsed.data.proofFile);

    const paymentStatus = shouldVerifyImmediately ? 'verified' : 'pending_verification';
    const paymentId = `pay_${crypto.randomUUID()}`;
    const receiptNumber = formatReceiptNumber({
      prefix: settings.receipt_prefix,
      sequence: settings.receipt_next_seq,
    });

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE financial_settings SET receipt_next_seq = receipt_next_seq + 1 WHERE school_id = ?').run(schoolId);
      db.prepare(`
        INSERT INTO fee_payments (
          id, school_id, student_id, fee_assignment_id, academic_term_id, receipt_number,
          amount_paid, payment_method, custom_method_label, reference_code, payment_date,
          status, proof_file_id, notes, recorded_by_user_id, verified_by_user_id, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentId,
        schoolId,
        parsed.data.studentId,
        assignment.id,
        assignment.academic_term_id,
        receiptNumber,
        roundMoney(parsed.data.amountPaid),
        parsed.data.paymentMethod,
        parsed.data.customMethodLabel,
        parsed.data.referenceCode,
        parsed.data.paymentDate,
        paymentStatus,
        proofFileId,
        parsed.data.notes,
        req.auth!.id,
        shouldVerifyImmediately ? req.auth!.id : null,
        shouldVerifyImmediately ? new Date().toISOString() : null,
      );

      recalculateFeeAssignment(schoolId, assignment.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to record payment.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.finance.payment_recorded',
      resourceType: 'fee_payment',
      resourceId: paymentId,
      outcome: 'success',
      metadata: { receiptNumber, amountPaid: parsed.data.amountPaid, status: paymentStatus },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      payment: db.prepare('SELECT * FROM fee_payments WHERE id = ?').get(paymentId),
    });
  },
);

schoolFinanceRouter.patch(
  '/finance/payments/:paymentId/verify',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = verifyOrRejectPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid verification decision.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const payment = db
      .prepare('SELECT id, fee_assignment_id, amount_paid, status FROM fee_payments WHERE id = ? AND school_id = ?')
      .get(req.params.paymentId, schoolId) as
      | { id: string; fee_assignment_id: string; amount_paid: number; status: string }
      | undefined;

    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    if (payment.status !== 'pending_verification') {
      res.status(400).json({ error: `Cannot verify payment in ${payment.status} state.` });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE fee_payments
        SET status = ?, verified_by_user_id = ?, verified_at = datetime('now'),
            notes = CASE WHEN ? != '' THEN notes || ' | ' || ? ELSE notes END
        WHERE id = ? AND school_id = ?
      `).run(parsed.data.decision, req.auth!.id, parsed.data.notes, parsed.data.notes, payment.id, schoolId);

      recalculateFeeAssignment(schoolId, payment.fee_assignment_id);
      db.exec('COMMIT');
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to update payment verification status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: `school.finance.payment_${parsed.data.decision}`,
      resourceType: 'fee_payment',
      resourceId: payment.id,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ id: payment.id, status: parsed.data.decision });
  },
);

schoolFinanceRouter.post(
  '/finance/payments/:paymentId/reverse',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = reversePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Reversal reason required.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const payment = db
      .prepare('SELECT id, fee_assignment_id, receipt_number, amount_paid, status FROM fee_payments WHERE id = ? AND school_id = ?')
      .get(req.params.paymentId, schoolId) as
      | { id: string; fee_assignment_id: string; receipt_number: string; amount_paid: number; status: string }
      | undefined;

    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    if (payment.status === 'reversed') {
      res.status(400).json({ error: 'Payment has already been reversed.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE fee_payments
        SET status = 'reversed', reversal_reason = ?, reversed_by_user_id = ?, reversed_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(parsed.data.reason, req.auth!.id, payment.id, schoolId);
      recalculateFeeAssignment(schoolId, payment.fee_assignment_id);
      db.exec('COMMIT');
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to reverse payment.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.finance.payment_reversed',
      resourceType: 'fee_payment',
      resourceId: payment.id,
      outcome: 'success',
      metadata: { receiptNumber: payment.receipt_number, amountPaid: payment.amount_paid, reason: parsed.data.reason },
      ipAddress: getClientIp(req),
    });

    res.json({ id: payment.id, status: 'reversed' });
  },
);

schoolFinanceRouter.get(
  '/finance/payments/:paymentId/receipt.pdf',
  requirePermission('school.files.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const payment = db
      .prepare(`
        SELECT fp.*, s.user_id AS student_user_id, s.admission_number, s.first_name, s.last_name,
               c.name AS class_name, fs.name AS fee_name, sfa.net_amount, sfa.amount_paid AS total_paid, sfa.balance_due,
               sch.name AS school_name, sch.code AS school_code
        FROM fee_payments fp
        INNER JOIN students s ON s.id = fp.student_id
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        INNER JOIN student_fee_assignments sfa ON sfa.id = fp.fee_assignment_id
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        INNER JOIN schools sch ON sch.id = fp.school_id
        WHERE fp.id = ? AND fp.school_id = ?
      `)
      .get(req.params.paymentId, schoolId) as
      | {
          id: string;
          student_id: string;
          student_user_id: string | null;
          receipt_number: string;
          amount_paid: number;
          payment_method: string;
          reference_code: string;
          payment_date: string;
          status: string;
          admission_number: string;
          first_name: string;
          last_name: string;
          class_name: string | null;
          fee_name: string;
          net_amount: number;
          total_paid: number;
          balance_due: number;
          school_name: string;
          school_code: string;
        }
      | undefined;

    if (!payment) {
      res.status(404).json({ error: 'Receipt not found.' });
      return;
    }

    const isFinanceStaff =
      req.auth!.permissions.includes('school.finance.manage') ||
      req.auth!.permissions.includes('school.finance.record');

    if (!isFinanceStaff) {
      if (req.auth!.roleCode === 'student' && payment.student_user_id !== req.auth!.id) {
        res.status(403).json({ error: 'Access denied to this payment receipt.' });
        return;
      }
      if (req.auth!.roleCode === 'parent') {
        const linked = db
          .prepare(`
            SELECT 1 FROM parents p
            INNER JOIN student_guardians sg ON sg.parent_id = p.id
            WHERE p.school_id = ? AND p.user_id = ? AND sg.student_id = ?
          `)
          .get(schoolId, req.auth!.id, payment.student_id);
        if (!linked) {
          res.status(403).json({ error: 'Access denied to this ward payment receipt.' });
          return;
        }
      }
    }

    const settings = ensureFinancialSettings(schoolId);
    const pdfBuf = buildSimpleTabularPdf({
      title: `${payment.school_name} — Official Payment Receipt`,
      subtitle: `Receipt No: ${payment.receipt_number} | Status: ${payment.status.toUpperCase()}`,
      metaLines: [
        `Student: ${payment.first_name} ${payment.last_name} (${payment.admission_number}) | Class: ${payment.class_name ?? 'Unassigned'}`,
        `Payment Date: ${payment.payment_date} | Method: ${payment.payment_method.toUpperCase()} | Ref: ${payment.reference_code || 'N/A'}`,
      ],
      columns: [
        { label: 'Fee Description', x: 42 },
        { label: 'Net Billed', x: 255 },
        { label: 'This Payment', x: 345 },
        { label: 'Total Paid', x: 435 },
        { label: 'Balance', x: 505 },
      ],
      rows: [
        [
          payment.fee_name,
          `${settings.currency_code} ${payment.net_amount.toFixed(2)}`,
          `${settings.currency_code} ${payment.amount_paid.toFixed(2)}`,
          `${settings.currency_code} ${payment.total_paid.toFixed(2)}`,
          `${settings.currency_code} ${payment.balance_due.toFixed(2)}`,
        ],
      ],
      footerLines: [
        `Issued by ${payment.school_name} (${payment.school_code}) via Dave Timi EdTech Systems.`,
        'Only verified receipts reduce institutional fee balances.',
      ],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.receipt_number}.pdf"`);
    res.send(pdfBuf);
  },
);

// Expenses & Financial Reports
schoolFinanceRouter.get(
  '/finance/expenses',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const expenses = db
      .prepare(`
        SELECT e.*, u.full_name AS recorded_by_name
        FROM school_expenses e
        LEFT JOIN users u ON u.id = e.recorded_by_user_id
        WHERE e.school_id = ?
        ORDER BY e.expense_date DESC, e.created_at DESC
        LIMIT 200
      `)
      .all(req.auth!.activeSchoolId!);
    res.json({ expenses, settings: ensureFinancialSettings(req.auth!.activeSchoolId!) });
  },
);

schoolFinanceRouter.post(
  '/finance/expenses',
  requireCsrfCheck,
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid expense payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const id = `exp_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO school_expenses (
        id, school_id, academic_term_id, category, title, vendor, amount,
        expense_date, payment_method, reference_code, notes, status, recorded_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
    `).run(
      id,
      schoolId,
      parsed.data.academicTermId ?? null,
      parsed.data.category,
      parsed.data.title,
      parsed.data.vendor,
      roundMoney(parsed.data.amount),
      parsed.data.expenseDate,
      parsed.data.paymentMethod,
      parsed.data.referenceCode,
      parsed.data.notes,
      req.auth!.id,
    );

    res.status(201).json({ expense: db.prepare('SELECT * FROM school_expenses WHERE id = ?').get(id) });
  },
);

schoolFinanceRouter.get(
  '/finance/reports',
  requirePermission('school.finance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const format = typeof req.query.format === 'string' ? req.query.format : 'json';

    const byCategory = db
      .prepare(`
        SELECT
          fc.name AS category_name,
          COUNT(sfa.id) AS fee_items,
          COALESCE(SUM(sfa.net_amount), 0) AS total_billed,
          COALESCE(SUM(sfa.amount_paid), 0) AS total_collected,
          COALESCE(SUM(sfa.balance_due), 0) AS total_outstanding
        FROM student_fee_assignments sfa
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        INNER JOIN fee_categories fc ON fc.id = fs.fee_category_id
        WHERE sfa.school_id = ?
        GROUP BY fc.id, fc.name
        ORDER BY total_billed DESC
      `)
      .all(schoolId) as Array<{
      category_name: string;
      fee_items: number;
      total_billed: number;
      total_collected: number;
      total_outstanding: number;
    }>;

    const byMethod = db
      .prepare(`
        SELECT payment_method, COUNT(*) AS payment_count, COALESCE(SUM(amount_paid), 0) AS total_amount
        FROM fee_payments
        WHERE school_id = ? AND status = 'verified'
        GROUP BY payment_method
      `)
      .all(schoolId);

    const expensesByCategory = db
      .prepare(`
        SELECT category, COUNT(*) AS expense_count, COALESCE(SUM(amount), 0) AS total_amount
        FROM school_expenses
        WHERE school_id = ? AND status != 'voided'
        GROUP BY category
      `)
      .all(schoolId);

    if (format === 'csv') {
      const header = ['Category', 'Fee Items', 'Net Billed', 'Collected', 'Outstanding'].map(escapeCsvCell).join(',');
      const lines = byCategory.map((r) =>
        [r.category_name, r.fee_items, r.total_billed, r.total_collected, r.total_outstanding]
          .map(escapeCsvCell)
          .join(','),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="financial-summary.csv"');
      res.send([header, ...lines].join('\n'));
      return;
    }

    res.json({
      settings: ensureFinancialSettings(schoolId),
      byCategory,
      byMethod,
      expensesByCategory,
    });
  },
);

// Student & Parent Fee Statements
schoolFinanceRouter.get(
  '/student/finance',
  requirePermission('student.finance.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureFinancialSettings(schoolId);
    const student = db
      .prepare('SELECT id, admission_number, first_name, last_name FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    if (!student) {
      res.json({ settings, assignments: [], payments: [], totals: { netAmount: 0, amountPaid: 0, balanceDue: 0 } });
      return;
    }

    const assignments = db
      .prepare(`
        SELECT sfa.*, fs.name AS fee_name, fc.name AS category_name, trm.name AS term_name
        FROM student_fee_assignments sfa
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        INNER JOIN fee_categories fc ON fc.id = fs.fee_category_id
        LEFT JOIN academic_terms trm ON trm.id = sfa.academic_term_id
        WHERE sfa.school_id = ? AND sfa.student_id = ?
        ORDER BY sfa.created_at DESC
      `)
      .all(schoolId, student.id) as Array<{ net_amount: number; amount_paid: number; balance_due: number }>;

    const payments = db
      .prepare(`
        SELECT fp.*, fs.name AS fee_name
        FROM fee_payments fp
        INNER JOIN student_fee_assignments sfa ON sfa.id = fp.fee_assignment_id
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE fp.school_id = ? AND fp.student_id = ?
        ORDER BY fp.created_at DESC
      `)
      .all(schoolId, student.id);

    const totals = {
      netAmount: roundMoney(assignments.reduce((s, a) => s + Number(a.net_amount ?? 0), 0)),
      amountPaid: roundMoney(assignments.reduce((s, a) => s + Number(a.amount_paid ?? 0), 0)),
      balanceDue: roundMoney(assignments.reduce((s, a) => s + Number(a.balance_due ?? 0), 0)),
    };

    res.json({ settings, student, assignments, payments, totals });
  },
);

schoolFinanceRouter.get(
  '/parent/finance',
  requirePermission('parent.finance.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureFinancialSettings(schoolId);
    const parent = db
      .prepare("SELECT id FROM parents WHERE school_id = ? AND user_id = ? AND status = 'active' LIMIT 1")
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    if (!parent) {
      res.json({ settings, wards: [] });
      return;
    }

    const wards = db
      .prepare(`
        SELECT s.id, s.admission_number, s.first_name, s.last_name, c.name AS class_name
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id AND s.school_id = sg.school_id
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        WHERE sg.school_id = ? AND sg.parent_id = ?
      `)
      .all(schoolId, parent.id) as Array<{ id: string }>;

    const result = wards.map((ward) => {
      const assignments = db
        .prepare(`
          SELECT sfa.*, fs.name AS fee_name, fc.name AS category_name
          FROM student_fee_assignments sfa
          INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
          INNER JOIN fee_categories fc ON fc.id = fs.fee_category_id
          WHERE sfa.school_id = ? AND sfa.student_id = ?
          ORDER BY sfa.created_at DESC
        `)
        .all(schoolId, ward.id);
      const payments = db
        .prepare(`
          SELECT fp.*, fs.name AS fee_name
          FROM fee_payments fp
          INNER JOIN student_fee_assignments sfa ON sfa.id = fp.fee_assignment_id
          INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
          WHERE fp.school_id = ? AND fp.student_id = ?
          ORDER BY fp.created_at DESC
        `)
        .all(schoolId, ward.id);
      return { ward, assignments, payments };
    });

    res.json({ settings, wards: result });
  },
);
