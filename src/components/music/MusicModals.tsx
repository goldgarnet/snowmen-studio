import { useState } from 'react';
import type { ChapterRow } from '../../api/chapters';
import type { MusicPlaylist, MusicSample } from '../../api/music';
import { chapterKeyOf, COMMON_KEY } from '../../lib/music';
import { useEscapeKey } from '../../lib/useEscapeKey';

// ---------------------------------------------------------------- 곡 정보 수정 (올리는 두 계정만)

export interface TrackEdit {
  title: string;
  note: string;
  chapter_id: string | null;
}

interface EditTrackModalProps {
  sample: MusicSample;
  chapters: ChapterRow[];
  commonLabel: string;
  onSave: (patch: TrackEdit) => Promise<void>;
  onCancel: () => void;
}

export function EditTrackModal({ sample, chapters, commonLabel, onSave, onCancel }: EditTrackModalProps) {
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
          placeholder="(선택) 쓰는 곳 · 반복 지점 · 출처 등"
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

// ---------------------------------------------------------------- 플레이리스트 이름 (새로 만들기 · 이름 바꾸기)

export const PLAYLIST_NAME_MAX = 60;

interface PlaylistNameModalProps {
  title: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function PlaylistNameModal({ title, initial = '', submitLabel, onSubmit, onCancel }: PlaylistNameModalProps) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(() => { if (!busy) onCancel(); });

  const submit = async () => {
    if (!name.trim()) { setError('이름을 입력하세요.'); return; }
    setBusy(true);
    setError(null);
    try { await onSubmit(name.trim()); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <label className="field-label" htmlFor="music-playlist-name">플레이리스트 이름</label>
        <input
          id="music-playlist-name"
          className="field-input"
          value={name}
          maxLength={PLAYLIST_NAME_MAX}
          autoFocus
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder="예: 작업할 때 듣는 곡"
        />
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? '저장 중…' : submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 플레이리스트에 저장 (곡 하나를 여러 플레이리스트에)

interface SaveToPlaylistModalProps {
  track: MusicSample;
  playlists: MusicPlaylist[];
  /** 이 곡이 들어 있는 내 플레이리스트 id */
  memberOf: ReadonlySet<string>;
  onToggle: (playlist: MusicPlaylist, add: boolean) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}

export function SaveToPlaylistModal({ track, playlists, memberOf, onToggle, onCreate, onClose }: SaveToPlaylistModalProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  // 누른 체크는 저장이 끝나기 전에 바로 바뀌어 보인다. 실패하면 되돌린다.
  const [pending, setPending] = useState<{ id: string; add: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(() => { if (!busyId && !creating) onClose(); });

  const toggle = async (playlist: MusicPlaylist, add: boolean) => {
    setBusyId(playlist.id);
    setPending({ id: playlist.id, add });
    setError(null);
    try { await onToggle(playlist, add); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); setPending(null); }
  };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try { await onCreate(newName.trim()); setNewName(''); }
    catch (e) { setError((e as Error).message); }
    finally { setCreating(false); }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busyId && !creating && onClose()}>
      <div className="modal music-save-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">플레이리스트에 저장</h3>
        <p className="music-save-track">「{track.title.trim() || '제목 없음'}」</p>
        {playlists.length === 0 ? (
          <p className="music-save-empty">아직 만든 플레이리스트가 없어요. 아래에서 새로 만들어 담아 보세요.</p>
        ) : (
          <ul className="music-save-list">
            {playlists.map((p) => {
              const checked = pending?.id === p.id ? pending.add : memberOf.has(p.id);
              return (
                <li key={p.id}>
                  <label className="music-save-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busyId != null}
                      onChange={() => void toggle(p, !checked)}
                    />
                    <span>{p.name || '이름 없음'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="music-save-new">
          <input
            className="field-input"
            value={newName}
            maxLength={PLAYLIST_NAME_MAX}
            disabled={creating}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
            placeholder="새 플레이리스트 이름"
            aria-label="새 플레이리스트 이름"
          />
          <button type="button" className="btn" disabled={!newName.trim() || creating} onClick={() => void create()}>
            {creating ? '만드는 중…' : '만들고 담기'}
          </button>
        </div>
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose} disabled={busyId != null || creating}>완료</button>
        </div>
      </div>
    </div>
  );
}
