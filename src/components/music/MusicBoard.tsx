import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { listChapters, type ChapterRow } from '../../api/chapters';
import {
  addToPlaylist, createPlaylist, deleteMusicSample, deletePlaylist, isMusicNotInstalled, loadMusic, musicDownloadUrl,
  removeFromPlaylist, renamePlaylist, reorderPlaylist, updateMusicSample, uploadMusicSample,
  type MusicData, type MusicPlaylist, type MusicPlaylistItem, type MusicSample,
} from '../../api/music';
import {
  byUploadOrder, chapterKeyOf, COMMON_KEY, fileProblem, formatBytes, formatTotal, libraryOrder,
  MAX_MUSIC_BYTES, moveInList, musicUrl, parseMusicView, titleFromFileName, type MusicView,
} from '../../lib/music';
import { isMusicUploader } from '../../lib/members';
import * as nav from '../../lib/nav';
import { chapterUrl } from '../../lib/hubState';
import { useMusic } from '../../context/MusicContext';
import ConfirmModal from '../common/ConfirmModal';
import MusicTrackList, { type TrackRow } from './MusicTrackList';
import { EditTrackModal, PlaylistNameModal, SaveToPlaylistModal, type TrackEdit } from './MusicModals';
import { analyzeAudio } from './analyze';
import { usePlayerState, type MusicTrack } from './player';
import { prefetchMusicUrls } from './urls';
import { PlayIcon, ShuffleIcon } from './icons';
import './music.css';

// 음악 탭 — 김정훈 · 황정빈이 올린 곡을 누구나 듣고, 각자 플레이리스트를 만든다.
//   '/music'               모든 곡 (챕터 순서대로)
//   '/music?ch=<챕터 id>'   그 챕터의 곡, '/music?ch=common' 공통(타이틀 · 엔딩 등)
//   '/music?pl=<id>'       내 플레이리스트
// 재생은 사이트 전체의 재생기(MusicProvider)가 맡는다 — 이 탭을 떠나도 우측 하단 플레이어로 이어서 들린다.

const COMMON_TITLE = '공통';
const COMMON_HINT = '타이틀 · 메뉴 · 엔딩처럼 챕터 밖에서 쓰는 곡을 모아 둬요.';
const UPLOAD_TARGET_KEY = 'snowmen-studio:music:upload-target';
/** 듣기 주소를 미리 새로 받는 간격 — 오래 열어 둔 화면에서도 누르면 바로 재생되게. */
const URL_REFRESH_MS = 20 * 60 * 1000;

const chapterTitle = (ch: ChapterRow) => `챕터 ${ch.number} · ${ch.name || '이름 없음'}`;
const errorText = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e);
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
const quoted = (s: Pick<MusicSample, 'title'>) => `「${s.title.trim() || '제목 없음'}」`;

function uploadError(e: unknown): string {
  if (isMusicNotInstalled(e)) return 'DB 구조가 아직 없어요. SQL을 먼저 실행해 주세요.';
  const err = e as { message?: string; statusCode?: string | number } | null;
  const message = err?.message ?? String(e);
  if (/bucket not found/i.test(message)) return '음악 저장소가 아직 없어요. SQL을 먼저 실행해 주세요.';
  if (/row-level security|unauthorized|not allowed|403/i.test(message) || String(err?.statusCode) === '403') {
    return '음악은 김정훈 · 황정빈 계정만 올릴 수 있어요.';
  }
  if (/maximum allowed size|too large|exceeded/i.test(message) || String(err?.statusCode) === '413') {
    return `${formatBytes(MAX_MUSIC_BYTES)}가 넘는 파일은 올릴 수 없어요.`;
  }
  if (/mime type|not supported/i.test(message)) return '음악 파일만 올릴 수 있어요.';
  return `올리지 못했어요: ${message}`;
}

function readUploadTarget(): string {
  try { return localStorage.getItem(UPLOAD_TARGET_KEY) || COMMON_KEY; }
  catch { return COMMON_KEY; }
}

interface UploadItem {
  key: string;
  name: string;
  chapterKey: string;
  state: 'waiting' | 'reading' | 'uploading' | 'done' | 'error';
  message: string | null;
}

const UPLOAD_STATE_TEXT: Record<UploadItem['state'], string> = {
  waiting: '기다리는 중',
  reading: '파형 읽는 중…',
  uploading: '올리는 중…',
  done: '올렸어요',
  error: '',
};

