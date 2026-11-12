import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { listChapters, type ChapterRow } from '../../api/chapters';
import {
  addMusicComment, deleteMusicComment, deleteMusicSample, isMusicNotInstalled, loadMusic, musicDownloadUrl,
  setMusicStatus, updateMusicSample, uploadMusicSample,
  type MusicComment, type MusicData, type MusicSample, type MusicStatus,
} from '../../api/music';
import { STATUS_LABEL } from '../../api/types';
import {
  byUploadOrder, chapterKeyOf, COMMON_KEY, fileProblem, formatBytes, groupByStatus, MAX_MUSIC_BYTES,
  musicChapterKey, musicUrl, sampleNumbers, summarize, titleFromFileName, type ChapterSummary,
} from '../../lib/music';
import * as nav from '../../lib/nav';
import { chapterUrl } from '../../lib/hubState';
import ConfirmModal from '../common/ConfirmModal';
import MusicSampleRow from './MusicSampleRow';
import MusicPlayerBar, { type PlayerBarInfo } from './MusicPlayerBar';
import { AdoptModal, EditSampleModal, type SampleEdit } from './MusicModals';
import { analyzeAudio } from './analyze';
import { createMusicPlayer, usePlayerState, type MusicTrack } from './player';
import { cachedMusicUrl, freshMusicUrl, prefetchMusicUrls } from './urls';
import './music.css';

// 챕터 음악 — 챕터마다 후보 곡을 올리고 들어 보고 채택한다.
//   '/music'              채택곡 모아 듣기 (챕터 순서대로 채택한 곡)
//   '/music?ch=<챕터 id>'  그 챕터의 후보 곡 (채택 · 검토중 · 보류 · 반려)
//   '/music?ch=common'     공통 — 타이틀 · 엔딩처럼 챕터 밖의 곡
// 챕터 목록은 '챕터 구성'의 챕터를 그대로 쓴다.

const COMMON_TITLE = '공통';
const COMMON_HINT = '타이틀 · 메뉴 · 엔딩처럼 챕터 밖에서 쓰는 곡을 모아 둬요.';
/** 듣기 주소를 미리 새로 받는 간격 — 오래 열어 둔 화면에서도 누르면 바로 재생되게. */
const URL_REFRESH_MS = 20 * 60 * 1000;
const EMPTY_COMMENTS: MusicComment[] = [];

const chapterTitle = (ch: ChapterRow) => `챕터 ${ch.number} · ${ch.name || '이름 없음'}`;

function countsText(sum: ChapterSummary): string {
  if (sum.total === 0) return '아직 곡 없음';
  const parts = [`${sum.total}곡`];
  for (const status of ['accepted', 'pending', 'held', 'rejected'] as const) {
    if (sum[status] > 0) parts.push(`${STATUS_LABEL[status]} ${sum[status]}`);
  }
  return parts.join(' · ');
}

const errorText = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e);

