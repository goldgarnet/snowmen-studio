import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listPublishedMaps, insertMap, fetchAllForBackup } from '../../api/maps';
import type { MapRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import MapCard from './MapCard';
import MapDetail from './MapDetail';
import UploadForm, { UploadPayload } from './UploadForm';
import PlayView from '../editor/PlayView';
import './hub.css';

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
    lines.push(`난이도: ${m.difficulty != null ? m.difficulty.toFixed(1) : '(미지정)'}`);
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
  const [acceptedOnly, setAcceptedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<MapRow | null>(null);
  const [playMap, setPlayMap] = useState<MapRow | null>(null);

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
      if (acceptedOnly && m.status !== 'accepted') return false;
      if (q) {
        const hay = `${m.title ?? ''} ${m.author_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [maps, acceptedOnly, query]);

  const doUpload = async (p: UploadPayload) => {
    if (!profile) return;
    await insertMap({ owner_id: profile.id, ...p, published: true });
    setShowUpload(false);
    refresh();
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

  // ---- play ----
  if (playMap) {
    return (
      <PlayView
        code={playMap.code}
        title={playMap.title || '플레이'}
        onClose={() => setPlayMap(null)}
      />
    );
  }

  // ---- detail ----
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

  // ---- grid ----
  return (
    <div className="hub">
      <div className="hub-head">
        <div>
          <h2>맵 허브</h2>
          <p className="studio-sub">팀원들이 올린 맵을 플레이하고 피드백을 남겨보세요.</p>
        </div>
        <div className="hub-head-actions">
          <button className="btn" onClick={exportBackup}>⭳ 전체 백업</button>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>+ 맵 업로드</button>
        </div>
      </div>

      <div className="hub-toolbar">
        <input
          className="field-input hub-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 · 제작자 검색"
        />
        <label className="hub-filter">
          <input type="checkbox" checked={acceptedOnly} onChange={(e) => setAcceptedOnly(e.target.checked)} />
          채택된 맵만 보기
        </label>
      </div>

      {loading ? (
        <div className="studio-empty">불러오는 중…</div>
      ) : visible.length === 0 ? (
        <div className="studio-empty">
          {maps.length === 0 ? '아직 업로드된 맵이 없습니다. 첫 맵을 올려보세요!' : '조건에 맞는 맵이 없습니다.'}
        </div>
      ) : (
        <div className="hub-grid">
          {visible.map((m) => <MapCard key={m.id} map={m} onOpen={setSelected} />)}
        </div>
      )}

      {showUpload && (
        <UploadForm
          title="맵 업로드"
          submitLabel="업로드"
          initial={{ author_name: profile?.name ?? '' }}
          onSubmit={doUpload}
          onCancel={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
