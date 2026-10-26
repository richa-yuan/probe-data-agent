import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Search, X } from 'lucide-react';
import type { ColumnProfile, Dataset, FieldType } from '../types';
import { detectFormat, formatCell, formatInteger, formatNumber, formatPercent } from '../lib/format';

const TYPE_CODE: Record<FieldType, string> = {
  number: 'NUM',
  date: 'DATE',
  category: 'CAT',
  boolean: 'BOOL',
};

const TYPE_LABEL: Record<FieldType, string> = {
  number: '数值',
  date: '日期',
  category: '分类',
  boolean: '布尔',
};

type InspectorTab = 'fields' | 'preview' | 'quality';

function fieldMeta(field: ColumnProfile): string {
  const missing = field.missing > 0 ? ` · 空 ${formatInteger(field.missing)}` : '';
  return `${formatInteger(field.unique)} 个唯一值${missing}`;
}

function displayValue(value: unknown, field: ColumnProfile): string {
  if (typeof value === 'number') {
    return formatNumber(value, detectFormat(field.name));
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  return formatCell(value, 26);
}

function FieldDetail({
  field,
  onAsk,
}: {
  field: ColumnProfile;
  onAsk: (field: ColumnProfile) => void;
}) {
  const rows = (() => {
    if (field.type === 'number' && field.numeric) {
      return [
        ['最小值', formatNumber(field.numeric.min, detectFormat(field.name))],
        ['中位数', formatNumber(field.numeric.median, detectFormat(field.name))],
        ['最大值', formatNumber(field.numeric.max, detectFormat(field.name))],
        ['均值', formatNumber(field.numeric.mean, detectFormat(field.name))],
      ];
    }
    if (field.type === 'date') {
      return [
        ['最早', field.dateMin ?? '—'],
        ['最晚', field.dateMax ?? '—'],
        ['空值', formatInteger(field.missing)],
      ];
    }
    return [];
  })();

  const top = field.topValues?.slice(0, 4) ?? [];

  return (
    <div className="field-detail">
      {rows.length > 0 && (
        <dl className="field-stats">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {top.length > 0 && (
        <div className="field-top-list">
          {top.map((entry) => (
            <div className="field-top" key={entry.value}>
              <span className="field-top__label">{entry.value}</span>
              <span className="field-top__track">
                <span
                  style={{ width: `${(entry.count / Math.max(1, top[0].count)) * 100}%` }}
                />
              </span>
              <span className="field-top__count">{formatInteger(entry.count)}</span>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="field-ask" onClick={() => onAsk(field)}>
        用这个字段分析
        <ArrowUpRight size={14} strokeWidth={1.7} />
      </button>
    </div>
  );
}

function FieldsPanel({
  dataset,
  selectedField,
  onSelectField,
  onAsk,
}: {
  dataset: Dataset;
  selectedField: string | null;
  onSelectField: (name: string | null) => void;
  onAsk: (field: ColumnProfile) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = dataset.columns.filter((field) =>
    field.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="fields-panel">
      <label className="field-search">
        <Search size={14} strokeWidth={1.7} />
        <span className="sr-only">筛选字段</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="筛选字段"
        />
        <span className="field-search__count">{String(filtered.length).padStart(2, '0')}</span>
      </label>

      <div className="field-list">
        {filtered.map((field) => {
          const expanded = selectedField === field.name;
          return (
            <div className={`field-row${expanded ? ' is-expanded' : ''}`} key={field.name}>
              <button
                type="button"
                className="field-row__button"
                onClick={() => onSelectField(expanded ? null : field.name)}
                aria-expanded={expanded}
              >
                <span className={`type-code type-code--${field.type}`}>{TYPE_CODE[field.type]}</span>
                <span className="field-row__body">
                  <span className="field-row__name">{field.name}</span>
                  <span className="field-row__meta">{fieldMeta(field)}</span>
                </span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.7}
                  className="field-row__chevron"
                  aria-hidden="true"
                />
              </button>
              {expanded && <FieldDetail field={field} onAsk={onAsk} />}
            </div>
          );
        })}
        {!filtered.length && <p className="field-empty">没有匹配的字段。</p>}
      </div>
    </div>
  );
}

function PreviewPanel({ dataset }: { dataset: Dataset }) {
  const rows = dataset.rows.slice(0, 8);
  return (
    <div className="preview-panel">
      <div className="subsection-head">
        <span>前 8 行原始记录</span>
        <span>{formatInteger(dataset.profile.rowCount)} ROWS</span>
      </div>
      <div className="preview-scroll">
        <table className="preview-table">
          <thead>
            <tr>
              {dataset.columns.map((field) => (
                <th key={field.name} scope="col">
                  <span>{field.name}</span>
                  <small>{TYPE_CODE[field.type]}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`preview-row-${rowIndex}`}>
                {dataset.columns.map((field) => (
                  <td key={`${field.name}-${rowIndex}`} title={String(row[field.name] ?? '')}>
                    {displayValue(row[field.name], field)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-footnote">预览保留原始值的标准形式，数值列已转为数字。</p>
    </div>
  );
}

function QualityPanel({ dataset }: { dataset: Dataset }) {
  const { profile } = dataset;
  const filled = profile.completeness === 1 ? 24 : Math.floor(profile.completeness * 24);
  const affected = dataset.columns
    .filter((field) => field.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  const constant = dataset.columns.filter((field) => field.unique === 1);
  const maxMissing = Math.max(1, ...affected.map((field) => field.missing));

  return (
    <div className="quality-panel">
      <div className="completeness-readout">
        <div className="completeness-readout__top">
          <span className="mono-label">FULLNESS / 完整度</span>
          <span className={`completeness-readout__value${profile.completeness < 0.95 ? ' is-warn' : ''}`}>
            {formatPercent(profile.completeness)}
          </span>
        </div>
        <div className="completeness-meter" aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <span key={index} className={index < filled ? 'is-filled' : 'is-missing'} />
          ))}
        </div>
        <div className="completeness-readout__foot">
          <span>{formatInteger(profile.missingCells)} 个空单元格</span>
          <span>{formatInteger(profile.rowCount * profile.columnCount)} 单元格总量</span>
        </div>
      </div>

      <div className="quality-stats">
        <div>
          <span>重复行</span>
          <strong>{formatInteger(profile.duplicateRows)}</strong>
        </div>
        <div>
          <span>受影响字段</span>
          <strong>{affected.length}</strong>
        </div>
        <div>
          <span>常量字段</span>
          <strong>{constant.length}</strong>
        </div>
        <div>
          <span>字段数</span>
          <strong>{profile.columnCount}</strong>
        </div>
      </div>

      {affected.length ? (
        <div className="missing-list">
          <div className="subsection-head">
            <span>缺失字段</span>
            <span>EMPTY CELLS</span>
          </div>
          {affected.map((field) => (
            <div className="missing-row" key={field.name}>
              <div className="missing-row__top">
                <span>{field.name}</span>
                <span>{formatPercent(field.missing / Math.max(1, field.total), 2)}</span>
              </div>
              <div className="missing-row__track">
                <span style={{ width: `${(field.missing / maxMissing) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="quality-clear">
          <span className="quality-clear__mark">✓</span>
          <p>所有字段都是满的。没有空值需要处理。</p>
        </div>
      )}

      {profile.duplicateRows > 0 && (
        <div className="quality-callout">
          <span className="mono-label">REVIEW</span>
          <p>发现 {formatInteger(profile.duplicateRows)} 行完全重复。做计数和求和前，先确认是否保留。</p>
        </div>
      )}

      <div className="quality-note">
        <span>所有检查基于当前读取的数据，不修改原文件。</span>
        <span>LOCAL SESSION</span>
      </div>
    </div>
  );
}

interface InspectorProps {
  dataset: Dataset;
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  selectedField: string | null;
  setSelectedField: (name: string | null) => void;
  onAskField: (field: ColumnProfile) => void;
  onClose: () => void;
}

export function Inspector({
  dataset,
  tab,
  setTab,
  selectedField,
  setSelectedField,
  onAskField,
  onClose,
}: InspectorProps) {
  const issueCount =
    (dataset.profile.missingCells > 0 ? 1 : 0) +
    (dataset.profile.duplicateRows > 0 ? 1 : 0);

  return (
    <aside className="inspector">
      <div className="panel-heading inspector__head">
        <div>
          <span className="panel-kicker">SPECIMEN / 已装载</span>
          <h2 className="panel-title">数据剖面</h2>
        </div>
        <button
          type="button"
          className="icon-button drawer-close"
          onClick={onClose}
          aria-label="关闭数据剖面"
        >
          <X size={17} />
        </button>
      </div>

      <div className="inspector__dataset">
        <h3 title={dataset.name}>{dataset.name}</h3>
        <p>
          {formatInteger(dataset.profile.rowCount)} 行 × {dataset.profile.columnCount} 列
          <span> / </span>
          {dataset.kind.toUpperCase()}
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="数据剖面视图">
        {(
          [
            ['fields', '字段', dataset.columns.length],
            ['preview', '预览', Math.min(8, dataset.rows.length)],
            ['quality', '质量', issueCount],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`tab${tab === value ? ' is-active' : ''}`}
            onClick={() => setTab(value)}
          >
            <span>{label}</span>
            <small>{String(count).padStart(2, '0')}</small>
          </button>
        ))}
      </div>

      <div className="inspector__content">
        {tab === 'fields' && (
          <FieldsPanel
            dataset={dataset}
            selectedField={selectedField}
            onSelectField={setSelectedField}
            onAsk={onAskField}
          />
        )}
        {tab === 'preview' && <PreviewPanel dataset={dataset} />}
        {tab === 'quality' && <QualityPanel dataset={dataset} />}
      </div>

      <div className="inspector__foot">
        <span className="mono-label">FILE</span>
        <span className="inspector__filename" title={dataset.fileName}>
          {dataset.fileName}
        </span>
        <span className="inspector__types">
          {(['number', 'date', 'category', 'boolean'] as const)
            .filter((type) => dataset.columns.some((field) => field.type === type))
            .map((type) => TYPE_LABEL[type])
            .join(' · ')}
        </span>
      </div>
    </aside>
  );
}
