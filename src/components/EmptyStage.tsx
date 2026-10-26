import { ArrowRight, ArrowUpRight, LockKeyhole } from 'lucide-react';

interface EmptyStageProps {
  onUpload: () => void;
  onLoadSample: () => void;
  dragging: boolean;
}

export function EmptyStage({ onUpload, onLoadSample, dragging }: EmptyStageProps) {
  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro__topline">
        <span>EVIDENCE-FIRST ANALYSIS / 本地研判</span>
        <span>SESSION 000</span>
      </div>

      <div className="intro__heading">
        <span className="eyebrow">DATA INTAKE · 取样台</span>
        <h1 id="intro-title">
          不猜。
          <br />
          读完表<span className="accent-dot">。</span>
        </h1>
        <p>
          上传 CSV、Excel 或 JSON，PROBE 会在本机完成字段体检、趋势、对比与异常分析。
          每个回答都带计算路径。
        </p>
      </div>

      <button
        type="button"
        className={`intake-stage${dragging ? ' is-dragging' : ''}`}
        onClick={onUpload}
        aria-label="选择或拖入数据文件"
      >
        <span className="stage-tag">SAMPLE STAGE / 样本入口</span>
        <span className="stage-state">
          <i className="status-dot" />
          WAITING FOR SIGNAL
        </span>

        <span className="stage-grid" aria-hidden="true" />
        <span className="stage-corner stage-corner--tl" aria-hidden="true" />
        <span className="stage-corner stage-corner--tr" aria-hidden="true" />
        <span className="stage-corner stage-corner--bl" aria-hidden="true" />
        <span className="stage-corner stage-corner--br" aria-hidden="true" />

        <span className="stage-main">
          <span className="stage-copy">
            <span className="stage-kicker">DROP YOUR DATA HERE</span>
            <span className="stage-title">把表格放上探针台</span>
            <span className="stage-desc">
              拖入文件，或点击选择
              <span className="stage-types"> CSV · TSV · XLSX · JSON / ≤ 20 MB</span>
            </span>
            <span className="stage-action">
              选择文件
              <ArrowUpRight size={15} strokeWidth={1.8} />
            </span>
          </span>

          <span className="probe-target" aria-hidden="true">
            <span className="probe-target__ring probe-target__ring--outer" />
            <span className="probe-target__ring probe-target__ring--inner" />
            <span className="probe-target__axis probe-target__axis--x" />
            <span className="probe-target__axis probe-target__axis--y" />
            <span className="probe-target__core">+</span>
            <span className="probe-target__readout">34° 12′ / S-001</span>
          </span>
        </span>

        <span className="stage-ruler" aria-hidden="true">
          {['READ', 'TYPE', 'PROFILE', 'ASK'].map((label, index) => (
            <span key={label} className="stage-ruler__item">
              <span className="stage-ruler__tick">{String(index + 1).padStart(2, '0')}</span>
              <span>{label}</span>
            </span>
          ))}
        </span>

        <span className="scan-line" aria-hidden="true" />
      </button>

      <div className="intro__footer">
        <button type="button" className="sample-link" onClick={onLoadSample}>
          <span className="sample-link__tag">TEST 01</span>
          <span>没有数据？载入线上零售样片</span>
          <span className="sample-link__meta">480 行 × 10 列</span>
          <ArrowRight size={15} strokeWidth={1.7} />
        </button>
        <span className="privacy-note">
          <LockKeyhole size={12} strokeWidth={1.7} />
          文件只在这台设备的浏览器内解析
        </span>
      </div>
    </section>
  );
}
