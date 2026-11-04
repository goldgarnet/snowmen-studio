import { useRef, useState, type DragEvent } from 'react';
import { DESIGN_STATUSES, imageUrl, type DesignData, type DesignGroup, type DesignImage, type DesignItem, type DesignStatus } from '../../api/design';
import { bySortOrder, imageWarnings } from '../../lib/designBoard';
import EditableText from './EditableText';

export interface BoardActions {
  addGroup: () => void;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (group: DesignGroup) => void;
  moveGroup: (id: string, beforeId: string | null) => void;
  addItem: (groupId: string) => void;
  patchItem: (id: string, patch: Partial<DesignItem>) => void;
  moveItem: (id: string, groupId: string, beforeId: string | null) => void;
  uploadTo: (itemId: string, files: File[]) => void;
  addItemsFromFiles: (groupId: string, files: File[]) => void;
  openItem: (id: string) => void;
}

const ITEM_TYPE = 'application/x-design-item';
const GROUP_TYPE = 'application/x-design-group';

const hasType = (e: DragEvent, type: string) => e.dataTransfer.types.includes(type);
const hasFiles = (e: DragEvent) => hasType(e, 'Files');
const droppedFiles = (e: DragEvent) => Array.from(e.dataTransfer.files);

// 마우스가 요소의 위쪽 절반이면 그 앞에, 아래쪽 절반이면 그 뒤에 놓는다.
const isUpperHalf = (e: DragEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2;
};

interface Slot {
  groupId: string;
  beforeId: string | null;
}

function ItemRow({
  item, nextId, image, uploading, slot, setSlot, fileOver, setFileOver, actions,
}: {
  item: DesignItem;
  nextId: string | null;
  image: DesignImage | undefined;
  uploading: boolean;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  fileOver: string | null;
  setFileOver: (id: string | null) => void;
  actions: BoardActions;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const warnings = image ? imageWarnings(item, image.file_name, image.width, image.height) : [];
  const lineBefore = slot?.beforeId === item.id;

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
      actions.uploadTo(item.id, droppedFiles(e));
    }
  };

  return (
    <div
      ref={rowRef}
      className={`dw-row${lineBefore ? ' is-line-before' : ''}${fileOver === item.id ? ' is-file-over' : ''}`}
      data-item-id={item.id}
      onDragOver={onDragOver}
      onDragLeave={() => { if (fileOver === item.id) setFileOver(null); }}
      onDrop={onDrop}
    >
      <span
        className="dw-handle"
        draggable
        title="끌어서 위치 옮기기"
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData(ITEM_TYPE, item.id);
          if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 12, 16);
        }}
        onDragEnd={() => setSlot(null)}
      >⋮⋮</span>
      <button type="button" className="dw-thumb" onClick={() => actions.openItem(item.id)} aria-label={`${item.name || '항목'} 열기`}>
        {image ? <img src={imageUrl(image.path)} alt="" loading="lazy" /> : <span>{uploading ? '…' : '+'}</span>}
        {warnings.length > 0 && <i className="dw-warn-dot" title={warnings.join('\n')}>!</i>}
      </button>
      <EditableText className="dw-cell dw-cell-name" label="요소명" placeholder="요소명" value={item.name}
        onSave={(name) => actions.patchItem(item.id, { name })} />
      <EditableText className="dw-cell dw-cell-file" label="파일명" placeholder="파일명" value={item.file_name}
        onSave={(file_name) => actions.patchItem(item.id, { file_name })} />
      <EditableText className="dw-cell" label="담당자" placeholder="담당자" value={item.assignee}
        onSave={(assignee) => actions.patchItem(item.id, { assignee })} />
      <select
        className={`dw-status is-${item.status}`}
        aria-label="상태"
        value={item.status}
        onChange={(e) => actions.patchItem(item.id, { status: e.target.value as DesignStatus })}
      >
        {DESIGN_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <button type="button" className="dw-desc" onClick={() => actions.openItem(item.id)}>
        {item.description || <span className="dw-faint">세부 설명</span>}
      </button>
    </div>
  );
}

