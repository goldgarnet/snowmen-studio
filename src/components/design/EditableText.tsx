import { useState, type KeyboardEvent } from 'react';

// 칸을 눌러 바로 고치고, 칸을 벗어나면 저장한다. 고치는 동안에는 다시 읽어 온 값이 글자를 덮지 않는다.
export default function EditableText({
  value, onSave, label, placeholder, className, multiline, rows,
}: {
  value: string;
  onSave: (next: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const common = {
    className,
    value: draft ?? value,
    placeholder,
    'aria-label': label,
    onFocus: () => setDraft(value),
    onBlur: () => {
      if (draft !== null && draft.trim() !== value) onSave(draft.trim());
      setDraft(null);
    },
  };
  if (multiline) {
    return <textarea {...common} rows={rows ?? 3} onChange={(e) => setDraft(e.target.value)} />;
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  return <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />;
}
