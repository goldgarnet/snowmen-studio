import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listSolutions, deleteSolution } from '../../api/solutions';
import type { SolutionRow } from '../../api/types';

interface SolutionListProps {
  mapId: string;
  mapOwnerId: string;
  reloadToken: number;            // bump to force a reload after a register/delete elsewhere
  onView: (sol: SolutionRow) => void;
  onRegister: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Author's own solution pinned first, then fewest turns (unknown turn counts last),
// then oldest.
function sortSolutions(list: SolutionRow[], ownerId: string): SolutionRow[] {
  return [...list].sort((a, b) => {
    const aAuthor = a.author_id === ownerId ? 0 : 1;
    const bAuthor = b.author_id === ownerId ? 0 : 1;
    if (aAuthor !== bAuthor) return aAuthor - bAuthor;
    const at = a.turn_count ?? Infinity;
    const bt = b.turn_count ?? Infinity;
    if (at !== bt) return at - bt;
    return a.created_at.localeCompare(b.created_at);
  });
}

export default function SolutionList({ mapId, mapOwnerId, reloadToken, onView, onRegister }: SolutionListProps) {
  const { profile } = useAuth();
  const [sols, setSols] = useState<SolutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSols(sortSolutions(await listSolutions(mapId), mapOwnerId)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [mapId, mapOwnerId]);

  useEffect(() => { load(); }, [load, reloadToken]);

  const remove = async (id: string) => {
    if (!confirm('이 풀이를 삭제할까요?')) return;
    setBusyId(id);
    try { await deleteSolution(id); await load(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  const isMapOwner = profile?.id === mapOwnerId;

  return (
    <div className="detail-solution">
      <div className="detail-solution-head">
        <span className="detail-mini-label" style={{ margin: 0 }}>풀이 ({sols.length})</span>
        <button className="btn btn-sm" onClick={onRegister}>＋ 내 풀이 등록</button>
      </div>

      {loading ? (
        <p className="detail-solution-desc">불러오는 중…</p>
      ) : sols.length === 0 ? (
        <p className="detail-solution-desc">
          아직 등록된 풀이가 없어요. <b>바로 플레이</b>로 클리어하거나 <b>내 풀이 등록</b>으로 풀이를 남겨보세요. (스포일러)
        </p>
      ) : (
        <ul className="sol-items">
          {sols.map((s) => {
            const isAuthor = s.author_id === mapOwnerId;
            const canDelete = profile?.id === s.author_id || isMapOwner;
            return (
              <li className="sol-item" key={s.id}>
                <div className="sol-item-main">
                  <span className="sol-author">{s.author_name}</span>
                  {isAuthor && <span className="sol-tag on">출제자</span>}
                  {/* 턴 수는 스포일러라 목록에선 숨기고, 재생 화면에서만 보여준다. */}
                  <span className="sol-meta">{formatWhen(s.created_at)}</span>
                </div>
                {s.note && <div className="sol-note">{s.note}</div>}
                <div className="sol-item-actions">
                  <button className="btn btn-sm" onClick={() => onView(s)}>👀 보기</button>
                  {canDelete && (
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)} disabled={busyId === s.id}>
                      삭제
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
