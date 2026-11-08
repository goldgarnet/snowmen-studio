import { useState, useEffect, useCallback, useMemo, useRef, type DragEvent } from 'react';
import type { Level } from '../../types';
import { createLevel } from '../../utils/level';
import { encodeLevelCode, decodeLevelCode } from '../../utils/levelCode';
import GameLevelExport from '../common/GameLevelExport';
import { useAuth } from '../../context/AuthContext';
import { useGuard, StudioApi } from '../../context/GuardContext';
import {
  listMyMaps, insertMap, updateMap, deleteMap, registeredToISO, isoToDateStr,
  compareMapOrder, reorderMapsInFolder,
} from '../../api/maps';
import {
  listMyFolders, insertFolder, updateFolder, deleteFolder, moveMapToFolder, publishFolder,
} from '../../api/folders';
import type { MapRow, FolderRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import Editor, { type EditorHistoryState, type EditorSessionState, type EditorToolbarApi } from '../editor/Editor';
import UploadForm, { UploadPayload } from '../hub/UploadForm';
import FolderForm, { FolderFormPayload } from '../hub/FolderForm';
import FolderGlyph from '../hub/FolderGlyph';
import MapThumbnail from '../hub/MapThumbnail';
import SolutionRecorder from '../hub/SolutionRecorder';
import { insertSolution, deleteSolutionsForMap } from '../../api/solutions';
import ConfirmModal from '../common/ConfirmModal';
import Pagination from '../common/Pagination';
import {
  type EditorDraft, readEditorDraft, removeEditorDraft, writeEditorDraft,
} from '../../utils/editorDraft';
import * as nav from '../../lib/nav';
import { isStudioFolderUrl, isStudioListUrl, listUrl, parseListQuery, splitUrl } from '../../lib/hubState';
import './MapStudio.css';

// 'opening' = 주소의 맵을 아직 열지 못함(불러오는 중·불러오기 실패)
type View = 'list' | 'folder' | 'editor' | 'play' | 'opening';
type ToolbarIconName = 'play' | 'undo' | 'redo' | 'reset' | 'export' | 'import' | 'save';
const PAGE_SIZE = 8; // 4 columns × 2 rows
const STUDIO_BASE = '/editor';
// 저장 안 한 새 맵의 주소 키: '/editor/new' (플레이는 '/editor/new/play')
const NEW_MAP = 'new';
const editorPath = (key: string) => `${STUDIO_BASE}/${encodeURIComponent(key)}`;
const isStudioListPath = (path: string) => path === STUDIO_BASE || path === `${STUDIO_BASE}/`;

interface MapStudioProps {
  // A saved map gets its own address so an in-progress edit can be bookmarked or
  // refreshed without losing which map was open. A new unsaved map lives at /editor/new.
  editMapId?: string;
  playing: boolean;
  onEditRouteChange: (mapId: string | null, options?: { replace?: boolean }) => void;
  onPlayRouteChange: (mapId: string | null) => void;
  onExitPlay: () => void;
}

interface DraftRestoreTarget {
  draft: EditorDraft;
  map: MapRow | null;
  afterDiscard?: () => void;   // '+ 새 맵 만들기'에서 띄운 창이면 '삭제' 뒤 빈 새 맵으로
}

function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  const svgProps = { className: 'studio-toolbar-icon', viewBox: '0 0 24 24', 'aria-hidden': true };
  switch (name) {
    case 'play': return <svg {...svgProps}><path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none" /></svg>;
    case 'undo': return <svg {...svgProps}><path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" /></svg>;
    case 'redo': return <svg {...svgProps}><path d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6" /></svg>;
    case 'reset': return <svg {...svgProps}><path d="M5 7h14M10 11v6m4-6v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14" /></svg>;
    case 'export': return <svg {...svgProps}><path d="M12 15V3m0 0L8 7m4-4 4 4M5 13v7h14v-7" /></svg>;
    case 'import': return <svg {...svgProps}><path d="M12 3v12m0 0-4-4m4 4 4-4M5 13v7h14v-7" /></svg>;
    case 'save': return <svg {...svgProps}><path d="M5 3h11l3 3v15H5V3Zm3 0v6h8V3m-7 12h6" /></svg>;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function MapStudio({
  editMapId, playing, onEditRouteChange, onPlayRouteChange, onExitPlay,
}: MapStudioProps) {
  const { profile } = useAuth();
  const guard = useGuard();
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 내 맵 목록 조회 자체가 실패했나 — '권한 없음' 으로 내보내지 않고 다시 시도를 보인다.
  const [loadError, setLoadError] = useState(false);
  // 목록의 쪽·열어 둔 폴더는 주소가 정한다: '/editor?page=<n>&folder=<폴더 id>'.
  const location = nav.useLocation();
  const listQuery = useMemo(() => parseListQuery(location), [location]);

  // Editing state (the map currently open in the editor).
  // session = 메모리에 열린 편집 세션: 'new'(저장 안 한 새 맵) | 맵 id | null. 주소가 같은 세션을
  // 가리키면 에디터·플레이를 그대로 보이고(뒤로/앞으로로 오가도 작업 유지), 다르면 그 맵을 연다.
  const [session, setSession] = useState<string | null>(null);
  const editId = session && session !== NEW_MAP ? session : null;
  const [level, setLevel] = useState<Level>(() => createLevel(8, 8));
  // Once a saved map's layout changes, its persisted walkthroughs are invalid even
  // if the edit is later undone. Reset after a new solution is registered so a later
  // edit invalidates that fresh walkthrough too.
  const invalidatedSolutionsForRef = useRef<string | null>(null);
  const editorRef = useRef<EditorToolbarApi>(null);
  const [editorHistory, setEditorHistory] = useState<EditorHistoryState>({ canUndo: false, canRedo: false });
  // 테스트 플레이에 다녀오면 Editor 가 다시 마운트된다. 세션별 실행취소/다시실행·고른 도구를
  // 여기 들고 있다가 넘긴다. 세션이 바뀌면(다른 맵·새 맵 시작·복구) 비우고 Editor 를 새로 띄운다.
  const [editorSession, setEditorSession] = useState<EditorSessionState | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [editTitle, setEditTitle] = useState('');
  const [published, setPublished] = useState(false);
  // The full DB row of the map open in the editor (null for a brand-new map).
  // Carries saved metadata (author/comment/difficulty/dates) so re-publishing a
  // previously-published map preserves everything instead of resetting it.
  const [editRow, setEditRow] = useState<MapRow | null>(null);
  // The map code as of the last save/open — used to detect unsaved changes. It starts as
  // the initial blank map (not ''), so an untouched screen never counts as an edit.
  const [savedCode, setSavedCode] = useState(() => encodeLevelCode(createLevel(8, 8)));
  const [savedTitle, setSavedTitle] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MapRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); // per-card action in flight
  const [draftRestoreTarget, setDraftRestoreTarget] = useState<DraftRestoreTarget | null>(null);
  // 이 세션이 직접 쓴 임시저장본의 세션 키. 남이 남긴 임시저장본은 덮거나 지우지 않는다.
  const draftOwnerRef = useRef<string | null>(null);
  // 이 마운트에서 처음 저장한 새 맵의 id — 남아 있던 '/editor/new' 기록 항목을 그 맵 주소로 바꿔 적는다.
  const savedFromNewRef = useRef<string | null>(null);
  const checkedNewDraftForRef = useRef<string | null>(null);
  // 풀이 등록 뒤 플레이 끝내기는 await 뒤라, 그사이 바뀐 주소(새 맵 → 저장된 맵)를 아는 최신 콜백을 쓴다.
  const exitPlayRef = useRef(onExitPlay);
  useEffect(() => { exitPlayRef.current = onExitPlay; });

  // ---- folders ----
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const currentFolderId = listQuery.folder;                                     // folder being viewed (주소)
  const [editFolderId, setEditFolderId] = useState<string | null>(null);        // folder the open map belongs to
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showPublishFolder, setShowPublishFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderRow | null>(null);

  // ---- folder map ordering (drag & drop) ----
  const [dragMapId, setDragMapId] = useState<string | null>(null);   // tile being dragged
  const [dropTargetId, setDropTargetId] = useState<string | null>(null); // tile hovered over
  const [reordering, setReordering] = useState(false);

  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;
  const rootMaps = maps.filter((m) => !m.folder_id);              // maps outside any folder
  // Inside a folder the maps follow the owner's manual order (same order the hub shows).
  const folderMaps = maps.filter((m) => m.folder_id === currentFolderId).sort(compareMapOrder);

  // The list page mixes folders and root maps (folders first), newest first within each.
  const listEntries: ({ kind: 'folder'; folder: FolderRow } | { kind: 'map'; map: MapRow })[] = [
    ...folders.map((f) => ({ kind: 'folder' as const, folder: f })),
    ...rootMaps.map((m) => ({ kind: 'map' as const, map: m })),
  ];
  const pageCount = Math.max(1, Math.ceil(listEntries.length / PAGE_SIZE));
  const visiblePage = Math.min(listQuery.page, pageCount);
  const pagedEntries = listEntries.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);

  // 화면은 주소가 정한다 — 목록 '/editor', 폴더 '/editor?folder=', 에디터 '/editor/new'·'/editor/<id>',
  // 플레이 '…/play'. 메모리의 세션이 주소의 맵과 다르면 그 맵을 여는 중('opening')이다.
  const view: View = editMapId
    ? (session === editMapId ? (playing ? 'play' : 'editor') : 'opening')
    : playing ? 'opening' : currentFolder ? 'folder' : 'list';

  const showFlash = useCallback((msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1800); }, []);

  // 폴더 목록 조회가 실패했나 — 이때는 주소의 폴더를 '없어짐'으로 보고 지우지 않는다.
  const [foldersError, setFoldersError] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setLoadError(false);
    try { setMaps(await listMyMaps(profile.id)); }
    catch (e) { console.error(e); setLoadError(true); }
    // 실패하면 지금 목록을 그대로 둔다(첫 조회면 빈 목록).
    try { setFolders(await listMyFolders(profile.id)); setFoldersError(false); }
    catch (e) { console.error(e); setFoldersError(true); }
    setLoading(false);
  }, [profile]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  // ---- 편집 세션 ----
  // 다른 맵을 열거나 새 맵을 시작·복구하면 실행취소 기록을 비우고 Editor 를 새로 띄운다.
  const resetEditorSession = useCallback(() => {
    setEditorSession(null);
    setEditorEpoch((n) => n + 1);
  }, []);

  // 빈 새 맵 세션. offerDraft 면 저장 안 한 새 맵 임시저장본을 덮지 않고 복구 창을 띄운다.
  const beginNewSession = useCallback((folderId: string | null, offerDraft: boolean) => {
    const fresh = createLevel(8, 8);
    setLevel(fresh);
    setSavedCode(encodeLevelCode(fresh));
    setSavedTitle('새 맵');
    invalidatedSolutionsForRef.current = null;
    draftOwnerRef.current = null;
    setSession(NEW_MAP); setEditTitle('새 맵'); setPublished(false); setEditRow(null);
    setEditFolderId(folderId);
    resetEditorSession();
    const draft = offerDraft && profile ? readEditorDraft(profile.id, null) : null;
    if (draft && decodeLevelCode(draft.code)) setDraftRestoreTarget({ draft, map: null });
  }, [profile, resetEditorSession]);

  // 저장된 맵 세션. 그 맵의 임시저장본이 있으면 복구 창을 띄운다.
  const openSession = useCallback((m: MapRow): boolean => {
    const lv = decodeLevelCode(m.code);
    if (!lv) return false;
    setLevel(lv);
    setSavedCode(encodeLevelCode(lv));
    setSavedTitle(m.title ?? '제목 없음');
    invalidatedSolutionsForRef.current = null;
    draftOwnerRef.current = null;
    setSession(m.id); setEditTitle(m.title ?? '제목 없음'); setPublished(m.published); setEditRow(m);
    setEditFolderId(m.folder_id);
    resetEditorSession();
    const draft = profile ? readEditorDraft(profile.id, m.id) : null;
    if (draft?.mapId === m.id && decodeLevelCode(draft.code)) setDraftRestoreTarget({ draft, map: m });
    return true;
  }, [profile, resetEditorSession]);

  // 새 맵을 처음 저장하면(저장·허브에 올리기·플레이 중 풀이 등록) 지금 기록 항목의 '/editor/new…'
  // 주소를 그 맵 주소로 바꿔 적고 에디터(플레이)에 머문다.
  const adoptSavedNewMap = useCallback((id: string) => {
    savedFromNewRef.current = id;
    const newPath = editorPath(NEW_MAP);
    const { path } = splitUrl(nav.currentUrl());
    const target = editorPath(id);
    if (path === `${newPath}/play` || path === `${newPath}/play/`) {
      // 바로 앞의 '/editor/new' 항목도 돌아가면 이 맵 주소로 바뀌므로 from 을 맞춰 둔다(끝내기 = 뒤로).
      const { from } = nav.readNavState();
      nav.go(`${target}/play?${new URLSearchParams({ returnTo: target })}`, {
        replace: true,
        state: from === newPath ? { from: target } : undefined,
      });
    } else if (path === newPath || path === `${newPath}/`) {
      onEditRouteChange(id, { replace: true });
    }
  }, [onEditRouteChange]);

  // '+ 새 맵 만들기'·폴더의 '+ 새 맵' = push '/editor/new'. 저장 안 한 새 맵 임시저장본이 이미
  // 있으면 빈 맵으로 덮지 않고 복구 창부터 띄운다('삭제'를 고르면 그때 빈 새 맵).
  const openNew = (folderId: string | null = null) => {
    const startBlank = () => { beginNewSession(folderId, false); onEditRouteChange(NEW_MAP); };
    const draft = profile ? readEditorDraft(profile.id, null) : null;
    if (draft && decodeLevelCode(draft.code)) {
      setDraftRestoreTarget({ draft, map: null, afterDiscard: startBlank });
      return;
    }
    startBlank();
  };

  const openExisting = (m: MapRow) => {
    // 같은 맵이 메모리에 저장 안 한 작업과 함께 열려 있으면(뒤로가기로 목록에 온 경우) 그 작업을 이어 간다.
    // 그 밖에는 목록의 최신 행으로 새로 연다 — 폴더로 옮기기·빼기·다시 공개 등이 반영되게.
    const keepWork = session === m.id && (encodeLevelCode(level) !== savedCode || editTitle !== savedTitle);
    if (!keepWork && !openSession(m)) { alert('맵 코드를 해석할 수 없어 열 수 없습니다.'); return; }
    onEditRouteChange(m.id);
  };

  // 메모리 세션의 맵 행이 목록에서 바뀌었으면(폴더로 옮기기·빼기, 다시 공개, 폴더 삭제 등) 폴더·공개 상태·
  // 행을 최신 값으로 맞춘다 — 레이아웃·제목·실행취소 기록은 그대로. 방금 저장해 세션 쪽이 더 새로우면
  // (목록을 다시 받기 전) 덮지 않는다.
  const listedRow = editId ? maps.find((m) => m.id === editId) ?? null : null;
  if (listedRow && editRow && listedRow.id === editRow.id && listedRow !== editRow) {
    const listedAt = Date.parse(listedRow.updated_at);
    const sessionAt = Date.parse(editRow.updated_at);
    const newer = listedAt > sessionAt
      || (listedAt === sessionAt && (listedRow.folder_id !== editRow.folder_id || listedRow.published !== editRow.published));
    if (newer) {
      setEditRow(listedRow);
      setPublished(listedRow.published);
      setEditFolderId(listedRow.folder_id ?? null);
    }
  }

  // 주소 → 세션. 주소로 바로 열기·새로고침·뒤로/앞으로 모두 여기서 맞춘다. effect 안에서는 replace 만.
  useEffect(() => {
    if (!profile) return;
    if (!editMapId) {
      // 옛 주소 '/editor/play' 는 새 맵 에디터로 바꿔 적는다 — 빈 맵으로 플레이하지 않는다.
      if (playing) queueMicrotask(() => onEditRouteChange(NEW_MAP, { replace: true }));
      return;
    }
    if (session === editMapId) return;
    if (editMapId === NEW_MAP) {
      if (session && session === savedFromNewRef.current) {
        queueMicrotask(() => adoptSavedNewMap(session));
        return;
      }
      // 새로 마운트한 '/editor/new/play' 는 '/editor/new' 로 바꿔 적은 뒤 아래를 따른다.
      if (playing) { queueMicrotask(() => onEditRouteChange(NEW_MAP, { replace: true })); return; }
      // 임시저장본이 있으면 복구 창, 없으면 빈 새 맵.
      queueMicrotask(() => beginNewSession(null, true));
      return;
    }
    if (loading || loadError) return;
    const map = maps.find((m) => m.id === editMapId);
    queueMicrotask(() => {
      if (map && openSession(map)) return;
      // 남의 맵·없는 맵은 안내하고 목록으로 replace — 뒤로가기에 다시 튕겨 갇히지 않게.
      showFlash(map ? '맵 코드를 해석할 수 없어 열 수 없습니다' : '이 맵을 편집할 권한이 없습니다');
      onEditRouteChange(null, { replace: true });
    });
  }, [adoptSavedNewMap, beginNewSession, editMapId, loadError, loading, maps, onEditRouteChange, openSession, playing, profile, session, showFlash]);

  // An unsaved brand-new map's cache is offered from the studio list once per mount —
  // unless that new map is the one still open in memory (it owns that draft).
  // Saved-map drafts are offered when that map is opened.
  useEffect(() => {
    if (!profile || loading || view !== 'list' || session === NEW_MAP || checkedNewDraftForRef.current === profile.id) return;
    checkedNewDraftForRef.current = profile.id;
    const draft = readEditorDraft(profile.id, null);
    if (draft && decodeLevelCode(draft.code)) {
      queueMicrotask(() => setDraftRestoreTarget({ draft, map: null }));
    }
  }, [loading, profile, session, view]);

  // 목록·폴더 주소 정리(잘못된 쪽, 없어진 폴더 → replace)와 '맵 제작' 탭이 돌아올 목록 기억.
  // 조회가 실패한 동안에는 하지 않는다 — 빈 목록 기준으로 쪽·폴더를 지우지 않게.
  useEffect(() => {
    if (editMapId || playing || loading || loadError || foldersError || !isStudioListPath(splitUrl(location).path)) return;
    const folderOk = !currentFolderId || folders.some((f) => f.id === currentFolderId);
    const canonical = listUrl(STUDIO_BASE, { page: visiblePage, folder: folderOk ? currentFolderId : null });
    if (canonical !== location) nav.go(canonical, { replace: true });
    nav.rememberListUrl('studio', listUrl(STUDIO_BASE, { page: visiblePage }));
  }, [currentFolderId, editMapId, folders, foldersError, loadError, loading, location, playing, visiblePage]);

  // 목록·폴더로 돌아오면 그 항목의 스크롤을 되살린다.
  nav.useScrollRestore(!loading && (view === 'list' || view === 'folder'));

  const currentCode = encodeLevelCode(level);
  // 플레이 화면에서도 에디터 변경이 저장 안 됐으면 dirty — 탭·로그아웃은 경고, 새로고침은 beforeunload.
  const isDirty = (view === 'editor' || view === 'play') && (currentCode !== savedCode || editTitle !== savedTitle);

  // Write every editor change immediately. Keeping this synchronous means a tab
  // kill or browser crash still leaves the most recent completed edit available.
  // 새 맵 임시저장본은 저장 성공·복구 창 '삭제'·경고창 '저장 안 함' 때만 지운다 — 화면 전환·
  // 새 마운트·손대지 않은 화면이 덮거나 지우지 않는다. 저장된 맵은 이 세션이 쓴 임시저장본을
  // 변경을 다 되돌려 저장본과 같아졌을 때도 지운다.
  useEffect(() => {
    if (!profile || !session || (view !== 'editor' && view !== 'play') || draftRestoreTarget) return;
    if (!isDirty) {
      if (editId && draftOwnerRef.current === session) {
        removeEditorDraft(profile.id, editId);
        draftOwnerRef.current = null;
      }
      return;
    }
    writeEditorDraft(profile.id, {
      version: 1,
      mapId: editId,
      folderId: editFolderId,
      title: editTitle,
      code: currentCode,
      savedCode,
      savedTitle,
      updatedAt: new Date().toISOString(),
    });
    draftOwnerRef.current = session;
  }, [currentCode, draftRestoreTarget, editFolderId, editId, editTitle, isDirty, profile, savedCode, savedTitle, session, view]);

  // 경고창 '저장 안 함': 임시저장본을 지우고 메모리의 작업도 버린다 — 뒤로/앞으로로 되살아나지 않는다.
  const discardCurrentDraft = useCallback(() => {
    if (profile) removeEditorDraft(profile.id, editId);
    draftOwnerRef.current = null;
    if (editId && editRow) openSession(editRow);   // 저장된 맵 → 저장된 내용으로
    else beginNewSession(editFolderId, false);     // 새 맵 → 빈 새 맵
  }, [beginNewSession, editFolderId, editId, editRow, openSession, profile]);

  const discardRestoreDraft = () => {
    if (!draftRestoreTarget || !profile) return;
    removeEditorDraft(profile.id, draftRestoreTarget.draft.mapId);
    const after = draftRestoreTarget.afterDiscard;
    setDraftRestoreTarget(null);
    after?.();
  };

  const restoreDraft = () => {
    if (!draftRestoreTarget) return;
    const levelFromDraft = decodeLevelCode(draftRestoreTarget.draft.code);
    if (!levelFromDraft) { discardRestoreDraft(); return; }

    const { draft, map } = draftRestoreTarget;
    setDraftRestoreTarget(null);
    setLevel(levelFromDraft);
    setEditTitle(draft.title);
    setSavedCode(map ? encodeLevelCode(decodeLevelCode(map.code) ?? levelFromDraft) : draft.savedCode);
    setSavedTitle(map ? (map.title ?? '제목 없음') : draft.savedTitle);
    // 복구한 내용은 이제 이 세션의 임시저장본이다.
    draftOwnerRef.current = map ? map.id : NEW_MAP;
    resetEditorSession();

    if (map) {
      setSession(map.id); setPublished(map.published); setEditRow(map); setEditFolderId(map.folder_id);
    } else {
      setSession(NEW_MAP); setPublished(false); setEditRow(null); setEditFolderId(draft.folderId);
      // 목록에서 띄운 복구 창이면 새 맵 에디터('/editor/new')로 간다.
      if (editMapId !== NEW_MAP) onEditRouteChange(NEW_MAP);
    }
    showFlash('임시 저장한 맵을 복구했습니다');
  };

  const persistCurrentMap = async (): Promise<{ row: MapRow; codeChanged: boolean } | null> => {
    if (!profile) return null;
    const code = encodeLevelCode(level);
    const codeChanged = !!editId && code !== savedCode;
    if (editId) {
      const row = await updateMap(editId, { title: editTitle || null, code });
      // Layout changed → every recorded 풀이 no longer solves it. Wipe them.
      if (codeChanged) await deleteSolutionsForMap(editId);
      setEditRow(row);
      setSavedCode(code);
      setSavedTitle(editTitle);
      removeEditorDraft(profile.id, editId);
      draftOwnerRef.current = null;
      await refresh();
      return { row, codeChanged };
    }

    // A new map created inside a folder inherits the folder's published state so it
    // stays visible/hidden together with the folder (keeps the member invariant).
    const folderPub = editFolderId ? (folders.find((f) => f.id === editFolderId)?.published ?? false) : false;
    const row = await insertMap({
      owner_id: profile.id, title: editTitle || null, code,
      published: folderPub,
      published_at: folderPub ? new Date().toISOString() : null,
      // Only reference folder_id when actually filing into a folder — keeps a plain
      // new-map save working even before the folder_id column migration is applied.
      ...(editFolderId ? { folder_id: editFolderId } : {}),
    });
    setSession(row.id); setPublished(folderPub); setEditRow(row);
    setSavedCode(code);
    setSavedTitle(editTitle);
    removeEditorDraft(profile.id, null);
    draftOwnerRef.current = null;
    adoptSavedNewMap(row.id);
    await refresh();
    return { row, codeChanged: false };
  };

  const save = async () => {
    try {
      const persisted = await persistCurrentMap();
      if (persisted) {
        showFlash(persisted.codeChanged ? '저장됨 (맵이 바뀌어 기존 풀이는 삭제)' : '저장됨');
      }
    } catch (e) { alert('저장 실패: ' + (e as Error).message); }
  };

  const invalidateSolutionsForLayoutEdit = useCallback((mapId: string) => {
    if (invalidatedSolutionsForRef.current === mapId) return;
    invalidatedSolutionsForRef.current = mapId;
    void deleteSolutionsForMap(mapId).then(
      () => showFlash('맵 수정으로 기존 풀이를 삭제했습니다'),
      (error: unknown) => {
        // Retry on a later edit if the immediate invalidation request failed.
        invalidatedSolutionsForRef.current = null;
        console.error(error);
        showFlash('기존 풀이 삭제에 실패했습니다. 다시 수정하거나 저장해 주세요.');
      },
    );
  }, [showFlash]);

  const setEditorLevel = useCallback((nextLevel: Level) => {
    setLevel(nextLevel);
    if (editId && encodeLevelCode(nextLevel) !== savedCode) {
      invalidateSolutionsForLayoutEdit(editId);
    }
  }, [editId, invalidateSolutionsForLayoutEdit, savedCode]);

  // ---- folder actions ----
  const createFolder = async () => {
    if (!profile || !newFolderName.trim()) return;
    try {
      const f = await insertFolder({ owner_id: profile.id, name: newFolderName.trim() });
      setShowNewFolder(false); setNewFolderName('');
      await refresh();
      openFolder(f.id); // jump into the new folder
    } catch (e) { alert('폴더 생성 실패: ' + (e as Error).message); }
  };

  const doPublishFolder = async (p: FolderFormPayload) => {
    if (!currentFolderId) return;
    await publishFolder(currentFolderId, {
      name: p.name, author_name: p.author_name, comment: p.comment,
      created_at: registeredToISO(p.registered_on),
    });
    setShowPublishFolder(false);
    showFlash('폴더를 허브에 올렸습니다');
    refresh();
  };

  const saveFolderMeta = async (p: FolderFormPayload) => {
    if (!currentFolderId) return;
    await updateFolder(currentFolderId, {
      name: p.name, author_name: p.author_name, comment: p.comment,
      created_at: registeredToISO(p.registered_on),
    });
    setEditingFolder(false);
    showFlash('폴더 정보를 수정했습니다');
    refresh();
  };

  const doDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setDeleting(true);
    try {
      await deleteFolder(deleteFolderTarget.id);
      setDeleteFolderTarget(null);
      backToList();
      refresh();
    } catch (e) { alert('폴더 삭제 실패: ' + (e as Error).message); }
    finally { setDeleting(false); }
  };

  const addMapToFolder = async (mapId: string) => {
    if (!currentFolderId) return;
    setBusyId(mapId);
    // Append after the maps already in the folder, then renumber the whole folder so a
    // never-reordered folder (all sort_order null) doesn't push the newcomer to the front.
    const ordered = [...folderMaps.map((m) => m.id), mapId];
    try {
      await moveMapToFolder(mapId, currentFolderId, currentFolder?.published ?? false, ordered.length - 1);
      await reorderMapsInFolder(ordered);
      refresh();
    }
    catch (e) { alert('맵 이동 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  const removeMapFromFolder = async (mapId: string) => {
    setBusyId(mapId);
    try { await moveMapToFolder(mapId, null, false); refresh(); }
    catch (e) { alert('맵 이동 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  // ---- reordering maps inside a folder by dragging one tile onto another ----
  const clearDrag = () => { setDragMapId(null); setDropTargetId(null); };

  // Move `draggedId` to the slot `targetId` currently occupies, then renumber the
  // whole folder. The new order is applied to local state first so the grid follows
  // the drop immediately; a failed save falls back to the server order.
  const moveMapBefore = async (draggedId: string, targetId: string) => {
    const ids = folderMaps.map((m) => m.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    const rank = new Map(ids.map((id, i) => [id, i]));
    setMaps((prev) => prev.map((m) => (rank.has(m.id) ? { ...m, sort_order: rank.get(m.id)! } : m)));
    setReordering(true);
    try {
      await reorderMapsInFolder(ids);
      showFlash('순서를 저장했습니다');
    } catch (e) {
      alert('순서 저장 실패: ' + (e as Error).message
        + '\n(supabase/schema.sql 의 sort_order 마이그레이션이 아직 적용되지 않았을 수 있어요)');
      refresh();
    } finally { setReordering(false); }
  };

  const onTileDragStart = (e: DragEvent, mapId: string) => {
    setDragMapId(mapId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', mapId); // Firefox needs payload to start a drag
  };

  const onTileDragOver = (e: DragEvent, mapId: string) => {
    if (!dragMapId) return;
    e.preventDefault();                 // allow the drop
    e.dataTransfer.dropEffect = 'move';
    if (mapId !== dropTargetId) setDropTargetId(mapId);
  };

  const onTileDrop = (e: DragEvent, mapId: string) => {
    e.preventDefault();
    const dragged = dragMapId;
    clearDrag();
    if (dragged && dragged !== mapId) void moveMapBefore(dragged, mapId);
  };

  // ---- 목록·폴더 이동 (주소) ----
  // 쪽 이동·폴더 열기 = push(뒤로 = 직전 목록). '← 내 맵'·'← 목록'·'← 폴더' = 돌아가기:
  // 바로 앞 항목이 그 목록·폴더면 뒤로, 아니면(주소로 바로 연 경우) 그 주소로 push.
  const goPage = (p: number) => nav.go(listUrl(STUDIO_BASE, { page: p }));
  const openFolder = (folderId: string) => nav.go(listUrl(STUDIO_BASE, { page: visiblePage, folder: folderId }));
  const backToList = () => nav.goBack(listUrl(STUDIO_BASE, { page: visiblePage }), isStudioListUrl);

  const leaveEditor = () => guard.attempt(() => {
    if (editFolderId) {
      const folderId = editFolderId;
      nav.goBack(listUrl(STUDIO_BASE, { folder: folderId }), (from) => isStudioFolderUrl(from, folderId));
    } else {
      nav.goBack(nav.tabUrl('studio', STUDIO_BASE), isStudioListUrl);
    }
  });

  // 게임에 넣을 레벨 JSON 을 보여주는 모달 (복사만 하면 뭐가 들어갔는지 확인이 안 된다)
  const [showExport, setShowExport] = useState(false);

  const testPlay = () => onPlayRouteChange(editId);

  const doPublish = async (p: UploadPayload) => {
    if (!profile) return;
    const created_at = registeredToISO(p.registered_on);
    // Preserve the original publish time when re-publishing a map that was already
    // published before (e.g. after being taken private); only stamp fresh on the
    // first publish.
    const published_at = editRow?.published_at ?? new Date().toISOString();
    if (editId) {
      const codeChanged = p.code !== savedCode;
      const updated = await updateMap(editId, {
        title: p.title, author_name: p.author_name, comment: p.comment,
        author_difficulty: p.difficulty, code: p.code, created_at, published: true, published_at,
      });
      if (codeChanged) await deleteSolutionsForMap(editId);
      setPublished(true); setEditRow(updated);
    } else {
      const row = await insertMap({
        owner_id: profile.id,
        author_name: p.author_name, code: p.code, title: p.title,
        comment: p.comment, author_difficulty: p.difficulty, created_at, published: true, published_at,
      });
      setSession(row.id); setPublished(true); setEditRow(row);
      adoptSavedNewMap(row.id);
    }
    setSavedCode(p.code);
    setEditTitle(p.title ?? '');
    setSavedTitle(p.title ?? '');
    removeEditorDraft(profile.id, editId);
    draftOwnerRef.current = null;
    setShowPublish(false);
    showFlash('허브에 올렸습니다');
    refresh();
  };

  // Re-publish a previously-published (now private) map with a single click.
  // Just flips `published` back on — every other field (comment, 난이도, status,
  // 공개 시각) is left untouched, so nothing is lost.
  const republish = async (m: MapRow) => {
    setBusyId(m.id);
    try { await updateMap(m.id, { published: true }); showFlash('다시 공개했습니다'); refresh(); }
    catch (e) { alert('공개 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  // Save a clear recorded in the studio as the owner's solution. Registering is an
  // explicit action after the clear, so a new or modified layout is persisted first.
  const saveStudioSolution = async (moves: string, turnCount: number) => {
    if (!profile) return;
    const currentCode = encodeLevelCode(level);
    let mapId = editId;
    if (!mapId || currentCode !== savedCode) {
      const persisted = await persistCurrentMap();
      mapId = persisted?.row.id ?? null;
    }
    if (!mapId) throw new Error('맵을 저장하지 못해 풀이를 등록할 수 없습니다.');
    await insertSolution({
      map_id: mapId,
      author_id: profile.id,
      author_name: editRow?.author_name || profile.name,
      moves,
      turn_count: turnCount,
    });
    invalidatedSolutionsForRef.current = null;
    exitPlayRef.current();   // 들어오기 전 에디터로 돌아가기(뒤로) — 화면은 주소를 따른다
    showFlash('풀이가 등록되었습니다');
  };

  const doDeleteMap = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMap(deleteTarget.id);
      if (profile) removeEditorDraft(profile.id, deleteTarget.id);
      // 메모리에 열려 있던 맵이면 세션도 닫는다 — 앞으로가기로 지운 맵 에디터가 되살아나지 않게.
      if (session === deleteTarget.id) setSession(null);
      setDeleteTarget(null);
      refresh();
    }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); }
    finally { setDeleting(false); }
  };

  // --- unsaved-changes guard: expose isDirty/save to the app via a stable api
  // that delegates to the latest closures. ---
  const latest = useRef<StudioApi>({ isDirty: () => false, save: async () => {}, discard: () => {} });

  useEffect(() => {
    latest.current = { isDirty: () => isDirty, save, discard: discardCurrentDraft };
  });

  useEffect(() => {
    const api: StudioApi = {
      isDirty: () => latest.current.isDirty(),
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    };
    guard.register(api);
    return () => guard.register(null);
  }, [guard]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // A saved-map tile, shared by the flat list and the folder view. In a folder the
  // per-card action is "폴더에서 빼기"; in the root list it's the "다시 공개" shortcut.
  const renderMapTile = (m: MapRow, context: 'list' | 'folder') => {
    const dnd = context === 'folder';
    const cls = [
      'studio-card',
      dnd ? 'studio-card-draggable' : '',
      dnd && dragMapId === m.id ? 'is-dragging' : '',
      dnd && dropTargetId === m.id && dragMapId !== m.id ? 'is-drop-target' : '',
    ].filter(Boolean).join(' ');
    return (
    <div
      className={cls}
      key={m.id}
      onClick={() => openExisting(m)}
      draggable={dnd}
      onDragStart={dnd ? (e) => onTileDragStart(e, m.id) : undefined}
      onDragOver={dnd ? (e) => onTileDragOver(e, m.id) : undefined}
      onDrop={dnd ? (e) => onTileDrop(e, m.id) : undefined}
      onDragEnd={dnd ? clearDrag : undefined}
    >
      <div className="studio-card-thumb">
        <MapThumbnail code={m.code} />
        {dnd && <span className="studio-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>}
        {m.published
          ? <span className={`badge badge-${m.status} studio-card-badge`}>{STATUS_LABEL[m.status]}</span>
          : m.published_at
            ? <span className="badge badge-private studio-card-badge">비공개</span>
            : <span className="badge badge-draft studio-card-badge">제작중</span>}
      </div>
      <div className="studio-card-body">
        <div className="studio-card-title">{m.title || '제목 없음'}</div>
        <div className="studio-card-meta">
          {m.published ? '허브 공개' : m.published_at ? '비공개' : '제작중'} · {formatDate(m.updated_at)}
        </div>
        {/* Buttons sit inside a draggable card — drag must start from the card, not
            from a button, or a click-and-hold on 삭제 would begin a reorder. */}
        <div className="studio-card-actions" draggable={false} onDragStart={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => openExisting(m)}>이어서 만들기</button>
          {context === 'list' && !m.published && m.published_at && (
            <button className="btn btn-sm btn-primary" onClick={() => republish(m)} disabled={busyId === m.id}>다시 공개</button>
          )}
          {context === 'folder' && (
            <button className="btn btn-sm" onClick={() => removeMapFromFolder(m.id)} disabled={busyId === m.id}>폴더에서 빼기</button>
          )}
          <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(m)}>삭제</button>
        </div>
      </div>
    </div>
    );
  };

  const newFolderModal = showNewFolder && (
    <div className="modal-backdrop" onClick={() => setShowNewFolder(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 className="modal-title">새 맵 폴더 만들기</h3>
        <label className="field-label">폴더 이름</label>
        <input className="field-input" autoFocus value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); }}
          placeholder="예: 튜토리얼 챕터" />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>취소</button>
          <button className="btn btn-primary" onClick={createFolder} disabled={!newFolderName.trim()}>만들기</button>
        </div>
      </div>
    </div>
  );

  const mapDeleteModal = deleteTarget && (
    <ConfirmModal
      title="맵 삭제"
      message={<>'{deleteTarget.title ?? '제목 없음'}' 맵을 삭제할까요? 되돌릴 수 없습니다.</>}
      confirmLabel="삭제"
      danger
      busy={deleting}
      onConfirm={doDeleteMap}
      onCancel={() => setDeleteTarget(null)}
    />
  );

  const draftRestoreModal = draftRestoreTarget && (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="draft-restore-title" style={{ maxWidth: 460 }}>
        <h3 className="modal-title" id="draft-restore-title">임시 저장한 맵이 있어요</h3>
        <p className="unsaved-text">
          {draftRestoreTarget.map
            ? `'${draftRestoreTarget.map.title || '제목 없음'}' 맵의 저장하지 않은 변경사항을 찾았습니다.`
            : '저장하지 않고 종료한 새 맵을 찾았습니다.'}
          <br />마지막 임시 저장 시각: {new Date(draftRestoreTarget.draft.updatedAt).toLocaleString('ko-KR')}
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={discardRestoreDraft}>삭제</button>
          <button className="btn btn-primary" onClick={restoreDraft}>복구</button>
        </div>
      </div>
    </div>
  );

  // ---------- play submode ----------
  if (view === 'play') {
    return (
      <>
        <SolutionRecorder
          key={`${profile?.id}:${editId}:${currentCode}`}
          code={currentCode}
          mapId={editId}
          playerId={profile?.id}
          title={`플레이 · ${editTitle || '맵'}`}
          backLabel="에디터로"
          onSave={saveStudioSolution}
          onCancel={() => onExitPlay()}
        />
        {draftRestoreModal}
      </>
    );
  }

  // ---------- editor submode ----------
  if (view === 'editor') {
    return (
      <div className="studio-editor">
        <div className="studio-toolbar">
          <button className="btn btn-ghost" onClick={leaveEditor}>← {editFolderId ? '폴더' : '목록'}</button>
          <input
            className="field-input studio-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="맵 제목"
          />
          {published && <span className="badge badge-accepted">허브 공개됨</span>}
          {editFolderId && <span className="badge badge-draft">📁 폴더 맵</span>}
          {isDirty && <span className="studio-dirty">● 저장 안 됨 · 임시 저장됨</span>}
          <div className="studio-toolbar-spacer" />
          {flash && <span className="studio-flash">{flash}</span>}
          <button className="btn" onClick={() => setShowExport(true)}
            title="snowmen-adventure 의 levels/L<번호>.json 에 그대로 붙여넣을 JSON 을 보여줍니다">
            📋 게임에 넣기
          </button>
          <button className="btn studio-toolbar-icon-btn" onClick={testPlay} title="플레이" aria-label="플레이"><ToolbarIcon name="play" /></button>
          <div className="studio-toolbar-editor-actions" aria-label="에디터 동작">
            <button className="btn btn-sm studio-toolbar-icon-btn" onClick={() => editorRef.current?.undo()} disabled={!editorHistory.canUndo} title="실행취소" aria-label="실행취소"><ToolbarIcon name="undo" /></button>
            <button className="btn btn-sm studio-toolbar-icon-btn" onClick={() => editorRef.current?.redo()} disabled={!editorHistory.canRedo} title="다시 실행" aria-label="다시 실행"><ToolbarIcon name="redo" /></button>
            <button className="btn btn-sm studio-toolbar-icon-btn" onClick={() => editorRef.current?.reset()} title="초기화" aria-label="초기화"><ToolbarIcon name="reset" /></button>
            <button className="btn btn-sm studio-toolbar-icon-btn studio-toolbar-divider-before" onClick={() => editorRef.current?.exportCode()} title="레벨 코드 내보내기" aria-label="레벨 코드 내보내기"><ToolbarIcon name="export" /></button>
            <button className="btn btn-sm studio-toolbar-icon-btn" onClick={() => editorRef.current?.openImport()} title="레벨 코드 불러오기" aria-label="레벨 코드 불러오기"><ToolbarIcon name="import" /></button>
          </div>
          <button className="btn btn-primary studio-toolbar-icon-btn studio-toolbar-divider-before" onClick={save} title="저장" aria-label="저장"><ToolbarIcon name="save" /></button>
          {/* Folder maps are published together with their folder, not individually. */}
          {!editFolderId && (
            <button className="btn btn-primary" onClick={() => setShowPublish(true)}>🚀 허브에 올리기</button>
          )}
        </div>

        <div className="studio-editor-body">
          <Editor
            key={editorEpoch}
            ref={editorRef}
            level={level}
            setLevel={setEditorLevel}
            onHistoryChange={setEditorHistory}
            initialSession={editorSession ?? undefined}
            onSessionChange={setEditorSession}
          />
        </div>

        {showPublish && (
          <UploadForm
            title="허브에 올리기"
            submitLabel="허브에 올리기"
            lockCode
            initial={{
              // Prefill saved metadata so re-publishing keeps the author, comment,
              // 출제자 난이도 and 등록일 that were set before (empty for a new map).
              author_name: editRow?.author_name ?? profile?.name ?? '',
              code: encodeLevelCode(level),
              title: editTitle,
              comment: editRow?.comment ?? '',
              difficulty: editRow?.author_difficulty ?? null,
              registered_on: editRow ? isoToDateStr(editRow.created_at) : undefined,
            }}
            onSubmit={doPublish}
            onCancel={() => setShowPublish(false)}
          />
        )}

        {showExport && (
          <GameLevelExport
            code={encodeLevelCode(level)}
            title={editTitle}
            onClose={() => setShowExport(false)}
          />
        )}
        {draftRestoreModal}
      </div>
    );
  }

  // ---------- opening: 주소의 맵을 여는 중 / 내 맵 목록을 불러오지 못함 ----------
  if (view === 'opening') {
    return (
      <div className="studio-list">
        {loadError && editMapId && editMapId !== NEW_MAP ? (
          <div className="studio-empty">
            맵을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => { void refresh(); }}>다시 시도</button>
            </div>
          </div>
        ) : (
          <div className="studio-empty">불러오는 중…</div>
        )}
        {draftRestoreModal}
      </div>
    );
  }

  // ---------- folder submode (inside one of my folders) ----------
  if (view === 'folder' && currentFolder) {
    return (
      <div className="studio-list">
        <div className="studio-list-head">
          <div className="studio-folder-head-left">
            <button className="btn btn-ghost" onClick={backToList}>← 내 맵</button>
            <div>
              <h2>📁 {currentFolder.name || '이름 없는 폴더'}</h2>
              <p className="studio-sub">
                {currentFolder.published ? '허브에 공개된 폴더' : '제작 중인 폴더'} · 맵 {folderMaps.length}개
                {folderMaps.length > 1 && ' · 카드를 드래그해 순서를 바꿀 수 있어요'}
                {reordering && <span className="studio-reordering"> 순서 저장 중…</span>}
              </p>
            </div>
          </div>
          <div className="studio-list-head-actions">
            {flash && <span className="studio-flash">{flash}</span>}
            <button className="btn" onClick={() => setShowMovePicker(true)}>맵 옮겨 넣기</button>
            <button className="btn" onClick={() => setEditingFolder(true)}>폴더 정보 수정</button>
            <button className="btn btn-danger" onClick={() => setDeleteFolderTarget(currentFolder)}>폴더 삭제</button>
            <button className="btn btn-primary" onClick={() => openNew(currentFolder.id)}>+ 새 맵</button>
            <button className="btn btn-primary" onClick={() => setShowPublishFolder(true)}>
              {currentFolder.published ? '허브 정보 갱신' : '허브에 올리기'}
            </button>
          </div>
        </div>

        {folderMaps.length === 0 ? (
          <div className="studio-empty">
            이 폴더에는 아직 맵이 없습니다. <b>새 맵</b>을 만들거나 <b>맵 옮겨 넣기</b>로 채워보세요.
          </div>
        ) : (
          <div className="studio-grid">
            {folderMaps.map((m) => renderMapTile(m, 'folder'))}
          </div>
        )}

        {showMovePicker && (
          <div className="modal-backdrop" onClick={() => setShowMovePicker(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <h3 className="modal-title">폴더로 옮길 맵 선택</h3>
              {rootMaps.length === 0 ? (
                <p className="studio-sub">폴더 밖에 옮길 수 있는 맵이 없습니다.</p>
              ) : (
                <div className="studio-move-list">
                  {rootMaps.map((m) => (
                    <div className="studio-move-row" key={m.id}>
                      <div className="studio-move-thumb"><MapThumbnail code={m.code} /></div>
                      <span className="studio-move-title">{m.title || '제목 없음'}</span>
                      <button className="btn btn-sm btn-primary" disabled={busyId === m.id} onClick={() => addMapToFolder(m.id)}>넣기</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowMovePicker(false)}>닫기</button>
              </div>
            </div>
          </div>
        )}

        {showPublishFolder && (
          <FolderForm
            title={currentFolder.published ? '허브 정보 갱신' : '폴더를 허브에 올리기'}
            submitLabel={currentFolder.published ? '갱신' : '허브에 올리기'}
            initial={{
              name: currentFolder.name,
              author_name: currentFolder.author_name ?? profile?.name ?? '',
              comment: currentFolder.comment ?? '',
              registered_on: currentFolder.published ? isoToDateStr(currentFolder.created_at) : undefined,
            }}
            onSubmit={doPublishFolder}
            onCancel={() => setShowPublishFolder(false)}
          />
        )}

        {editingFolder && (
          <FolderForm
            title="폴더 정보 수정"
            submitLabel="저장"
            initial={{
              name: currentFolder.name,
              author_name: currentFolder.author_name ?? '',
              comment: currentFolder.comment ?? '',
              registered_on: isoToDateStr(currentFolder.created_at),
            }}
            onSubmit={saveFolderMeta}
            onCancel={() => setEditingFolder(false)}
          />
        )}

        {deleteFolderTarget && (
          <ConfirmModal
            title="폴더 삭제"
            message={<>'{deleteFolderTarget.name || '이름 없는 폴더'}' 폴더를 삭제할까요? 폴더 안의 맵은 삭제되지 않고 <b>단독 맵</b>(비공개)으로 남습니다.</>}
            confirmLabel="삭제"
            danger
            busy={deleting}
            onConfirm={doDeleteFolder}
            onCancel={() => setDeleteFolderTarget(null)}
          />
        )}

        {mapDeleteModal}
        {draftRestoreModal}
      </div>
    );
  }

  // ---------- list submode ----------
  return (
    <div className="studio-list">
      <div className="studio-list-head">
        <div>
          <h2>내 맵</h2>
          <p className="studio-sub">제작 중인 맵과 폴더를 관리하고, 이어서 만들거나 허브에 올릴 수 있어요.</p>
        </div>
        <div className="studio-list-head-actions">
          {flash && <span className="studio-flash">{flash}</span>}
          <button className="btn" onClick={() => setShowNewFolder(true)}>+ 새 맵 폴더 만들기</button>
          <button className="btn btn-primary" onClick={() => openNew(null)}>+ 새 맵 만들기</button>
        </div>
      </div>

      {loading ? (
        <div className="studio-empty">불러오는 중…</div>
      ) : (loadError && maps.length === 0) || (foldersError && listEntries.length === 0) ? (
        <div className="studio-empty">
          목록을 불러오지 못했습니다.{' '}
          <button className="btn btn-sm" onClick={() => { void refresh(); }}>다시 시도</button>
        </div>
      ) : listEntries.length === 0 ? (
        <div className="studio-empty">
          아직 저장한 맵이 없습니다. <b>새 맵 만들기</b>로 시작하세요.
        </div>
      ) : (
        <>
        <div className="studio-grid">
          {pagedEntries.map((e) => e.kind === 'folder' ? (
            <div
              className="studio-card studio-folder-card"
              key={`f-${e.folder.id}`}
              onClick={() => openFolder(e.folder.id)}
              role="link"
              tabIndex={0}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFolder(e.folder.id); } }}
            >
              <div className="studio-card-thumb folder-card-thumb">
                <FolderGlyph />
                <span className="badge folder-card-badge">📁 {maps.filter((m) => m.folder_id === e.folder.id).length}</span>
                {e.folder.published && <span className="badge badge-accepted studio-card-badge">허브 공개</span>}
              </div>
              <div className="studio-card-body">
                <div className="studio-card-title">📁 {e.folder.name || '이름 없는 폴더'}</div>
                <div className="studio-card-meta">폴더 · 맵 {maps.filter((m) => m.folder_id === e.folder.id).length}개</div>
              </div>
            </div>
          ) : renderMapTile(e.map, 'list'))}
        </div>
        <Pagination page={visiblePage} pageCount={pageCount} onChange={goPage} />
        </>
      )}

      {newFolderModal}
      {mapDeleteModal}
      {draftRestoreModal}
    </div>
  );
}
