import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentReport, ColumnProfile, Dataset, Message, UserPrompt } from './types';
import {
  buildIntakeReport,
  analyzeQuestion,
  primaryMetric,
  suggestionsForDataset,
} from './lib/analytics';
import { generateSampleDataset, newId, parseDataFile } from './lib/data';
import { formatInteger, formatBytes, timeLabel } from './lib/format';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { EmptyStage } from './components/EmptyStage';
import { ProtocolRail } from './components/ProtocolRail';
import { ReportView } from './components/Report';
import { Composer } from './components/Composer';
import { Inspector } from './components/Inspector';
import { DropVeil, IngestionOverlay, Toast } from './components/Overlays';

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

function buildMarkdown(dataset: Dataset, messages: Message[]): string {
  const lines: string[] = [
    `# ${dataset.name} · 分析记录`,
    '',
    `> PROBE 探针 · 本地数据研判台  `,
    `> ${formatInteger(dataset.profile.rowCount)} 行 × ${dataset.profile.columnCount} 列 · 完整度 ${(dataset.profile.completeness * 100).toFixed(1)}% · 导出时间 ${new Date().toLocaleString('zh-CN')}`,
    '',
  ];

  const escapeCell = (value: string) => value.replace(/\|/g, '\\|');

  for (const message of messages) {
    if (message.role === 'user') {
      lines.push('## 提问', '', message.text, '');
      continue;
    }
    lines.push(`## ${message.title}`, '', message.lede, '');
    if (message.metrics?.length) {
      lines.push('| 指标 | 读数 |', '| --- | --- |');
      message.metrics.forEach((metric) => {
        lines.push(
          `| ${escapeCell(metric.label)} | ${escapeCell(`${metric.value}${metric.unit ?? ''}`)} |`,
        );
      });
      lines.push('');
    }
    if (message.chart) {
      lines.push(`> 图表：${message.chart.title}${message.chart.subtitle ? `（${message.chart.subtitle}）` : ''}`, '');
    }
    if (message.findings?.length) {
      lines.push('**读数**', '');
      message.findings.forEach((finding) => lines.push(`- ${finding.text}`));
      lines.push('');
    }
    if (message.table) {
      const { columns, rows } = message.table;
      lines.push(`| ${columns.map(escapeCell).join(' | ')} |`);
      lines.push(`| ${columns.map(() => '---').join(' | ')} |`);
      rows.forEach((row) => lines.push(`| ${row.map(escapeCell).join(' | ')} |`));
      lines.push('');
    }
    if (message.trace.length) {
      lines.push(`<details><summary>计算路径 · ${message.trace.length} 步</summary>`, '');
      message.trace.forEach((step, index) => {
        lines.push(`${index + 1}. **${step.label}** — ${step.detail}`);
      });
      lines.push('', '</details>', '');
    }
  }

  return lines.join('\n');
}

function PromptTurn({ message }: { message: UserPrompt }) {
  return (
    <div className="prompt-turn">
      <div className="prompt-turn__meta">
        <span>YOU ASKED</span>
        <span>{timeLabel(message.createdAt)}</span>
      </div>
      <p>{message.text}</p>
    </div>
  );
}

