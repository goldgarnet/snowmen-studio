import { useRef, useState, type DragEvent } from 'react';
import {
  colorOf, DESIGN_ALPHAS, DESIGN_ASSIGNEES, DESIGN_CATEGORIES, DESIGN_PRIORITIES, DESIGN_STATUSES, imageUrl,
  type DesignFile, type DesignGroup, type DesignImage, type DesignItem, type DesignStatus,
} from '../../api/design';
import { daysLeft, shortDate, type Deadline } from '../../lib/designBoard';
import EditableText from './EditableText';
import { Tag, TagSelect } from './tags';

export interface BoardActions {
  addGroup: () => void;
  patchGroup: (id: string, patch: Partial<DesignGroup>) => void;
  recolorGroup: (group: DesignGroup) => void;
  removeGroup: (group: DesignGroup) => void;
  moveGroup: (id: string, beforeId: string | null) => void;
  addItem: (groupId: string) => void;
  patchItem: (id: string, patch: Partial<DesignItem>) => void;
  moveItem: (id: string, groupId: string, beforeId: string | null) => void;
  dropOnItem: (item: DesignItem, picked: File[]) => void;
  openItem: (id: string) => void;
}

export interface BoardRows {
  group: DesignGroup;
  items: DesignItem[];     // 지금 보이는 항목
  total: number;           // 묶음의 전체 항목 수
  done: number;
}

const ITEM_TYPE = 'application/x-design-item';
const GROUP_TYPE = 'application/x-design-group';

const hasType = (e: DragEvent, type: string) => e.dataTransfer.types.includes(type);
const hasFiles = (e: DragEvent) => hasType(e, 'Files');

// 마우스가 요소의 위쪽 절반이면 그 앞에, 아래쪽 절반이면 그 뒤에 놓는다.
const isUpperHalf = (e: DragEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2;
};

const firstSentence = (text: string) => text.split('\n')[0];

function sizeText(files: DesignFile[]): string {
  const sizes = [...new Set(files.filter((f) => f.canvas_w && f.canvas_h).map((f) => `${f.canvas_w} × ${f.canvas_h}`))];
  if (sizes.length === 0) return '';
  return sizes.length === 1 ? `${sizes[0]} px` : `${sizes[0]} 외 ${sizes.length - 1}개`;
}

interface Slot {
  groupId: string;
  beforeId: string | null;
}

