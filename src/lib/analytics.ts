import { newId, numericStats } from './data';
import { detectFormat, formatCell, formatInteger, formatNumber, formatPercent } from './format';
import type {
  AgentReport,
  BarChartSpec,
  Cell,
  ChartSpec,
  ColumnProfile,
  Dataset,
  Finding,
  LineChartSpec,
  Metric,
  ScatterChartSpec,
  TableData,
  TraceStep,
} from '../types';

const DAY_MS = 86_400_000;

const TYPE_NAME: Record<ColumnProfile['type'], string> = {
  number: '数值',
  date: '日期',
  category: '分类',
  boolean: '布尔',
};

interface MentionedColumn {
  column: ColumnProfile;
  score: number;
}

interface TimeSeries {
  labels: string[];
  values: number[];
  bucketName: '日' | '月' | '年';
  excluded: number;
  validRows: number;
  meanMode: boolean;
}

interface GroupResult {
  label: string;
  value: number;
  records: number;
  share?: number;
}

function percentChange(first: number, last: number): number | null {
  if (!Number.isFinite(first) || first === 0) return null;
  return (last - first) / Math.abs(first);
}

function truncated(text: string, length = 24): string {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function granularityLabel(bucket: TimeSeries['bucketName']): string {
  if (bucket === '日') return '每日';
  if (bucket === '月') return '月度';
  return '年度';
}

function stringifyCell(value: Cell, column: ColumnProfile): string {
  if (value === null) return '—';
  if (typeof value === 'number') return formatNumber(value, detectFormat(column.name));
  if (typeof value === 'boolean') return value ? '是' : '否';
  return formatCell(value, 30);
}

function report(data: Omit<AgentReport, 'id' | 'role' | 'createdAt'>): AgentReport {
  return {
    ...data,
    id: newId('report'),
    role: 'agent',
    createdAt: Date.now(),
  };
}

function isoToTime(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function columnScoreForMetric(column: ColumnProfile): number {
  let score = 1;
  if (/(销售额|销售收入|营业收入|营收|收入|成交额|gmv|revenue|sales|income)/i.test(column.name)) {
    score += 12;
  } else if (/(金额|amount)/i.test(column.name)) score += 10;
  else if (/(利润|毛利|profit)/i.test(column.name)) score += 8;
  else if (/(人数|用户数|订单数|件数|销量|数量|访客|访问|流量|count|users|orders|visits)/i.test(column.name)) {
    score += 6;
  } else if (/(客单价|单价|均价|价格|price)/i.test(column.name)) score += 5;
  else if (/(率|占比|比例|rate|ratio)/i.test(column.name)) score += 3;
  if (column.likelyId) score -= 20;
  if (column.unique < 3) score -= 2;
  return score;
}

export function primaryMetric(dataset: Dataset): ColumnProfile | null {
  const numeric = dataset.columns.filter(
    (column) => column.type === 'number' && column.numeric && !column.likelyId,
  );
  if (!numeric.length) return null;
  return [...numeric].sort(
    (a, b) =>
      columnScoreForMetric(b) - columnScoreForMetric(a) ||
      (b.numeric?.std ?? 0) - (a.numeric?.std ?? 0),
  )[0];
}

export function secondaryMetric(dataset: Dataset): ColumnProfile | null {
  const primary = primaryMetric(dataset);
  const numeric = dataset.columns.filter(
    (column) =>
      column.type === 'number' &&
      column.numeric &&
      !column.likelyId &&
      column.name !== primary?.name,
  );
  if (!numeric.length) return null;
  return [...numeric].sort(
    (a, b) =>
      columnScoreForMetric(b) - columnScoreForMetric(a) ||
      (b.numeric?.std ?? 0) - (a.numeric?.std ?? 0),
  )[0];
}

export function primaryDate(dataset: Dataset): ColumnProfile | null {
  const dates = dataset.columns.filter((column) => column.type === 'date');
  if (!dates.length) return null;
  return [...dates].sort((a, b) => {
    const aBonus = /(日期|date)/i.test(a.name) ? 2 : 0;
    const bBonus = /(日期|date)/i.test(b.name) ? 2 : 0;
    return bBonus - aBonus;
  })[0];
}

export function primaryCategory(dataset: Dataset): ColumnProfile | null {
  const categories = dataset.columns.filter(
    (column) =>
      (column.type === 'category' || column.type === 'boolean') &&
      !column.likelyId &&
      column.unique >= 2 &&
      column.unique <= 30,
  );
  if (!categories.length) return null;
  const score = (column: ColumnProfile) => {
    let value = 0;
    if (/(品类|类别|分类|category|type)/i.test(column.name)) value += 8;
    if (/(城市|地区|区域|省份|city|region)/i.test(column.name)) value += 7;
    if (/(渠道|channel|来源|source)/i.test(column.name)) value += 6;
    if (/(产品|商品|product|sku)/i.test(column.name)) value += 5;
    if (column.unique >= 3 && column.unique <= 10) value += 2;
    return value;
  };
  return [...categories].sort((a, b) => score(b) - score(a))[0];
}

export function findMentionedColumns(dataset: Dataset, question: string): MentionedColumn[] {
  const compactQuestion = question.toLowerCase().replace(/\s+/g, '');
  const found: MentionedColumn[] = [];

  for (const column of dataset.columns) {
    const name = column.name.toLowerCase().replace(/\s+/g, '');
    let score = 0;

    if (compactQuestion.includes(name) && name.length >= 2) {
      score = 100 + name.length;
    } else {
      const stem = name.replace(
        /(销售额|销售数量|金额|数量|总量|总数|日期|时间|名称|编号|单号|代码|率|数)$/u,
        '',
      );
      if (stem.length >= 2 && compactQuestion.includes(stem)) {
        score = 60 + stem.length;
      } else {
        for (const token of name.split(/[\s_-]+/)) {
          if (token.length >= 3 && compactQuestion.includes(token)) {
            score = Math.max(score, 40 + token.length);
          }
        }
      }
    }

    if (score > 0) found.push({ column, score });
  }

  return found.sort((a, b) => b.score - a.score).map((item) => item);
}

function pickNumeric(
  dataset: Dataset,
  mentioned: MentionedColumn[],
): ColumnProfile | null {
  const candidates = mentioned
    .map((item) => item.column)
    .filter((column) => column.type === 'number' && column.numeric && !column.likelyId);
  return candidates[0] ?? primaryMetric(dataset);
}

function pickDate(dataset: Dataset, mentioned: MentionedColumn[]): ColumnProfile | null {
  const candidate = mentioned.find(
    (item) => item.column.type === 'date',
  )?.column;
  return candidate ?? primaryDate(dataset);
}

function pickCategory(
  dataset: Dataset,
  mentioned: MentionedColumn[],
): ColumnProfile | null {
  const candidate = mentioned
    .map((item) => item.column)
    .find(
      (column) =>
        (column.type === 'category' || column.type === 'boolean') &&
        !column.likelyId &&
        column.unique >= 2 &&
        column.unique <= 50,
    );
  return candidate ?? primaryCategory(dataset);
}

function aggregationMode(column: ColumnProfile | null): 'sum' | 'mean' | 'count' {
  if (!column) return 'count';
  if (
    detectFormat(column.name).type === 'percent' ||
    /(单价|均价|客单价|价格|平均|评分|得分|满意度|年龄|时长|rate|ratio|price|score)/i.test(
      column.name,
    )
  ) {
    return 'mean';
  }
  return 'sum';
}

function aggregationLabel(column: ColumnProfile | null): string {
  const mode = aggregationMode(column);
  if (mode === 'count') return '记录数';
  if (mode === 'mean') return '平均';
  return '总';
}

function formatMetric(column: ColumnProfile | null, value: number, compact = false): string {
  if (!column) return formatNumber(value, { type: 'number' }, compact);
  return formatNumber(value, detectFormat(column.name), compact);
}

function groupByCategory(
  dataset: Dataset,
  category: ColumnProfile,
  metric: ColumnProfile | null,
): { groups: GroupResult[]; excluded: number; total: number } {
  const mode = aggregationMode(metric);
  const buckets = new Map<string, { sum: number; records: number }>();
  let excluded = 0;

  for (const row of dataset.rows) {
    const categoryValue = row[category.name];
    const metricValue = metric ? row[metric.name] : 1;

    if (categoryValue === null || (metric && typeof metricValue !== 'number')) {
      excluded += 1;
      continue;
    }

    const label =
      typeof categoryValue === 'boolean' ? (categoryValue ? '是' : '否') : String(categoryValue);
    const bucket = buckets.get(label) ?? { sum: 0, records: 0 };
    if (!metric || typeof metricValue === 'number') {
      bucket.sum += Number(metricValue);
    }
    bucket.records += 1;
    buckets.set(label, bucket);
  }

  const raw = [...buckets.entries()].map(([label, bucket]) => ({
    label,
    value: mode === 'mean' && metric ? bucket.sum / bucket.records : bucket.sum,
    records: bucket.records,
  }));
  const total =
    mode === 'mean'
      ? raw.reduce((sum, group) => sum + group.value * group.records, 0)
      : raw.reduce((sum, group) => sum + group.value, 0);

  const groups = raw.map((group) => ({
    ...group,
    share:
      mode === 'sum' && total !== 0
        ? group.value / total
        : group.records / Math.max(1, dataset.rows.length),
  }));

  return { groups, excluded, total };
}

function makeTimeSeries(
  dataset: Dataset,
  dateColumn: ColumnProfile,
  metric: ColumnProfile | null,
): TimeSeries {
  const mode = aggregationMode(metric);
  const valid: { time: number; value: number }[] = [];
  let excluded = 0;

  for (const row of dataset.rows) {
    const rawDate = row[dateColumn.name];
    if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      excluded += 1;
      continue;
    }
    const rawValue = metric ? row[metric.name] : 1;
    if (metric && (typeof rawValue !== 'number' || !Number.isFinite(rawValue))) {
      excluded += 1;
      continue;
    }
    valid.push({ time: isoToTime(rawDate), value: metric ? Number(rawValue) : 1 });
  }

  if (!valid.length) {
    return {
      labels: [],
      values: [],
      bucketName: '月',
      excluded,
      validRows: 0,
      meanMode: mode === 'mean',
    };
  }

  const times = valid.map((entry) => entry.time);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const spanDays = (max - min) / DAY_MS + 1;
  const bucketName: TimeSeries['bucketName'] =
    spanDays <= 45 ? '日' : spanDays <= 730 ? '月' : '年';
  const multiYear = new Date(min).getFullYear() !== new Date(max).getFullYear();

  const buckets = new Map<string, { sum: number; records: number; time: number }>();
  for (const entry of valid) {
    const date = new Date(entry.time);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key =
      bucketName === '日'
        ? `${year}-${String(month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : bucketName === '月'
          ? `${year}-${String(month).padStart(2, '0')}`
          : String(year);
    const bucket = buckets.get(key) ?? {
      sum: 0,
      records: 0,
      time:
        bucketName === '日'
          ? new Date(year, month - 1, date.getDate()).getTime()
          : bucketName === '月'
            ? new Date(year, month - 1, 1).getTime()
            : new Date(year, 0, 1).getTime(),
    };
    if (!metric || mode !== 'mean') bucket.sum += entry.value;
    else bucket.sum += entry.value;
    bucket.records += 1;
    buckets.set(key, bucket);
  }

  const entries = [...buckets.entries()].sort((a, b) => a[1].time - b[1].time);
  const labels = entries.map(([key, bucket]) => {
    if (bucketName === '日') {
      const date = new Date(bucket.time);
      return multiYear ? `${date.getFullYear() % 100}.${date.getMonth() + 1}/${date.getDate()}` : `${date.getMonth() + 1}/${date.getDate()}`;
    }
    if (bucketName === '月') {
      const date = new Date(bucket.time);
      return multiYear ? `${String(date.getFullYear()).slice(2)}.${date.getMonth() + 1}` : `${date.getMonth() + 1}月`;
    }
    return `${key}`;
  });
  const values = entries.map(([, bucket]) =>
    mode === 'mean' && metric ? bucket.sum / bucket.records : bucket.sum,
  );

  return {
    labels,
    values,
    bucketName,
    excluded,
    validRows: valid.length,
    meanMode: mode === 'mean',
  };
}

function histogram(values: number[], column: ColumnProfile | null): BarChartSpec | null {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return {
      kind: 'bar',
      title: `${column?.name ?? '数值'}的取值分布`,
      labels: [formatMetric(column, min, true)],
      values: [values.length],
      format: { type: 'number' },
      horizontal: false,
    };
  }

  const binCount = Math.max(5, Math.min(7, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / binCount;
  const counts = new Array(binCount).fill(0);
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }

  const valueFormat = column ? detectFormat(column.name) : { type: 'number' as const };
  const binFormat = valueFormat.type === 'currency' ? { type: 'number' as const } : valueFormat;
  const labels = counts.map((_, index) => {
    const start = min + width * index;
    const end = min + width * (index + 1);
    return `${formatNumber(start, binFormat, true)}–${formatNumber(end, binFormat, true)}`;
  });

  return {
    kind: 'bar',
    title: `${column?.name ?? '数值'}的区间分布`,
    subtitle: `${values.length} 条非空记录 · ${binCount} 个等宽区间${valueFormat.type === 'currency' ? ' · 单位：元' : ''}`,
    labels,
    values: counts,
    format: { type: 'number' },
    horizontal: true,
  };
}

function quickChart(dataset: Dataset): ChartSpec | undefined {
  const date = primaryDate(dataset);
  const metric = primaryMetric(dataset);
  const category = primaryCategory(dataset);

  if (date && (metric || dataset.rows.length)) {
    const series = makeTimeSeries(dataset, date, metric);
    if (series.values.length > 1) {
      return {
        kind: 'line',
        title: metric
          ? `${metric.name} · ${granularityLabel(series.bucketName)}轨迹`
          : '样本量 · 时间轨迹',
        subtitle: `按${granularityLabel(series.bucketName)}聚合 · 共 ${series.validRows} 条有效记录`,
        labels: series.labels,
        values: series.values,
        seriesName: metric?.name ?? '记录数',
        format: metric ? detectFormat(metric.name) : { type: 'number' },
      } satisfies LineChartSpec;
    }
  }

  if (metric?.numeric) {
    const values = dataset.rows
      .map((row) => row[metric.name])
      .filter((value): value is number => typeof value === 'number');
    return histogram(values, metric) ?? undefined;
  }

  if (category) {
    const { groups } = groupByCategory(dataset, category, null);
    const top = groups.sort((a, b) => b.records - a.records).slice(0, 8);
    return {
      kind: 'bar',
      title: `${category.name} · 记录分布`,
      subtitle: `按${category.name}计数`,
      labels: top.map((group) => group.label),
      values: top.map((group) => group.records),
      format: { type: 'number' },
      horizontal: true,
      accentIndex: 0,
    };
  }

  return undefined;
}

function baseMetrics(dataset: Dataset): Metric[] {
  return [
    { label: '样本行数', value: formatInteger(dataset.profile.rowCount), unit: '行' },
    { label: '字段数', value: String(dataset.profile.columnCount), unit: '列' },
    {
      label: '数据完整度',
      value: formatPercent(dataset.profile.completeness),
      tone:
        dataset.profile.completeness < 0.95
          ? 'warn'
          : dataset.profile.completeness === 1
            ? 'accent'
            : 'default',
    },
    {
      label: '重复行',
      value: formatInteger(dataset.profile.duplicateRows),
      unit: '行',
      tone: dataset.profile.duplicateRows > 0 ? 'warn' : 'default',
    },
  ];
}

function buildOverviewReport(dataset: Dataset, intake: boolean): AgentReport {
  const date = primaryDate(dataset);
  const metric = primaryMetric(dataset);
  const category = primaryCategory(dataset);
  const findings: Finding[] = [];

  if (date?.dateMin && date.dateMax) {
    findings.push({
      text: `采样区间为 ${date.dateMin} 至 ${date.dateMax}，日期字段有 ${formatInteger(date.missing)} 个空值。`,
    });
  }

  if (category?.topValues?.[0]) {
    const top = category.topValues[0];
    findings.push({
      text: `${category.name}中「${top.value}」出现最多，共 ${formatInteger(top.count)} 条记录。`,
    });
  } else if (metric?.numeric) {
    findings.push({
      text: `${metric.name}中位数为 ${formatMetric(metric, metric.numeric.median)}，区间 ${formatMetric(metric, metric.numeric.min)} — ${formatMetric(metric, metric.numeric.max)}。`,
    });
  }

  if (dataset.profile.duplicateRows > 0) {
    findings.push({
      text: `检测到 ${formatInteger(dataset.profile.duplicateRows)} 行完全重复记录，做汇总前建议先确认。`,
      tone: 'warn',
    });
  } else if (dataset.profile.missingCells > 0) {
    findings.push({
      text: `共 ${formatInteger(dataset.profile.missingCells)} 个空单元格，完整度 ${formatPercent(dataset.profile.completeness)}。`,
    });
  } else {
    findings.push({ text: '没有发现空单元格或完全重复的行，可以直接开始分析。', tone: 'good' });
  }

  if (dataset.truncated) {
    findings.push({
      text: `文件超过单次读取上限，本次只分析前 ${formatInteger(dataset.profile.rowCount)} 行。`,
      tone: 'warn',
    });
  }

  const chart = quickChart(dataset);
  const typeSummary = (['number', 'category', 'date', 'boolean'] as const)
    .map((type) => {
      const count = dataset.columns.filter((column) => column.type === type).length;
      return count ? `${count} 个${TYPE_NAME[type]}字段` : null;
    })
    .filter(Boolean)
    .join('、');

  const lede = intake
    ? `「${dataset.name}」已经进入工作台：${formatInteger(dataset.profile.rowCount)} 行 × ${dataset.profile.columnCount} 列，识别到 ${typeSummary}。下面是读表后的第一份轮廓；接下来可以直接问具体问题。`
    : `这份样本共 ${formatInteger(dataset.profile.rowCount)} 行 × ${dataset.profile.columnCount} 列，识别到 ${typeSummary}。我先拉一个总体轮廓，你也可以直接指向某个字段。`;

  return report({
    kind: intake ? 'INTAKE' : 'OVERVIEW',
    title: intake ? '样本已读完' : '先看一遍全貌',
    lede,
    metrics: baseMetrics(dataset),
    chart,
    findings: findings.slice(0, 3),
    trace: [
      { label: '读取样本', detail: `${dataset.profile.rowCount} 行 / ${dataset.profile.columnCount} 列` },
      { label: '识别字段', detail: typeSummary || '未识别到可用字段' },
      {
        label: '质量扫描',
        detail: `${formatPercent(dataset.profile.completeness)} 完整 · ${dataset.profile.duplicateRows} 行重复`,
      },
      { label: '生成轮廓', detail: date && metric ? `按${date.name}与${metric.name}取概览` : '按字段类型取概览' },
    ],
  });
}

function buildQualityReport(dataset: Dataset): AgentReport {
  const affected = dataset.columns
    .filter((column) => column.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  const missingFields = affected.length;
  const chart: BarChartSpec | undefined = affected.length
    ? {
        kind: 'bar',
        title: '各字段的缺失记录',
        subtitle: `共 ${formatInteger(dataset.profile.missingCells)} 个空单元格`,
        labels: affected.slice(0, 9).map((column) => column.name),
        values: affected.slice(0, 9).map((column) => column.missing),
        format: { type: 'number' },
        horizontal: true,
        accentIndex: 0,
      }
    : undefined;

  const findings: Finding[] = [];
  if (!affected.length) {
    findings.push({ text: '所有字段都没有缺失值，完整度 100%。', tone: 'good' });
  } else {
    const worst = affected[0];
    findings.push({
      text: `缺失最集中的字段是「${worst.name}」，空值 ${formatInteger(worst.missing)} 个，占该列 ${formatPercent(worst.missing / Math.max(1, worst.total))}。`,
    });
    if (affected.length > 1) {
      findings.push({
        text: `共有 ${missingFields} 个字段存在空值，建议先决定这些行是剔除还是单独补录。`,
      });
    }
  }

  if (dataset.profile.duplicateRows > 0) {
    findings.push({
      text: `另有 ${formatInteger(dataset.profile.duplicateRows)} 行完全重复记录。缺失和重复可能重叠，清洗时需要一起看。`,
      tone: 'warn',
    });
  } else {
    findings.push({ text: '未发现完全重复的行。' });
  }

  return report({
    kind: 'QUALITY',
    title: '数据质量体检',
    lede: `逐列扫描空值、完整度和重复记录。这份样本完整度为 ${formatPercent(dataset.profile.completeness)}，共 ${formatInteger(dataset.profile.missingCells)} 个空单元格。`,
    metrics: [
      {
        label: '完整度',
        value: formatPercent(dataset.profile.completeness),
        tone: dataset.profile.completeness < 0.95 ? 'warn' : 'accent',
      },
      { label: '空单元格', value: formatInteger(dataset.profile.missingCells), unit: '个' },
      { label: '受影响字段', value: String(missingFields), unit: '列' },
      {
        label: '重复行',
        value: formatInteger(dataset.profile.duplicateRows),
        unit: '行',
        tone: dataset.profile.duplicateRows ? 'warn' : 'default',
      },
    ],
    chart,
    findings,
    table: affected.length
      ? {
          columns: ['字段', '类型', '缺失', '缺失占比'],
          align: ['left', 'left', 'right', 'right'],
          rows: affected.slice(0, 10).map((column) => [
            column.name,
            TYPE_NAME[column.type],
            formatInteger(column.missing),
            formatPercent(column.missing / Math.max(1, column.total)),
          ]),
          caption: '按缺失数量降序 · 最多显示 10 个字段',
        }
      : undefined,
    trace: [
      { label: '逐列扫描', detail: `${dataset.profile.columnCount} 个字段` },
      { label: '空值判定', detail: '空字符串、NA、NULL、NaN 计为缺失' },
      {
        label: '完整度',
        detail: `1 − ${dataset.profile.missingCells} / ${dataset.profile.rowCount * dataset.profile.columnCount}`,
      },
      { label: '重复检查', detail: '按所有字段的完整行比较' },
    ],
  });
}

function findDuplicateGroups(dataset: Dataset): { count: number; row: Dataset['rows'][number] }[] {
  const buckets = new Map<string, { count: number; row: Dataset['rows'][number] }>();
  const columns = dataset.columns.map((column) => column.name);

  for (const row of dataset.rows) {
    const signature = columns.map((column) => `${column}:${String(row[column] ?? '∅')}`).join('¦');
    const bucket = buckets.get(signature);
    if (bucket) bucket.count += 1;
    else buckets.set(signature, { count: 1, row });
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.count > 1)
    .sort((a, b) => b.count - a.count);
}

function buildDuplicateReport(dataset: Dataset): AgentReport {
  const groups = findDuplicateGroups(dataset);
  const duplicateRows = dataset.profile.duplicateRows;
  const date = primaryDate(dataset);
  const category = primaryCategory(dataset);
  const metric = primaryMetric(dataset);
  const contextColumns = [date, category, metric].filter(
    (column): column is ColumnProfile => Boolean(column),
  );
  const tableColumns = contextColumns.length
    ? contextColumns.slice(0, 4)
    : dataset.columns.filter((column) => !column.likelyId).slice(0, 4);

  const table: TableData | undefined = groups.length
    ? {
        columns: [...tableColumns.map((column) => column.name), '重复次数'],
        align: [...tableColumns.map(() => 'left' as const), 'right'],
        rows: groups.slice(0, 5).map((group) => [
          ...tableColumns.map((column) => stringifyCell(group.row[column.name], column)),
          String(group.count),
        ]),
        caption: `前 ${Math.min(5, groups.length)} 组重复记录 · 重复行按首次出现后的额外行计数`,
      }
    : undefined;

  return report({
    kind: 'DUPLICATES',
    title: '重复记录检查',
    lede: duplicateRows
      ? `检测到 ${formatInteger(duplicateRows)} 行完全重复记录，分布在 ${groups.length} 组中。它们会让计数和求和结果偏大，汇总前值得先确认是否保留。`
      : '按所有字段逐行比对后，没有发现完全重复的记录。',
    metrics: [
      {
        label: '重复行',
        value: formatInteger(duplicateRows),
        unit: '行',
        tone: duplicateRows ? 'warn' : 'accent',
      },
      { label: '重复组', value: formatInteger(groups.length), unit: '组' },
      { label: '去重后行数', value: formatInteger(dataset.profile.rowCount - duplicateRows), unit: '行' },
      {
        label: '重复占比',
        value: formatPercent(duplicateRows / Math.max(1, dataset.profile.rowCount)),
      },
    ],
    findings: [
      duplicateRows
        ? { text: '重复记录按“所有字段完全相同”判定，不包含仅部分字段相同的情况。', tone: 'warn' }
        : { text: '当前样本没有整行重复。', tone: 'good' },
      {
        text: '如果数据来自多次导出，建议保留导入批次或时间戳字段，方便追溯。',
      },
    ],
    table,
    trace: [
      { label: '读取全表', detail: `${dataset.profile.rowCount} 行 × ${dataset.profile.columnCount} 列` },
      { label: '构造行指纹', detail: '拼接所有字段的标准化值' },
      { label: '比对分组', detail: `${groups.length} 组出现重复` },
      { label: '统计额外行', detail: `${duplicateRows} 行需要确认` },
    ],
  });
}


function buildTrendReport(dataset: Dataset, mentioned: MentionedColumn[]): AgentReport {
  const date = pickDate(dataset, mentioned);
  const metric = pickNumeric(dataset, mentioned);

  if (!date) {
    return insufficientReport(dataset, '找不到时间字段', '要做趋势，需要至少一个日期或时间字段。当前样本里没有识别到可用的时间列，可以先做字段分布或分组对比。');
  }

  const series = makeTimeSeries(dataset, date, metric);
  if (!series.values.length) {
    return insufficientReport(dataset, '时间字段读不出有效值', `「${date.name}」存在，但没有可聚合的有效值。检查一下日期格式和数值空值后再试。`);
  }

  const first = series.values[0];
  const last = series.values[series.values.length - 1];
  const change = percentChange(first, last);
  let peakIndex = 0;
  series.values.forEach((value, index) => {
    if (value > series.values[peakIndex]) peakIndex = index;
  });
  const peak = series.values[peakIndex];
  const validMetric = metric;
  const aggregation = validMetric
    ? `${aggregationLabel(validMetric)}${validMetric.name}`
    : '记录数';
  const subject = validMetric?.name ?? '记录数';
  const total =
    aggregationMode(validMetric) === 'mean'
      ? series.values.reduce((sum, value) => sum + value, 0) / series.values.length
      : series.values.reduce((sum, value) => sum + value, 0);

  const findings: Finding[] = [];
  if (change !== null) {
    findings.push({
      text: `${series.labels[0]} 到 ${series.labels[series.labels.length - 1]}，${aggregation}从 ${formatMetric(validMetric, first)} 变为 ${formatMetric(validMetric, last)}，变化 ${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%。`,
      tone: change >= 0 ? 'good' : 'default',
    });
  } else {
    findings.push({
      text: `起始值为 0，无法计算百分比变化；${series.labels[series.labels.length - 1]} 的${aggregation}是 ${formatMetric(validMetric, last)}。`,
    });
  }

  findings.push({
    text: `峰值出现在 ${series.labels[peakIndex]}，为 ${formatMetric(validMetric, peak)}；${aggregationMode(validMetric) === 'mean' ? '周期平均' : '区间累计'}为 ${formatMetric(validMetric, total)}。`,
  });

  if (series.excluded > 0) {
    findings.push({
      text: `有 ${formatInteger(series.excluded)} 行因日期无效或${subject}为空而未参与趋势计算。`,
      tone: 'warn',
    });
  }

  const chart: LineChartSpec = {
    kind: 'line',
    title: `${subject} · ${granularityLabel(series.bucketName)}轨迹`,
    subtitle: `按${granularityLabel(series.bucketName)}${aggregationMode(validMetric) === 'mean' ? '取均值' : '求和'} · ${series.labels.length} 个数据点`,
    labels: series.labels,
    values: series.values,
    seriesName: subject,
    format: validMetric ? detectFormat(validMetric.name) : { type: 'number' },
  };

  return report({
    kind: 'TREND',
    title: `${subject}的${granularityLabel(series.bucketName)}走势`,
    lede: `以「${date.name}」为时间轴，按${granularityLabel(series.bucketName)}${aggregationMode(validMetric) === 'mean' ? `取${subject}均值` : `汇总${subject}`}。当前有 ${formatInteger(series.validRows)} 条有效记录进入计算。`,
    metrics: [
      {
        label: '区间变化',
        value: change === null ? '—' : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`,
        note: `${series.labels[0]} → ${series.labels[series.labels.length - 1]}`,
      },
      {
        label: '峰值',
        value: formatMetric(validMetric, peak, true),
        note: series.labels[peakIndex],
        tone: 'accent',
      },
      {
        label: aggregationMode(validMetric) === 'mean' ? '周期平均' : '区间累计',
        value: formatMetric(validMetric, total, true),
        note: `${series.labels.length} 个周期`,
      },
      { label: '有效记录', value: formatInteger(series.validRows), unit: '行' },
    ],
    chart,
    findings,
    trace: [
      { label: '识别时间字段', detail: date.name },
      { label: '选择度量', detail: validMetric ? validMetric.name : '记录数' },
      {
        label: aggregationMode(validMetric) === 'mean' ? '按周期取均值' : '按周期求和',
        detail: `时间粒度：${series.bucketName}`,
      },
      {
        label: '排除无效行',
        detail: `${series.excluded} 行日期或数值无效`,
      },
      { label: '提取转折点', detail: `峰值 ${series.labels[peakIndex]}` },
    ],
  });
}

