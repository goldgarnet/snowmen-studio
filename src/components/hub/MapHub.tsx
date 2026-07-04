import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listPublishedMaps, insertMap, fetchAllForBackup, registeredToISO } from '../../api/maps';
import type { MapRow, MapStatus } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import MapCard from './MapCard';
import MapDetail from './MapDetail';
import UploadForm, { UploadPayload } from './UploadForm';
import PlayView from '../editor/PlayView';
import Pagination from '../common/Pagination';
import './hub.css';

const PAGE_SIZE = 8; // 4 columns × 2 rows

type Filter = 'all' | MapStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토중' },
  { key: 'accepted', label: '채택' },
  { key: 'held', label: '보류' },
  { key: 'rejected', label: '반려' },
];

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

export default function MapHub() {
  const { profile } = useAuth();
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<MapRow | null>(null);
  const [playMap, setPlayMap] = useState<MapRow | null>(null);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setMaps(await listPublishedMaps()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return maps.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (q) {
        const hay = `${m.title ?? ''} ${m.author_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [maps, filter, query]);

  const stats = useMemo(() => ({
    total: maps.length,
    adopted: maps.filter((m) => m.status === 'accepted').length,
    review: maps.filter((m) => m.status === 'pending').length,
  }), [maps]);

  // Pagination over the filtered list. Reset to page 1 whenever the filter/search
  // changes; clamp if the visible count shrinks below the current page.
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [filter, query]);
  useEffect(() => { setPage((p) => Math.min(p, pageCount)); }, [pageCount]);
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  if (playMap) {
    return (
      <PlayView code={playMap.code} title={playMap.title || '플레이'} onClose={() => setPlayMap(null)} />
    );
  }

  if (selected) {
    return (
      <MapDetail
        map={selected}
        onBack={() => setSelected(null)}
        onPlay={(m) => setPlayMap(m)}
        onChanged={onDetailChanged}
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
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="field-input hub-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 · 제작자 검색"
        />
      </div>

      {loading ? (
        <div className="hub-empty">불러오는 중…</div>
      ) : visible.length === 0 ? (
        <div className="hub-empty">
          {maps.length === 0 ? '아직 업로드된 맵이 없습니다. 첫 맵을 올려보세요!' : '조건에 맞는 맵이 없습니다.'}
        </div>
      ) : (
        <>
          <div className="hub-grid">
            {paged.map((m) => <MapCard key={m.id} map={m} onOpen={setSelected} />)}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
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
