import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listComments, addComment, deleteComment } from '../../api/comments';
import type { CommentRow } from '../../api/types';
import SpoilerText from './SpoilerText';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CommentList({ mapId }: { mapId: string }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Wrap the selected text (or a placeholder) in ||spoiler|| markers.
  const wrapSpoiler = () => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const inner = selected || '스포일러';
    const next = `${body.slice(0, start)}||${inner}||${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + 2;
      ta.setSelectionRange(pos, pos + inner.length);
    });
  };

  const load = useCallback(async () => {
    try { setComments(await listComments(mapId)); }
    catch (e) { console.error(e); }
  }, [mapId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!profile || !body.trim()) return;
    setBusy(true);
    try {
      await addComment({ map_id: mapId, author_id: profile.id, author_name: profile.name, body: body.trim() });
      setBody('');
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
          <button
            type="button"
            className="btn btn-sm comment-spoiler-btn"
            onClick={wrapSpoiler}
            disabled={busy}
            title="선택한 글자를 ||스포일러||로 감쌉니다"
          >
            ⬛ 스포일러
          </button>
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !body.trim()}>등록</button>
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
              <div className="comment-body"><SpoilerText text={c.body} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