function buildGroupedReport(
  dataset: Dataset,
  mentioned: MentionedColumn[],
  mode: 'ranking' | 'compare',
  question: string,
): AgentReport {
  const category = pickCategory(dataset, mentioned);
  const metric = pickNumeric(dataset, mentioned);

  if (!category) {
    return insufficientReport(dataset, '还缺一个分组字段', '要做分组对比，需要至少一个分类字段（比如城市、渠道、品类）和一个可计算的度量。');
  }

  const { groups, excluded } = groupByCategory(dataset, category, metric);
  if (!groups.length) {
    return insufficientReport(dataset, '分组没有产生有效结果', `「${category.name}」存在，但没有可用的非空分组值。`);
  }

  const ascending = /最低|最少|垫底|最差|最少|lowest|bottom|least/i.test(question);
  const sorted = [...groups].sort((a, b) =>
    ascending ? a.value - b.value : b.value - a.value,
  );
  const focus = sorted[0];
  const top = sorted.slice(0, 8);
  const agg = metric ? `${aggregationLabel(metric)}${metric.name}` : '记录数';
  const subject = metric?.name ?? '记录数';
  const highest = [...groups].sort((a, b) => b.value - a.value)[0];
  const lowest = [...groups].sort((a, b) => a.value - b.value)[0];
  const lead = ascending ? lowest : highest;
  const tail = ascending ? highest : lowest;
  const gap = highest.value !== 0 ? (highest.value - lowest.value) / Math.abs(highest.value) : null;
  const share = highest.share ?? 0;
  const formatting = metric ? detectFormat(metric.name) : { type: 'number' as const };

  const chart: BarChartSpec = {
    kind: 'bar',
    title: `${subject} · ${category.name}${mode === 'ranking' ? '排名' : '对比'}`,
    subtitle: `${agg} · 最多展示 ${top.length} 组`,
    labels: top.map((group) => group.label),
    values: top.map((group) => group.value),
    format: formatting,
    horizontal: true,
    accentIndex: 0,
  };

  const table: TableData = {
    columns: [
      category.name,
      agg,
      '记录数',
      aggregationMode(metric) === 'sum' ? '占比' : '样本占比',
    ],
    align: ['left', 'right', 'right', 'right'],
    rows: sorted.slice(0, 8).map((group) => [
      group.label,
      formatMetric(metric, group.value),
      formatInteger(group.records),
      formatPercent(
        aggregationMode(metric) === 'sum'
          ? (group.share ?? 0)
          : group.records / Math.max(1, dataset.rows.length),
      ),
    ]),
    caption: `按${agg}${ascending ? '升序' : '降序'} · ${excluded > 0 ? `已排除 ${excluded} 行空值` : '无空值排除'}`,
  };

  const findings: Finding[] = [];
  if (mode === 'ranking') {
    findings.push({
      text: `${focus.label} 的${agg}为 ${formatMetric(metric, focus.value)}，排在${ascending ? '最低' : '第一'}位${aggregationMode(metric) === 'sum' ? `，占总体 ${formatPercent(share)}` : ''}。`,
      tone: 'accent',
    });
    if (sorted.length > 1) {
      findings.push({
        text: `与下一名 ${sorted[1].label} 的差值为 ${formatMetric(metric, Math.abs(focus.value - sorted[1].value))}。`,
      });
    }
  } else {
    findings.push({
      text: `${category.name}中最高的是 ${highest.label}（${formatMetric(metric, highest.value)}），最低的是 ${lowest.label}（${formatMetric(metric, lowest.value)}）。`,
      tone: 'accent',
    });
    if (gap !== null) {
      findings.push({ text: `两者相差 ${(gap * 100).toFixed(1)}%；这是组间均值/汇总差异，不代表个体差异。` });
    }
  }
  findings.push({
    text: `对比基于 ${formatInteger(dataset.rows.length - excluded)} 条有效记录，共 ${groups.length} 个分组。`,
  });
  findings.push({
    text:
      aggregationMode(metric) === 'mean'
        ? '该字段包含比例或价格属性，因此按组取均值，而不是求和。'
        : '该字段按组求和；如果字段本身是单价或比例，请先确认聚合方式。',
  });

  return report({
    kind: mode === 'ranking' ? 'RANKING' : 'COMPARE',
    title:
      mode === 'ranking'
        ? `${subject} · ${category.name}排名`
        : `${subject} · ${category.name}对比`,
    lede: `按「${category.name}」分组，对「${subject}」${aggregationMode(metric) === 'mean' ? '取各组均值' : aggregationMode(metric) === 'count' ? '计数' : '求和'}，得到 ${groups.length} 组结果。${excluded > 0 ? `有 ${excluded} 行因空值未参与计算。` : ''}`,
    metrics: [
      {
        label:
          mode === 'ranking'
            ? ascending
              ? '排名末位'
              : '排名第一'
            : ascending
              ? '最低组'
              : '最高组',
        value: lead.label,
        note: formatMetric(metric, lead.value),
        tone: 'accent',
      },
      {
        label: ascending ? '最高组' : '最低组',
        value: tail.label,
        note: formatMetric(metric, tail.value),
      },
      { label: '分组数', value: String(groups.length), unit: '组' },
      {
        label: aggregationMode(metric) === 'sum' ? '最高组占比' : '最高组样本比',
        value: formatPercent(
          aggregationMode(metric) === 'sum'
            ? share
            : highest.records / Math.max(1, dataset.rows.length),
        ),
      },
    ],
    chart,
    findings: findings.slice(0, 3),
    table,
    trace: [
      { label: '选择分组', detail: `${category.name} · ${groups.length} 组` },
      { label: '选择度量', detail: subject },
      { label: aggregationMode(metric) === 'sum' ? '组内求和' : '组内求均值', detail: '忽略空值' },
      { label: '排序输出', detail: `${ascending ? '升序' : '降序'} · 最多 8 组` },
    ],
  });
}

