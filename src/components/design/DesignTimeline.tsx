import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { colorOf, TASK_CATEGORIES, type DesignTask } from '../../api/design';
import { addDays, diffDays, dragDates, timelineRange, type DragMode } from '../../lib/designBoard';
import EditableText from './EditableText';
import { TagSelect } from './tags';

// 왼쪽 글 칸은 고정하고, 남은 폭에 전체 기간을 맞춰 넣는다. 화면이 좁으면 하루 폭의 하한에서 가로 스크롤이 생긴다.
const LEFT = 340;
const MIN_DAY = 5;
const TASK_TYPE = 'application/x-design-task';

interface Dragging {
  id: string;
  mode: DragMode;
  startX: number;
  dayPx: number;    // 화면(client) 좌표 기준 하루 폭. 페이지 확대율이 들어 있다.
  days: number;
}

const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const rangeText = (start: string, end: string) => (start === end ? shortDate(start) : `${shortDate(start)} ~ ${shortDate(end)}`);

export default function DesignTimeline({ tasks, allTasks, today, filtering, onAdd, onPatch, onRemove, onMove }: {
  tasks: DesignTask[];      // 지금 보이는 일정
  allTasks: DesignTask[];
  today: string;
  filtering: boolean;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<DesignTask>) => void;
  onRemove: (task: DesignTask) => void;
  onMove: (id: string, beforeId: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(1180);
  const [drag, setDrag] = useState<Dragging | null>(null);
  const [rowSlot, setRowSlot] = useState<string | null | undefined>(undefined);
  const [datesOf, setDatesOf] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWrapW(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { from, weeks } = useMemo(() => timelineRange(allTasks, today), [allTasks, today]);
  const days = weeks * 7;
  const dayW = Math.max(MIN_DAY, (wrapW - LEFT) / days);
  const width = days * dayW;
  const x = (d: string) => diffDays(from, d) * dayW;
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7));
  const monthStarts = Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d, i) => i === 0 || d.endsWith('-01'));
  const marks = allTasks.filter((t) => t.category === 'mile').map((t) => t.start_date);

  const startDrag = (e: ReactPointerEvent<HTMLElement>, task: DesignTask, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const track = e.currentTarget.closest<HTMLElement>('.dw-tl-track');
    const scale = track ? track.getBoundingClientRect().width / width : 1;
    setDrag({ id: task.id, mode, startX: e.clientX, dayPx: dayW * scale, days: 0 });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag) setDrag({ ...drag, days: Math.round((e.clientX - drag.startX) / drag.dayPx) });
  };
  const endDrag = (task: DesignTask) => {
    if (!drag) return;
    if (drag.days !== 0) {
      const next = dragDates(task.start_date, task.end_date, drag.days, drag.mode);
      onPatch(task.id, { start_date: next.start, end_date: next.end });
    }
    setDrag(null);
  };

  const onRowOver = (e: DragEvent<HTMLElement>, id: string, nextId: string | null) => {
    if (!e.dataTransfer.types.includes(TASK_TYPE)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setRowSlot(e.clientY < r.top + r.height / 2 ? id : nextId);
  };
  const onRowDrop = (e: DragEvent<HTMLElement>) => {
    const id = e.dataTransfer.getData(TASK_TYPE);
    if (id && rowSlot !== undefined) onMove(id, rowSlot);
    setRowSlot(undefined);
  };

  return (
    <div className="dw-timeline" ref={wrapRef}>
      <div className="dw-tl-legend">
        {TASK_CATEGORIES.map((c) => <span key={c.value} className={`c-${c.color}`}><i />{c.label}</span>)}
      </div>
      {tasks.length === 0 ? (
        <div className="dw-empty">
          <p>{filtering ? '조건에 맞는 일정이 없습니다.' : '아직 일정이 없습니다.'}</p>
          {!filtering && <button type="button" className="btn btn-primary" onClick={onAdd}>+ 일정 추가</button>}
        </div>
      ) : (
        <div className="dw-tl-scroll">
          <div className="dw-tl-grid" style={{ width: width + LEFT }}>
            <div className="dw-tl-row dw-tl-head">
              <div className="dw-tl-info"><b>일정</b></div>
              <div className="dw-tl-track" style={{ width }}>
                {monthStarts.map((m) => <b key={m} className="dw-tl-month" style={{ left: x(m) }}>{Number(m.slice(5, 7))}월</b>)}
                {weekStarts.map((w) => <span key={w} className="dw-tl-week" style={{ left: x(w) }}>{shortDate(w)}</span>)}
                <i className="dw-tl-today-label" style={{ left: x(today) }}>오늘</i>
              </div>
            </div>
            {tasks.map((task, i) => {
              const live = drag?.id === task.id ? dragDates(task.start_date, task.end_date, drag.days, drag.mode) : { start: task.start_date, end: task.end_date };
              const barW = (diffDays(live.start, live.end) + 1) * dayW;
              const color = colorOf(TASK_CATEGORIES, task.category);
              const mile = task.category === 'mile';
              return (
                <div
                  key={task.id}
                  className={`dw-tl-row c-${color}${rowSlot === task.id ? ' is-line-before' : ''}`}
                  data-task-id={task.id}
                  onDragOver={(e) => onRowOver(e, task.id, tasks[i + 1]?.id ?? null)}
                  onDrop={onRowDrop}
                >
                  <div className="dw-tl-info">
                    {filtering ? <span /> : (
                      <span
                        className="dw-handle"
                        draggable
                        title="끌어서 순서 옮기기"
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(TASK_TYPE, task.id); }}
                        onDragEnd={() => setRowSlot(undefined)}
                      >⋮⋮</span>
                    )}
                    <i className="dw-tl-dot" />
                    <div className="dw-tl-text">
                      <EditableText className="dw-tl-name" label="일정 이름" placeholder="일정 이름" value={task.name}
                        onSave={(name) => onPatch(task.id, { name })} />
                      {datesOf === task.id ? (
                        <div className="dw-tl-dates">
                          <input type="date" aria-label="시작일" value={task.start_date} max={task.end_date}
                            onChange={(e) => { if (e.target.value) onPatch(task.id, { start_date: e.target.value }); }} />
                          <input type="date" aria-label="종료일" value={task.end_date} min={task.start_date}
                            onChange={(e) => { if (e.target.value) onPatch(task.id, { end_date: e.target.value }); }} />
                          <TagSelect value={task.category} options={TASK_CATEGORIES} label="종류" onChange={(category) => onPatch(task.id, { category })} />
                          <button type="button" className="dw-tl-done" onClick={() => setDatesOf(null)}>완료</button>
                        </div>
                      ) : (
                        <div className="dw-tl-sub">
                          <EditableText className="dw-tl-owner" label="담당" placeholder="담당" value={task.owner}
                            onSave={(owner) => onPatch(task.id, { owner })} />
                          <button type="button" className="dw-tl-range" title="날짜 고치기" onClick={() => setDatesOf(task.id)}>
                            {rangeText(live.start, live.end)}
                          </button>
                        </div>
                      )}
                    </div>
                    <button type="button" className="dw-x" aria-label={`${task.name || '일정'} 삭제`} onClick={() => onRemove(task)}>×</button>
                  </div>
                  <div className="dw-tl-track" style={{ width }}>
                    {weekStarts.map((w) => <i key={w} className="dw-tl-line" style={{ left: x(w) }} />)}
                    {marks.map((m) => <i key={m} className="dw-tl-mark" style={{ left: x(m) + dayW / 2 }} />)}
                    <i className="dw-tl-today" style={{ left: x(today) + dayW / 2 }} />
                    {mile ? (
                      <i className="dw-tl-diamond" title={`${task.name} ${shortDate(live.start)}`} style={{ left: x(live.start) + dayW / 2 }} />
                    ) : (
                      <div
                        className="dw-tl-bar"
                        style={{ left: x(live.start), width: barW }}
                        title={`${task.name} ${rangeText(live.start, live.end)}`}
                        onPointerDown={(e) => startDrag(e, task, 'move')}
                        onPointerMove={moveDrag}
                        onPointerUp={() => endDrag(task)}
                        onPointerCancel={() => setDrag(null)}
                      >
                        {barW >= 92 && <span>{rangeText(live.start, live.end)}</span>}
                        <b className="dw-tl-grip is-start" onPointerDown={(e) => startDrag(e, task, 'start')} onPointerMove={moveDrag} onPointerUp={() => endDrag(task)} />
                        <b className="dw-tl-grip is-end" onPointerDown={(e) => startDrag(e, task, 'end')} onPointerMove={moveDrag} onPointerUp={() => endDrag(task)} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!filtering && (
              <div
                className={`dw-tl-end${rowSlot === null ? ' is-line-before' : ''}`}
                onDragOver={(e) => { if (e.dataTransfer.types.includes(TASK_TYPE)) { e.preventDefault(); setRowSlot(null); } }}
                onDrop={onRowDrop}
              >
                <button type="button" className="btn btn-sm" onClick={onAdd}>+ 일정 추가</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
