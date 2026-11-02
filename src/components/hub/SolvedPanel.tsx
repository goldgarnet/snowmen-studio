import { useEffect } from 'react';
import { useClears } from '../../context/ClearsContext';
import { otherNames } from '../../lib/solvedChecks';
import ClearChips from './ClearChips';

// 맵 상세의 '푼 사람' 카드: 허브 카드와 같은 칩 줄을 크게. 체크는 내 이름 칩을 눌러서 한다(따로 버튼 없음).
// 기능이 꺼져 있으면(테이블 없음 등) 아무것도 그리지 않는다.
export default function SolvedPanel({ mapId }: { mapId: string }) {
  const clears = useClears();
  const { reloadMap } = clears;

  // 상세를 열 때마다 이 맵만 새로 읽는다 — 그새 다른 사람이 체크했을 수 있다.
  useEffect(() => { queueMicrotask(() => { void reloadMap(mapId); }); }, [mapId, reloadMap]);

  if (clears.status !== 'ready') return null;
  const s = clears.summarize(mapId);
  const inTable = s.members.some((r) => r.mine);

  return (
    <div className="detail-solved">
      <div className="detail-solved-head">
        <span className="detail-mini-label">푼 사람</span>
        <span className="detail-solved-count">{s.solvedMembers}/{s.members.length}</span>
      </div>
      <ClearChips mapId={mapId} size="detail" />
      {s.others.length > 0 && (
        <div className="detail-solved-others">그 외 {s.others.length}명: {otherNames(s.others, clears.nameOf)}</div>
      )}
      <p className="detail-solved-hint">
        {inTable
          ? '내 이름을 누르면 풀었어요 체크 · 다시 누르면 해제 · 점선 칩 = 풀이 등록(자동)'
          : '채운 칩 = 풀었어요 체크 · 점선 칩 = 풀이 등록(자동) · 내 계정은 멤버 표에 없어 체크할 수 없어요.'}
      </p>
    </div>
  );
}
