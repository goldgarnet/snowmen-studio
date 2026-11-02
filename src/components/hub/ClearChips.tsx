import { useClears } from '../../context/ClearsContext';
import { memberSolveTitle, otherNames } from '../../lib/solvedChecks';

// '풀었어요' 체크 칩 한 줄: 멤버 표(src/lib/members.ts) 순서대로 짧은 이름 칩.
//   채운 칩 = 직접 체크 · 점선 칩 = 풀이를 등록해 자동 표시 · 빈 칩 = 아직.
// 내 칩만 눌러서 켜고 끈다 (다른 사람 칩은 보기만). 표 밖 계정은 '+N'.
// 저장 중인 내 칩은 disabled 가 아니라 aria-disabled 로 흐리게만 한다 — disabled 가 되면 크롬이 포커스를
// body 로 옮겨 키보드 · 스크린리더 사용자가 자리를 잃는다. 저장 중에 또 누르는 것은 toggleMine 이 무시한다.
// 기능이 꺼져 있으면(테이블 없음 등) 아무것도 그리지 않는다.

interface ClearChipsProps {
  mapId: string;
  size?: 'card' | 'detail';
  /** 내 칩을 누를 때 (토글 전에) 부르는 콜백 — 허브의 '내가 안 푼 맵' 거르기가 쓴다 */
  onToggle?: (mapId: string) => void;
}

export default function ClearChips({ mapId, size = 'card', onToggle }: ClearChipsProps) {
  const clears = useClears();
  if (clears.status !== 'ready') return null;
  const s = clears.summarize(mapId);
  const busy = clears.isBusy(mapId);

  return (
    <div className={`clear-chips clear-chips-${size}`} role="group" aria-label="푼 사람">
      {s.members.map((row) => {
        const cls = `clear-chip is-${row.state}${row.mine ? ' is-mine' : ''}`;
        const title = memberSolveTitle(row, s.myCheck);
        return row.mine ? (
          <button
            key={row.member.name}
            type="button"
            className={cls}
            title={title}
            aria-label={title}
            aria-pressed={s.myCheck}
            aria-disabled={busy}
            onClick={() => { onToggle?.(mapId); clears.toggleMine(mapId); }}
          >
            {row.member.short}
          </button>
        ) : (
          <span key={row.member.name} className={cls} title={title}>{row.member.short}</span>
        );
      })}
      {s.others.length > 0 && (
        <span className="clear-more" title={`멤버 표 밖 계정: ${otherNames(s.others, clears.nameOf)}`}>
          +{s.others.length}
        </span>
      )}
    </div>
  );
}
