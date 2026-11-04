import { useMemo, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { DesignTask } from '../../api/design';
import { addDays, bySortOrder, diffDays, dragDates, timelineRange, type DragMode } from '../../lib/designBoard';
import EditableText from './EditableText';

const DAY = 8;              // 하루의 폭(px)
const TASK_TYPE = 'application/x-design-task';

interface Dragging {
  id: string;
  mode: DragMode;
  startX: number;
  days: number;
}

const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function DesignTimeline({ tasks, today, onAdd, onPatch, onRemove, onMove }: {
  tasks: DesignTask[];
  today: string;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<DesignTask>) => void;
  onRemove: (task: DesignTask) => void;
  onMove: (id: string, beforeId: string | null) => void;
}) {
  const [drag, setDrag] = useState<Dragging | null>(null);
  const [rowSlot, setRowSlot] = useState<string | null | undefined>(undefined);
  const sorted = useMemo(() => [...tasks].sort(bySortOrder), [tasks]);
  const { from, weeks } = useMemo(() => timelineRange(tasks, today), [tasks, today]);
  const width = weeks * 7 * DAY;
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7));
  const x = (d: string) => diffDays(from, d) * DAY;

  const startDrag = (e: ReactPointerEvent<HTMLElement>, task: DesignTask, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: task.id, mode, startX: e.clientX, days: 0 });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag) setDrag({ ...drag, days: Math.round((e.clientX - drag.startX) / DAY) });
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

  if (sorted.length === 0) {
    return (
      <div className="dw-empty">
        <p>아직 일정이 없습니다.</p>
        <button type="button" className="btn btn-primary" onClick={onAdd}>+ 일정 추가</button>
      </div>
    );
  }

  return (
    <div className="dw-timeline">
      <div className="dw-tl-scroll">
        <div className="dw-tl-grid" style={{ width: width + 430 }}>
          <div className="dw-tl-row dw-tl-head">
            <div className="dw-tl-info"><span>일정</span><span>담당</span><span>시작</span><span>끝</span></div>
            <div className="dw-tl-track" style={{ width }}>
              {weekStarts.map((w) => <span key={w} className="dw-tl-week" style={{ left: x(w) }}>{shortDate(w)}</span>)}
            </div>
          </div>
          {sorted.map((task, i) => {
            const live = drag?.id === task.id ? dragDates(task.start_date, task.end_date, drag.days, drag.mode) : { start: task.start_date, end: task.end_date };
            return (
              <div
                key={task.id}
                className={`dw-tl-row${rowSlot === task.id ? ' is-line-before' : ''}`}
                onDragOver={(e) => onRowOver(e, task.id, sorted[i + 1]?.id ?? null)}
                onDrop={onRowDrop}
              >
                <div className="dw-tl-info">
                  <span
                    className="dw-handle"
                    draggable
                    title="끌어서 순서 옮기기"
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(TASK_TYPE, task.id); }}
                    onDragEnd={() => setRowSlot(undefined)}
                  >⋮⋮</span>
                  <EditableText className="dw-cell dw-cell-name" label="일정 이름" placeholder="일정 이름" value={task.name}
                    onSave={(name) => onPatch(task.id, { name })} />
                  <EditableText className="dw-cell" label="담당" placeholder="담당" value={task.owner}
                    onSave={(owner) => onPatch(task.id, { owner })} />
                  <input className="dw-cell dw-date" type="date" aria-label="시작일" value={live.start} max={task.end_date}
                    onChange={(e) => { if (e.target.value) onPatch(task.id, { start_date: e.target.value }); }} />
                  <input className="dw-cell dw-date" type="date" aria-label="종료일" value={live.end} min={task.start_date}
                    onChange={(e) => { if (e.target.value) onPatch(task.id, { end_date: e.target.value }); }} />
                  <button type="button" className="dw-x" aria-label={`${task.name || '일정'} 삭제`} onClick={() => onRemove(task)}>×</button>
                </div>
                <div className="dw-tl-track" style={{ width }}>
                  {weekStarts.map((w) => <i key={w} className="dw-tl-line" style={{ left: x(w) }} />)}
                  <i className="dw-tl-today" style={{ left: x(today) }} />
                  <div
                    className="dw-tl-bar"
                    data-task-id={task.id}
                    style={{ left: x(live.start), width: (diffDays(live.start, live.end) + 1) * DAY }}
                    title={`${task.name} ${shortDate(live.start)} ~ ${shortDate(live.end)}`}
                    onPointerDown={(e) => startDrag(e, task, 'move')}
                    onPointerMove={moveDrag}
                    onPointerUp={() => endDrag(task)}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <b className="dw-tl-grip is-start" onPointerDown={(e) => startDrag(e, task, 'start')} onPointerMove={moveDrag} onPointerUp={() => endDrag(task)} />
                    <b className="dw-tl-grip is-end" onPointerDown={(e) => startDrag(e, task, 'end')} onPointerMove={moveDrag} onPointerUp={() => endDrag(task)} />
                  </div>
                </div>
              </div>
            );
          })}
          <div
            className={`dw-tl-end${rowSlot === null ? ' is-line-before' : ''}`}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(TASK_TYPE)) { e.preventDefault(); setRowSlot(null); } }}
            onDrop={onRowDrop}
          >
            <button type="button" className="btn btn-sm" onClick={onAdd}>+ 일정 추가</button>
          </div>
        </div>
      </div>
    </div>
  );
}
