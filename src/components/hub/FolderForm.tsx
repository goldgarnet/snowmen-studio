import { useState, useRef } from 'react';

export interface FolderFormPayload {
  name: string;
  author_name: string;
  comment: string | null;
  registered_on: string; // YYYY-MM-DD (등록일)
}

interface FolderFormProps {
  title: string;                          // modal heading
  initial?: Partial<FolderFormPayload>;
  submitLabel?: string;
  onSubmit: (payload: FolderFormPayload) => Promise<void>;
  onCancel: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Folder metadata form for 허브에 올리기 / 폴더 수정. Mirrors the single-map UploadForm
// but with just the fields a folder needs: 이름 · 제작자 · 등록일 · 코멘트(스포일러 가능).
export default function FolderForm({
  title, initial, submitLabel = '허브에 올리기', onSubmit, onCancel,
}: FolderFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [author, setAuthor] = useState(initial?.author_name ?? '');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [registeredOn, setRegisteredOn] = useState(initial?.registered_on || todayStr());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const wrapCommentSpoiler = () => {
    const ta = commentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const inner = comment.slice(start, end) || '스포일러';
    setComment(`${comment.slice(0, start)}||${inner}||${comment.slice(end)}`);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 2 + inner.length); });
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('폴더 이름을 입력하세요.'); return; }
    if (!author.trim()) { setError('제작자를 입력하세요.'); return; }
    if (!registeredOn) { setError('등록일을 입력하세요.'); return; }
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        author_name: author.trim(),
        comment: comment.trim() || null,
        registered_on: registeredOn,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '올리기에 실패했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>

        <div className="upload-grid">
          <div>
            <label className="field-label">폴더 이름 *</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="폴더 이름" disabled={busy} />
          </div>
          <div>
            <label className="field-label">제작자 *</label>
            <input className="field-input" value={author} onChange={(e) => setAuthor(e.target.value)}
              placeholder="폴더를 만든 사람" disabled={busy} />
          </div>
        </div>

        <div className="upload-comment-head" style={{ marginTop: 12 }}>
          <label className="field-label" style={{ margin: 0 }}>코멘트</label>
          <button type="button" className="btn btn-sm" onClick={wrapCommentSpoiler} disabled={busy}
            title="선택한 글자를 ||스포일러||로 감쌉니다">⬛ 스포일러</button>
        </div>
        <textarea ref={commentRef} className="field-textarea" value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="(선택) 폴더 설명이나 의도 · 선택한 글자를 스포일러로 가릴 수 있어요" rows={2} disabled={busy} />

        <div className="upload-grid" style={{ marginTop: 12, alignItems: 'start' }}>
          <div>
            <label className="field-label">등록일</label>
            <input className="field-input" type="date" value={registeredOn}
              onChange={(e) => setRegisteredOn(e.target.value)} disabled={busy} />
          </div>
          <div />
        </div>

        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '올리는 중…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
