export type FeeAssignmentStatus = 'unpaid' | 'partial' | 'paid' | 'waived';
export type FeeDiscountType = 'fixed' | 'percentage';

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computeFeeDiscount(params: {
  baseAmount: number;
  discountType: FeeDiscountType;
  value: number;
}): { discountAmount: number; netAmount: number } {
  const base = Math.max(0, roundMoney(params.baseAmount));
  if (params.value <= 0 || !Number.isFinite(params.value)) {
    return { discountAmount: 0, netAmount: base };
  }

  const rawDiscount =
    params.discountType === 'percentage'
      ? (base * Math.min(100, params.value)) / 100
      : params.value;

  const discountAmount = Math.min(base, roundMoney(Math.max(0, rawDiscount)));
  const netAmount = roundMoney(Math.max(0, base - discountAmount));
  return { discountAmount, netAmount };
}

export function computeAssignmentBalance(params: {
  netAmount: number;
  verifiedPaidTotal: number;
  isWaived?: boolean;
}): {
  amountPaid: number;
  balanceDue: number;
  status: FeeAssignmentStatus;
} {
  const net = Math.max(0, roundMoney(params.netAmount));
  const paid = Math.max(0, roundMoney(params.verifiedPaidTotal));

  if (params.isWaived || net === 0) {
    return {
      amountPaid: paid,
      balanceDue: 0,
      status: params.isWaived ? 'waived' : 'paid',
    };
  }

  const balanceDue = roundMoney(Math.max(0, net - paid));
  let status: FeeAssignmentStatus = 'unpaid';
  if (balanceDue <= 0.009) {
    status = 'paid';
  } else if (paid > 0) {
    status = 'partial';
  }

  return {
    amountPaid: paid,
    balanceDue,
    status,
  };
}

export function validatePaymentInput(params: {
  amountPaid: number;
  balanceDue: number;
  allowPartialPayments: boolean;
}): { ok: boolean; error?: string } {
  const amount = roundMoney(params.amountPaid);
  const due = roundMoney(params.balanceDue);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Payment amount must be greater than zero.' };
  }
  if (due <= 0) {
    return { ok: false, error: 'This fee assignment has no outstanding balance remaining.' };
  }
  if (amount > due + 0.01) {
    return {
      ok: false,
      error: `Payment amount (${amount.toFixed(2)}) exceeds outstanding balance (${due.toFixed(2)}).`,
    };
  }
  if (!params.allowPartialPayments && amount + 0.01 < due) {
    return {
      ok: false,
      error: 'School financial settings require full settlement of the remaining balance.',
    };
  }
  return { ok: true };
}

export function formatReceiptNumber(params: {
  prefix: string;
  sequence: number;
  year?: number;
}): string {
  const cleanPrefix = (params.prefix || 'RCP').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'RCP';
  const yr = params.year ?? new Date().getUTCFullYear();
  const seq = String(Math.max(1, Math.floor(params.sequence))).padStart(5, '0');
  return `${cleanPrefix}-${yr}-${seq}`;
}
