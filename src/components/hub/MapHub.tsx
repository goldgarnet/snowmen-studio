import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClears } from '../../context/ClearsContext';
import { isSolvedByMe } from '../../lib/solvedChecks';
import { listPublishedMaps, insertMap, fetchAllForBackup, registeredToISO } from '../../api/maps';
import { listPublishedFolders } from '../../api/folders';
import type { MapRow, FolderRow } from '../../api/types';
import { STATUS_LABEL, STATUS_FILTERS } from '../../api/types';
import MapCard from './MapCard';
import MapDetail from './MapDetail';
import FolderCard from './FolderCard';
import FolderDetail from './FolderDetail';
import UploadForm, { UploadPayload } from './UploadForm';
import Pagination from '../common/Pagination';
import { getFolder } from '../../api/folders';
import * as nav from '../../lib/nav';
import {
  focusGridItem, getHubCache, isHubListUrl, isHubPath, lastOpenedMapId, listUrl, parseListQuery, setHubCache,
  setLastOpenedMapId, splitUrl, type ListQuery,
} from '../../lib/hubState';
import './hub.css';

const PAGE_SIZE = 8; // 4 columns × 2 rows

interface MapHubProps {
  onOpenMap?: (map: MapRow) => void;
}

function buildBackupText(maps: MapRow[]): string {
  const lines: string[] = [];
  lines.push('# Snowmen Studio — 맵 백업');
  lines.push(`# 생성: ${new Date().toISOString()}`);
  lines.push(`# 총 ${maps.length}개`);
  lines.push('');
  for (const m of maps) {
    lines.push('----------------------------------------');
    lines.push(`제목: ${m.title ?? '(없음)'}`);
    lines.push(`제작자: ${m.author_name ?? '(없음)'}`);
    lines.push(`상태: ${STATUS_LABEL[m.status]}`);
    lines.push(`출제자 난이도: ${m.author_difficulty != null ? m.author_difficulty.toFixed(1) : '(미지정)'}`);
    lines.push(`회의 난이도: ${m.difficulty != null ? m.difficulty.toFixed(1) : '(미결정)'}`);
    lines.push(`공개: ${m.published ? '허브' : '초안'}`);
    lines.push(`생성: ${m.created_at}`);
    if (m.comment) lines.push(`코멘트: ${m.comment}`);
    lines.push(`코드: ${m.code}`);
    lines.push('');
  }
  lines.push('# --- 기계용 JSON ---');
  lines.push(JSON.stringify(maps, null, 2));
  return lines.join('\n');
}

