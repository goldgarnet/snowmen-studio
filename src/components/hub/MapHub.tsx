import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClears } from '../../context/ClearsContext';
import { isSolvedByMe } from '../../lib/solvedChecks';
import { listPublishedMaps, insertMap, fetchAllForBackup, registeredToISO } from '../../api/maps';
import { listPublishedFolders } from '../../api/folders';
import type { MapRow, FolderRow, StatusFilter } from '../../api/types';
import { STATUS_LABEL, STATUS_FILTERS } from '../../api/types';
import MapCard from './MapCard';
import MapDetail from './MapDetail';
import FolderCard from './FolderCard';
import FolderDetail from './FolderDetail';
import UploadForm, { UploadPayload } from './UploadForm';
import Pagination from '../common/Pagination';
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
  const [maps, setMaps] = useState<MapRow[]>([]); // all published maps (standalone + members)
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  // '내가 안 푼 맵': 내 칩이 빈 맵만 (풀이를 등록한 맵은 푼 것). 켠 채 방금 체크한 카드는 keep 에 넣어
  // 바로 사라지지 않게 둔다 — 버튼을 다시 누르면 빠진다 (푼 맵 현황의 같은 거르기와 같은 동작).
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<MapRow | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderRow | null>(null);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    // '풀었어요' 체크도 허브에 올 때마다 새로 읽는다 (다른 사람 체크 반영). 맵 목록과 따로 돌고,
    // 테이블이 없으면 스스로 기능을 숨긴다.
    void reloadClears();
    try { setMaps(await listPublishedMaps()); }
    catch (e) { console.error(e); }
    // Folder table may not exist yet (pre-migration); degrade gracefully to empty.
    try { setFolders(await listPublishedFolders()); } catch (e) { console.error(e); setFolders([]); }
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
  const mineOnly = unsolvedOnly && clears.status === 'ready';
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
        if (q && !`${f.name ?? ''} ${f.author_name ?? ''}`.toLowerCase().includes(q)) continue;
        if (mineOnly && (mapsByFolder.get(f.id) ?? []).every(hidden)) continue;
        list.push({ kind: 'folder', folder: f, date: f.created_at, pub: f.published_at ?? '' });
      }
    }
    // Newest 등록일(created_at) first; ties broken by 공개 시각(published_at, minute/second
    // precision) — the same order the SQL uses for maps, now applied across the merged
    // map+folder list so folders slot in at the right spot.
    list.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.pub < b.pub ? 1 : a.pub > b.pub ? -1 : 0);
    return list;
  }, [standaloneMaps, folders, filter, query, mineOnly, keep, clears, myUserId, mapsByFolder]);

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
        folder={selectedFolder}
        onBack={() => setSelectedFolder(null)}
        onOpenMap={openMap}
        onChanged={refresh}
      />
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
              onClick={() => { setFilter(f.key); setPage(1); }}
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
                className={`chip${unsolvedOnly ? ' active' : ''}`}
                aria-pressed={unsolvedOnly}
                title="내 칩이 빈 맵만 봅니다 (풀이를 등록한 맵은 푼 것으로 칩니다)"
                onClick={() => { setKeep(new Set()); setUnsolvedOnly((v) => !v); setPage(1); }}
              >
                내가 안 푼 맵
              </button>
            </span>
          )}
        </div>
        <input
          className="field-input hub-search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="제목 · 제작자 검색"
        />
      </div>

      {loading ? (
        <div className="hub-empty">불러오는 중…</div>
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
          <div className="hub-grid">
            {paged.map((e) => e.kind === 'folder'
              ? <FolderCard key={`f-${e.folder.id}`} folder={e.folder} maps={mapsByFolder.get(e.folder.id) ?? []} onOpen={setSelectedFolder} />
              : <MapCard
                  key={`m-${e.map.id}`}
                  map={e.map}
                  onOpen={openMap}
                  onToggleMine={mineOnly ? (id) => setKeep((k) => new Set(k).add(id)) : undefined}
                />)}
          </div>
          <Pagination page={visiblePage} pageCount={pageCount} onChange={setPage} />
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
