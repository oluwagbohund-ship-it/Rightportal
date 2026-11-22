-- Dave Timi EdTech Systems — Phase 5 School Finance Management
-- Migration 006: Financial Settings, Fee Categories, Fee Structures, Student Billing, Discounts, Manual Verified Payments, Expenses

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS financial_settings (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL DEFAULT 'NGN',
  currency_symbol TEXT NOT NULL DEFAULT 'NGN ',
  receipt_prefix TEXT NOT NULL DEFAULT 'RCP',
  receipt_next_seq INTEGER NOT NULL DEFAULT 1 CHECK (receipt_next_seq >= 1),
  allow_partial_payments INTEGER NOT NULL DEFAULT 1 CHECK (allow_partial_payments IN (0, 1)),
  require_admin_verification INTEGER NOT NULL DEFAULT 1 CHECK (require_admin_verification IN (0, 1)),
  bank_payment_instructions TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_categories (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_category_id TEXT NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  due_date TEXT NOT NULL DEFAULT '',
  is_mandatory INTEGER NOT NULL DEFAULT 1 CHECK (is_mandatory IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_fee_assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id TEXT NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  base_amount REAL NOT NULL CHECK (base_amount >= 0),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  net_amount REAL NOT NULL CHECK (net_amount >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_due REAL NOT NULL CHECK (balance_due >= 0),
  status TEXT NOT NULL CHECK (status IN ('unpaid', 'partial', 'paid', 'waived')) DEFAULT 'unpaid',
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, student_id, fee_structure_id)
);

CREATE TABLE IF NOT EXISTS student_discounts_scholarships (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_assignment_id TEXT REFERENCES student_fee_assignments(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  value REAL NOT NULL CHECK (value > 0),
  computed_discount REAL NOT NULL DEFAULT 0 CHECK (computed_discount >= 0),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_assignment_id TEXT NOT NULL REFERENCES student_fee_assignments(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  amount_paid REAL NOT NULL CHECK (amount_paid > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'pos', 'custom')),
  custom_method_label TEXT NOT NULL DEFAULT '',
  reference_code TEXT NOT NULL DEFAULT '',
  payment_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_verification', 'verified', 'rejected', 'reversed')) DEFAULT 'pending_verification',
  proof_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  recorded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  reversal_reason TEXT NOT NULL DEFAULT '',
  reversed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reversed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS school_expenses (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL CHECK (amount > 0),
  expense_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'pos', 'custom')) DEFAULT 'bank_transfer',
  reference_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('recorded', 'approved', 'voided')) DEFAULT 'recorded',
  recorded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_school ON fee_structures(school_id, academic_term_id, class_id, is_active);
CREATE INDEX IF NOT EXISTS idx_student_fees_lookup ON student_fee_assignments(school_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_fee_payments_lookup ON fee_payments(school_id, student_id, status, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_school_expenses_lookup ON school_expenses(school_id, expense_date DESC, status);