type Sorted = { sort_order: number; created_at: string; id: string };
const byListOrder = (a: Sorted, b: Sorted) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

interface MusicBoardProps {
  userId: string;
  userName: string;
}

export default function MusicBoard({ userId, userName }: MusicBoardProps) {
  const location = nav.useLocation();
  const view = useMemo(() => parseMusicView(location), [location]);
  const viewKey = musicUrl(view);
  const canUpload = isMusicUploader(userId);
  const { player, pendingLocate, clearLocate } = useMusic();
  const playerState = usePlayerState(player);

  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chaptersFailed, setChaptersFailed] = useState(false);
  const [data, setData] = useState<MusicData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notInstalled, setNotInstalled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadTarget, setUploadTarget] = useState(readUploadTarget);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<MusicSample | null>(null);
  const [deleting, setDeleting] = useState<MusicSample | null>(null);
  const [saving, setSaving] = useState<MusicSample | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: 'create' } | { mode: 'rename'; playlist: MusicPlaylist } | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState<MusicPlaylist | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showFlash = useCallback((message: string) => {
    setFlash(message);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // ---- 불러오기 ----
  const load = useCallback(async () => {
    try {
      setChapters(await listChapters());
      setChaptersFailed(false);
    } catch (e) {
      console.error(e);
      setChaptersFailed(true);
    }
    try {
      const music = await loadMusic();
      setData(music);
      setNotInstalled(false);
      setLoadError(null);
    } catch (e) {
      if (isMusicNotInstalled(e)) setNotInstalled(true);
      else { console.error(e); setLoadError(errorText(e)); }
    }
    setLoaded(true);
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  // ---- 파생 값 ----
  const samples = useMemo(() => data?.samples ?? [], [data]);
  const playlists = useMemo(() => [...(data?.playlists ?? [])].sort(byListOrder), [data]);
  const items = useMemo(() => data?.items ?? [], [data]);
  const sampleById = useMemo(() => new Map(samples.map((s) => [s.id, s])), [samples]);
  const chapterById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const chapterRank = useMemo(() => new Map(chapters.map((c, i) => [c.id, i])), [chapters]);
  const labelOf = useCallback((key: string) => {
    if (key === COMMON_KEY) return COMMON_TITLE;
    const ch = chapterById.get(key);
    return ch ? chapterTitle(ch) : '챕터 (목록에 없음)';
  }, [chapterById]);

  // 재생기가 쓰는 곡 정보. 바뀌거나 지워지면 대기열도 맞춘다(다른 탭에서 듣는 중이어도).
  const tracks = useMemo(() => new Map(samples.map((s): [string, MusicTrack] => {
    const key = chapterKeyOf(s);
    return [s.id, {
      id: s.id,
      path: s.path,
      title: s.title.trim() || '제목 없음',
      artist: s.uploader_name || '익명',
      album: labelOf(key),
      chapterKey: key,
      duration: s.duration_sec,
      peaks: s.peaks,
    }];
  })), [samples, labelOf]);
  useEffect(() => { if (data) player.syncTracks(tracks); }, [data, player, tracks]);

  // 듣기 주소를 미리 받아 두고, 오래 열어 둔 화면에서도 낡기 전에 새로 받는다.
  useEffect(() => {
    const paths = samples.map((s) => s.path);
    void prefetchMusicUrls(paths);
    const timer = setInterval(() => { void prefetchMusicUrls(paths); }, URL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [samples]);

  const countByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of samples) map.set(chapterKeyOf(s), (map.get(chapterKeyOf(s)) ?? 0) + 1);
    return map;
  }, [samples]);
  // 왼쪽 목록: 챕터들 → 공통. 목록에 없는 챕터에 곡이 있으면(챕터를 못 불러옴) 맨 뒤에 붙인다.
  const keys = useMemo(() => {
    const list = [...chapters.map((c) => c.id), COMMON_KEY];
    for (const key of countByKey.keys()) if (!list.includes(key)) list.push(key);
    return list;
  }, [chapters, countByKey]);
  const itemsByPlaylist = useMemo(() => {
    const map = new Map<string, MusicPlaylistItem[]>();
    for (const it of [...items].sort(byListOrder)) {
      const list = map.get(it.playlist_id);
      if (list) list.push(it); else map.set(it.playlist_id, [it]);
    }
    return map;
  }, [items]);

  const viewPlaylist = view.kind === 'playlist' ? playlists.find((p) => p.id === view.id) ?? null : null;
  const viewKnown = view.kind === 'all'
    || (view.kind === 'chapter' && (view.key === COMMON_KEY || chapterById.has(view.key) || countByKey.has(view.key)))
    || (view.kind === 'playlist' && !!viewPlaylist);

  const { title, source, rows } = useMemo(() => {
    const row = (sample: MusicSample, itemId?: string): TrackRow | null => {
      const track = tracks.get(sample.id);
      return track ? { sample, track, itemId } : null;
    };
    const keep = (r: TrackRow | null): r is TrackRow => r != null;
    if (view.kind === 'chapter') {
      const label = labelOf(view.key);
      const list = samples.filter((s) => chapterKeyOf(s) === view.key).sort(byUploadOrder);
      return { title: label, source: label, rows: list.map((s) => row(s)).filter(keep) };
    }
    if (view.kind === 'playlist') {
      const name = viewPlaylist?.name || '이름 없는 플레이리스트';
      const list = (itemsByPlaylist.get(view.id) ?? [])
        .map((it) => { const s = sampleById.get(it.sample_id); return s ? row(s, it.id) : null; })
        .filter(keep);
      return { title: name, source: name, rows: list };
    }
    return { title: '모든 곡', source: '모든 곡', rows: libraryOrder(samples, chapterRank).map((s) => row(s)).filter(keep) };
  }, [view, samples, tracks, labelOf, viewPlaylist, itemsByPlaylist, sampleById, chapterRank]);

  const shownTracks = rows.map((r) => r.track);
  const totalBytes = samples.reduce((sum, s) => sum + (s.size_bytes ?? 0), 0);

  // ---- 주소 ----
  // 지워진 챕터 · 플레이리스트를 가리키는 주소는 모든 곡으로 바꾼다. 불러오는 동안 · 실패한 동안은 그대로.
  useEffect(() => {
    if (!location.startsWith('/music')) return;
    if (loaded && data && !chaptersFailed && !viewKnown) { nav.go(musicUrl({ kind: 'all' }), { replace: true }); return; }
    nav.rememberListUrl('music', viewKey);
  }, [location, loaded, data, chaptersFailed, viewKnown, viewKey]);

  nav.useScrollRestore(loaded);

  const goView = (next: MusicView) => nav.go(musicUrl(next), { replace: true });
  const openStages = (e: MouseEvent<HTMLAnchorElement>, chapterId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    nav.go(chapterUrl(chapterId));
  };

  // 우측 하단 플레이어의 곡 이름 → 그 곡 줄을 보여 주고 잠깐 빛낸다.
  useEffect(() => {
    if (!pendingLocate || !loaded) return;
    const el = document.getElementById(`track-${pendingLocate}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
    clearLocate();
  });

  // 스페이스 = 재생 / 멈춤, ← → = 5초. 글을 쓰는 중이거나 단추 · 창 위에서는 그 요소가 먼저다.
  // (이 탭에서만. 다른 탭은 게임 · 에디터가 키보드를 쓴다.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [role="slider"], [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop')) return;
      if (!player.getState().current) return;
      if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player.seek(player.getTime() + 5); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player.seek(player.getTime() - 5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  // ---- 재생 ----
  const playAll = (shuffle: boolean) => {
    if (shownTracks.length === 0) return;
    const start = shuffle ? shownTracks[Math.floor(Math.random() * shownTracks.length)] : shownTracks[0];
    player.playList(shownTracks, start.id, { source, shuffle });
  };

  // ---- 올리기 (김정훈 · 황정빈) ----
  const targetKey = view.kind === 'chapter' ? view.key : uploadTarget;
  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const uploadFiles = async (files: File[], chapterKey: string) => {
    const stamp = Date.now();
    const batch = files.map((file, i) => {
      const problem = fileProblem(file);
      const item: UploadItem = {
        key: `${stamp}-${i}-${file.name}`, name: file.name, chapterKey,
        state: problem ? 'error' : 'waiting', message: problem,
      };
      return { file, item };
    });
    setUploads((prev) => [...prev, ...batch.map((b) => b.item)]);
    let added = 0;
    for (const { file, item } of batch) {
      if (item.state === 'error') continue;
      patchUpload(item.key, { state: 'reading' });
      const facts = await analyzeAudio(file);
      patchUpload(item.key, { state: 'uploading' });
      try {
        const row = await uploadMusicSample({
          chapterId: chapterKey === COMMON_KEY ? null : chapterKey,
          file,
          title: titleFromFileName(file.name),
          durationSec: facts.durationSec,
          peaks: facts.peaks,
          uploaderName: userName,
        });
        setData((prev) => (prev ? { ...prev, samples: [...prev.samples, row] } : prev));
        void prefetchMusicUrls([row.path]);
        added += 1;
        patchUpload(item.key, { state: 'done' });
        setTimeout(() => setUploads((prev) => prev.filter((u) => u.key !== item.key)), 2500);
      } catch (e) {
        console.error(e);
        patchUpload(item.key, { state: 'error', message: uploadError(e) });
      }
    }
    if (added > 0) showFlash(`${added}곡을 올렸어요`);
  };

  const canDropFiles = canUpload && view.kind !== 'playlist';
  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!canDropFiles || !hasFiles(e)) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!canDropFiles || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!canDropFiles || !hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void uploadFiles(files, targetKey);
  };

  const chooseTarget = (key: string) => {
    setUploadTarget(key);
    try { localStorage.setItem(UPLOAD_TARGET_KEY, key); } catch { /* 이번만 */ }
  };

  // ---- 곡 수정 · 삭제 · 받기 ----
  const saveEdit = async (patch: TrackEdit) => {
    if (!editing) return;
    const row = await updateMusicSample(editing.id, patch);
    setData((prev) => prev && { ...prev, samples: prev.samples.map((s) => (s.id === row.id ? row : s)) });
    const moved = chapterKeyOf(row) !== chapterKeyOf(editing);
    setEditing(null);
    showFlash(moved ? `${labelOf(chapterKeyOf(row))}(으)로 옮겼어요` : '곡 정보를 고쳤어요');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setBusy(true);
    try {
      await deleteMusicSample(target);
      setData((prev) => prev && {
        ...prev,
        samples: prev.samples.filter((s) => s.id !== target.id),
        items: prev.items.filter((it) => it.sample_id !== target.id),
      });
      showFlash('곡을 지웠어요');
    } catch (e) {
      setNotice(`지우지 못했어요: ${errorText(e)}`);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const download = async (sample: MusicSample) => {
    try {
      const a = document.createElement('a');
      a.href = await musicDownloadUrl(sample);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setNotice(`받지 못했어요: ${errorText(e)}`);
    }
  };

  // ---- 내 플레이리스트 ----
  const nextPlaylistOrder = () => playlists.reduce((max, p) => Math.max(max, p.sort_order + 1), 0);
  const nextItemOrder = (playlistId: string) =>
    (itemsByPlaylist.get(playlistId) ?? []).reduce((max, it) => Math.max(max, it.sort_order + 1), 0);

  const makePlaylist = async (name: string): Promise<MusicPlaylist> => {
    const row = await createPlaylist(name, nextPlaylistOrder());
    setData((prev) => prev && { ...prev, playlists: [...prev.playlists, row] });
    return row;
  };

  const submitName = async (name: string) => {
    if (!nameModal) return;
    if (nameModal.mode === 'create') {
      const row = await makePlaylist(name);
      setNameModal(null);
      goView({ kind: 'playlist', id: row.id });
      showFlash('플레이리스트를 만들었어요');
      return;
    }
    const row = await renamePlaylist(nameModal.playlist.id, name);
    setData((prev) => prev && { ...prev, playlists: prev.playlists.map((p) => (p.id === row.id ? row : p)) });
    setNameModal(null);
    showFlash('이름을 바꿨어요');
  };

  const confirmDeletePlaylist = async () => {
    if (!deletingPlaylist) return;
    const target = deletingPlaylist;
    setBusy(true);
    try {
      await deletePlaylist(target.id);
      setData((prev) => prev && {
        ...prev,
        playlists: prev.playlists.filter((p) => p.id !== target.id),
        items: prev.items.filter((it) => it.playlist_id !== target.id),
      });
      if (view.kind === 'playlist' && view.id === target.id) goView({ kind: 'all' });
      showFlash('플레이리스트를 지웠어요');
    } catch (e) {
      setNotice(`지우지 못했어요: ${errorText(e)}`);
    } finally {
      setBusy(false);
      setDeletingPlaylist(null);
    }
  };

  const addItem = async (playlist: MusicPlaylist, sample: MusicSample) => {
    const row = await addToPlaylist(playlist.id, sample.id, nextItemOrder(playlist.id));
    setData((prev) => prev && { ...prev, items: [...prev.items, row] });
  };

  const removeItem = async (itemId: string) => {
    const before = data;
    setData((prev) => prev && { ...prev, items: prev.items.filter((it) => it.id !== itemId) });
    try {
      await removeFromPlaylist(itemId);
    } catch (e) {
      if (before) setData(before);
      setNotice(`빼지 못했어요: ${errorText(e)}`);
    }
  };

  const toggleMembership = async (playlist: MusicPlaylist, add: boolean) => {
    if (!saving) return;
    if (add) {
      await addItem(playlist, saving);
      showFlash(`'${playlist.name}'에 담았어요`);
      return;
    }
    const item = (itemsByPlaylist.get(playlist.id) ?? []).find((it) => it.sample_id === saving.id);
    if (!item) return;
    await removeFromPlaylist(item.id);
    setData((prev) => prev && { ...prev, items: prev.items.filter((it) => it.id !== item.id) });
  };

  const moveItem = async (from: number, to: number) => {
    if (view.kind !== 'playlist') return;
    const list = itemsByPlaylist.get(view.id) ?? [];
    if (to < 0 || to >= list.length || from === to) return;
    const moved = moveInList(list, from, to);
    const changes = moved
      .map((it, index) => ({ id: it.id, sort_order: index }))
      .filter((c) => list.find((it) => it.id === c.id)?.sort_order !== c.sort_order);
    const before = data;
    setData((prev) => prev && {
      ...prev,
      items: prev.items.map((it) => {
        const change = changes.find((c) => c.id === it.id);
        return change ? { ...it, sort_order: change.sort_order } : it;
      }),
    });
    try {
      await reorderPlaylist(changes);
    } catch (e) {
      if (before) setData(before);
      setNotice(`순서를 바꾸지 못했어요: ${errorText(e)}`);
    }
  };

  // ---- 그리기 ----
  const memberOf = useMemo(() => {
    if (!saving) return new Set<string>();
    return new Set(items.filter((it) => it.sample_id === saving.id).map((it) => it.playlist_id));
  }, [items, saving]);

  const uploadList = uploads.length > 0 && (
    <ul className="music-uploads" aria-live="polite">
      {uploads.map((u) => (
        <li key={u.key} className={`music-upload ${u.state}`}>
          <span className="music-upload-name">{u.name}</span>
          <span className="music-upload-where">→ {labelOf(u.chapterKey)}</span>
          <span className="music-upload-state">{u.state === 'error' ? u.message : UPLOAD_STATE_TEXT[u.state]}</span>
          {(u.state === 'error' || u.state === 'done') && (
            <button type="button" className="music-link-btn"
              onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}>닫기</button>
          )}
        </li>
      ))}
    </ul>
  );

  const viewChapter = view.kind === 'chapter' && view.key !== COMMON_KEY ? chapterById.get(view.key) ?? null : null;
  const subtitle = view.kind === 'chapter' && view.key === COMMON_KEY
    ? COMMON_HINT
    : viewChapter?.description ?? null;

  const header = (
    <div className="chapter-header music-view-head">
      <div className="chapter-header-info">
        <span className="music-view-kind">{view.kind === 'playlist' ? '내 플레이리스트' : view.kind === 'chapter' ? '챕터' : '보관함'}</span>
        <h2>{title}</h2>
        {subtitle && <p className="chapter-desc">{subtitle}</p>}
        <p className="music-summary">{rows.length}곡{rows.length > 0 ? ` · ${formatTotal(rows.map((r) => r.sample.duration_sec))}` : ''}</p>
      </div>
      <div className="chapter-header-actions">
        <button type="button" className="btn btn-primary" disabled={shownTracks.length === 0} onClick={() => playAll(false)}>
          <PlayIcon size={15} /> 전체 재생
        </button>
        <button type="button" className="btn" disabled={shownTracks.length === 0} onClick={() => playAll(true)}>
          <ShuffleIcon /> 랜덤 재생
        </button>
        {viewChapter && (
          <a className="btn" href={chapterUrl(viewChapter.id)} onClick={(e) => openStages(e, viewChapter.id)}>스테이지 보기</a>
        )}
        {viewPlaylist && (
          <>
            <button type="button" className="btn" onClick={() => setNameModal({ mode: 'rename', playlist: viewPlaylist })}>이름 바꾸기</button>
            <button type="button" className="btn btn-danger" onClick={() => setDeletingPlaylist(viewPlaylist)}>삭제</button>
          </>
        )}
      </div>
    </div>
  );

  const uploadBar = canUpload && view.kind !== 'playlist' && (
    <div className="music-upload-bar">
      {view.kind === 'all' ? (
        <label className="music-upload-target">
          올릴 곳
          <select className="field-select" value={keys.includes(uploadTarget) ? uploadTarget : COMMON_KEY}
            onChange={(e) => chooseTarget(e.target.value)}>
            {keys.map((key) => <option key={key} value={key}>{labelOf(key)}</option>)}
          </select>
        </label>
      ) : (
        <span className="music-upload-target">올릴 곳 <b>{labelOf(view.key)}</b></span>
      )}
      <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>+ 곡 올리기</button>
      <span className="music-upload-hint">mp3 파일을 이 화면에 끌어 놓아도 돼요 · 여러 곡 한 번에 · 한 파일 {formatBytes(MAX_MUSIC_BYTES)}까지</span>
    </div>
  );

  const emptyText = view.kind === 'playlist'
    ? '아직 담은 곡이 없어요. 곡 옆 ⋯ 메뉴의 \'플레이리스트에 저장\'으로 담아 보세요.'
    : view.kind === 'chapter'
      ? '이 챕터에는 아직 곡이 없어요.'
      : '아직 올린 곡이 없어요.';

  const listView = (
    <>
      {header}
      {uploadBar}
      {uploadList}
      {view.kind === 'playlist' && rows.length > 1 && (
        <p className="music-toolbar-hint">왼쪽 손잡이를 끌어 순서를 바꿔요</p>
      )}
      {rows.length === 0 ? (
        <div className="hub-empty music-empty">{emptyText}</div>
      ) : (
        <MusicTrackList
          rows={rows}
          source={source}
          showChapter={view.kind !== 'chapter'}
          canManage={canUpload}
          playlistMode={view.kind === 'playlist'}
          reorderEnabled={view.kind === 'playlist'}
          onSaveToPlaylist={setSaving}
          onDownload={(s) => void download(s)}
          onEdit={setEditing}
          onDelete={setDeleting}
          onRemoveFromPlaylist={(itemId) => void removeItem(itemId)}
          onMove={(from, to) => void moveItem(from, to)}
        />
      )}
    </>
  );

  const sideItem = (target: MusicView, label: string, num: string | null, count: number, extraClass = '') => {
    const active = musicUrl(target) === viewKey;
    return (
      <button
        key={musicUrl(target)}
        type="button"
        className={`chapters-item${active ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}`}
        onClick={() => goView(target)}
        aria-current={active ? 'page' : undefined}
      >
        {num && <span className="chapters-item-num">{num}</span>}
        <span className="chapters-item-name">{label}</span>
        <span className="chapters-item-count">{count}</span>
      </button>
    );
  };

  return (
    <div className={`chapters music${playerState.current ? ' with-player' : ''}`}>
      <div className="chapters-head">
        <div>
          <h1 className="hub-title">챕터 음악</h1>
          <p className="hub-sub">
            챕터마다 올라온 곡을 누구나 듣고, 내 플레이리스트에 모아 둘 수 있어요.
            <br />곡을 틀면 다른 탭으로 가도 오른쪽 아래 플레이어에서 계속 나와요. 곡은 김정훈 · 황정빈만 올려요.
          </p>
        </div>
        <div className="music-head-right">
          {flash && <span className="detail-flash">{flash}</span>}
          {data && <span className="music-stats" title="저장소에 올린 음악 파일의 합계">{samples.length}곡 · {formatBytes(totalBytes)}</span>}
          <button type="button" className="btn btn-sm" onClick={() => void load()} title="새로 올라온 곡까지 다시 불러와요">새로 고침</button>
        </div>
      </div>

      {notice && (
        <div className="music-alert" role="alert">
          <span>{notice}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>닫기</button>
        </div>
      )}

      <div className="chapters-body">
        <aside className="chapters-side music-side">
          <div className="music-side-label">보관함</div>
          {sideItem({ kind: 'all' }, '모든 곡', null, samples.length, 'music-side-all')}
          {!loaded ? (
            <div className="chapters-side-empty">불러오는 중…</div>
          ) : (
            <div className="chapters-list">
              {chaptersFailed && <div className="chapters-side-empty">챕터를 불러오지 못했습니다.</div>}
              {keys.map((key) => {
                const ch = chapterById.get(key);
                return sideItem(
                  { kind: 'chapter', key },
                  ch ? ch.name || '이름 없음' : key === COMMON_KEY ? '타이틀 · 엔딩 등' : '목록에 없음',
                  ch ? `챕터 ${ch.number}` : key === COMMON_KEY ? '공통' : '챕터',
                  countByKey.get(key) ?? 0,
                );
              })}
            </div>
          )}
          <div className="music-side-label with-action">
            <span>내 플레이리스트</span>
            {data && (
              <button type="button" className="music-side-add" onClick={() => setNameModal({ mode: 'create' })}
                title="새 플레이리스트 만들기" aria-label="새 플레이리스트 만들기">+ 새로</button>
            )}
          </div>
          {data && playlists.length === 0 ? (
            <div className="music-side-hint">곡 옆 ⋯ 메뉴에서 '플레이리스트에 저장'을 누르면 여기에 모여요.</div>
          ) : (
            <div className="chapters-list">
              {playlists.map((p) => sideItem({ kind: 'playlist', id: p.id }, p.name || '이름 없음', null,
                (itemsByPlaylist.get(p.id) ?? []).filter((it) => sampleById.has(it.sample_id)).length))}
            </div>
          )}
        </aside>

        <section
          className={`chapters-main music-main${dragging ? ' dragging' : ''}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {notInstalled ? (
            <div className="hub-empty music-empty">
              <p>음악 탭의 DB 구조가 아직 적용되지 않았습니다.</p>
              <p>Supabase SQL Editor에서 <code>supabase/migrations/2026-11-13_music_library.sql</code>을 실행해 주세요.</p>
            </div>
          ) : !loaded ? (
            <div className="hub-empty">불러오는 중…</div>
          ) : loadError ? (
            <div className="hub-empty">
              곡 목록을 불러오지 못했습니다. ({loadError}){' '}
              <button type="button" className="btn btn-sm" onClick={() => void load()}>다시 시도</button>
            </div>
          ) : listView}
          {dragging && (
            <div className="music-drop-overlay" aria-hidden="true">
              <span>여기에 놓으면 <b>{labelOf(targetKey)}</b>에 올려요</span>
            </div>
          )}
        </section>
      </div>

      {canUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) void uploadFiles(files, targetKey);
          }}
        />
      )}

      {editing && (
        <EditTrackModal
          sample={editing}
          chapters={chapters}
          commonLabel={`${COMMON_TITLE} (타이틀 · 엔딩 등)`}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="곡 삭제"
          message={<>{quoted(deleting)}을(를) 지울까요? 모든 사람의 플레이리스트에서도 빠지고 되돌릴 수 없어요.</>}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      {saving && (
        <SaveToPlaylistModal
          track={saving}
          playlists={playlists}
          memberOf={memberOf}
          onToggle={toggleMembership}
          onCreate={async (name) => {
            const row = await makePlaylist(name);
            await addItem(row, saving);
            showFlash(`'${row.name}'을(를) 만들고 담았어요`);
          }}
          onClose={() => setSaving(null)}
        />
      )}

      {nameModal && (
        <PlaylistNameModal
          title={nameModal.mode === 'create' ? '새 플레이리스트' : '플레이리스트 이름 바꾸기'}
          initial={nameModal.mode === 'rename' ? nameModal.playlist.name : ''}
          submitLabel={nameModal.mode === 'create' ? '만들기' : '저장'}
          onSubmit={submitName}
          onCancel={() => setNameModal(null)}
        />
      )}

      {deletingPlaylist && (
        <ConfirmModal
          title="플레이리스트 삭제"
          message={<>'{deletingPlaylist.name || '이름 없음'}' 플레이리스트를 지울까요? 곡 자체는 그대로 남아요.</>}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void confirmDeletePlaylist()}
          onCancel={() => setDeletingPlaylist(null)}
        />
      )}
    </div>
  );
}
