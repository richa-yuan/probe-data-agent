const STEPS = [
  {
    number: '01',
    title: '取样',
    body: '拖入 CSV、TSV、Excel 或 JSON。文件只在本机浏览器内读取。',
  },
  {
    number: '02',
    title: '读表',
    body: '自动识别数值、日期和分类字段，先做一次完整性扫描。',
  },
  {
    number: '03',
    title: '提问',
    body: '用中文问趋势、排名、相关或异常，系统会自己选字段和方法。',
  },
  {
    number: '04',
    title: '求证',
    body: '每份结论都附带计算路径，不靠模糊印象下判断。',
  },
];

const EXAMPLES = [
  '销售额每个月的走势如何？',
  '哪个城市贡献最高？',
  '销售额和利润相关吗？',
  '有哪些异常记录？',
];

export function ProtocolRail() {
  return (
    <aside className="inspector protocol-rail">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">PROTOCOL / 001</span>
          <h2 className="panel-title">分析协议</h2>
        </div>
        <span className="protocol-rail__seal" aria-hidden="true">
          探
        </span>
      </div>

      <ol className="protocol-steps">
        {STEPS.map((step) => (
          <li className="protocol-step" key={step.number}>
            <span className="protocol-step__number">{step.number}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="protocol-rule" />

      <div className="protocol-examples">
        <span className="list-label">
          <span>可以这样问</span>
          <span>EXAMPLES</span>
        </span>
        {EXAMPLES.map((example, index) => (
          <div className="protocol-example" key={example}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{example}</p>
          </div>
        ))}
      </div>

      <div className="engine-status">
        <span className="engine-status__top">
          <i className="status-dot" />
          ENGINE READY
        </span>
        <p>等待样本 · 计算在本地完成</p>
        <div className="engine-status__meter" aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <span key={index} className={index % 5 === 0 ? 'hot' : ''} />
          ))}
        </div>
      </div>
    </aside>
  );
}
