import { useEffect, useRef, useState } from 'react';
import type { ChartSpec, ScatterChartSpec } from '../types';
import { formatNumber } from '../lib/format';

const BLUE = '#2334e6';
const ORANGE = '#ff5a36';
const MUTED = '#69716b';
const GRID = '#d7dbd2';

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(300, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function tickEvery(count: number, maxTicks = 7): number {
  return Math.max(1, Math.ceil(count / maxTicks));
}

function linearScale(value: number, min: number, max: number, start: number, end: number) {
  if (max === min) return (start + end) / 2;
  return start + ((value - min) / (max - min)) * (end - start);
}

function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function niceScale(minValue: number, maxValue: number, tickCount = 4) {
  let low = Math.min(minValue, maxValue);
  let high = Math.max(minValue, maxValue);
  if (low === high) {
    high = low === 0 ? 1 : low + Math.abs(low) * 0.1;
  }
  const step = niceStep((high - low) / Math.max(1, tickCount));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let index = 0; index <= 12; index += 1) {
    const value = min + step * index;
    if (value > max + step * 0.001) break;
    ticks.push(Number(value.toPrecision(12)));
  }
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return { min, max, ticks, step };
}

function regression(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  }
  const denominator = points.length * sumXX - sumX * sumX;
  if (!denominator) return null;
  const slope = (points.length * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / points.length;
  return { slope, intercept };
}

