import Papa from 'papaparse';
import type {
  Cell,
  ColumnProfile,
  DataRow,
  Dataset,
  FieldType,
  NumericStats,
} from '../types';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 50_000;

const MISSING_TOKENS = new Set([
  '',
  '-',
  '—',
  'na',
  'n/a',
  'null',
  'nil',
  'none',
  'nan',
  'undefined',
  '缺失',
]);

let datasetCounter = 0;

export function newId(prefix = 'id'): string {
  datasetCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${datasetCounter}`;
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return MISSING_TOKENS.has(value.trim().toLowerCase());
  return false;
}

function isIdColumn(name: string): boolean {
  return /(^|[\s_])(id|编号|序号|单号|代码|邮编|手机号|电话|身份证)|订单号/i.test(name);
}

function isRateColumn(name: string): boolean {
  return /(率|占比|比例|转化|留存|增长|完成|rate|ratio|percent)/i.test(name);
}

export function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let text = value.trim().replace(/\s+/g, '');
  if (!text) return null;

  let negativeByParens = false;
  if (/^\(.*\)$/.test(text)) {
    negativeByParens = true;
    text = text.slice(1, -1);
  }

  text = text.replace(/[¥￥$€£,]/g, '').replace(/(元|人民币|rmb)/gi, '');

  let multiplier = 1;
  if (text.endsWith('万')) {
    multiplier = 10_000;
    text = text.slice(0, -1);
  } else if (text.endsWith('亿')) {
    multiplier = 100_000_000;
    text = text.slice(0, -1);
  }

  text = text.replace(/%$/, '').replace(/(件|单|个|次|人|笔|台|份|条|套)$/, '');
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;

  const parsed = Number(text) * multiplier;
  if (!Number.isFinite(parsed)) return null;
  return negativeByParens ? -parsed : parsed;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function parseDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const chinese = text.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日?)?/);
  if (chinese) {
    const year = Number(chinese[1]);
    const month = Number(chinese[2]);
    const day = Number(chinese[3] ?? 1);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const western = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (western) {
    const month = Number(western[1]);
    const day = Number(western[2]);
    const year = Number(western[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(
      parsed.getUTCDate(),
    )}`;
  }

  return null;
}

function looksBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value !== 'string') return false;
  return /^(true|false|yes|no|y|n|是|否)$/i.test(value.trim());
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  if (/^(true|yes|y|是)$/i.test(value.trim())) return true;
  if (/^(false|no|n|否)$/i.test(value.trim())) return false;
  return null;
}

function inferType(name: string, values: unknown[]): FieldType {
  const present = values.filter((value) => !isMissing(value));
  if (!present.length) return 'category';

  const booleanRatio =
    present.filter((value) => looksBoolean(value)).length / present.length;
  if (booleanRatio >= 0.9) return 'boolean';

  const dateRatio =
    present.filter((value) => parseDateValue(value) !== null).length / present.length;
  const dateLikeName = /(日期|时间|date|time|month|day)/i.test(name);
  if (dateRatio >= 0.85 || (dateLikeName && dateRatio >= 0.6)) return 'date';

  const numericRatio =
    present.filter((value) => parseNumeric(value) !== null).length / present.length;
  if (numericRatio >= 0.85) {
    const unique = new Set(present.map((value) => String(value))).size;
    if (isIdColumn(name) && unique > present.length * 0.5) return 'category';
    if (unique === 1) return 'category';
    return 'number';
  }

  return 'category';
}

function convertCell(value: unknown, type: FieldType): Cell {
  if (isMissing(value)) return null;
  if (type === 'number') return parseNumeric(value);
  if (type === 'date') return parseDateValue(value);
  if (type === 'boolean') return toBoolean(value);
  if (value instanceof Date) return parseDateValue(value);
  return String(value).trim();
}

function valuesOf(rows: DataRow[], name: string): Cell[] {
  return rows.map((row) => row[name]);
}