function uploadError(e: unknown): string {
  if (isMusicNotInstalled(e)) return 'DB 구조가 아직 없어요. SQL을 먼저 실행해 주세요.';
  const err = e as { message?: string; statusCode?: string | number } | null;
  const message = err?.message ?? String(e);
  if (/bucket not found/i.test(message)) return '음악 저장소가 아직 없어요. SQL을 먼저 실행해 주세요.';
  if (/maximum allowed size|too large|exceeded/i.test(message) || String(err?.statusCode) === '413') {
    return `${formatBytes(MAX_MUSIC_BYTES)}가 넘는 파일은 올릴 수 없어요.`;
  }
  if (/mime type|not supported/i.test(message)) return '음악 파일만 올릴 수 있어요.';
  return `올리지 못했어요: ${message}`;
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

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

interface MusicBoardProps {
  userId: string;
  userName: string;
}

export default function MusicBoard({ userId, userName }: MusicBoardProps) {
  const location = nav.useLocation();
  const view = useMemo(() => musicChapterKey(location), [location]);   // null = 채택곡 모아 듣기

  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chaptersFailed, setChaptersFailed] = useState(false);
  const [data, setData] = useState<MusicData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notInstalled, setNotInstalled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [openFeedback, setOpenFeedback] = useState<ReadonlySet<string>>(new Set());
  const [rejectedOpenFor, setRejectedOpenFor] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<MusicSample | null>(null);
  const [deleting, setDeleting] = useState<MusicSample | null>(null);
  const [adoptAsk, setAdoptAsk] = useState<{ sample: MusicSample; others: MusicSample[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ---- 재생기: 화면 전체가 오디오 하나를 같이 쓴다 ----
  const [player] = useState(() => createMusicPlayer({ cachedUrl: cachedMusicUrl, freshUrl: freshMusicUrl }));
  useEffect(() => player.attach(), [player]);
  const playerState = usePlayerState(player);

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
      void prefetchMusicUrls(music.samples.map((s) => s.path));
    } catch (e) {
      if (isMusicNotInstalled(e)) setNotInstalled(true);
      else { console.error(e); setLoadError(errorText(e)); }
    }
    setLoaded(true);
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  // ---- 파생 값 ----
  const samples = useMemo(() => data?.samples ?? [], [data]);
  const byKey = useMemo(() => {
    const map = new Map<string, MusicSample[]>();
    for (const s of samples) {
      const key = chapterKeyOf(s);
      const list = map.get(key);
      if (list) list.push(s); else map.set(key, [s]);
    }
    return map;
  }, [samples]);
  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const list of byKey.values()) for (const [id, n] of sampleNumbers(list)) map.set(id, n);
    return map;
  }, [byKey]);
  const commentsBySample = useMemo(() => {
    const map = new Map<string, MusicComment[]>();
    for (const c of [...(data?.comments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const list = map.get(c.sample_id);
      if (list) list.push(c); else map.set(c.sample_id, [c]);
    }
    return map;
  }, [data]);
  const chapterById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);

  // 재생기가 아는 곡 목록 — 곡 id 로 틀고 앞뒤 곡을 찾는다.
  const tracks = useMemo(() => new Map(samples.map((s): [string, MusicTrack] => {
    const ch = s.chapter_id ? chapterById.get(s.chapter_id) : undefined;
    return [s.id, {
      id: s.id,
      path: s.path,
      title: s.title.trim() || '제목 없음',
      artist: s.uploader_name || '익명',
      album: ch ? chapterTitle(ch) : COMMON_TITLE,
      duration: s.duration_sec,
    }];
  })), [samples, chapterById]);
  useEffect(() => { player.setTracks(tracks); }, [player, tracks]);

  // 듣기 주소를 미리 받아 두고, 오래 열어 둔 화면에서도 낡기 전에 새로 받는다.
  useEffect(() => {
    const paths = samples.map((s) => s.path);
    void prefetchMusicUrls(paths);
    const timer = setInterval(() => { void prefetchMusicUrls(paths); }, URL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [samples]);
  // 왼쪽 목록 순서: 챕터들 → 공통. 목록에 없는 챕터에 곡이 있으면(챕터를 못 불러옴) 맨 뒤에 붙인다.
  const keys = useMemo(() => {
    const list = [...chapters.map((c) => c.id), COMMON_KEY];
    for (const key of byKey.keys()) if (!list.includes(key)) list.push(key);
    return list;
  }, [chapters, byKey]);
  const labelOf = useCallback((key: string) => {
    if (key === COMMON_KEY) return COMMON_TITLE;
    const ch = chapterById.get(key);
    return ch ? chapterTitle(ch) : '챕터 (목록에 없음)';
  }, [chapterById]);

  const viewKnown = view == null || view === COMMON_KEY || chapterById.has(view) || byKey.has(view);
  const viewChapter = view && view !== COMMON_KEY ? chapterById.get(view) ?? null : null;
  const viewSamples = useMemo(() => (view ? byKey.get(view) ?? [] : []), [view, byKey]);
  const groups = useMemo(() => groupByStatus(viewSamples), [viewSamples]);
  const showRejected = rejectedOpenFor === view;
  const shownGroups = groups.filter((g) => g.status !== 'rejected' || showRejected);
  const rejectedCount = groups.find((g) => g.status === 'rejected')?.samples.length ?? 0;
  const chapterQueue = shownGroups.flatMap((g) => g.samples.map((s) => s.id));

  const overview = useMemo(() => keys
    .map((key) => {
      const list = byKey.get(key) ?? [];
      return { key, adopted: list.filter((s) => s.status === 'accepted').sort(byUploadOrder), summary: summarize(list) };
    })
    .filter((o) => o.key !== COMMON_KEY || o.summary.total > 0), [keys, byKey]);
  const overviewQueue = overview.flatMap((o) => o.adopted.map((s) => s.id));
  const totalBytes = samples.reduce((sum, s) => sum + (s.size_bytes ?? 0), 0);
  const adoptedCount = samples.filter((s) => s.status === 'accepted').length;

  // ---- 주소 ----
  // 지워진 챕터를 가리키는 주소는 모아 듣기로 바꾼다. 불러오는 동안 · 챕터를 못 불러온 동안은 그대로 둔다.
  useEffect(() => {
    if (!location.startsWith('/music')) return;
    if (loaded && !chaptersFailed && !viewKnown) { nav.go(musicUrl(null), { replace: true }); return; }
    nav.rememberListUrl('music', musicUrl(view));
  }, [location, loaded, chaptersFailed, viewKnown, view]);

  nav.useScrollRestore(loaded);

  const selectKey = (key: string | null) => nav.go(musicUrl(key), { replace: true });
  const openKey = (e: MouseEvent<HTMLAnchorElement>, key: string | null) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    selectKey(key);
  };
  const openStages = (e: MouseEvent<HTMLAnchorElement>, chapterId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    nav.go(chapterUrl(chapterId));
  };

  // ---- 재생 ----
  // 다른 사람이 지운 곡을 듣고 있었으면 멈춘다.
  useEffect(() => {
    const id = playerState.currentId;
    if (id && data && !data.samples.some((s) => s.id === id)) player.stop();
  }, [data, playerState.currentId, player]);

  const currentSample = playerState.currentId ? samples.find((s) => s.id === playerState.currentId) ?? null : null;
  const barInfo: PlayerBarInfo | null = currentSample && {
    title: currentSample.title.trim() || '제목 없음',
    no: numbers.get(currentSample.id) ?? 0,
    label: labelOf(chapterKeyOf(currentSample)),
    uploader: currentSample.uploader_name || '익명',
  };
  const locateCurrent = () => {
    if (!currentSample) return;
    const key = chapterKeyOf(currentSample);
    if (key !== view) selectKey(key);
    if (currentSample.status === 'rejected') setRejectedOpenFor(key);
    setScrollToId(currentSample.id);
  };
  useEffect(() => {
    if (!scrollToId) return;
    const el = document.getElementById(`music-${scrollToId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    queueMicrotask(() => setScrollToId(null));
  });

  // 스페이스 = 재생 / 멈춤, ← → = 5초. 글을 쓰는 중이거나 단추 · 창 위에서는 그 요소가 먼저다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [role="slider"], [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop')) return;
      const st = player.getState();
      if (!st.currentId) return;
      if (e.code === 'Space') { e.preventDefault(); if (st.playing) player.pause(); else player.resume(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player.seek(player.getTime() + 5); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player.seek(player.getTime() - 5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  // ---- 올리기 ----
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

  const pickFiles = () => fileInputRef.current?.click();

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!view || !hasFiles(e)) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!view || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!view || !hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void uploadFiles(files, view);
  };

  // ---- 채택 · 보류 · 반려 ----
  const applyStatus = async (changes: { id: string; status: MusicStatus }[], message?: string) => {
    const ids = changes.map((c) => c.id);
    setStatusBusy((prev) => new Set([...prev, ...ids]));
    setData((prev) => prev && {
      ...prev,
      samples: prev.samples.map((s) => {
        const change = changes.find((c) => c.id === s.id);
        return change ? { ...s, status: change.status } : s;
      }),
    });
    try {
      for (const c of changes) await setMusicStatus(c.id, c.status);
      if (message) showFlash(message);
    } catch (e) {
      setNotice(isMusicNotInstalled(e)
        ? '상태를 바꾸는 DB 함수가 아직 없어요. SQL을 먼저 실행해 주세요.'
        : `상태를 바꾸지 못했어요: ${errorText(e)}`);
      void load();
    } finally {
      setStatusBusy((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  const requestStatus = (sample: MusicSample, status: MusicStatus) => {
    const name = `「${sample.title.trim() || '제목 없음'}」`;
    if (status === 'accepted') {
      const others = (byKey.get(chapterKeyOf(sample)) ?? [])
        .filter((s) => s.id !== sample.id && s.status === 'accepted');
      if (others.length > 0) { setAdoptAsk({ sample, others }); return; }
    }
    void applyStatus([{ id: sample.id, status }], `${name} → ${STATUS_LABEL[status]}`);
  };

  const resolveAdopt = async (swap: boolean) => {
    if (!adoptAsk) return;
    const { sample, others } = adoptAsk;
    setBusy(true);
    await applyStatus(
      [{ id: sample.id, status: 'accepted' }, ...(swap ? others.map((o) => ({ id: o.id, status: 'held' as const })) : [])],
      swap ? '채택한 곡을 바꿨어요 (앞의 곡은 보류)' : '함께 채택했어요',
    );
    setBusy(false);
    setAdoptAsk(null);
  };

  // ---- 수정 · 삭제 · 받기 ----
  const saveEdit = async (patch: SampleEdit) => {
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
      if (player.getState().currentId === target.id) player.stop();
      setData((prev) => prev && {
        samples: prev.samples.filter((s) => s.id !== target.id),
        comments: prev.comments.filter((c) => c.sample_id !== target.id),
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

  // ---- 피드백 ----
  const toggleFeedback = (id: string) => setOpenFeedback((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const addComment = async (sample: MusicSample, body: string, atSec: number | null) => {
    const row = await addMusicComment({ sample_id: sample.id, author_name: userName, body, at_sec: atSec });
    setData((prev) => prev && { ...prev, comments: [...prev.comments, row] });
  };
  const removeComment = async (comment: MusicComment) => {
    await deleteMusicComment(comment.id);
    setData((prev) => prev && { ...prev, comments: prev.comments.filter((c) => c.id !== comment.id) });
  };

  // ---- 그리기 ----
  const renderRow = (sample: MusicSample, queue: string[], compact = false) => {
    const current = playerState.currentId === sample.id;
    return (
      <MusicSampleRow
        key={sample.id}
        sample={sample}
        no={numbers.get(sample.id) ?? 0}
        player={player}
        current={current}
        playing={current && playerState.playing}
        loading={current && playerState.loading}
        duration={current && playerState.duration > 0 ? playerState.duration : sample.duration_sec ?? 0}
        error={current ? playerState.error : null}
        queue={queue}
        comments={commentsBySample.get(sample.id) ?? EMPTY_COMMENTS}
        mine={sample.uploader_id === userId}
        userId={userId}
        compact={compact}
        feedbackOpen={openFeedback.has(sample.id)}
        statusBusy={statusBusy.has(sample.id)}
        onToggleFeedback={() => toggleFeedback(sample.id)}
        onStatus={(status) => requestStatus(sample, status)}
        onEdit={() => setEditing(sample)}
        onDelete={() => setDeleting(sample)}
        onDownload={() => void download(sample)}
        onAddComment={(body, atSec) => addComment(sample, body, atSec)}
        onDeleteComment={removeComment}
      />
    );
  };

  const uploadList = uploads.length > 0 && (
    <ul className="music-uploads" aria-live="polite">
      {uploads.map((u) => (
        <li key={u.key} className={`music-upload ${u.state}`}>
          <span className="music-upload-name">{u.name}</span>
          {u.chapterKey !== view && <span className="music-upload-where">→ {labelOf(u.chapterKey)}</span>}
          <span className="music-upload-state">{u.state === 'error' ? u.message : UPLOAD_STATE_TEXT[u.state]}</span>
          {(u.state === 'error' || u.state === 'done') && (
            <button
              type="button"
              className="music-link-btn"
              onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}
            >닫기</button>
          )}
        </li>
      ))}
    </ul>
  );

  const overviewView = (
    <>
      <div className="chapter-header">
        <div className="chapter-header-info">
          <h2>채택곡 모아 듣기</h2>
          <p className="chapter-desc">챕터마다 채택한 곡을 챕터 순서대로 모았어요. 후보 곡을 듣고 고르려면 왼쪽에서 챕터를 누르세요.</p>
        </div>
        <div className="chapter-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={overviewQueue.length === 0}
            onClick={() => { player.setMode('continue'); player.play(overviewQueue[0], { queue: overviewQueue }); }}
          >▶ 처음부터 이어 듣기</button>
        </div>
      </div>
      {uploadList}
      <div className="music-overview">
        {overview.map((o) => (
          <section className="music-ov" key={o.key}>
            <div className="music-ov-head">
              <a className="music-ov-name" href={musicUrl(o.key)} onClick={(e) => openKey(e, o.key)}>{labelOf(o.key)}</a>
              <span className="music-ov-counts">{countsText(o.summary)}</span>
            </div>
            {o.adopted.length > 0 ? (
              <div className="music-list">{o.adopted.map((s) => renderRow(s, overviewQueue, true))}</div>
            ) : (
              <p className="music-ov-empty">
                {o.summary.total > 0 ? '아직 채택한 곡이 없어요.' : '아직 올린 곡이 없어요.'}
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  );

  const chapterView = view && (
    <>
      <div className="chapter-header">
        <div className="chapter-header-info">
          <h2>{labelOf(view)}</h2>
          {view === COMMON_KEY
            ? <p className="chapter-desc">{COMMON_HINT}</p>
            : viewChapter?.description && <p className="chapter-desc">{viewChapter.description}</p>}
          {viewSamples.length > 0 && <p className="music-summary">{countsText(summarize(viewSamples))}</p>}
        </div>
        <div className="chapter-header-actions">
          {viewChapter && (
            <a className="btn" href={chapterUrl(viewChapter.id)} onClick={(e) => openStages(e, viewChapter.id)}>스테이지 보기</a>
          )}
          <button type="button" className="btn btn-primary" onClick={pickFiles}>+ 곡 올리기</button>
        </div>
      </div>
      {uploadList}

      {viewSamples.length === 0 ? (
        <button type="button" className="music-dropzone" onClick={pickFiles}>
          <b>아직 올린 곡이 없어요</b>
          <span>mp3 파일을 여기로 끌어 놓거나 눌러서 고르세요 · 여러 곡을 한 번에 · 한 파일 {formatBytes(MAX_MUSIC_BYTES)}까지</span>
        </button>
      ) : (
        <>
          <p className="music-hint">
            파일을 이 화면에 끌어 놓아도 올라가요. 파형을 누르면 그 지점부터 들어요. 스페이스 = 재생 · 멈춤
          </p>
          {shownGroups.map((g) => (
            <div className="music-group" key={g.status}>
              <h3 className={`music-group-title status-${g.status}`}>
                {STATUS_LABEL[g.status]} <span>{g.samples.length}</span>
              </h3>
              <div className="music-list">{g.samples.map((s) => renderRow(s, chapterQueue))}</div>
            </div>
          ))}
          {rejectedCount > 0 && (
            <button
              type="button"
              className="music-more"
              aria-expanded={showRejected}
              onClick={() => setRejectedOpenFor(showRejected ? null : view)}
            >
              {showRejected ? '반려한 곡 접기' : `반려한 곡 ${rejectedCount}개 보기`}
            </button>
          )}
        </>
      )}
    </>
  );

  return (
    <div className={`chapters music${playerState.currentId ? ' with-bar' : ''}`}>
      <div className="chapters-head">
        <div>
          <h1 className="hub-title">챕터 음악</h1>
          <p className="hub-sub">
            챕터마다 후보 곡을 올리고 들어 본 뒤 채택해요. 누구나 여러 곡을 올릴 수 있어요.
            <br />채택 · 보류 · 반려는 맵처럼 누구나 바꾸고, 곡 정보 수정 · 삭제는 올린 사람만 할 수 있어요.
          </p>
        </div>
        <div className="music-head-right">
          {flash && <span className="detail-flash">{flash}</span>}
          {data && (
            <span className="music-stats" title="저장소에 올린 음악 파일의 합계">
              {samples.length}곡 · 채택 {adoptedCount} · {formatBytes(totalBytes)}
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={() => void load()} title="다른 사람이 올린 곡까지 다시 불러와요">새로 고침</button>
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
          <button
            type="button"
            className={`chapters-item music-side-all${view == null ? ' active' : ''}`}
            onClick={() => selectKey(null)}
          >
            <span className="chapters-item-name">채택곡 모아 듣기</span>
            <span className="chapters-item-count">{adoptedCount}</span>
          </button>
          {!loaded ? (
            <div className="chapters-side-empty">불러오는 중…</div>
          ) : (
            <div className="chapters-list">
              {chaptersFailed && <div className="chapters-side-empty">챕터를 불러오지 못했습니다.</div>}
              {keys.map((key) => {
                const list = byKey.get(key) ?? [];
                const ch = chapterById.get(key);
                const adopted = list.some((s) => s.status === 'accepted');
                return (
                  <button
                    key={key}
                    type="button"
                    className={`chapters-item${key === view ? ' active' : ''}`}
                    onClick={() => selectKey(key)}
                    title={key === COMMON_KEY ? COMMON_HINT : undefined}
                  >
                    <span className="chapters-item-num">{ch ? `챕터 ${ch.number}` : key === COMMON_KEY ? '공통' : '챕터'}</span>
                    <span className="chapters-item-name">{ch ? ch.name || '이름 없음' : key === COMMON_KEY ? '타이틀 · 엔딩 등' : '목록에 없음'}</span>
                    <span
                      className={`chapters-item-count${adopted ? ' music-count-adopted' : ''}`}
                      title={adopted ? '채택한 곡이 있어요' : undefined}
                    >
                      {adopted ? '✓ ' : ''}{list.length}
                    </span>
                  </button>
                );
              })}
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
              <p>챕터 음악의 DB 구조가 아직 적용되지 않았습니다.</p>
              <p>Supabase SQL Editor에서 <code>supabase/migrations/2026-11-12_chapter_music.sql</code>을 실행해 주세요.</p>
            </div>
          ) : !loaded ? (
            <div className="hub-empty">불러오는 중…</div>
          ) : loadError ? (
            <div className="hub-empty">
              곡 목록을 불러오지 못했습니다. ({loadError}){' '}
              <button type="button" className="btn btn-sm" onClick={() => void load()}>다시 시도</button>
            </div>
          ) : view == null ? overviewView : chapterView}
          {dragging && view && (
            <div className="music-drop-overlay" aria-hidden="true">
              <span>여기에 놓으면 <b>{labelOf(view)}</b>에 올려요</span>
            </div>
          )}
        </section>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0 && view) void uploadFiles(files, view);
        }}
      />

      <MusicPlayerBar player={player} state={playerState} info={barInfo} onLocate={locateCurrent} />

      {editing && (
        <EditSampleModal
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
          message={<>「{deleting.title.trim() || '제목 없음'}」을(를) 지울까요? 파일과 피드백도 함께 지워지고 되돌릴 수 없어요.</>}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      {adoptAsk && (
        <AdoptModal
          sample={adoptAsk.sample}
          others={adoptAsk.others}
          placeLabel={labelOf(chapterKeyOf(adoptAsk.sample))}
          busy={busy}
          onBoth={() => void resolveAdopt(false)}
          onSwap={() => void resolveAdopt(true)}
          onCancel={() => setAdoptAsk(null)}
        />
      )}
    </div>
  );
}