function Thinking() {
  return (
    <div className="thinking" role="status" aria-live="polite">
      <div className="thinking__meta">
        <span>PROBE / COMPUTING</span>
        <span className="thinking__dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="thinking__scan" aria-hidden="true">
        <span />
      </div>
      <p>正在匹配字段、选择方法并计算。</p>
    </div>
  );
}

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  const [draft, setDraft] = useState('');
  const [thinkingId, setThinkingId] = useState<string | null>(null);
  const [ingestFile, setIngestFile] = useState<string | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'default' | 'error' | 'success' } | null>(
    null,
  );
  const [inspectorTab, setInspectorTab] = useState<'fields' | 'preview' | 'quality'>('fields');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const activeDataset = datasets.find((dataset) => dataset.id === activeId) ?? null;
  const messages = activeId ? conversations[activeId] ?? [] : [];
  const busy = thinkingId !== null;
  const suggestions = useMemo(
    () => (activeDataset ? suggestionsForDataset(activeDataset) : []),
    [activeDataset],
  );
  const dragging = dragDepth > 0;

  const notify = (message: string, tone: 'default' | 'error' | 'success' = 'default') => {
    setToast({ id: Date.now(), message, tone });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSamplesOpen(false);
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.title = activeDataset
      ? `${activeDataset.name} · PROBE 探针`
      : 'PROBE / 探针 — 本地数据研判台';
  }, [activeDataset]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeId]);

  useEffect(() => {
    if (!scrollTarget) return;
    const thread = threadRef.current;
    if (!thread) return;
    const target = thread.querySelector<HTMLElement>(
      `[data-anchor-id="${scrollTarget.id}"]`,
    );
    if (!target) return;
    const top =
      target.getBoundingClientRect().top -
      thread.getBoundingClientRect().top +
      thread.scrollTop;
    thread.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
  }, [scrollTarget]);

  const addDataset = (dataset: Dataset) => {
    const report = buildIntakeReport(dataset);
    setDatasets((previous) => [dataset, ...previous]);
    setConversations((previous) => ({ ...previous, [dataset.id]: [report] }));
    setActiveId(dataset.id);
    setInspectorTab('fields');
    setSelectedField(null);
    setDraft('');
    setSamplesOpen(false);
    setInspectorOpen(false);
  };

  const handleFile = async (file: File) => {
    if (ingestFile) return;
    setIngestFile(file.name);
    const startedAt = performance.now();
    try {
      const dataset = await parseDataFile(file);
      const elapsed = performance.now() - startedAt;
      await wait(Math.max(0, 980 - elapsed));
      addDataset(dataset);
      notify(`已装载「${dataset.name}」，可以开始提问。`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取失败，请检查文件。';
      notify(message, 'error');
    } finally {
      setIngestFile(null);
    }
  };

  const handleSample = async () => {
    if (ingestFile) return;
    setIngestFile('retail_2026H1.csv');
    const startedAt = performance.now();
    const dataset = generateSampleDataset();
    const elapsed = performance.now() - startedAt;
    await wait(Math.max(0, 1050 - elapsed));
    addDataset(dataset);
    setIngestFile(null);
    notify('已载入测试样片。它会保留缺失值和离群点，方便试分析。', 'success');
  };

  const askQuestion = (raw?: string) => {
    const text = (raw ?? draft).trim();
    if (!activeDataset || !text || busy) return;
    const dataset = activeDataset;
    const prompt: UserPrompt = {
      id: newId('prompt'),
      role: 'user',
      text,
      createdAt: Date.now(),
    };

    setConversations((previous) => ({
      ...previous,
      [dataset.id]: [...(previous[dataset.id] ?? []), prompt],
    }));
    setDraft('');
    setThinkingId(dataset.id);
    setScrollTarget({ id: prompt.id, nonce: Date.now() });

    window.setTimeout(() => {
      try {
        const report = analyzeQuestion(dataset, text);
        setConversations((previous) => ({
          ...previous,
          [dataset.id]: [...(previous[dataset.id] ?? []), report],
        }));
        setScrollTarget({ id: prompt.id, nonce: Date.now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : '这次分析没有完成。';
        notify(message, 'error');
      } finally {
        setThinkingId(null);
      }
    }, 680);
  };

  const activateDataset = (id: string) => {
    setActiveId(id);
    setSelectedField(null);
    setInspectorTab('fields');
    setDraft('');
    setSamplesOpen(false);
  };

  const handleAskField = (field: ColumnProfile) => {
    if (!activeDataset || busy) return;
    const metric = primaryMetric(activeDataset);
    let question: string;
    if (field.type === 'number') {
      question = `「${field.name}」的分布怎么样？`;
    } else if (field.type === 'date') {
      question = metric ? `${metric.name}随时间怎么变化？` : '看一下这份数据的全貌';
    } else if (metric) {
      question = `按${field.name}看${metric.name}，谁排在前面？`;
    } else {
      question = `按${field.name}分组`;
    }
    setInspectorOpen(false);
    askQuestion(question);
  };

  const exportReport = () => {
    if (!activeDataset || !messages.length) return;
    const markdown = buildMarkdown(activeDataset, messages);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeName = activeDataset.name.replace(/[\\/:*?"<>|]/g, '-');
    anchor.href = url;
    anchor.download = `PROBE-${safeName}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('分析记录已导出为 Markdown。', 'success');
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragCounter.current += 1;
    setDragDepth(dragCounter.current);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    setDragDepth(dragCounter.current);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setDragDepth(0);
    const file = event.dataTransfer.files?.[0];
    if (file && !ingestFile) void handleFile(file);
  };

  return (
    <div
      className={`app${samplesOpen ? ' has-samples-open' : ''}${inspectorOpen ? ' has-inspector-open' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      <TopBar
        dataset={activeDataset ?? undefined}
        hasData={Boolean(activeDataset)}
        onUpload={openFilePicker}
        onExport={exportReport}
        onOpenSamples={() => {
          setInspectorOpen(false);
          setSamplesOpen(true);
        }}
        onOpenInspector={() => {
          setSamplesOpen(false);
          setInspectorOpen(true);
        }}
      />

      <div className="workspace">
        <Sidebar
          datasets={datasets}
          activeId={activeId}
          onActivate={activateDataset}
          onUpload={openFilePicker}
          onLoadSample={() => void handleSample()}
          onClose={() => setSamplesOpen(false)}
        />

        {activeDataset ? (
          <main className="main main--session">
            <div className="session-head">
              <div className="session-head__main">
                <span className="panel-kicker">ANALYSIS LOG / SESSION 01</span>
                <div className="session-head__title-row">
                  <h1>{activeDataset.name}</h1>
                  <span className="session-head__kind">{activeDataset.kind.toUpperCase()}</span>
                </div>
              </div>
              <div className="session-head__meta">
                <span>
                  <strong>{formatInteger(activeDataset.profile.rowCount)}</strong> 行
                </span>
                <span>
                  <strong>{activeDataset.profile.columnCount}</strong> 列
                </span>
                <span>
                  <strong>{(activeDataset.profile.completeness * 100).toFixed(1)}%</strong> 完整
                </span>
                {activeDataset.sizeBytes && <span>{formatBytes(activeDataset.sizeBytes)}</span>}
                <span className="session-head__time">读于 {timeLabel(activeDataset.createdAt)}</span>
              </div>
            </div>

            <div className="thread" ref={threadRef} aria-live="polite">
              <div className="thread__inner">
                {messages.map((message) => (
                  <div className="message-anchor" data-anchor-id={message.id} key={message.id}>
                    {message.role === 'user' ? (
                      <PromptTurn message={message} />
                    ) : (
                      <ReportView
                        report={message as AgentReport}
                        onSuggestion={(suggestion) => askQuestion(suggestion)}
                      />
                    )}
                  </div>
                ))}
                {thinkingId === activeDataset.id && <Thinking />}
                <div className="thread__end" />
              </div>
            </div>

            <Composer
              draft={draft}
              setDraft={setDraft}
              onSubmit={askQuestion}
              suggestions={suggestions}
              busy={busy}
              disabled={!activeDataset}
              textareaRef={textareaRef}
            />
          </main>
        ) : (
          <>
            <main className="main main--intro">
              <EmptyStage
                onUpload={openFilePicker}
                onLoadSample={() => void handleSample()}
                dragging={dragging}
              />
            </main>
            <ProtocolRail />
          </>
        )}

        {activeDataset && (
          <Inspector
            key={activeDataset.id}
            dataset={activeDataset}
            tab={inspectorTab}
            setTab={setInspectorTab}
            selectedField={selectedField}
            setSelectedField={setSelectedField}
            onAskField={handleAskField}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </div>

      {(samplesOpen || inspectorOpen) && (
        <button
          type="button"
          className="drawer-backdrop"
          onClick={() => {
            setSamplesOpen(false);
            setInspectorOpen(false);
          }}
          aria-label="关闭侧边面板"
        />
      )}

      {dragging && !ingestFile && <DropVeil />}
      {ingestFile && <IngestionOverlay fileName={ingestFile} />}
      {toast && <Toast key={toast.id} message={toast.message} tone={toast.tone} />}
    </div>
  );
}