export default function MapHub({ onOpenMap }: MapHubProps) {
  const { profile } = useAuth();
  const clears = useClears();
  const { reload: reloadClears } = clears;
  const myUserId = profile?.id ?? null;
  // 다시 마운트되면 허브 목록 캐시로 바로 그리고('불러오는 중…' 없이) 뒤에서 새로 받는다.
  const [maps, setMaps] = useState<MapRow[]>(() => getHubCache()?.maps ?? []); // all published maps (standalone + members)
  const [folders, setFolders] = useState<FolderRow[]>(() => getHubCache()?.folders ?? []);
  const [loading, setLoading] = useState(() => !getHubCache());
  // 목록을 한 번이라도 제대로 받았나(캐시 포함). 받기 전에는 주소를 고쳐 적지 않는다 — 일시 오류로 빈 목록이
  // 되면 쪽 수가 1로 보여 주소의 쪽·폴더가 지워지기 때문이다.
  const [listOk, setListOk] = useState(() => !!getHubCache());
  const [failed, setFailed] = useState(false);
  // 쪽·필터·검색어·'내가 안 푼 맵'·폴더는 주소 쿼리가 정한다 — 새로고침·주소 공유·뒤로가기에도 그대로.
  const location = nav.useLocation();
  const { page, filter, q: query, unsolved, folder: folderParam } = useMemo(() => parseListQuery(location), [location]);
  // '내가 안 푼 맵'(unsolved=1)을 켠 채 방금 체크한 카드는 keep 에 넣어 바로 사라지지 않게 둔다 —
  // 버튼을 다시 누르면 빠진다 (푼 맵 현황의 같은 거르기와 같은 동작).
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<MapRow | null>(null);
  const [fetchedFolder, setFetchedFolder] = useState<{ id: string; row: FolderRow | null; error?: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!getHubCache()) setLoading(true);
    // '풀었어요' 체크도 허브에 올 때마다 새로 읽는다 (다른 사람 체크 반영). 맵 목록과 따로 돌고,
    // 테이블이 없으면 스스로 기능을 숨긴다.
    void reloadClears();
    const [nextMaps, nextFolders] = await Promise.all([
      listPublishedMaps().catch((e) => { console.error(e); return null; }),
      listPublishedFolders().catch((e) => { console.error(e); return null; }),
    ]);
    // 실패한 쪽은 지금 보이는 값(캐시)을 그대로 둔다.
    if (nextMaps) setMaps(nextMaps);
    if (nextFolders) setFolders(nextFolders);
    const cache = getHubCache();
    if (nextMaps && nextFolders) { setHubCache(nextMaps, nextFolders); setListOk(true); }
    else if (cache && (nextMaps || nextFolders)) setHubCache(nextMaps ?? cache.maps, nextFolders ?? cache.folders);
    setFailed(!nextMaps || !nextFolders);
    setLoading(false);
  }, [reloadClears]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  // Split the published maps: standalone go in the main grid; folder members are
  // grouped under their folder card (for its cover thumbnail + count).
  const standaloneMaps = useMemo(() => maps.filter((m) => !m.folder_id), [maps]);
  const mapsByFolder = useMemo(() => {
    const grouped = new Map<string, MapRow[]>();
    for (const mp of maps) {
      if (!mp.folder_id) continue;
      const arr = grouped.get(mp.folder_id);
      if (arr) arr.push(mp); else grouped.set(mp.folder_id, [mp]);
    }
    return grouped;
  }, [maps]);

  // Unified list of hub entries — standalone maps + folder cards — newest first.
  // Folders have no single review status, so they show only under the '전체' filter.
  // '내가 안 푼 맵'을 켜면 내가 푼 맵을 빼고, 폴더는 안 푼 맵이 하나라도 있을 때만 남긴다.
  const mineOnly = unsolved && clears.status === 'ready';
  // 주소로 바로 연 '내가 안 푼 맵'은 앱이 체크를 처음 읽는 동안 기다린다 — 거르지 않은 목록이 잠깐 보였다가
  // 바뀌거나, 그 사이 쪽 번호가 고쳐 적히지 않게. (체크 기능이 꺼져 있으면 거르기 없이 보인다)
  const waitingClears = unsolved && clears.status === 'loading';
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hidden = (m: MapRow) => mineOnly && !keep.has(m.id) && isSolvedByMe(clears.summarize(m.id), myUserId);
    type Entry =
      | { kind: 'map'; map: MapRow; date: string; pub: string }
      | { kind: 'folder'; folder: FolderRow; date: string; pub: string };
    const list: Entry[] = [];
    for (const m of standaloneMaps) {
      if (filter !== 'all' && m.status !== filter) continue;
      if (q && !`${m.title ?? ''} ${m.author_name ?? ''}`.toLowerCase().includes(q)) continue;
      if (hidden(m)) continue;
      list.push({ kind: 'map', map: m, date: m.created_at, pub: m.published_at ?? '' });
    }
    if (filter === 'all') {
      for (const f of folders) {
        // 검색어는 폴더 이름·제작자뿐 아니라 폴더 안 맵의 제목·제작자도 본다 (결과는 폴더 카드).
        // 폴더 이름이 안 맞으면 검색어에 맞는 안의 맵만 후보 — '내가 안 푼 맵'도 그 후보로 판정한다.
        const inner = mapsByFolder.get(f.id) ?? [];
        const folderHit = !q || `${f.name ?? ''} ${f.author_name ?? ''}`.toLowerCase().includes(q);
        const candidates = folderHit ? inner : inner.filter((m) => `${m.title ?? ''} ${m.author_name ?? ''}`.toLowerCase().includes(q));
        if (!folderHit && candidates.length === 0) continue;
        if (mineOnly && candidates.every(hidden)) continue;
        list.push({ kind: 'folder', folder: f, date: f.created_at, pub: f.published_at ?? '' });
      }
    }
    // Newest 등록일(created_at) first; ties broken by 공개 시각(published_at, minute/second
    // precision) — the same order the SQL uses for maps, now applied across the merged
    // map+folder list so folders slot in at the right spot.
    list.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.pub < b.pub ? 1 : a.pub > b.pub ? -1 : 0);
    return list;
  }, [standaloneMaps, folders, mapsByFolder, filter, query, mineOnly, keep, clears, myUserId]);

  // 통계는 폴더 안에 든 맵까지 포함한 전체 공개 맵(maps) 기준으로 센다.
  // (그리드에 낱개로 보이지 않는 폴더 멤버도 엄연히 허브에 올라온 맵이므로.)
  const stats = useMemo(() => ({
    total: maps.length,
    adopted: maps.filter((m) => m.status === 'accepted').length,
    review: maps.filter((m) => m.status === 'pending').length,
  }), [maps]);

  // Pagination over the filtered list. Filter/search handlers reset to page 1;
  // derive a clamped value if a refresh reduces the number of visible pages.
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const paged = entries.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);

  // 이 허브 목록의 주소. 쪽·필터 = push(뒤로 = 직전 쪽·필터), 검색 = replace(글자마다 기록이 늘지 않게).
  const hubBase = splitUrl(location).path || '/';
  const hubHref = (next: Partial<ListQuery>) => listUrl(hubBase, { page: visiblePage, filter, q: query, unsolved, ...next });
  // 폴더를 연 목록(주소 그대로의 쪽 — 목록을 받기 전이면 쪽 수를 아직 모른다).
  const folderParentHref = listUrl(hubBase, { page, filter, q: query, unsolved });
  const backFromFolder = () => nav.goBack(folderParentHref, isHubListUrl);

  // 폴더 화면('…&folder=<id>'): 폴더 행은 허브 목록(캐시)에서 찾고, 없으면 한 번 직접 묻는다.
  // 직접 묻다가 난 오류는 '없음'이 아니다 — 주소는 그대로 두고 다시 시도를 보인다.
  const listedFolder = folderParam ? folders.find((f) => f.id === folderParam) ?? null : null;
  const fetched = fetchedFolder && fetchedFolder.id === folderParam ? fetchedFolder : null;
  const selectedFolder = listedFolder ?? fetched?.row ?? null;
  const folderGone = !!folderParam && !listedFolder && !!fetched && !fetched.row && !fetched.error;
  const folderError = !!folderParam && !listedFolder && !!fetched?.error;
  useEffect(() => {
    if (!folderParam || loading || listedFolder || fetched) return;
    let active = true;
    getFolder(folderParam)
      .then((row) => { if (active) setFetchedFolder({ id: folderParam, row: row?.published ? row : null }); })
      .catch((e) => { console.error(e); if (active) setFetchedFolder({ id: folderParam, row: null, error: true }); });
    return () => { active = false; };
  }, [folderParam, loading, listedFolder, fetched]);

  // 잘못된 쪽·필터, 없거나 비공개된 폴더는 목록을 다 불러온 뒤에만 고쳐 적는다(replace).
  // 불러오는 중·목록을 못 받은 동안에는 쪽 수가 1로 보여서, 이때 쓰면 page 가 1로 덮인다.
  useEffect(() => {
    if (loading || waitingClears || !listOk || !isHubPath(hubBase)) return;
    const canonical = listUrl(hubBase, { page: visiblePage, filter, q: query, unsolved, folder: folderGone ? null : folderParam });
    if (canonical !== location) nav.go(canonical, { replace: true });
    nav.rememberListUrl('hub', listUrl(hubBase, { page: visiblePage, filter, q: query, unsolved }));
  }, [loading, waitingClears, listOk, hubBase, visiblePage, filter, query, unsolved, folderParam, folderGone, location]);

  // 돌아오면 그 항목의 스크롤을 되살리고, 방금 연 카드에 초점을 준다.
  nav.useScrollRestore(!loading && !waitingClears && !folderParam, (returned) => {
    if (!returned) return;
    const id = lastOpenedMapId();
    focusGridItem(gridRef.current, paged.findIndex((e) => e.kind === 'map' && e.map.id === id));
  });

  const doUpload = async (p: UploadPayload) => {
    if (!profile) return;
    await insertMap({
      owner_id: profile.id,
      author_name: p.author_name,
      code: p.code,
      title: p.title,
      comment: p.comment,
      author_difficulty: p.difficulty,
      created_at: registeredToISO(p.registered_on),
      published: true,
      published_at: new Date().toISOString(),
    });
    setShowUpload(false);
    refresh();
  };

  const exportAcceptedIds = () => {
    const ids = maps.filter((m) => m.status === 'accepted').map((m) => m.id);
    const blob = new Blob([JSON.stringify(ids, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accepted-map-ids-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDetailChanged = (updated?: MapRow) => {
    if (updated) {
      setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setSelected((s) => (s && s.id === updated.id ? updated : s));
    } else {
      refresh();
    }
  };

  const openMap = useCallback((map: MapRow) => {
    setLastOpenedMapId(map.id);
    if (onOpenMap) onOpenMap(map);
    else setSelected(map);
  }, [onOpenMap]);

  const exportBackup = async () => {
    try {
      const all = await fetchAllForBackup();
      const text = buildBackupText(all);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snowmen-maps-backup-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('백업 실패: ' + (e as Error).message); }
  };

  // Map detail sits on top of everything (including a folder view): backing out just
  // clears the map, returning to the folder it was opened from (if any) or the hub.
  if (selected) {
    return (
      <MapDetail
        map={selected}
        onBack={() => setSelected(null)}
        onChanged={onDetailChanged}
      />
    );
  }

  if (selectedFolder) {
    return (
      <FolderDetail
        key={selectedFolder.id}
        folder={selectedFolder}
        onBack={backFromFolder}
        onOpenMap={openMap}
        onChanged={refresh}
      />
    );
  }

  // 폴더 주소인데 폴더 행을 아직 모름(새로고침·주소로 바로 열기) — 허브 목록 틀 대신 폴더 자리표시.
  if (folderParam && !folderGone) {
    return (
      <div className="folder-detail">
        <div className="detail-topbar">
          <button className="btn" onClick={backFromFolder}>← 허브로</button>
        </div>
        {folderError ? (
          <div className="hub-empty">
            폴더를 불러오지 못했습니다.{' '}
            <button className="btn btn-sm" onClick={() => setFetchedFolder(null)}>다시 시도</button>
          </div>
        ) : (
          <div className="hub-empty">불러오는 중…</div>
        )}
      </div>
    );
  }

  return (
    <div className="hub">
      <div className="hub-head">
        <div>
          <h1 className="hub-title">맵 허브</h1>
          <p className="hub-sub">팀이 만든 맵을 모으고, 함께 검토하고, 챕터에 배치해요.</p>
        </div>
        <div className="hub-head-right">
          <div className="hub-stats">
            <div className="hub-stat"><div className="hub-stat-num">{stats.total}</div><div className="hub-stat-label">전체 맵</div></div>
            <div className="hub-stat"><div className="hub-stat-num accepted">{stats.adopted}</div><div className="hub-stat-label">채택</div></div>
            <div className="hub-stat"><div className="hub-stat-num review">{stats.review}</div><div className="hub-stat-label">검토중</div></div>
          </div>
          <div className="hub-head-actions">
            <button className="btn" onClick={exportAcceptedIds} title="채택된 모든 맵의 ID를 JSON 파일로 저장">채택 맵 ID 저장</button>
            <button className="btn" onClick={exportBackup}>⭳ 전체 백업</button>
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>＋ 맵 올리기</button>
          </div>
        </div>
      </div>

      <div className="hub-toolbar">
        <div className="hub-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip${filter === f.key ? ' active' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => nav.go(hubHref({ page: 1, filter: f.key }))}
            >
              {f.label}
            </button>
          ))}
          {/* 상태(하나만 고름)와 따로 켜고 끄는 거르기 — 구분선으로 나눠 둔다. 체크 기능이 꺼져 있으면 숨김. */}
          {clears.status === 'ready' && (
            <span className="hub-filter-mine">
              <span className="hub-filter-sep" aria-hidden="true" />
              <button
                type="button"
                className={`chip${unsolved ? ' active' : ''}`}
                aria-pressed={unsolved}
                title="내 칩이 빈 맵만 봅니다 (풀이를 등록한 맵은 푼 것으로 칩니다)"
                onClick={() => { setKeep(new Set()); nav.go(hubHref({ page: 1, unsolved: !unsolved })); }}
              >
                내가 안 푼 맵
              </button>
            </span>
          )}
        </div>
        <input
          type="search"
          className="field-input hub-search"
          value={query}
          onChange={(e) => nav.go(hubHref({ page: 1, q: e.target.value }), { replace: true })}
          placeholder="제목 · 제작자 검색"
          aria-label="제목·제작자 검색"
        />
      </div>

      {loading || waitingClears ? (
        <div className="hub-empty">불러오는 중…</div>
      ) : failed && maps.length === 0 ? (
        <div className="hub-empty">
          목록을 불러오지 못했습니다.{' '}
          <button className="btn btn-sm" onClick={() => { void refresh(); }}>다시 시도</button>
        </div>
      ) : entries.length === 0 ? (
        <div className="hub-empty">
          {standaloneMaps.length === 0 && folders.length === 0
            ? '아직 업로드된 맵이 없습니다. 첫 맵을 올려보세요!'
            : mineOnly && filter === 'all' && !query.trim()
              ? '안 푼 맵이 없어요. 허브의 맵을 모두 풀었어요!'
              : '조건에 맞는 맵이 없습니다.'}
        </div>
      ) : (
        <>
          <div className="hub-grid" ref={gridRef}>
            {paged.map((e) => e.kind === 'folder'
              ? <FolderCard key={`f-${e.folder.id}`} folder={e.folder} maps={mapsByFolder.get(e.folder.id) ?? []} onOpen={(f) => nav.go(hubHref({ folder: f.id }))} />
              : <MapCard
                  key={`m-${e.map.id}`}
                  map={e.map}
                  onOpen={openMap}
                  onToggleMine={mineOnly ? (id) => setKeep((k) => new Set(k).add(id)) : undefined}
                />)}
          </div>
          <Pagination page={visiblePage} pageCount={pageCount} onChange={(p) => nav.go(hubHref({ page: p }))} />
        </>
      )}

      {showUpload && (
        <UploadForm
          title="맵 올리기"
          submitLabel="허브에 등록"
          initial={{ author_name: profile?.name ?? '' }}
          onSubmit={doUpload}
          onCancel={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
