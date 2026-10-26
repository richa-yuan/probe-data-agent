import { AlertCircle, ArrowDownToLine, Check } from 'lucide-react';

export function IngestionOverlay({ fileName }: { fileName: string }) {
  return (
    <div className="ingest-scrim" role="status" aria-live="assertive">
      <div className="ingest-panel">
        <div className="ingest-panel__head">
          <span className="mono-label">INTAKE PROCESS / S-001</span>
          <span className="ingest-panel__light">
            <i className="status-dot" />
            READING
          </span>
        </div>

        <div className="ingest-scan" aria-hidden="true">
          <span className="ingest-scan__grid" />
          <span className="ingest-scan__beam" />
          <span className="ingest-scan__center" />
          <span className="ingest-scan__axis ingest-scan__axis--x" />
          <span className="ingest-scan__axis ingest-scan__axis--y" />
          <span className="ingest-scan__corner ingest-scan__corner--tl" />
          <span className="ingest-scan__corner ingest-scan__corner--tr" />
          <span className="ingest-scan__corner ingest-scan__corner--bl" />
          <span className="ingest-scan__corner ingest-scan__corner--br" />
        </div>

        <div className="ingest-panel__copy">
          <span className="mono-label">正在读取样本</span>
          <h2>{fileName}</h2>
          <p>识别表头、推断类型、建立字段剖面。数据只在当前浏览器内处理。</p>
        </div>

        <ol className="ingest-steps">
          <li>
            <span>01</span>
            <span>读取文件</span>
            <i />
          </li>
          <li>
            <span>02</span>
            <span>识别字段类型</span>
            <i />
          </li>
          <li>
            <span>03</span>
            <span>建立数据剖面</span>
            <i />
          </li>
        </ol>
      </div>
    </div>
  );
}

export function DropVeil() {
  return (
    <div className="drop-veil" aria-hidden="true">
      <div className="drop-veil__frame">
        <span className="drop-veil__corner drop-veil__corner--tl" />
        <span className="drop-veil__corner drop-veil__corner--tr" />
        <span className="drop-veil__corner drop-veil__corner--bl" />
        <span className="drop-veil__corner drop-veil__corner--br" />
        <ArrowDownToLine size={34} strokeWidth={1.3} />
        <span className="drop-veil__title">松手，开始取样</span>
        <span className="drop-veil__meta">CSV · TSV · XLSX · JSON</span>
      </div>
    </div>
  );
}

export function Toast({
  message,
  tone,
}: {
  message: string;
  tone: 'default' | 'error' | 'success';
}) {
  return (
    <div className={`toast toast--${tone}`} role="status" aria-live="polite">
      <span className="toast__icon">
        {tone === 'error' ? (
          <AlertCircle size={15} strokeWidth={1.8} />
        ) : (
          <Check size={15} strokeWidth={2.2} />
        )}
      </span>
      <span>{message}</span>
    </div>
  );
}