function iqrThresholds(column: ColumnProfile): { lower: number; upper: number } | null {
  if (!column.numeric) return null;
  const iqr = column.numeric.q3 - column.numeric.q1;
  if (iqr <= 0) return null;
  return { lower: column.numeric.q1 - 3 * iqr, upper: column.numeric.q3 + 3 * iqr };
}

function buildOutlierReport(dataset: Dataset, mentioned: MentionedColumn[]): AgentReport {
  const mentionedNumeric = mentioned
    .map((item) => item.column)
    .filter((column) => column.type === 'number' && column.numeric && !column.likelyId);
  const candidates = (
    mentionedNumeric.length
      ? mentionedNumeric
      : dataset.columns.filter((column) => column.type === 'number' && !column.likelyId)
  ).slice(0, 8);

  if (!candidates.length) {
    return insufficientReport(dataset, '没有可扫描的数值字段', '异常值检测需要至少一个数值字段。当前样本里没有识别到可用数值列。');
  }

  const scanned = candidates
    .map((column) => {
      const threshold = iqrThresholds(column);
      if (!threshold || !column.numeric) {
        return { column, threshold, indexes: [] as number[], count: 0 };
      }
      const indexes: number[] = [];
      dataset.rows.forEach((row, index) => {
        const value = row[column.name];
        if (typeof value === 'number' && (value < threshold.lower || value > threshold.upper)) {
          indexes.push(index);
        }
      });
      return { column, threshold, indexes, count: indexes.length };
    })
    .filter((entry) => entry.threshold);

  const affected = scanned.filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count);
  const primary =
    mentionedNumeric.find((column) =>
      scanned.some((entry) => entry.column.name === column.name && entry.count > 0),
    ) ??
    affected[0]?.column ??
    mentionedNumeric[0] ??
    scanned[0]?.column ??
    null;
  const primaryScan = scanned.find((entry) => entry.column.name === primary?.name);
  const totalOutliers = affected.reduce((sum, entry) => sum + entry.count, 0);

  const chart: BarChartSpec | undefined = affected.length
    ? {
        kind: 'bar',
        title: '各数值字段的极端值数量',
        subtitle: 'IQR 规则：低于 Q1−3×IQR 或高于 Q3+3×IQR',
        labels: affected.map((entry) => entry.column.name),
        values: affected.map((entry) => entry.count),
        format: { type: 'number' },
        horizontal: true,
        accentIndex: 0,
      }
    : undefined;

  const contextColumns = [primaryDate(dataset), primaryCategory(dataset)].filter(
    (column): column is ColumnProfile => Boolean(column),
  );
  const tableColumns = [...contextColumns, primary].filter(
    (column): column is ColumnProfile => Boolean(column),
  );
  const extremeIndexes = [...(primaryScan?.indexes ?? [])]
    .sort((a, b) => {
      const aValue = primary
        ? Math.abs(Number(dataset.rows[a][primary.name]) - (primary.numeric?.median ?? 0))
        : 0;
      const bValue = primary
        ? Math.abs(Number(dataset.rows[b][primary.name]) - (primary.numeric?.median ?? 0))
        : 0;
      return bValue - aValue;
    })
    .slice(0, 5);

  const table: TableData | undefined =
    primary && tableColumns.length && extremeIndexes.length
      ? {
          columns: tableColumns.map((column) => column.name),
          align: tableColumns.map((column) =>
            column.type === 'number' ? ('right' as const) : ('left' as const),
          ),
          rows: extremeIndexes.map((index) =>
            tableColumns.map((column) => stringifyCell(dataset.rows[index][column.name], column)),
          ),
          caption: `${primary.name}的极端记录 · 按偏离中位数排序，最多 5 行`,
        }
      : undefined;

  const findings: Finding[] = [];
  if (primaryScan?.threshold && affected.length) {
    findings.push({
      text: `${primary.name}的 3×IQR 阈值为 ${formatMetric(primary, primaryScan.threshold.lower)} 至 ${formatMetric(primary, primaryScan.threshold.upper)}，共有 ${primaryScan.count} 个值越界。`,
      tone: 'warn',
    });
    findings.push({
      text: '离群不等于错误。先确认它是否来自真实大单、录入错误或特殊活动，再决定保留还是剔除。',
    });
    if (affected.length > 1) {
      findings.push({
        text: `其他越界的字段还有${affected.slice(1, 4).map((entry) => `「${entry.column.name}」`).join('、')}。`,
      });
    }
  } else {
    findings.push({
      text: '按 3×IQR 规则没有发现极端离群值，数据的两端相对紧凑。',
      tone: 'good',
    });
    if (primary?.numeric) {
      findings.push({
        text: `${primary.name}的最大值是 ${formatMetric(primary, primary.numeric.max)}，最小值是 ${formatMetric(primary, primary.numeric.min)}，可以作为人工复核的参考。`,
      });
    }
    findings.push({ text: '如果业务上有明确的阈值（比如单笔金额上限），可以用那个阈值再检查一次。' });
  }

  if (primary && primaryScan?.threshold && affected.length === 0) {
    const maxRow = dataset.rows.reduce<{ value: number; index: number }>(
      (best, row, index) => {
        const value = row[primary.name];
        return typeof value === 'number' && value > best.value ? { value, index } : best;
      },
      { value: -Infinity, index: -1 },
    );
    if (maxRow.index >= 0) {
      const context = tableColumns.slice(0, 3);
      return report({
        kind: 'OUTLIERS',
        title: '极端值扫描',
        lede: `检查了 ${scanned.length} 个数值字段，按 3×IQR 规则没有发现显著离群值。为了便于复核，下面保留 ${primary.name} 的最大值记录。`,
        metrics: [
          { label: '极端值', value: '0', unit: '个', tone: 'accent' },
          { label: '扫描字段', value: String(scanned.length), unit: '列' },
          { label: '判定规则', value: 'IQR × 3', note: '3 × 四分位距' },
          { label: '最大值', value: formatMetric(primary, maxRow.value, true) },
        ],
        findings,
        table: {
          columns: context.map((column) => column.name),
          rows: [context.map((column) => stringifyCell(dataset.rows[maxRow.index][column.name], column))],
          caption: `${primary.name}的最大值记录`,
        },
        trace: [
          { label: '扫描数值字段', detail: `${scanned.length} 列` },
          { label: '计算四分位距', detail: 'Q1 / Q3 / IQR' },
          { label: '应用边界', detail: 'Q1−3IQR ~ Q3+3IQR' },
          { label: '输出复核样本', detail: '0 个越界值 · 保留最大记录' },
        ],
      });
    }
  }

  return report({
    kind: 'OUTLIERS',
    title: '极端值扫描',
    lede: `按 3×IQR 规则扫描了 ${scanned.length} 个数值字段，共命中 ${formatInteger(totalOutliers)} 个字段级极端值，分布在 ${affected.length} 个字段中。同一行可能在多个字段上越界。`,
    metrics: [
      {
        label: '极端值',
        value: formatInteger(totalOutliers),
        unit: '个',
        tone: totalOutliers ? 'warn' : 'accent',
      },
      { label: '涉及字段', value: String(affected.length), unit: '列' },
      { label: '扫描字段', value: String(scanned.length), unit: '列' },
      { label: '判定规则', value: 'IQR × 3', note: '3 × 四分位距' },
    ],
    chart,
    findings: findings.slice(0, 3),
    table,
    trace: [
      { label: '扫描数值字段', detail: `${scanned.length} 列` },
      { label: '计算四分位距', detail: 'Q1 / Q3 / IQR' },
      { label: '应用边界', detail: 'Q1−3IQR ~ Q3+3IQR' },
      { label: '标记极端值', detail: `${affected.length} 个字段有越界` },
    ],
  });
}

