import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DEVISE, LOCALE } from '@/constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency formatting ─────────────────────────────────────────────────────
export function formatCurrency(amount: number, compact = false): string {
  if (compact) {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} Md ${DEVISE}`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} M ${DEVISE}`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)} K ${DEVISE}`;
  }
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ` ${DEVISE}`;
}

// ─── Date formatting ─────────────────────────────────────────────────────────
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffD < 7) return `Il y a ${diffD}j`;
  return formatDate(d);
}

// ─── Percentage formatting ────────────────────────────────────────────────────
export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatPercentSimple(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─── Number formatting ────────────────────────────────────────────────────────
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

// ─── Color utilities ─────────────────────────────────────────────────────────
export function getVariationColor(value: number): string {
  if (value > 0) return 'text-success-600';
  if (value < 0) return 'text-danger-600';
  return 'text-muted-foreground';
}

export function getProgressColor(percent: number): string {
  if (percent >= 100) return 'bg-success-500';
  if (percent >= 75) return 'bg-primary-500';
  if (percent >= 50) return 'bg-warning-500';
  return 'bg-danger-500';
}

// ─── String utilities ─────────────────────────────────────────────────────────
export function getInitials(nom: string, prenom?: string): string {
  if (prenom) return `${nom[0] ?? ''}${prenom[0] ?? ''}`.toUpperCase();
  const parts = nom.trim().split(' ');
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  return nom.slice(0, 2).toUpperCase();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}
