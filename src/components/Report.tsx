import { ChevronDown, CornerDownRight } from 'lucide-react';
import type { AgentReport, TableData } from '../types';
import { timeLabel } from '../lib/format';
import { Chart } from './Chart';

function DataTable({ table }: { table: TableData }) {
  return (
    <div className="data-table-block">
      <div className="section-label">
        <span>TABLE / 读数明细</span>
        <span>{table.rows.length} ROWS</span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {table.columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  style={{ textAlign: table.align?.[index] ?? 'left' }}
                  scope="col"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    style={{ textAlign: table.align?.[cellIndex] ?? 'left' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.caption && <p className="data-table-caption">{table.caption}</p>}
    </div>
  );
}

interface ReportViewProps {
  report: AgentReport;
  onSuggestion: (text: string) => void;
}

export function ReportView({ report, onSuggestion }: ReportViewProps) {
  return (
    <article className="report" aria-label={report.title}>
      <header className="report__meta">
        <span className="report__identity">
          <i className="report__mark" aria-hidden="true" />
          PROBE / {report.kind}
        </span>
        <span className="report__time">{timeLabel(report.createdAt)}</span>
      </header>

      <h2 className="report__title">{report.title}</h2>
      <p className="report__lede">{report.lede}</p>

      {report.metrics && report.metrics.length > 0 && (
        <div className="metric-strip">
          {report.metrics.map((metric, index) => (
            <div
              className={`metric${metric.tone ? ` metric--${metric.tone}` : ''}`}
              key={`${metric.label}-${index}`}
            >
              <span className="metric__label">{metric.label}</span>
              <span className="metric__value">
                {metric.value}
                {metric.unit && <small>{metric.unit}</small>}
              </span>
              {metric.note && <span className="metric__note">{metric.note}</span>}
            </div>
          ))}
        </div>
      )}

      {report.chart && <Chart spec={report.chart} />}

      {report.findings && report.findings.length > 0 && (
        <section className="findings">
          <div className="section-label">
            <span>READOUT / 读数</span>
            <span>{String(report.findings.length).padStart(2, '0')}</span>
          </div>
          <ul>
            {report.findings.map((finding, index) => (
              <li key={`${finding.text}-${index}`} className={finding.tone ? `is-${finding.tone}` : ''}>
                <CornerDownRight size={14} strokeWidth={1.6} aria-hidden="true" />
                <span>{finding.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.table && <DataTable table={report.table} />}

      {report.suggestions && report.suggestions.length > 0 && (
        <div className="report__suggestions">
          <span className="mono-label">换一种问法</span>
          <div>
            {report.suggestions.slice(0, 3).map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                className="suggestion-chip"
                onClick={() => onSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <details className="trace">
        <summary>
          <span className="trace__summary-main">
            <span className="trace__icon" aria-hidden="true">
              ⌁
            </span>
            计算路径
          </span>
          <span className="trace__summary-side">
            CALC TRACE · {String(report.trace.length).padStart(2, '0')} STEPS
            <ChevronDown size={13} strokeWidth={1.8} />
          </span>
        </summary>
        <ol className="trace__steps">
          {report.trace.map((step, index) => (
            <li key={`${step.label}-${index}`}>
              <span className="trace__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="trace__label">{step.label}</span>
              <span className="trace__detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