function LinePlot({ spec, width }: { spec: Extract<ChartSpec, { kind: 'line' }>; width: number }) {
  const height = 238;
  const margin = { top: 30, right: 22, bottom: 38, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const values = spec.values;
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const baseMin = Math.min(0, rawMin);
  const scale = niceScale(baseMin, rawMax + (rawMax - baseMin) * 0.02, 4);
  const min = scale.min;
  const max = scale.max;
  const step = innerWidth / Math.max(1, values.length - 1);
  const points = values.map((value, index) => ({
    x: margin.left + (values.length === 1 ? innerWidth / 2 : index * step),
    y: linearScale(value, min, max, margin.top + innerHeight, margin.top),
    value,
    label: spec.labels[index] ?? '',
  }));

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const area = `${path} L ${points[points.length - 1]?.x ?? margin.left} ${
    margin.top + innerHeight
  } L ${points[0]?.x ?? margin.left} ${margin.top + innerHeight} Z`;
  let peakIndex = 0;
  values.forEach((value, index) => {
    if (value > values[peakIndex]) peakIndex = index;
  });
  const tickValues = scale.ticks;
  const labelStep = tickEvery(spec.labels.length, 7);
  const peak = points[peakIndex];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${spec.title}，${spec.subtitle ?? ''}`}
    >
      <title>{spec.title}</title>
      <desc>{spec.subtitle}</desc>
      {tickValues.map((value, index) => {
        const y = linearScale(value, min, max, margin.top + innerHeight, margin.top);
        return (
          <g key={`tick-${index}`}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke={GRID}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={margin.left - 10}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {formatNumber(value, spec.format, true)}
            </text>
          </g>
        );
      })}
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={margin.top + innerHeight}
        y2={margin.top + innerHeight}
        stroke={GRID}
      />
      <path d={area} fill={BLUE} opacity={0.08} className="chart-area" />
      <path
        d={path}
        fill="none"
        stroke={BLUE}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="chart-path"
      />
      {points.map((point, index) =>
        spec.labels.length <= 16 || index === 0 || index === points.length - 1 ? (
          <g key={`point-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={3.2}
              fill="#f4f5ef"
              stroke={BLUE}
              strokeWidth={1.8}
              className="chart-dot"
            >
              <title>{`${point.label} · ${formatNumber(point.value, spec.format)}`}</title>
            </circle>
          </g>
        ) : null,
      )}
      {peak && (
        <g>
          <circle cx={peak.x} cy={peak.y} r={7.5} fill={ORANGE} opacity={0.12} />
          <circle cx={peak.x} cy={peak.y} r={4.4} fill={ORANGE} className="chart-peak">
            <title>{`峰值 ${peak.label} · ${formatNumber(peak.value, spec.format)}`}</title>
          </circle>
          <text
            x={Math.min(width - margin.right, peak.x + 10)}
            y={Math.max(16, peak.y - 10)}
            fontSize={9.5}
            fontFamily="IBM Plex Mono, monospace"
            fill={ORANGE}
            textAnchor={peak.x > width * 0.72 ? 'end' : 'start'}
          >
            PEAK {formatNumber(peak.value, spec.format, true)}
          </text>
        </g>
      )}
      {spec.labels.map((label, index) => {
        if (index % labelStep !== 0 && index !== spec.labels.length - 1) return null;
        const x = points[index]?.x ?? margin.left;
        return (
          <text
            key={`label-${index}`}
            x={x}
            y={height - 14}
            fontSize={9.5}
            fontFamily="IBM Plex Mono, monospace"
            fill={MUTED}
            textAnchor={
              index === 0 ? 'start' : index === spec.labels.length - 1 ? 'end' : 'middle'
            }
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function HorizontalBarPlot({
  spec,
  width,
}: {
  spec: Extract<ChartSpec, { kind: 'bar' }>;
  width: number;
}) {
  const rowHeight = spec.labels.length > 6 ? 27 : 30;
  const height = Math.max(198, spec.labels.length * rowHeight + 50);
  const margin = {
    top: 20,
    right: 72,
    bottom: 24,
    left: Math.min(180, Math.max(96, width * 0.28)),
  };
  const innerWidth = width - margin.left - margin.right;
  const rawMax = Math.max(...spec.values, 1);
  const scale = niceScale(
    0,
    rawMax,
    rawMax <= 10 ? Math.max(2, Math.ceil(rawMax)) : 5,
  );
  const max = scale.max;
  const ticks = scale.ticks;
  const labelLimit = width < 560 ? 10 : 16;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${spec.title}，${spec.subtitle ?? ''}`}
    >
      <title>{spec.title}</title>
      <desc>{spec.subtitle}</desc>
      {ticks.map((tick, index) => {
        const x = margin.left + (tick / max) * innerWidth;
        return (
          <g key={`grid-${tick}-${index}`}>
            <line
              x1={x}
              x2={x}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke={GRID}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={x}
              y={height - 8}
              textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
              fontSize={8.5}
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {formatNumber(tick, spec.format, true)}
            </text>
          </g>
        );
      })}
      {spec.labels.map((label, index) => {
        const y = margin.top + index * rowHeight;
        const barWidth = Math.max(2, (spec.values[index] / max) * innerWidth);
        const accent = spec.accentIndex === index;
        return (
          <g key={`bar-${index}-${label}`}>
            <text
              x={margin.left - 12}
              y={y + rowHeight / 2 + 3}
              textAnchor="end"
              fontSize={10.5}
              fontFamily="-apple-system, PingFang SC, sans-serif"
              fill="#303733"
            >
              {label.length > labelLimit ? `${label.slice(0, labelLimit)}…` : label}
            </text>
            <rect
              x={margin.left}
              y={y + 8}
              width={innerWidth}
              height={rowHeight - 17}
              fill="#e9ebe5"
              rx={1}
            />
            <rect
              x={margin.left}
              y={y + 8}
              width={barWidth}
              height={rowHeight - 17}
              fill={accent ? ORANGE : BLUE}
              rx={1}
              className="chart-bar-h"
            >
              <title>{`${label} · ${formatNumber(spec.values[index], spec.format)}`}</title>
            </rect>
            <text
              x={margin.left + barWidth + 8}
              y={y + rowHeight / 2 + 3}
              fontSize={9.5}
              fontFamily="IBM Plex Mono, monospace"
              fill={accent ? ORANGE : MUTED}
            >
              {formatNumber(spec.values[index], spec.format, true)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function VerticalBarPlot({
  spec,
  width,
}: {
  spec: Extract<ChartSpec, { kind: 'bar' }>;
  width: number;
}) {
  const height = 276;
  const margin = { top: 28, right: 20, bottom: 44, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const rawMax = Math.max(...spec.values, 1);
  const scale = niceScale(0, rawMax, rawMax <= 10 ? Math.max(2, Math.ceil(rawMax)) : 4);
  const max = scale.max;
  const slot = innerWidth / Math.max(1, spec.values.length);
  const barWidth = Math.min(40, slot * 0.56);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${spec.title}，${spec.subtitle ?? ''}`}
    >
      <title>{spec.title}</title>
      <desc>{spec.subtitle}</desc>
      {scale.ticks.map((value, index) => {
        const y = linearScale(value, 0, max, margin.top + innerHeight, margin.top);
        return (
          <g key={`v-grid-${index}`}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke={GRID}
              strokeDasharray="2 4"
            />
            <text
              x={margin.left - 9}
              y={y + 3}
              fontSize={8.5}
              textAnchor="end"
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {formatNumber(value, spec.format, true)}
            </text>
          </g>
        );
      })}
      {spec.values.map((value, index) => {
        const drawn = (value / max) * innerHeight;
        const x = margin.left + slot * index + (slot - barWidth) / 2;
        const y = margin.top + innerHeight - drawn;
        const accent = spec.accentIndex === index;
        return (
          <g key={`v-bar-${index}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, drawn)}
              fill={accent ? ORANGE : BLUE}
              rx={1}
              className="chart-bar-v"
            >
              <title>{`${spec.labels[index]} · ${formatNumber(value, spec.format)}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={Math.max(12, y - 6)}
              textAnchor="middle"
              fontSize={8.5}
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {formatNumber(value, spec.format, true)}
            </text>
            <text
              x={x + barWidth / 2}
              y={height - 16}
              textAnchor="middle"
              fontSize={8.5}
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {spec.labels[index]?.length > 10
                ? `${spec.labels[index].slice(0, 10)}…`
                : spec.labels[index]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ScatterPlot({
  spec,
  width,
}: {
  spec: ScatterChartSpec;
  width: number;
}) {
  const height = 250;
  const margin = { top: 26, right: 26, bottom: 44, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xs = spec.points.map((point) => point.x);
  const ys = spec.points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || Math.abs(xMax) || 1;
  const yRange = yMax - yMin || Math.abs(yMax) || 1;
  const xScale = niceScale(xMin >= 0 ? 0 : xMin, xMax + xRange * 0.025, 4);
  const yScale = niceScale(yMin >= 0 ? 0 : yMin, yMax + yRange * 0.04, 4);
  const xDomain = [xScale.min, xScale.max];
  const yDomain = [yScale.min, yScale.max];
  const fit = regression(spec.points);

  const toX = (value: number) =>
    linearScale(value, xDomain[0], xDomain[1], margin.left, margin.left + innerWidth);
  const toY = (value: number) =>
    linearScale(value, yDomain[0], yDomain[1], margin.top + innerHeight, margin.top);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${spec.title}，Pearson 相关系数 ${spec.correlation.toFixed(2)}`}
    >
      <title>{spec.title}</title>
      <desc>{`${spec.xLabel}与${spec.yLabel}的散点图，r=${spec.correlation.toFixed(3)}`}</desc>
      {yScale.ticks.map((value, index) => {
        const y = toY(value);
        return (
          <g key={`scatter-y-${index}`}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke={GRID}
              strokeDasharray="2 4"
            />
            <text
              x={margin.left - 9}
              y={y + 3}
              fontSize={8.5}
              textAnchor="end"
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {formatNumber(value, spec.formatY, true)}
            </text>
          </g>
        );
      })}
      {xScale.ticks.map((value, index) => {
        const x = toX(value);
        return (
          <g key={`scatter-x-${index}`}>
            <line
              x1={x}
              x2={x}
              y1={margin.top}
              y2={margin.top + innerHeight}
              stroke={GRID}
              strokeDasharray="2 4"
            />
            <text
              x={x}
              y={height - 20}
              fontSize={8.5}
              textAnchor={
                index === 0 ? 'start' : index === xScale.ticks.length - 1 ? 'end' : 'middle'
              }
              fontFamily="IBM Plex Mono, monospace"
              fill={MUTED}
            >
              {formatNumber(value, spec.formatX, true)}
            </text>
          </g>
        );
      })}
      {fit && (
        <line
          x1={toX(xDomain[0])}
          y1={toY(fit.slope * xDomain[0] + fit.intercept)}
          x2={toX(xDomain[1])}
          y2={toY(fit.slope * xDomain[1] + fit.intercept)}
          stroke={ORANGE}
          strokeWidth={1.6}
          strokeDasharray="7 5"
          opacity={0.9}
          className="chart-fit"
        />
      )}
      {spec.points.map((point, index) => (
        <circle
          key={`scatter-point-${index}`}
          cx={toX(point.x)}
          cy={toY(point.y)}
          r={2.7}
          fill={BLUE}
          opacity={0.48}
          className="chart-dot"
        >
          <title>{`${formatNumber(point.x, spec.formatX)} · ${formatNumber(point.y, spec.formatY)}`}</title>
        </circle>
      ))}
      <text
        x={width - margin.right}
        y={height - 4}
        textAnchor="end"
        fontSize={9.5}
        fontFamily="IBM Plex Mono, monospace"
        fill={MUTED}
      >
        {spec.xLabel} →
      </text>
      <text
        x={margin.left}
        y={12}
        fontSize={9.5}
        fontFamily="IBM Plex Mono, monospace"
        fill={MUTED}
      >
        ↑ {spec.yLabel}
      </text>
      <g transform={`translate(${width - margin.right - 74}, ${margin.top + 2})`}>
        <rect width={74} height={24} fill="#f4f5ef" stroke={GRID} />
        <text
          x={37}
          y={16}
          textAnchor="middle"
          fontSize={9}
          fontFamily="IBM Plex Mono, monospace"
          fill={ORANGE}
        >
          r = {spec.correlation.toFixed(2)}
        </text>
      </g>
    </svg>
  );
}

export function Chart({ spec }: { spec: ChartSpec }) {
  const { ref, width } = useMeasuredWidth();
  const count =
    spec.kind === 'scatter'
      ? `${spec.points.length} POINTS`
      : spec.kind === 'line'
        ? `${spec.labels.length} STEPS`
        : `${spec.labels.length} BARS`;

  return (
    <figure className={`chart chart--${spec.kind}`}>
      <div className="chart__head">
        <div className="chart__heading">
          <span className="chart__kicker">PLOT / {spec.kind.toUpperCase()}</span>
          <span className="chart__title">{spec.title}</span>
          {spec.subtitle && <span className="chart__subtitle">{spec.subtitle}</span>}
        </div>
        <span className="chart__count">{count}</span>
      </div>
      <div className="chart__body" ref={ref}>
        {spec.kind === 'line' && <LinePlot spec={spec} width={width} />}
        {spec.kind === 'bar' &&
          (spec.horizontal === false ? (
            <VerticalBarPlot spec={spec} width={width} />
          ) : (
            <HorizontalBarPlot spec={spec} width={width} />
          ))}
        {spec.kind === 'scatter' && <ScatterPlot spec={spec} width={width} />}
      </div>
    </figure>
  );
}
