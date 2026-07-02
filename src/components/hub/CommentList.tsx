import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listComments, addComment, deleteComment } from '../../api/comments';
import type { CommentRow } from '../../api/types';
import SpoilerText from './SpoilerText';
import StarRating from './StarRating';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CommentList({ mapId }: { mapId: string }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedDiff, setSuggestedDiff] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const wrapSpoiler = () => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const inner = body.slice(start, end) || '스포일러';
    setBody(`${body.slice(0, start)}||${inner}||${body.slice(end)}`);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 2 + inner.length); });
  };

  const load = useCallback(async () => {
    try { setComments(await listComments(mapId)); }
    catch (e) { console.error(e); }
  }, [mapId]);

  useEffect(() => { load(); }, [load]);

  const canSubmit = body.trim().length > 0 || (suggesting && suggestedDiff != null);

  const submit = async () => {
    if (!profile || !canSubmit) return;
    setBusy(true);
    try {
      await addComment({
        map_id: mapId,
        author_id: profile.id,
        author_name: profile.name,
        body: body.trim(),
        suggested_difficulty: suggesting ? suggestedDiff : null,
      });
      setBody('');
      setSuggesting(false);
      setSuggestedDiff(null);
      load();
    } catch (e) { alert('댓글 작성 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('댓글을 삭제할까요?')) return;
    try { await deleteComment(id); load(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); }
  };

  return (
    <div className="comments">
      <h4 className="comments-title">피드백 ({comments.length})</h4>

      <div className="comment-compose">
        <div className="comment-input-wrap">
          <textarea
            ref={taRef}
            className="field-textarea"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="피드백을 남겨주세요…  (선택한 글자를 스포일러로 가릴 수 있어요)"
            disabled={busy}
          />
          <div className="comment-compose-tools">
            <button type="button" className="btn btn-sm comment-spoiler-btn" onClick={wrapSpoiler}
              disabled={busy} title="선택한 글자를 ||스포일러||로 감쌉니다">⬛ 스포일러</button>
            <label className="comment-suggest-toggle">
              <input type="checkbox" checked={suggesting}
                onChange={(e) => setSuggesting(e.target.checked)} disabled={busy} />
              난이도 제안
            </label>
          </div>
          {suggesting && (
            <div className="comment-suggest-row">
              <StarRating value={suggestedDiff} onChange={setSuggestedDiff} size={22} />
              <span className="difficulty-num">{suggestedDiff != null ? suggestedDiff.toFixed(1) : '—'}</span>
              {suggestedDiff != null && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSuggestedDiff(null)} disabled={busy}>지우기</button>
              )}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !canSubmit}>등록</button>
      </div>

      {comments.length === 0 ? (
        <div className="comments-empty">아직 피드백이 없습니다.</div>
      ) : (
        <ul className="comment-items">
          {comments.map((c) => (
            <li className="comment-item" key={c.id}>
              <div className="comment-head">
                <span className="comment-author">{c.author_name}</span>
                <span className="comment-when">{formatWhen(c.created_at)}</span>
                {profile?.id === c.author_id && (
                  <button className="comment-del" onClick={() => remove(c.id)} aria-label="삭제">✕</button>
                )}
              </div>
              {c.suggested_difficulty != null && (
                <div className="comment-suggest-badge">
                  난이도 제안 <StarRating value={c.suggested_difficulty} size={13} />
                  <span className="difficulty-num" style={{ fontSize: 12 }}>{c.suggested_difficulty.toFixed(1)}</span>
                </div>
              )}
              {c.body && <div className="comment-body"><SpoilerText text={c.body} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