interface PairResult {
  a: ColumnProfile;
  b: ColumnProfile;
  r: number;
  n: number;
}

function pairResult(dataset: Dataset, a: ColumnProfile, b: ColumnProfile): PairResult | null {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (const row of dataset.rows) {
    const x = row[a.name];
    const y = row[b.name];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n += 1;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }

  if (n < 5) return null;
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX ** 2) * (n * sumYY - sumY ** 2));
  if (!denominator) return null;
  return { a, b, r: numerator / denominator, n };
}

function correlationStrength(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 0.7) return '强';
  if (abs >= 0.4) return '中等';
  if (abs >= 0.2) return '偏弱';
  return '很弱';
}

function buildCorrelationReport(dataset: Dataset, mentioned: MentionedColumn[]): AgentReport {
  const nums = dataset.columns.filter(
    (column) => column.type === 'number' && column.numeric && !column.likelyId,
  );
  if (nums.length < 2) {
    return insufficientReport(dataset, '相关分析需要两个数值字段', '当前样本里不足两个可计算的数值字段。可以上传含多个数值列的数据，或先做单列分布。');
  }

  const pairs: PairResult[] = [];
  for (let a = 0; a < nums.length; a += 1) {
    for (let b = a + 1; b < nums.length; b += 1) {
      const result = pairResult(dataset, nums[a], nums[b]);
      if (result) pairs.push(result);
    }
  }

  if (!pairs.length) {
    return insufficientReport(dataset, '没有足够的成对记录', '数值字段之间的有效成对记录太少，无法稳定计算相关系数。');
  }

  const mentionedNumeric = mentioned
    .map((item) => item.column)
    .filter((column) => nums.some((num) => num.name === column.name));

  let selected: PairResult;
  if (mentionedNumeric.length >= 2) {
    const found = pairs.find(
      (pair) =>
        (pair.a.name === mentionedNumeric[0].name && pair.b.name === mentionedNumeric[1].name) ||
        (pair.a.name === mentionedNumeric[1].name && pair.b.name === mentionedNumeric[0].name),
    );
    selected =
      found ??
      ([...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0] as PairResult);
  } else if (mentionedNumeric.length === 1) {
    const relevant = pairs.filter(
      (pair) => pair.a.name === mentionedNumeric[0].name || pair.b.name === mentionedNumeric[0].name,
    );
    selected = [...relevant].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  } else {
    selected = [...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  }

  if (!selected) {
    return insufficientReport(dataset, '没有稳定的相关关系', '有效成对数据不足，换一份更完整的数据再试。');
  }

  const sortedPairs = [...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const strongest = sortedPairs[0];
  const points = dataset.rows
    .map((row) => {
      const x = row[selected.a.name];
      const y = row[selected.b.name];
      return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
    })
    .filter((point): point is { x: number; y: number } => point !== null);
  const sampleSize = Math.min(points.length, 600);
  const step = Math.max(1, Math.floor(points.length / sampleSize));
  const sampled = points.filter((_, index) => index % step === 0).slice(0, sampleSize);

  const chart: ScatterChartSpec = {
    kind: 'scatter',
    title: `${selected.a.name} × ${selected.b.name}`,
    subtitle: `Pearson r = ${selected.r.toFixed(3)} · 成对样本 ${formatInteger(selected.n)} 条`,
    points: sampled,
    xLabel: selected.a.name,
    yLabel: selected.b.name,
    formatX: detectFormat(selected.a.name),
    formatY: detectFormat(selected.b.name),
    correlation: selected.r,
  };

  const direction = selected.r >= 0 ? '正' : '负';
  const otherPairs = sortedPairs.filter(
    (pair) => !(pair.a.name === selected.a.name && pair.b.name === selected.b.name),
  );

  return report({
    kind: 'CORRELATION',
    title: `${selected.a.name}与${selected.b.name}的关系`,
    lede: `用 ${formatInteger(selected.n)} 条有效记录计算 Pearson 相关系数：r = ${selected.r.toFixed(3)}，属于${correlationStrength(selected.r)}${direction}相关。`,
    metrics: [
      {
        label: 'Pearson r',
        value: selected.r.toFixed(2),
        tone: Math.abs(selected.r) >= 0.4 ? 'accent' : 'default',
      },
      { label: '相关强度', value: correlationStrength(selected.r), note: `${direction}相关` },
      { label: '成对样本', value: formatInteger(selected.n), unit: '条' },
      { label: '比较字段对', value: String(pairs.length), unit: '组' },
    ],
    chart,
    findings: [
      {
        text: `${selected.a.name}与${selected.b.name}呈${correlationStrength(selected.r)}${direction}相关，数据点总体上${direction === '正' ? '同向变化' : '反向变化'}。`,
        tone: Math.abs(selected.r) >= 0.7 ? 'accent' : 'default',
      },
      {
        text:
          strongest.a.name === selected.a.name && strongest.b.name === selected.b.name
            ? `这也是样本中最强的一对关系。`
            : `样本中最强的一对是「${strongest.a.name} × ${strongest.b.name}」（r = ${strongest.r.toFixed(2)}）。`,
      },
      ...(selected.n < 30
        ? [
            {
              text: `这次只有 ${formatInteger(selected.n)} 条有效成对记录，相关系数容易被个别点影响，建议补充样本后再判断。`,
              tone: 'warn' as const,
            },
          ]
        : []),
      { text: '相关不等于因果。这里只说明两个字段的同步变化程度，不能直接说明谁导致了谁。', tone: 'warn' },
    ],
    table: otherPairs.length
      ? {
          columns: ['字段组合', 'r', '成对样本'],
          align: ['left', 'right', 'right'],
          rows: otherPairs.slice(0, 4).map((pair) => [
            `${pair.a.name} × ${pair.b.name}`,
            pair.r.toFixed(3),
            formatInteger(pair.n),
          ]),
          caption: '按相关系数绝对值排序 · 最多显示 4 组',
        }
      : undefined,
    trace: [
      { label: '筛选数值字段', detail: `${nums.length} 列` },
      { label: '成对删除空值', detail: `${formatInteger(selected.n)} 条有效记录` },
      { label: '计算 Pearson r', detail: selected.r.toFixed(3) },
      { label: '抽样绘图', detail: `${sampled.length} 个散点` },
    ],
  });
}

function buildDistributionReport(dataset: Dataset, mentioned: MentionedColumn[]): AgentReport {
  const metric = pickNumeric(dataset, mentioned);
  const category = primaryCategory(dataset);

  if (!metric?.numeric) {
    if (!category?.topValues) {
      return insufficientReport(dataset, '没有可画的分布', '这份数据里没有足够明确的数值或分类字段。');
    }
    const groups = category.topValues.slice(0, 8);
    return report({
      kind: 'DISTRIBUTION',
      title: `${category.name}的构成`,
      lede: `没有找到数值字段，先把「${category.name}」的记录构成拉出来。按出现频次从高到低排列。`,
      metrics: [
        { label: '分组数', value: String(category.unique), unit: '组' },
        { label: '首位', value: groups[0]?.value ?? '—', note: `${formatInteger(groups[0]?.count ?? 0)} 条` },
        { label: '有效记录', value: formatInteger(dataset.rows.length), unit: '行' },
        { label: '缺失', value: formatInteger(category.missing), unit: '行' },
      ],
      chart: {
        kind: 'bar',
        title: `${category.name} · 记录频次`,
        labels: groups.map((group) => group.value),
        values: groups.map((group) => group.count),
        format: { type: 'number' },
        horizontal: true,
        accentIndex: 0,
      },
      findings: [
        { text: `${groups[0]?.value} 是出现最多的分组，共 ${formatInteger(groups[0]?.count ?? 0)} 条。` },
        { text: `共 ${category.unique} 个不同取值。` },
      ],
      trace: [
        { label: '选择字段', detail: category.name },
        { label: '统计频次', detail: '按非空值分组计数' },
        { label: '降序排列', detail: '最多展示 8 组' },
      ],
    });
  }

  const values = dataset.rows
    .map((row) => row[metric.name])
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) {
    return insufficientReport(dataset, '这列没有可用数值', `「${metric.name}」没有读到有效数字。`);
  }

  const chart = histogram(values, metric);
  const stats = numericStats(values);
  const sorted = [...values].sort((a, b) => b - a);
  const top10Count = Math.max(1, Math.ceil(values.length * 0.1));
  const top10Share = sorted.slice(0, top10Count).reduce((sum, value) => sum + value, 0) /
    Math.max(1, sorted.reduce((sum, value) => sum + value, 0));
  const diff = stats.mean - stats.median;

  return report({
    kind: 'DISTRIBUTION',
    title: `${metric.name}的分布`,
    lede: `对「${metric.name}」做等宽分箱，观察数值集中在哪个区间。本次使用 ${formatInteger(values.length)} 条非空记录。`,
    metrics: [
      { label: '平均值', value: formatMetric(metric, stats.mean, true), tone: 'accent' },
      { label: '中位数', value: formatMetric(metric, stats.median, true) },
      { label: '最小值', value: formatMetric(metric, stats.min, true) },
      { label: '最大值', value: formatMetric(metric, stats.max, true) },
    ],
    chart: chart ?? undefined,
    findings: [
      {
        text: `均值与中位数相差 ${formatMetric(metric, Math.abs(diff), true)}，${Math.abs(diff) > (stats.std || 1) * 0.2 ? '分布可能被一侧的极端值拉动' : '两者接近，分布相对均衡'}。`,
      },
      {
        text: `最高的 10% 记录贡献了全部${metric.name}的 ${formatPercent(top10Share)}，${top10Share > 0.5 ? '集中度较高。' : '集中度不突出。'}`,
      },
      { text: `四分位区间为 ${formatMetric(metric, stats.q1)} 至 ${formatMetric(metric, stats.q3)}，中位数 ${formatMetric(metric, stats.median)}。` },
    ],
    table: {
      columns: ['指标', '读数'],
      align: ['left', 'right'],
      rows: [
        ['下限 Q1', formatMetric(metric, stats.q1)],
        ['中位数', formatMetric(metric, stats.median)],
        ['上限 Q3', formatMetric(metric, stats.q3)],
        ['标准差', formatMetric(metric, stats.std)],
        ['总和', formatMetric(metric, stats.sum)],
      ],
      caption: '数值分布摘要',
    },
    trace: [
      { label: '选择数值字段', detail: metric.name },
      { label: '排除空值', detail: `${dataset.rows.length - values.length} 行未参与` },
      { label: '等宽分箱', detail: `${chart?.values.length ?? 0} 个区间` },
      { label: '计算分布摘要', detail: '均值 / 中位数 / 四分位 / 标准差' },
    ],
  });
}

function insufficientReport(
  dataset: Dataset,
  title: string,
  lede: string,
): AgentReport {
  return report({
    kind: 'NOTE',
    title,
    lede,
    metrics: [
      { label: '样本行数', value: formatInteger(dataset.profile.rowCount), unit: '行' },
      { label: '字段数', value: String(dataset.profile.columnCount), unit: '列' },
    ],
    findings: [
      { text: '可以指定字段名，比如“销售额随月份怎么变？”或“按城市对比销售额”。' },
      { text: '也可以直接点右侧字段列表，把字段带进提问框。' },
    ],
    trace: [
      { label: '解析问题', detail: '未找到足够的分析字段' },
      { label: '保留样本状态', detail: '数据仍在本地工作台' },
    ],
    suggestions: suggestionsForDataset(dataset),
  });
}

type Intent =
  | 'quality'
  | 'duplicates'
  | 'outlier'
  | 'correlation'
  | 'trend'
  | 'distribution'
  | 'ranking'
  | 'compare'
  | 'overview'
  | 'fallback';

function detectIntent(question: string): Intent {
  if (/重复|重复行|去重|duplicat/i.test(question)) return 'duplicates';
  if (
    /缺失|缺少|缺多少|空值|空着|完整|质量|健康|干净|可靠|能不能用|能不能直接|清洗|missing|null|completeness|quality|clean/i.test(
      question,
    )
  ) {
    return 'quality';
  }
  if (/异常|离群|极端|离谱|outlier|anomal/i.test(question)) return 'outlier';
  if (/相关|关联|关系|有关|影响|correlat|relationship/i.test(question)) return 'correlation';
  if (/趋势|走势|变化|增长|下降|上升|逐日|逐月|每日|每天|每月|每周|季度|月度|时间|trend|over time/i.test(question)) {
    return 'trend';
  }
  if (/分布|区间|直方|histogram|distribution/i.test(question)) return 'distribution';
  if (
    /排名|排行|最高|最低|最多|最少|最好|最差|排在|领跑|前\d|top|rank|贡献/i.test(question)
  ) {
    return 'ranking';
  }
  if (/对比|比较|差异|分组|分渠道|分城市|分品类|compare|group/i.test(question)) {
    return 'compare';
  }
  if (/概览|概况|总结|总体|介绍|检查|看看|怎么样|描述|summary|overview|describe|explain/i.test(question)) {
    return 'overview';
  }
  if (/平均|均值|中位|总数|求和|极值|方差|标准差|mean|average|median|sum|std/i.test(question)) {
    return 'distribution';
  }
  return 'fallback';
}

export function suggestionsForDataset(dataset: Dataset): string[] {
  const date = primaryDate(dataset);
  const metric = primaryMetric(dataset);
  const category = primaryCategory(dataset);
  const second = secondaryMetric(dataset);
  const suggestions: string[] = [];

  if (date && metric) suggestions.push(`${metric.name}随时间怎么变化？`);
  if (date && !metric) suggestions.push(`${date.name}上的记录量怎么变化？`);
  if (category && metric) suggestions.push(`按${category.name}看${metric.name}，谁排在前面？`);
  if (category && !metric) suggestions.push(`按${category.name}分组，哪组记录最多？`);
  if (metric && second) suggestions.push(`${metric.name}和${second.name}相关吗？`);
  suggestions.push('有哪些异常值？');
  suggestions.push('这份数据完整吗？');
  if (metric && !date) suggestions.push(`${metric.name}的分布怎么样？`);

  return [...new Set(suggestions)].slice(0, 4);
}

export function buildIntakeReport(dataset: Dataset): AgentReport {
  return buildOverviewReport(dataset, true);
}

export function analyzeQuestion(dataset: Dataset, question: string): AgentReport {
  const mentioned = findMentionedColumns(dataset, question);
  let intent = detectIntent(question);

  const hasCategoryMention = mentioned.some(
    (item) =>
      (item.column.type === 'category' || item.column.type === 'boolean') &&
      !item.column.likelyId,
  );
  const hasMetricMention = mentioned.some(
    (item) => item.column.type === 'number' && !item.column.likelyId,
  );

  if (
    intent === 'ranking' &&
    !hasCategoryMention &&
    /(哪天|哪一天|哪日|哪个月|哪月|几月|哪个季度|峰值)/.test(question)
  ) {
    intent = 'trend';
  }

  if (intent === 'fallback' && hasCategoryMention && hasMetricMention) {
    intent = 'compare';
  }

  if (intent === 'fallback' && hasMetricMention) {
    intent = 'distribution';
  }

  switch (intent) {
    case 'duplicates':
      return buildDuplicateReport(dataset);
    case 'quality':
      return buildQualityReport(dataset);
    case 'outlier':
      return buildOutlierReport(dataset, mentioned);
    case 'correlation':
      return buildCorrelationReport(dataset, mentioned);
    case 'trend':
      return buildTrendReport(dataset, mentioned);
    case 'distribution':
      return buildDistributionReport(dataset, mentioned);
    case 'ranking':
      return buildGroupedReport(dataset, mentioned, 'ranking', question);
    case 'compare':
      return buildGroupedReport(dataset, mentioned, 'compare', question);
    case 'overview':
      return buildOverviewReport(dataset, false);
    default: {
      const base = buildOverviewReport(dataset, false);
      return {
        ...base,
        id: newId('report'),
        title: '没完全对上，先换个角度看看',
        lede: `我没能把「${truncated(question, 32)}」直接映射到一个稳定动作。先把全表的轮廓放在这里；你可以直接点右侧字段，或换一个带字段名的问法。`,
        suggestions: suggestionsForDataset(dataset),
      };
    }
  }
}
