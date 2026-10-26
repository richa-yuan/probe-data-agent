import { Download, PanelLeft, PanelRight, Plus } from 'lucide-react';
import type { Dataset } from '../types';

function ProbeMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="13.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="17" cy="17" r="7.2" fill="none" stroke="var(--cobalt)" strokeWidth="1.4" />
      <path d="M17 1v8M17 25v8M1 17h8M25 17h8" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="17" cy="17" r="2.2" fill="var(--signal)" />
    </svg>
  );
}

interface TopBarProps {
  dataset?: Dataset;
  hasData: boolean;
  onUpload: () => void;
  onExport: () => void;
  onOpenSamples: () => void;
  onOpenInspector: () => void;
}

export function TopBar({
  dataset,
  hasData,
  onUpload,
  onExport,
  onOpenSamples,
  onOpenInspector,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button panel-toggle panel-toggle--samples"
        onClick={onOpenSamples}
        aria-label="打开样本架"
      >
        <PanelLeft size={18} strokeWidth={1.7} />
      </button>

      <div className="brand">
        <ProbeMark />
        <div className="brand__type">
          <span className="brand__name">PROBE</span>
          <span className="brand__cn">探针 / 数据研判台</span>
        </div>
      </div>

      <div className="topbar__crumb">
        <span className="mono-label">WORKSPACE</span>
        <span className="topbar__slash">/</span>
        <span>{dataset ? dataset.name : '新样本'}</span>
      </div>

      <div className="topbar__actions">
        <span className="local-status">
          <i className="status-dot" />
          <span>本地计算</span>
        </span>

        <button
          type="button"
          className="btn btn--quiet topbar__export"
          onClick={onExport}
          disabled={!hasData}
        >
          <Download size={15} strokeWidth={1.7} />
          <span>导出记录</span>
        </button>

        <button type="button" className="btn btn--primary topbar__upload" onClick={onUpload}>
          <Plus size={16} strokeWidth={2} />
          <span>上传数据</span>
        </button>

        {hasData && (
          <button
            type="button"
            className="icon-button panel-toggle panel-toggle--inspector"
            onClick={onOpenInspector}
            aria-label="打开数据剖面"
          >
            <PanelRight size={18} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </header>
  );
}
