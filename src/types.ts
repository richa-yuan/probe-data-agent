export type FieldType = 'number' | 'date' | 'category' | 'boolean';

export type Cell = string | number | boolean | null;

export type DataRow = Record<string, Cell>;

export type ValueFormat =
  | { type: 'number'; unit?: string }
  | { type: 'currency' }
  | { type: 'percent' };

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  sum: number;
  std: number;
}

export interface ColumnProfile {
  name: string;
  type: FieldType;
  total: number;
  missing: number;
  unique: number;
  numeric?: NumericStats;
  topValues?: { value: string; count: number }[];
  dateMin?: string;
  dateMax?: string;
  likelyId?: boolean;
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  missingCells: number;
  completeness: number;
  duplicateRows: number;
}

export interface Dataset {
  id: string;
  name: string;
  fileName: string;
  kind: 'csv' | 'xlsx' | 'json' | 'sample';
  rows: DataRow[];
  columns: ColumnProfile[];
  profile: DatasetProfile;
  createdAt: number;
  truncated?: boolean;
  sizeBytes?: number;
}

export interface Metric {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: 'default' | 'accent' | 'warn';
}

export interface Finding {
  text: string;
  tone?: 'default' | 'good' | 'warn' | 'accent';
}

export interface TableData {
  columns: string[];
  rows: string[][];
  caption?: string;
  align?: ('left' | 'right')[];
}

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface LineChartSpec {
  kind: 'line';
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
  seriesName: string;
  format: ValueFormat;
}

export interface BarChartSpec {
  kind: 'bar';
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
  format: ValueFormat;
  horizontal?: boolean;
  accentIndex?: number;
}

export interface ScatterChartSpec {
  kind: 'scatter';
  title: string;
  subtitle?: string;
  points: { x: number; y: number; label?: string }[];
  xLabel: string;
  yLabel: string;
  formatX: ValueFormat;
  formatY: ValueFormat;
  correlation: number;
}

export type ChartSpec = LineChartSpec | BarChartSpec | ScatterChartSpec;

export interface TraceStep {
  label: string;
  detail: string;
}

export interface AgentReport {
  id: string;
  role: 'agent';
  kind: string;
  title: string;
  lede: string;
  metrics?: Metric[];
  chart?: ChartSpec;
  findings?: Finding[];
  table?: TableData;
  trace: TraceStep[];
  createdAt: number;
  suggestions?: string[];
}

export interface UserPrompt {
  id: string;
  role: 'user';
  text: string;
  createdAt: number;
}

export type Message = AgentReport | UserPrompt;

export interface Conversation {
  datasetId: string;
  messages: Message[];
}
