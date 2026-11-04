import { colorOf, TASK_CATEGORIES, type DesignTask } from '../../api/design';
import { activeTasks, daysLeft, diffDays, nextCheck, nextTasks, shortDate } from '../../lib/designBoard';

// 작업 공간 맨 위 안내: 지금 무슨 작업을 하는 기간이고 언제까지 끝내야 하는지. 내용은 타임라인에서 나온다.
export default function DesignNow({ tasks, today, who }: {
  tasks: DesignTask[];
  today: string;
  who: string;       // 담당자 필터. 고르면 그 사람의 일정만 보여 준다.
}) {
  const person = who !== 'all' && who !== 'none';
  const scoped = person ? tasks.filter((t) => t.owner === who || t.owner === '전원' || t.owner === '자유롤') : tasks;
  const active = activeTasks(scoped, today);
  const next = nextTasks(scoped, today);
  const check = nextCheck(tasks, today);

  return (
    <section className="dw-now" aria-label="지금 작업 기간">
      <div className="dw-now-head">
        <b>지금 작업 기간</b>
        <span>오늘 {Number(today.slice(5, 7))}월 {Number(today.slice(8, 10))}일</span>
      </div>
      {active.length > 0 ? (
        <div className="dw-now-list">
          {active.map((t) => {
            const left = diffDays(today, t.end_date);
            return (
              <div key={t.id} className={`dw-now-card c-${colorOf(TASK_CATEGORIES, t.category)}`}>
                <div>
                  <b>{t.name}</b>
                  <span>{t.owner ? `${t.owner} · ` : ''}{shortDate(t.end_date)}까지</span>
                </div>
                <em className={left <= 3 ? 'is-soon' : ''}>{daysLeft(left)}</em>
              </div>
            );
          })}
        </div>
      ) : <p className="dw-faint">지금 진행 중인 일정이 없습니다.</p>}
      {(next.length > 0 || check) && (
        <p className="dw-now-next">
          {next.length > 0 && (
            <span><b>다음 시작</b> {shortDate(next[0].start_date)} {next[0].name}{next.length > 1 ? ` 외 ${next.length - 1}개` : ''}</span>
          )}
          {check && <span><b>다음 확인</b> {shortDate(check.start_date)} {check.name}</span>}
        </p>
      )}
    </section>
  );
}
