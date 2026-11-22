import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDashboardPathForRole(roleCode: string): string {
  switch (roleCode) {
    case 'platform_owner':
    case 'workforce_admin':
    case 'workforce_support':
      return '/dashboard/owner';
    case 'school_admin':
      return '/dashboard/school-admin';
    case 'teacher':
      return '/dashboard/teacher';
    case 'student':
      return '/dashboard/student';
    case 'parent':
      return '/dashboard/parent';
    default:
      return '/';
  }
}

export function formatUtcTimestamp(isoOrSqliteDate: string): string {
  if (!isoOrSqliteDate) return '—';
  const normalized = isoOrSqliteDate.includes('T')
    ? isoOrSqliteDate
    : `${isoOrSqliteDate.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return isoOrSqliteDate;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