function ItemRow({
  item, files, filled, due, drafts, image, busy, canDrag, active, nextId, slot, setSlot, fileOver, setFileOver, actions,
}: {
  item: DesignItem;
  files: DesignFile[];
  filled: number;
  due: Deadline | null;
  drafts: number;
  image: DesignImage | undefined;
  busy: boolean;
  canDrag: boolean;
  active: boolean;
  nextId: string | null;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  fileOver: string | null;
  setFileOver: (id: string | null) => void;
  actions: BoardActions;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (hasFiles(e)) {
      e.preventDefault();
      e.stopPropagation();
      setFileOver(item.id);
    } else if (hasType(e, ITEM_TYPE)) {
      e.preventDefault();
      e.stopPropagation();
      setSlot({ groupId: item.group_id, beforeId: isUpperHalf(e) ? item.id : nextId });
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (hasFiles(e)) {
      e.preventDefault();
      e.stopPropagation();
      setFileOver(null);
      actions.dropOnItem(item, Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      className={`dw-row${slot?.beforeId === item.id ? ' is-line-before' : ''}${fileOver === item.id ? ' is-file-over' : ''}${active ? ' is-active' : ''}`}
      data-item-id={item.id}
      onClick={() => actions.openItem(item.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) actions.openItem(item.id); }}
      onDragOver={onDragOver}
      onDragLeave={() => { if (fileOver === item.id) setFileOver(null); }}
      onDrop={onDrop}
    >
      {canDrag ? (
        <span
          className="dw-handle"
          draggable
          title="끌어서 위치 옮기기"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(ITEM_TYPE, item.id);
            if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 12, 16);
          }}
          onDragEnd={() => setSlot(null)}
        >⋮⋮</span>
      ) : <span />}
      <span className="dw-thumb">
        {image ? <img src={imageUrl(image.path)} alt="" loading="lazy" /> : <i>{busy ? '…' : '+'}</i>}
      </span>
      <span className="dw-row-main">
        <b>
          {item.name || '이름 없음'}
          {item.is_new && <Tag color="pink" title="게임에 아직 그림 자리가 없어 크기와 파일명이 바뀔 수 있습니다">신규</Tag>}
          {item.split && <Tag color={item.guide_done ? 'teal' : 'purple'}>{item.guide_done ? '채색 차례' : '가이드 차례'}</Tag>}
          {drafts > 0 && <Tag color="blue">{item.split ? '가이드' : '시안'} {drafts}</Tag>}
        </b>
        {item.description && <small>{firstSentence(item.description)}</small>}
      </span>
      <span className="dw-row-tags">
        {item.category && <Tag color={colorOf(DESIGN_CATEGORIES, item.category)}>{item.category}</Tag>}
        {item.priority && <Tag color={colorOf(DESIGN_PRIORITIES, item.priority)}>{item.priority}</Tag>}
        {item.alpha && <Tag color={colorOf(DESIGN_ALPHAS, item.alpha)}>{item.alpha}</Tag>}
      </span>
      <span className="dw-row-size">{sizeText(files)}</span>
      <span className={`dw-row-due${due ? (due.days < 0 ? ' is-late' : due.days <= 7 ? ' is-soon' : '') : ''}`} title={due ? `${due.label} 마감 ${daysLeft(due.days)}` : undefined}>
        {due ? <><b>~{shortDate(due.date)}</b><small>{due.label}</small></> : item.status === 'done' ? <small>완료</small> : ''}
      </span>
      <span className={`dw-row-files${files.length > 0 && filled === files.length ? ' is-full' : ''}`}>
        {files.length > 0 ? `${filled} / ${files.length}` : '-'}
      </span>
      {item.split ? (
        <span className="dw-row-who">
          <label className={item.guide_done ? '' : 'is-turn'}>
            <em>가이드</em>
            <TagSelect value={item.guide_assignee} options={DESIGN_ASSIGNEES} label="가이드 담당" emptyLabel="미정"
              onChange={(guide_assignee) => actions.patchItem(item.id, { guide_assignee })} />
          </label>
          <label className={item.guide_done ? 'is-turn' : ''}>
            <em>채색</em>
            <TagSelect value={item.assignee} options={DESIGN_ASSIGNEES} label="채색 담당" emptyLabel="미정"
              onChange={(assignee) => actions.patchItem(item.id, { assignee })} />
          </label>
        </span>
      ) : (
        <TagSelect value={item.assignee} options={DESIGN_ASSIGNEES} label="담당자" emptyLabel="담당 미정"
          onChange={(assignee) => actions.patchItem(item.id, { assignee })} />
      )}
      <TagSelect value={item.status} options={DESIGN_STATUSES} label="상태"
        onChange={(status) => actions.patchItem(item.id, { status: status as DesignStatus })} />
    </div>
  );
}

