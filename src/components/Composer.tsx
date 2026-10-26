import { useEffect, type RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

interface ComposerProps {
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: (text?: string) => void;
  suggestions: string[];
  busy: boolean;
  disabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({
  draft,
  setDraft,
  onSubmit,
  suggestions,
  busy,
  disabled,
  textareaRef,
}: ComposerProps) {
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(132, Math.max(28, element.scrollHeight))}px`;
  }, [draft, textareaRef]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    onSubmit(draft);
  };

  return (
    <div className="composer">
      <div className="composer__inner">
        <div className="composer__quick">
          <span className="mono-label">TRY / 试问</span>
          <div className="composer__chips">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                className="quick-chip"
                disabled={busy || disabled}
                onClick={() => onSubmit(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <form className="composer__box" onSubmit={handleSubmit}>
          <label htmlFor="ask-input" className="sr-only">
            向数据提问
          </label>
          <textarea
            id="ask-input"
            ref={textareaRef}
            rows={1}
            value={draft}
            disabled={disabled}
            placeholder={disabled ? '先上传一份数据…' : '问这份数据一个问题，比如：哪个月卖得最好？'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (draft.trim() && !busy) onSubmit(draft);
              }
            }}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!draft.trim() || busy || disabled}
            aria-label="发送问题"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </form>

        <div className="composer__foot">
          <span>
            <span className="key">ENTER</span> 发送 <span className="dot-sep">·</span>{' '}
            <span className="key">SHIFT + ENTER</span> 换行
          </span>
          <span>计算在本地完成 · 回答附带计算路径</span>
        </div>
      </div>
    </div>
  );
}