function uniqueCount(values: Cell[]): number {
  const set = new Set<string>();
  for (const value of values) {
    if (value !== null) set.add(String(value));
  }
  return set.size;
}

function quantile(sorted: number[], position: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

export function numericStats(values: number[]): NumericStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = count ? sum / count : 0;
  const variance = count
    ? sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / count
    : 0;

  return {
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
    mean,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    sum,
    std: Math.sqrt(variance),
  };
}

function buildColumnProfile(rows: DataRow[], name: string): ColumnProfile {
  const values = valuesOf(rows, name);
  const missing = values.filter((value) => value === null).length;
  const type = inferType(name, values.map((value) => value));
  const numericValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const dateValues = values
    .filter((value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  const profile: ColumnProfile = {
    name,
    type,
    total: values.length,
    missing,
    unique: uniqueCount(values),
    likelyId: isIdColumn(name),
  };

  if (type === 'number' && numericValues.length) {
    profile.numeric = numericStats(numericValues);
  }

  if (type === 'date' && dateValues.length) {
    profile.dateMin = dateValues[0];
    profile.dateMax = dateValues[dateValues.length - 1];
  }

  if (type === 'category' || type === 'boolean') {
    const counts = new Map<string, number>();
    for (const value of values) {
      if (value === null) continue;
      const key = typeof value === 'boolean' ? (value ? '是' : '否') : String(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    profile.topValues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([value, count]) => ({ value, count }));
  }

  return profile;
}

function countDuplicateRows(rows: DataRow[], columns: string[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const signature = columns
      .map((column) => `${column}:${String(row[column] ?? '∅')}`)
      .join('¦');
    if (seen.has(signature)) duplicates += 1;
    else seen.add(signature);
  }
  return duplicates;
}

export function createDataset(options: {
  name: string;
  fileName: string;
  kind: Dataset['kind'];
  records: Record<string, unknown>[];
  sizeBytes?: number;
  truncated?: boolean;
}): Dataset {
  const limited = options.records.slice(0, MAX_ROWS);
  if (!limited.length) {
    throw new Error('文件里没有读到有效数据行。');
  }

  const headers: string[] = [];
  const usedHeaders = new Set<string>();
  const keyMap = new Map<string, string>();
  for (const record of limited) {
    for (const key of Object.keys(record)) {
      if (keyMap.has(key)) continue;
      const base = String(key).trim() || `字段${keyMap.size + 1}`;
      let clean = base;
      let suffix = 2;
      while (usedHeaders.has(clean)) {
        clean = `${base}_${suffix}`;
        suffix += 1;
      }
      usedHeaders.add(clean);
      keyMap.set(key, clean);
      headers.push(clean);
    }
  }

  if (!headers.length) throw new Error('没有识别到字段，请检查文件表头。');

  const normalizedRecords = limited.map((record) => {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      const cleanKey = keyMap.get(key);
      if (cleanKey) output[cleanKey] = value;
    }
    return output;
  });

  const columns = headers.map((header) => buildColumnProfile(normalizedRecords as DataRow[], header));

  const rows: DataRow[] = normalizedRecords.map((record) => {
    const row: DataRow = {};
    for (const column of columns) {
      row[column.name] = convertCell(record[column.name], column.type);
    }
    return row;
  });

  for (const column of columns) {
    if (column.type !== 'number' || !isRateColumn(column.name)) continue;
    const numbers = rows
      .map((row) => row[column.name])
      .filter((value): value is number => typeof value === 'number');
    if (
      numbers.length &&
      numbers.some((value) => value !== 0) &&
      numbers.every((value) => Math.abs(value) <= 1)
    ) {
      for (const row of rows) {
        if (typeof row[column.name] === 'number') {
          row[column.name] = Number((Number(row[column.name]) * 100).toFixed(4));
        }
      }
    }
  }

  const finalColumns = headers.map((header) => buildColumnProfile(rows, header));
  const missingCells = finalColumns.reduce((total, column) => total + column.missing, 0);
  const cellCount = Math.max(1, rows.length * finalColumns.length);
  const duplicateRows = countDuplicateRows(rows, headers);

  return {
    id: newId('dataset'),
    name: options.name,
    fileName: options.fileName,
    kind: options.kind,
    rows,
    columns: finalColumns,
    sizeBytes: options.sizeBytes,
    truncated: options.truncated || options.records.length > MAX_ROWS,
    createdAt: Date.now(),
    profile: {
      rowCount: rows.length,
      columnCount: finalColumns.length,
      missingCells,
      completeness: 1 - missingCells / cellCount,
      duplicateRows,
    },
  };
}

function cleanHeader(header: string, index: number, seen: Map<string, number>): string {
  const clean = header.trim() || `字段${index + 1}`;
  const count = seen.get(clean) ?? 0;
  seen.set(clean, count + 1);
  return count ? `${clean}_${count + 1}` : clean;
}

function recordsFromJson(data: unknown): Record<string, unknown>[] {
  let source: unknown[];
  if (Array.isArray(data)) {
    source = data;
  } else if (data && typeof data === 'object') {
    const nestedArray = Object.values(data).find((value) => Array.isArray(value));
    source = nestedArray ?? [data];
  } else {
    throw new Error('JSON 需要是对象数组，或包含对象数组的对象。');
  }

  if (!source.length) throw new Error('JSON 里没有数据。');
  if (source.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('JSON 数组里的每一项都需要是对象。');
  }

  return source.map((item) => {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        output[key] = value.map((entry) => String(entry)).join(' / ');
      } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        output[key] = JSON.stringify(value);
      } else {
        output[key] = value;
      }
    }
    return output;
  });
}

