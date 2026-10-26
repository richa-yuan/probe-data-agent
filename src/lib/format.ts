import type { ValueFormat } from '../types';

export function detectFormat(columnName: string): ValueFormat {
  if (/(率|占比|比例|转化|留存|增长率|完成率|rate|ratio|percent)/i.test(columnName)) {
    return { type: 'percent' };
  }
  if (
    /(销售额|金额|收入|利润|价格|客单价|成本|费用|gmv|revenue|sales|profit|price|amount|spend)/i.test(
      columnName,
    )
  ) {
    return { type: 'currency' };
  }
  return { type: 'number' };
}

export function formatNumber(
  value: number,
  format: ValueFormat = { type: 'number' },
  compact = false,
): string {
  if (!Number.isFinite(value)) return '—';

  const useCompact = compact && Math.abs(value) >= 10_000;

  if (format.type === 'currency') {
    if (useCompact) {
      return `¥${new Intl.NumberFormat('zh-CN', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)}`;
    }
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(value);
  }

  const maximumFractionDigits =
    Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 1 : 2;

  const formatted = new Intl.NumberFormat('zh-CN', {
    notation: useCompact ? 'compact' : 'standard',
    maximumFractionDigits: useCompact ? 1 : maximumFractionDigits,
    useGrouping: true,
  }).format(value);

  return format.type === 'percent' ? `${formatted}%` : formatted;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(Math.round(value));
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatCell(value: unknown, maxLength = 36): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value);
  }
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function formatDateLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  if (!month || !day) return iso;
  return `${Number(month)}月${Number(day)}日`;
}

export function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}