function GroupSection({
  group, items, latest, uploading, nextGroupId, slot, setSlot, groupSlot, setGroupSlot, fileOver, setFileOver, actions,
}: {
  group: DesignGroup;
  items: DesignItem[];
  latest: Map<string, DesignImage>;
  uploading: Set<string>;
  nextGroupId: string | null;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  groupSlot: string | null | undefined;
  setGroupSlot: (id: string | null | undefined) => void;
  fileOver: string | null;
  setFileOver: (id: string | null) => void;
  actions: BoardActions;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const done = items.filter((i) => i.status === 'done').length;
  const fileKey = `group:${group.id}`;

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (hasFiles(e)) {
      e.preventDefault();
      setFileOver(fileKey);
    } else if (hasType(e, ITEM_TYPE)) {
      // 줄 사이가 아닌 곳(머리글·빈 묶음)에 놓으면 맨 뒤로 간다.
      e.preventDefault();
      setSlot({ groupId: group.id, beforeId: null });
    } else if (hasType(e, GROUP_TYPE)) {
      e.preventDefault();
      setGroupSlot(isUpperHalf(e) ? group.id : nextGroupId);
    }
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setFileOver(null);
    if (hasFiles(e)) {
      actions.addItemsFromFiles(group.id, droppedFiles(e));
      return;
    }
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
      className={`dw-group${groupSlot === group.id ? ' is-line-before' : ''}${fileOver === fileKey ? ' is-file-over' : ''}`}
      data-group-id={group.id}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (fileOver === fileKey && !e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(null);
      }}
      onDrop={onDrop}
    >
      <header className="dw-group-head">
        <span
          className="dw-handle"
          draggable
          title="끌어서 묶음 옮기기"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(GROUP_TYPE, group.id);
            if (sectionRef.current) e.dataTransfer.setDragImage(sectionRef.current, 12, 16);
          }}
          onDragEnd={() => setGroupSlot(undefined)}
        >⋮⋮</span>
        <EditableText className="dw-group-name" label="묶음 이름" placeholder="묶음 이름" value={group.name}
          onSave={(name) => actions.renameGroup(group.id, name)} />
        <span className="dw-count">{done} / {items.length}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.removeGroup(group)}>묶음 삭제</button>
      </header>
      {items.length > 0 && (
        <div className="dw-row dw-row-head" aria-hidden="true">
          <span /><span /><span>요소명</span><span>파일명</span><span>담당자</span><span>상태</span><span>세부 설명</span>
        </div>
      )}
      {items.map((item, i) => (
        <ItemRow
          key={item.id}
          item={item}
          nextId={items[i + 1]?.id ?? null}
          image={latest.get(item.id)}
          uploading={uploading.has(item.id)}
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
      >+ 항목 추가 <span className="dw-faint">또는 그림을 여기로 끌어다 놓기</span></button>
    </section>
  );
}

export default function DesignBoard({ data, uploading, actions }: {
  data: DesignData;
  uploading: Set<string>;
  actions: BoardActions;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  // undefined = 끌고 있지 않음, null = 맨 뒤
  const [groupSlot, setGroupSlot] = useState<string | null | undefined>(undefined);
  const [fileOver, setFileOver] = useState<string | null>(null);

  const groups = [...data.groups].sort(bySortOrder);
  const latest = new Map<string, DesignImage>();
  for (const image of data.images) if (!latest.has(image.item_id)) latest.set(image.item_id, image);

  if (groups.length === 0) {
    return (
      <div className="dw-empty">
        <p>아직 묶음이 없습니다. 타일, 캐릭터처럼 작업 묶음을 만들어 시작하세요.</p>
        <button type="button" className="btn btn-primary" onClick={actions.addGroup}>+ 묶음 추가</button>
      </div>
    );
  }

  return (
    <div className="dw-board">
      {groups.map((group, i) => (
        <GroupSection
          key={group.id}
          group={group}
          items={data.items.filter((item) => item.group_id === group.id).sort(bySortOrder)}
          latest={latest}
          uploading={uploading}
          nextGroupId={groups[i + 1]?.id ?? null}
          slot={slot}
          setSlot={setSlot}
          groupSlot={groupSlot}
          setGroupSlot={setGroupSlot}
          fileOver={fileOver}
          setFileOver={setFileOver}
          actions={actions}
        />
      ))}
      <button type="button" className="btn dw-add-group" onClick={actions.addGroup}>+ 묶음 추가</button>
    </div>
  );
}