function GroupSection({
  row, filesOf, filledOf, dueOf, draftsOf, latest, busyItems, open, canDrag, openId, nextGroupId, slot, setSlot, groupSlot, setGroupSlot,
  fileOver, setFileOver, onToggle, actions,
}: {
  row: BoardRows;
  filesOf: Map<string, DesignFile[]>;
  filledOf: Map<string, number>;
  dueOf: (item: DesignItem) => Deadline | null;
  draftsOf: Map<string, number>;
  latest: Map<string, DesignImage>;
  busyItems: Set<string>;
  open: boolean;
  canDrag: boolean;
  openId: string | null;
  nextGroupId: string | null;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  groupSlot: string | null | undefined;
  setGroupSlot: (id: string | null | undefined) => void;
  fileOver: string | null;
  setFileOver: (id: string | null) => void;
  onToggle: () => void;
  actions: BoardActions;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const { group, items, total, done } = row;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (hasType(e, ITEM_TYPE)) {
      // 줄 사이가 아닌 곳(머리글 · 접힌 묶음)에 놓으면 맨 뒤로 간다.
      e.preventDefault();
      setSlot({ groupId: group.id, beforeId: null });
    } else if (hasType(e, GROUP_TYPE)) {
      e.preventDefault();
      setGroupSlot(isUpperHalf(e) ? group.id : nextGroupId);
    }
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData(ITEM_TYPE);
    if (itemId && slot) actions.moveItem(itemId, slot.groupId, slot.beforeId);
    const groupId = e.dataTransfer.getData(GROUP_TYPE);
    if (groupId && groupSlot !== undefined) actions.moveGroup(groupId, groupSlot);
    setSlot(null);
    setGroupSlot(undefined);
  };

  return (
    <section
      ref={sectionRef}
      className={`dw-group c-${group.color}${groupSlot === group.id ? ' is-line-before' : ''}`}
      data-group-id={group.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="dw-group-head" onClick={onToggle}>
        {canDrag ? (
          <span
            className="dw-handle"
            draggable
            title="끌어서 묶음 옮기기"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData(GROUP_TYPE, group.id);
              if (sectionRef.current) e.dataTransfer.setDragImage(sectionRef.current, 12, 16);
            }}
            onDragEnd={() => setGroupSlot(undefined)}
          >⋮⋮</span>
        ) : <span />}
        <button type="button" className={`dw-caret${open ? ' is-open' : ''}`} aria-expanded={open} aria-label={`${group.name} ${open ? '접기' : '펼치기'}`}>▶</button>
        <button
          type="button"
          className="dw-dot"
          title="눌러서 색 바꾸기"
          aria-label="묶음 색 바꾸기"
          onClick={(e) => { e.stopPropagation(); actions.recolorGroup(group); }}
        />
        {editing ? (
          <span className="dw-group-title is-editing" onClick={(e) => e.stopPropagation()}>
            <EditableText className="dw-group-name-input" label="묶음 이름" value={group.name} autoFocus
              onSave={(name) => actions.patchGroup(group.id, { name })} />
            <EditableText className="dw-group-note-input" label="묶음 설명" placeholder="묶음 설명" value={group.note}
              onSave={(note) => actions.patchGroup(group.id, { note })} />
          </span>
        ) : (
          <span className="dw-group-title">
            <b>{group.name || '이름 없음'}</b>
            {group.note && <small>{group.note}</small>}
          </span>
        )}
        <span className="dw-group-progress" title={`완료 ${done} / 전체 ${total}`}>
          <span className="dw-bar"><i style={{ width: `${percent}%` }} /></span>
          <small>{done} / {total}</small>
        </span>
        <span className="dw-group-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((v) => !v)}>{editing ? '완료' : '이름 수정'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.removeGroup(group)}>삭제</button>
        </span>
      </header>
      {open && (
        <div className="dw-group-body">
          {items.length > 0 && (
            <div className="dw-row dw-row-head" aria-hidden="true">
              <span /><span /><span>요소</span><span>분류 · 우선 순위 · 투명</span><span>제작 크기</span><span>마감</span><span>파일</span><span>담당자</span><span>상태</span>
            </div>
          )}
          {items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              files={filesOf.get(item.id) ?? []}
              filled={filledOf.get(item.id) ?? 0}
              due={dueOf(item)}
              drafts={draftsOf.get(item.id) ?? 0}
              image={latest.get(item.id)}
              busy={busyItems.has(item.id)}
              canDrag={canDrag}
              active={openId === item.id}
              nextId={items[i + 1]?.id ?? null}
              slot={slot}
              setSlot={setSlot}
              fileOver={fileOver}
              setFileOver={setFileOver}
              actions={actions}
            />
          ))}
          <button
            type="button"
            className={`dw-add${slot?.groupId === group.id && slot.beforeId === null ? ' is-line-before' : ''}`}
            onClick={() => actions.addItem(group.id)}
          >+ 항목 추가</button>
        </div>
      )}
    </section>
  );
}

export default function DesignBoard({ rows, filesOf, filledOf, dueOf, draftsOf, latest, busyItems, isOpen, filtering, openId, onToggle, actions }: {
  rows: BoardRows[];
  filesOf: Map<string, DesignFile[]>;
  filledOf: Map<string, number>;
  dueOf: (item: DesignItem) => Deadline | null;
  draftsOf: Map<string, number>;
  latest: Map<string, DesignImage>;
  busyItems: Set<string>;
  isOpen: (groupId: string) => boolean;
  filtering: boolean;
  openId: string | null;
  onToggle: (groupId: string) => void;
  actions: BoardActions;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  // undefined = 끌고 있지 않음, null = 맨 뒤
  const [groupSlot, setGroupSlot] = useState<string | null | undefined>(undefined);
  const [fileOver, setFileOver] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="dw-empty">
        {filtering ? <p>조건에 맞는 항목이 없습니다.</p> : (
          <>
            <p>아직 묶음이 없습니다.</p>
            <button type="button" className="btn btn-primary" onClick={actions.addGroup}>+ 묶음 추가</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="dw-board">
      {rows.map((row, i) => (
        <GroupSection
          key={row.group.id}
          row={row}
          filesOf={filesOf}
          filledOf={filledOf}
          dueOf={dueOf}
          draftsOf={draftsOf}
          latest={latest}
          busyItems={busyItems}
          open={filtering || isOpen(row.group.id)}
          canDrag={!filtering}
          openId={openId}
          nextGroupId={rows[i + 1]?.group.id ?? null}
          slot={slot}
          setSlot={setSlot}
          groupSlot={groupSlot}
          setGroupSlot={setGroupSlot}
          fileOver={fileOver}
          setFileOver={setFileOver}
          onToggle={() => onToggle(row.group.id)}
          actions={actions}
        />
      ))}
      {!filtering && <button type="button" className="btn dw-add-group" onClick={actions.addGroup}>+ 묶음 추가</button>}
    </div>
  );
}
