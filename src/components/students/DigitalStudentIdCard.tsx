import React, { useState } from 'react';
import { Check, Copy, Download, Printer, QrCode, ShieldAlert } from 'lucide-react';
import { BRAND_LOGO_URL } from '../brand/Logo.tsx';
import { Button } from '../ui/button.tsx';
import type { StudentDigitalIdCardRecord } from '../../types/app.ts';

interface DigitalStudentIdCardProps {
  card: StudentDigitalIdCardRecord;
  showActions?: boolean;
  compact?: boolean;
}

export function DigitalStudentIdCard({
  card,
  showActions = true,
  compact = false,
}: DigitalStudentIdCardProps) {
  const [schoolLogoFailed, setSchoolLogoFailed] = useState(false);
  const [studentPhotoFailed, setStudentPhotoFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullName = [card.student.first_name, card.student.middle_name, card.student.last_name]
    .filter(Boolean)
    .join(' ');

  const initials = `${card.student.first_name?.[0] ?? 'S'}${card.student.last_name?.[0] ?? 'T'}`.toUpperCase();

  const statusMeta =
    card.status === 'active'
      ? {
          label: 'Active Card',
          badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        }
      : card.status === 'expired'
        ? {
            label: 'Expired Card',
            badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
          }
        : {
            label: 'Revoked Card',
            badgeClass: 'border-rose-200 bg-rose-50 text-rose-800',
          };

  const handleCopyToken = async () => {
    if (!card.qrToken || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(card.qrToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write unavailable in restricted context
    }
  };

  const handlePrint = () => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.body.classList.add('dt-printing-id-card');
    const cleanup = () => {
      document.body.classList.remove('dt-printing-id-card');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1200);
  };

  const logoSrc =
    !schoolLogoFailed && card.school.logo_file_id
      ? `/api/school/files/${card.school.logo_file_id}/download`
      : BRAND_LOGO_URL;

  return (
    <div className="space-y-4">
      <div className="print-id-card-root">
        <article
          aria-label={`Student Digital ID Card for ${fullName}`}
          className={`print-sheet overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
            compact ? 'max-w-md' : 'max-w-lg'
          }`}
        >
          {/* Institutional Header */}
          <div className="bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-[#2563EB] px-5 py-4 text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                  <img
                    src={logoSrc}
                    alt={`${card.school.name} logo`}
                    referrerPolicy="no-referrer"
                    onError={() => setSchoolLogoFailed(true)}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold tracking-tight text-white">
                    {card.school.name}
                  </p>
                  <p className="truncate text-[11px] text-blue-100">
                    {card.school.motto || `${card.school.city}${card.school.country ? `, ${card.school.country}` : ''}`}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[11px] font-medium text-blue-100">Student ID Card</p>
                <p className="font-mono text-xs font-semibold tabular-nums text-white">
                  {card.school.code}
                </p>
              </div>
            </div>
          </div>

          {/* Identity + QR Body */}
          <div className="p-5 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3.5 min-w-0">
                {card.student.photo_file_id && !studentPhotoFailed ? (
                  <img
                    src={`/api/school/files/${card.student.photo_file_id}/download`}
                    alt={fullName}
                    referrerPolicy="no-referrer"
                    onError={() => setStudentPhotoFailed(true)}
                    className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover bg-slate-50"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-900 text-lg font-bold text-white">
                    {initials}
                  </div>
                )}

                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[#0F172A] leading-snug">
                      {fullName}
                    </h3>
                  </div>
                  <p className="font-mono text-xs font-semibold text-[#1E3A8A] tabular-nums">
                    {card.student.admission_number}
                  </p>
                  <p className="text-xs text-slate-600">
                    {card.student.class_name
                      ? `${card.student.class_name}${card.student.arm_name ? ` (${card.student.arm_name})` : ''}`
                      : 'Class Pending'}
                    {' · '}
                    {card.student.gender}
                  </p>
                  <div className="pt-1">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* QR Matrix Box */}
              <div className="flex shrink-0 flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-2.5 self-start">
                {card.qrDataUrl && card.status === 'active' ? (
                  <img
                    src={card.qrDataUrl}
                    alt={`QR code for ${fullName}`}
                    className="h-32 w-32 rounded bg-white p-1 object-contain"
                  />
                ) : (
                  <div className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded bg-white p-2 text-center text-[11px] text-slate-500">
                    <ShieldAlert className="h-6 w-6 text-rose-500" aria-hidden="true" />
                    <span>{card.status === 'revoked' ? 'Card Revoked' : 'QR Unavailable'}</span>
                  </div>
                )}
                <span className="mt-1.5 font-mono text-[10px] font-medium text-slate-600 tabular-nums">
                  {card.card_number}
                </span>
              </div>
            </div>

            {/* Card Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
              <div>
                <p className="text-slate-500">Card Number</p>
                <p className="font-mono font-semibold text-[#0F172A] tabular-nums">
                  {card.card_number}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Issued Date</p>
                <p className="font-medium text-[#0F172A] tabular-nums">
                  {card.issued_at.slice(0, 10)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Valid Until</p>
                <p className="font-medium text-[#0F172A] tabular-nums">
                  {card.expires_at.slice(0, 10)}
                </p>
              </div>
            </div>

            {card.revoked_reason && card.status === 'revoked' ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                Revocation Note: {card.revoked_reason}
              </div>
            ) : null}

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-[#1E3A8A]" aria-hidden="true" />
                <span>Valid for Student Portal QR Login &amp; Attendance Scan</span>
              </span>
              <span className="font-medium text-slate-600">
                {card.student.portalLoginEnabled ? 'Portal QR Enabled' : 'Attendance QR Only'}
              </span>
            </div>
          </div>
        </article>
      </div>

      {showActions ? (
        <div className="no-print flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handlePrint}
            className="whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            <span>Print ID Card</span>
          </Button>

          {card.qrDataUrl && card.status === 'active' ? (
            <a
              href={card.qrDataUrl}
              download={`${card.card_number}-qr.png`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-[#0F172A] shadow-xs transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Download QR PNG</span>
            </a>
          ) : null}

          {card.qrToken && card.status === 'active' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleCopyToken()}
              className="whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <span>Copied Code</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>Copy QR Code</span>
                </>
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
