import { useState } from 'react';
import type { ChapterRow } from '../../api/chapters';
import type { MusicSample } from '../../api/music';
import { chapterKeyOf, COMMON_KEY } from '../../lib/music';
import { useEscapeKey } from '../../lib/useEscapeKey';

// ---------------------------------------------------------------- 곡 정보 수정 (올린 사람만)

export interface SampleEdit {
  title: string;
  note: string;
  chapter_id: string | null;
}

interface EditSampleModalProps {
  sample: MusicSample;
  chapters: ChapterRow[];
  commonLabel: string;
  onSave: (patch: SampleEdit) => Promise<void>;
  onCancel: () => void;
}

export function EditSampleModal({ sample, chapters, commonLabel, onSave, onCancel }: EditSampleModalProps) {
  const [title, setTitle] = useState(sample.title);
  const [note, setNote] = useState(sample.note);
  const [chapterKey, setChapterKey] = useState(chapterKeyOf(sample));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(() => { if (!busy) onCancel(); });

  const submit = async () => {
    if (!title.trim()) { setError('제목을 입력하세요.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), note: note.trim(), chapter_id: chapterKey === COMMON_KEY ? null : chapterKey });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  // 지금 칸이 목록에 없으면(챕터를 못 불러온 경우) 그 칸도 고를 수 있게 남긴다.
  const known = chapterKey === COMMON_KEY || chapters.some((c) => c.id === chapterKey);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">곡 정보 수정</h3>
        <label className="field-label" htmlFor="music-edit-title">제목 *</label>
        <input
          id="music-edit-title"
          className="field-input"
          value={title}
          maxLength={120}
          autoFocus
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder="예: 설원 아침 v2"
        />
        <label className="field-label" htmlFor="music-edit-note" style={{ marginTop: 12 }}>메모</label>
        <textarea
          id="music-edit-note"
          className="field-textarea"
          rows={3}
          maxLength={1000}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="(선택) 출처 · 쓰고 싶은 곳 · 반복 지점 등"
        />
        <label className="field-label" htmlFor="music-edit-chapter" style={{ marginTop: 12 }}>챕터</label>
        <select
          id="music-edit-chapter"
          className="field-select"
          value={chapterKey}
          disabled={busy}
          onChange={(e) => setChapterKey(e.target.value)}
        >
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>챕터 {c.number} · {c.name || '이름 없음'}</option>
          ))}
          <option value={COMMON_KEY}>{commonLabel}</option>
          {!known && <option value={chapterKey}>지금 챕터 (목록에 없음)</option>}
        </select>
        <p className="music-modal-file">원래 파일: {sample.file_name || '알 수 없음'}</p>
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 이미 채택한 곡이 있을 때

interface AdoptModalProps {
  sample: MusicSample;
  others: MusicSample[];   // 같은 칸에서 이미 채택한 곡
  placeLabel: string;      // 칸 이름 (챕터 2 · 바위 지형 / 공통)
  busy?: boolean;
  onBoth: () => void;
  onSwap: () => void;
  onCancel: () => void;
}

const quoted = (s: Pick<MusicSample, 'title'>) => `「${s.title.trim() || '제목 없음'}」`;

export function AdoptModal({ sample, others, placeLabel, busy, onBoth, onSwap, onCancel }: AdoptModalProps) {
  useEscapeKey(() => { if (!busy) onCancel(); });
  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal unsaved-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">이미 채택한 곡이 있어요</h3>
        <p className="unsaved-text">
          {placeLabel}에서 {others.map(quoted).join(', ')}을(를) 이미 채택했어요.
          <br />
          {quoted(sample)}을(를) 함께 채택할까요, 아니면 이 곡으로 바꿀까요?
          <br />
          <span className="music-modal-note">바꾸면 지금 채택한 곡은 보류로 옮겨요.</span>
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="btn" onClick={onBoth} disabled={busy}>함께 채택</button>
          <button type="button" className="btn btn-primary" onClick={onSwap} disabled={busy}>이 곡으로 바꾸기</button>
        </div>
      </div>
    </div>
  );
}
