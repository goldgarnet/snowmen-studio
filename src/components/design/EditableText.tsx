import { useState, type KeyboardEvent, type ReactNode } from 'react';

// 칸을 눌러 바로 고치고, 칸을 벗어나면 저장한다. 고치는 동안에는 다시 읽어 온 값이 글자를 덮지 않는다.
export default function EditableText({
  value, onSave, label, placeholder, className, autoFocus,
}: {
  value: string;
  onSave: (next: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  return (
    <input
      className={className}
      value={draft ?? value}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setDraft(value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== value) onSave(draft.trim());
        setDraft(null);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

/** 평소에는 읽기 좋게 보여 주고, 수정 버튼을 누르면 글상자로 바뀌는 칸. */
export function EditableBlock({ value, onSave, label, placeholder, rows, children }: {
  value: string;
  onSave: (next: string) => void;
  label: string;
  placeholder: string;
  rows?: number;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return (
      <textarea
        className="field-textarea"
        aria-label={label}
        autoFocus
        rows={rows ?? 4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value) onSave(draft.trim());
          setDraft(null);
        }}
      />
    );
  }
  return (
    <div className="dw-block">
      {value ? children : <p className="dw-faint">{placeholder}</p>}
      <button type="button" className="dw-block-edit" aria-label={`${label} 수정`} onClick={() => setDraft(value)}>수정</button>
    </div>
  );
}
