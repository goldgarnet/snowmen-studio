import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listComments, addComment, updateComment, deleteComment } from '../../api/comments';
import type { CommentRow } from '../../api/types';
import SpoilerText from './SpoilerText';
import StarRating from './StarRating';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Wrap the current textarea selection in ||spoiler|| markers.
function wrapSpoilerIn(ta: HTMLTextAreaElement | null, value: string, setValue: (v: string) => void) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const inner = value.slice(start, end) || '스포일러';
  setValue(`${value.slice(0, start)}||${inner}||${value.slice(end)}`);
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 2 + inner.length); });
}

// 쓰던 새 피드백은 사람·맵별로 이 탭(sessionStorage)에 둔다 — 플레이·풀이 보기·허브에 다녀오거나
// 새로고침해도 남는다. 등록에 성공하거나 입력칸을 비우면 지운다. 키에 사용자 id 를 넣어, 같은 탭에서
// 다른 계정으로 다시 로그인하면 앞 사람의 초안이 채워지지 않게 한다.
const commentDraftKey = (userId: string, mapId: string) => `snowmen-studio:comment-draft:${userId}:${mapId}`;

function readCommentDraft(userId: string, mapId: string): string {
  try { return sessionStorage.getItem(commentDraftKey(userId, mapId)) ?? ''; }
  catch { return ''; }
}

function writeCommentDraft(userId: string, mapId: string, body: string): void {
  try {
    if (body) sessionStorage.setItem(commentDraftKey(userId, mapId), body);
    else sessionStorage.removeItem(commentDraftKey(userId, mapId));
  } catch {
    // 초안 보관은 편의 기능 — 저장소가 막혀도 댓글 작성은 된다.
  }
}

export default function CommentList({ mapId }: { mapId: string }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  // 첫 응답 전에는 '아직 피드백이 없습니다' 대신 '불러오는 중…' (0개처럼 보이지 않게)
  const [loaded, setLoaded] = useState(false);
  const draftUser = profile?.id ?? 'anon';
  const [body, setBody] = useState(() => readCommentDraft(draftUser, mapId));
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedDiff, setSuggestedDiff] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Inline edit state (one comment at a time).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSuggesting, setEditSuggesting] = useState(false);
  const [editDiff, setEditDiff] = useState<number | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const editTaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSpoiler = () => wrapSpoilerIn(taRef.current, body, setBody);

  const load = useCallback(async () => {
    try { setComments(await listComments(mapId)); }
    catch (e) { console.error(e); }
    finally { setLoaded(true); }
  }, [mapId]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  useEffect(() => { writeCommentDraft(draftUser, mapId, body); }, [draftUser, mapId, body]);

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

  const startEdit = (c: CommentRow) => {
    setEditingId(c.id);
    setEditBody(c.body ?? '');
    setEditSuggesting(c.suggested_difficulty != null);
    setEditDiff(c.suggested_difficulty);
  };
  const cancelEdit = () => { setEditingId(null); setEditBusy(false); };

  const canSaveEdit = editBody.trim().length > 0 || (editSuggesting && editDiff != null);

  const saveEdit = async () => {
    if (!editingId || !canSaveEdit) return;
    setEditBusy(true);
    try {
      await updateComment(editingId, {
        body: editBody.trim(),
        suggested_difficulty: editSuggesting ? editDiff : null,
      });
      cancelEdit();
      load();
    } catch (e) { alert('수정 실패: ' + (e as Error).message); setEditBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('댓글을 삭제할까요?')) return;
    try { await deleteComment(id); if (editingId === id) cancelEdit(); load(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); }
  };

  return (
    <div className="comments">
      <h4 className="comments-title">피드백{loaded ? ` (${comments.length})` : ''}</h4>

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

      {!loaded ? (
        <div className="comments-empty">불러오는 중…</div>
      ) : comments.length === 0 ? (
        <div className="comments-empty">아직 피드백이 없습니다.</div>
      ) : (
        <ul className="comment-items">
          {comments.map((c) => {
            const mine = profile?.id === c.author_id;
            const editing = editingId === c.id;
            return (
              <li className="comment-item" key={c.id}>
                <div className="comment-head">
                  <span className="comment-author">{c.author_name}</span>
                  <span className="comment-when">{formatWhen(c.created_at)}</span>
                  {mine && !editing && (
                    <span className="comment-actions">
                      <button className="comment-edit" onClick={() => startEdit(c)}>수정</button>
                      <button className="comment-del" onClick={() => remove(c.id)} aria-label="삭제">✕</button>
                    </span>
                  )}
                </div>

                {editing ? (
                  <div className="comment-input-wrap comment-edit-wrap">
                    <textarea
                      ref={editTaRef}
                      className="field-textarea"
                      rows={2}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      placeholder="피드백을 남겨주세요…"
                      disabled={editBusy}
                    />
                    <div className="comment-compose-tools">
                      <button type="button" className="btn btn-sm" disabled={editBusy}
                        onClick={() => wrapSpoilerIn(editTaRef.current, editBody, setEditBody)}
                        title="선택한 글자를 ||스포일러||로 감쌉니다">⬛ 스포일러</button>
                      <label className="comment-suggest-toggle">
                        <input type="checkbox" checked={editSuggesting}
                          onChange={(e) => setEditSuggesting(e.target.checked)} disabled={editBusy} />
                        난이도 제안
                      </label>
                    </div>
                    {editSuggesting && (
                      <div className="comment-suggest-row">
                        <StarRating value={editDiff} onChange={setEditDiff} size={22} />
                        <span className="difficulty-num">{editDiff != null ? editDiff.toFixed(1) : '—'}</span>
                        {editDiff != null && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditDiff(null)} disabled={editBusy}>지우기</button>
                        )}
                      </div>
                    )}
                    <div className="comment-edit-actions">
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={editBusy}>취소</button>
                      <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editBusy || !canSaveEdit}>저장</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {c.suggested_difficulty != null && (
                      <div className="comment-suggest-badge">
                        난이도 제안 <StarRating value={c.suggested_difficulty} size={13} />
                        <span className="difficulty-num" style={{ fontSize: 12 }}>{c.suggested_difficulty.toFixed(1)}</span>
                      </div>
                    )}
                    {c.body && <div className="comment-body"><SpoilerText text={c.body} /></div>}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