async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buffer);
    } catch {
      return new TextDecoder().decode(buffer);
    }
  }
}

export async function parseDataFile(file: File): Promise<Dataset> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (file.size > MAX_FILE_BYTES) {
    throw new Error('文件超过 20 MB。请先抽样或压缩后再试。');
  }

  let records: Record<string, unknown>[] = [];

  if (extension === 'xlsx' || extension === 'xls') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: true,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('Excel 里没有可读取的工作表。');
    records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });
  } else if (extension === 'json') {
    const text = await readTextFile(file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('JSON 解析失败，请检查文件格式。');
    }
    records = recordsFromJson(parsed);
  } else if (['csv', 'tsv', 'txt'].includes(extension)) {
    const text = await readTextFile(file);
    const seen = new Map<string, number>();
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      delimiter: '',
      transformHeader: (header, index) => cleanHeader(header, index, seen),
    });

    if (result.data.length === 0) {
      throw new Error('CSV 里没有读到有效数据行。');
    }

    const fatal = result.errors.find((error) => error.type === 'Quotes');
    if (fatal) {
      throw new Error(`CSV 解析失败：${fatal.message}`);
    }

    records = result.data.map((row) => {
      const copy = { ...(row as Record<string, unknown>) };
      delete copy.__parsed_extra;
      return copy;
    });
  } else {
    throw new Error('暂不支持这个文件格式。请上传 CSV、TSV、Excel 或 JSON。');
  }

  const name = file.name.replace(/\.[^.]+$/, '').trim() || '未命名样本';

  return createDataset({
    name,
    fileName: file.name,
    kind: extension === 'xlsx' || extension === 'xls' ? 'xlsx' : extension === 'json' ? 'json' : 'csv',
    records,
    sizeBytes: file.size,
  });
}

