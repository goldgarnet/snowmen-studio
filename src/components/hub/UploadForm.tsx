import { useState, useRef } from 'react';
import { decodeLevelCode } from '../../utils/levelCode';
import StarRating from './StarRating';
import MapThumbnail from './MapThumbnail';

export interface UploadPayload {
  author_name: string;
  code: string;
  title: string | null;
  comment: string | null;
  difficulty: number | null;
  registered_on: string; // YYYY-MM-DD (등록일)
}

interface UploadFormProps {
  title: string;                       // modal heading
  initial?: Partial<UploadPayload>;
  lockCode?: boolean;                  // when the code comes from the editor
  submitLabel?: string;
  onSubmit: (payload: UploadPayload) => Promise<void>;
  onCancel: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Shared form for "맵 올리기"(허브) and "허브에 올리기"(제작 탭) and "맵 수정".
export default function UploadForm({
  title, initial, lockCode, submitLabel = '업로드', onSubmit, onCancel,
}: UploadFormProps) {
  const [author, setAuthor] = useState(initial?.author_name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [mapTitle, setMapTitle] = useState(initial?.title ?? '');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [difficulty, setDifficulty] = useState<number | null>(initial?.difficulty ?? null);
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

  const codeValid = code.trim() ? !!decodeLevelCode(code.trim()) : false;

  const submit = async () => {
    setError(null);
    if (!author.trim()) { setError('제작자를 입력하세요.'); return; }
    if (!code.trim()) { setError('맵 코드를 입력하세요.'); return; }
    if (!codeValid) { setError('맵 코드를 해석할 수 없습니다. 코드를 확인하세요.'); return; }
    if (!registeredOn) { setError('등록일을 입력하세요.'); return; }
    setBusy(true);
    try {
      await onSubmit({
        author_name: author.trim(),
        code: code.trim(),
        title: mapTitle.trim() || null,
        comment: comment.trim() || null,
        difficulty,
        registered_on: registeredOn,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>

        {codeValid && (
          <div className="upload-preview"><MapThumbnail code={code.trim()} /></div>
        )}

        <div className="upload-grid">
          <div>
            <label className="field-label">제작자 *</label>
            <input className="field-input" value={author} onChange={(e) => setAuthor(e.target.value)}
              placeholder="맵을 만든 사람" disabled={busy} />
          </div>
          <div>
            <label className="field-label">제목</label>
            <input className="field-input" value={mapTitle} onChange={(e) => setMapTitle(e.target.value)}
              placeholder="(선택) 맵 제목" disabled={busy} />
          </div>
        </div>

        <label className="field-label" style={{ marginTop: 12 }}>맵 코드 *</label>
        <textarea
          className="field-textarea code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="에디터에서 복사한 맵 코드를 붙여넣으세요"
          rows={3}
          disabled={busy || lockCode}
          readOnly={lockCode}
        />

        <div className="upload-comment-head" style={{ marginTop: 12 }}>
          <label className="field-label" style={{ margin: 0 }}>코멘트</label>
          <button type="button" className="btn btn-sm" onClick={wrapCommentSpoiler} disabled={busy}
            title="선택한 글자를 ||스포일러||로 감쌉니다">⬛ 스포일러</button>
        </div>
        <textarea ref={commentRef} className="field-textarea" value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="(선택) 맵 설명이나 의도 · 선택한 글자를 스포일러로 가릴 수 있어요" rows={2} disabled={busy} />

        <div className="upload-grid" style={{ marginTop: 12, alignItems: 'start' }}>
          <div>
            <label className="field-label">출제자 난이도 (선택)</label>
            <div className="upload-difficulty">
              <StarRating value={difficulty} onChange={setDifficulty} size={24} />
              {difficulty != null && (
                <>
                  <span className="difficulty-num">{difficulty.toFixed(1)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDifficulty(null)} disabled={busy}>지우기</button>
                </>
              )}
            </div>
          </div>
          <div>
            <label className="field-label">등록일</label>
            <input className="field-input" type="date" value={registeredOn}
              onChange={(e) => setRegisteredOn(e.target.value)} disabled={busy} />
          </div>
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
