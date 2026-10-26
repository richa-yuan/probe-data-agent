import { ArrowUpRight, Database, LockKeyhole, Plus, X } from 'lucide-react';
import type { Dataset } from '../types';
import { formatInteger } from '../lib/format';

interface SidebarProps {
  datasets: Dataset[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onUpload: () => void;
  onLoadSample: () => void;
  onClose: () => void;
}

export function Sidebar({
  datasets,
  activeId,
  onActivate,
  onUpload,
  onLoadSample,
  onClose,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="panel-heading sidebar__head">
        <div>
          <span className="panel-kicker">SAMPLE RACK / {String(datasets.length).padStart(2, '0')}</span>
          <h2 className="panel-title">样本架</h2>
        </div>
        <button
          type="button"
          className="icon-button drawer-close"
          onClick={onClose}
          aria-label="关闭样本架"
        >
          <X size={17} />
        </button>
      </div>

      <button type="button" className="btn btn--outline btn--wide" onClick={onUpload}>
        <Plus size={15} strokeWidth={2} />
        导入新样本
      </button>

      {datasets.length ? (
        <div className="dataset-list">
          <div className="list-label">
            <span>已装载</span>
            <span>{String(datasets.length).padStart(2, '0')}</span>
          </div>
          {datasets.map((dataset, index) => {
            const active = dataset.id === activeId;
            return (
              <button
                key={dataset.id}
                type="button"
                className={`dataset-item${active ? ' is-active' : ''}`}
                onClick={() => onActivate(dataset.id)}
              >
                <span className="dataset-item__index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="dataset-item__body">
                  <span className="dataset-item__name">{dataset.name}</span>
                  <span className="dataset-item__meta">
                    {formatInteger(dataset.profile.rowCount)} 行 ×{' '}
                    {dataset.profile.columnCount} 列 · {dataset.kind.toUpperCase()}
                  </span>
                </span>
                <ArrowUpRight
                  className="dataset-item__arrow"
                  size={14}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-rack">
          <div className="empty-rack__visual" aria-hidden="true">
            <Database size={22} strokeWidth={1.3} />
            <span />
            <span />
          </div>
          <p className="empty-rack__title">样本架是空的</p>
          <p className="empty-rack__copy">上传后会出现在这里，可随时切换比对。</p>
        </div>
      )}

      {!datasets.length && (
        <div className="sample-ticket">
          <div className="sample-ticket__top">
            <span className="mono-label">TEST SAMPLE / 01</span>
            <span className="sample-ticket__badge">READY</span>
          </div>
          <div className="sample-ticket__art" aria-hidden="true">
            {[28, 45, 34, 62, 50, 76, 64, 88, 70, 94, 82, 100].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <p className="sample-ticket__name">线上零售 · 2026 H1</p>
          <p className="sample-ticket__meta">480 行 × 10 列 · 含缺失与离群点</p>
          <button type="button" className="sample-ticket__action" onClick={onLoadSample}>
            载入样片
            <ArrowUpRight size={14} strokeWidth={1.7} />
          </button>
        </div>
      )}

      <div className="sidebar__foot">
        <div className="local-stamp" aria-label="本地处理">
          <span>LOCAL</span>
          <span>ONLY</span>
        </div>
        <div className="sidebar__foot-copy">
          <span>
            <LockKeyhole size={12} strokeWidth={1.7} /> 数据不离开这台设备
          </span>
          <small>CSV · TSV · XLSX · JSON / 20 MB</small>
        </div>
      </div>
    </aside>
  );
}