function mulberry32(seed: number) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generateSampleDataset(): Dataset {
  const random = mulberry32(20261026);
  const randomBetween = (min: number, max: number) => min + random() * (max - min);
  const pick = <T>(items: T[], weights: number[]): T => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = random() * total;
    for (let index = 0; index < items.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) return items[index];
    }
    return items[items.length - 1];
  };

  const cities = ['上海', '北京', '深圳', '杭州', '成都', '武汉'];
  const cityWeights = [0.24, 0.21, 0.17, 0.15, 0.13, 0.1];
  const categories = [
    { name: '数码', min: 820, max: 4_600, margin: [0.12, 0.24] as const, weight: 0.28 },
    { name: '家居', min: 120, max: 1_600, margin: [0.24, 0.38] as const, weight: 0.26 },
    { name: '个护', min: 55, max: 420, margin: [0.34, 0.52] as const, weight: 0.24 },
    { name: '食品', min: 26, max: 190, margin: [0.18, 0.32] as const, weight: 0.22 },
  ];
  const channels = ['官网', '小程序', '门店'];
  const channelWeights = [0.38, 0.37, 0.25];
  const monthWeights = [0.12, 0.13, 0.15, 0.18, 0.23, 0.19];
  const seasonFactor = [1, 1.04, 1.02, 1.1, 1.26, 1.18];
  const daysInMonth = [31, 28, 31, 30, 31, 30];

  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < 477; index += 1) {
    const monthIndex = (() => {
      const total = monthWeights.reduce((sum, weight) => sum + weight, 0);
      let cursor = random() * total;
      for (let month = 0; month < monthWeights.length; month += 1) {
        cursor -= monthWeights[month];
        if (cursor <= 0) return month;
      }
      return 5;
    })();

    const day = 1 + Math.floor(random() * daysInMonth[monthIndex]);
    const date = `2026-${pad(monthIndex + 1)}-${pad(day)}`;
    const city = pick(cities, cityWeights);
    const category = pick(
      categories.map((entry) => entry.name),
      categories.map((entry) => entry.weight),
    );
    const categoryConfig = categories.find((entry) => entry.name === category)!;
    const channel = pick(channels, channelWeights);
    const units = 1 + Math.floor(random() ** 1.8 * 3);
    const cityFactor: Record<string, number> = {
      上海: 1.2,
      北京: 1.14,
      深圳: 1.11,
      杭州: 1.02,
      成都: 0.9,
      武汉: 0.84,
    };
    const channelFactor: Record<string, number> = { 官网: 1.07, 小程序: 0.97, 门店: 1.01 };
    const basePrice = randomBetween(categoryConfig.min, categoryConfig.max);
    const sales = Math.round(
      basePrice *
        units *
        seasonFactor[monthIndex] *
        cityFactor[city] *
        channelFactor[channel] *
        randomBetween(0.88, 1.14),
    );
    const margin = randomBetween(categoryConfig.margin[0], categoryConfig.margin[1]);
    const profit = Math.round(sales * margin * randomBetween(0.87, 1.1));

    rows.push({
      订单号: `S0${2601 + monthIndex}${String(index + 1).padStart(4, '0')}`,
      日期: date,
      城市: city,
      品类: category,
      渠道: channel,
      销量: units,
      销售额: sales,
      利润: profit,
      客单价: Math.round((sales / units) * 100) / 100,
      是否新客: random() < 0.33 ? '是' : '否',
    });
  }

  for (const index of [2, 31, 88, 146, 263]) {
    rows[index].利润 = null;
  }
  for (const index of [74, 311]) {
    rows[index].城市 = null;
  }

  for (const index of [23, 159, 402]) {
    const row = rows[index];
    const originalSales = Number(row.销售额);
    row.销量 = 16;
    row.销售额 = Math.round(originalSales * 17.5);
    row.利润 = Math.round(originalSales * 3.1);
    row.客单价 = Math.round((Number(row.销售额) / 16) * 100) / 100;
  }

  for (const index of [12, 203, 366]) {
    rows.push({ ...rows[index] });
  }

  return createDataset({
    name: '线上零售 · 2026 H1',
    fileName: 'retail_2026H1.csv',
    kind: 'sample',
    records: rows,
  });
}
