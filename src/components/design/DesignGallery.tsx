import { useRef, useState, type DragEvent } from 'react';
import { imageUrl, IMAGE_RANKS, type DesignImage } from '../../api/design';
import { TagSelect } from './tags';

const IMAGE_TYPE = 'application/x-design-image';

// 시안 · 가이드 그림 모음. 몇 장이든 올리고, 끌어서 순서를 바꾸고, 우선순위와 채택을 고른다.
export default function DesignGallery({ images, comments, busy, emptyText, onUpload, onMove, onRank, onPick, onOpen }: {
  images: DesignImage[];              // 보이는 순서대로
  comments: Map<string, number>;      // 그림별 피드백 수
  busy: boolean;
  emptyText: string;
  onUpload: (picked: File[]) => void;
  onMove: (id: string, beforeId: string | null) => void;
  onRank: (id: string, rank: string) => void;
  onPick: (image: DesignImage) => void;
  onOpen: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileOver, setFileOver] = useState(false);
  const [slot, setSlot] = useState<string | null | undefined>(undefined);   // 끌어 놓을 자리. undefined = 끄는 중 아님

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const onCardOver = (e: DragEvent<HTMLElement>, id: string, nextId: string | null) => {
    if (!e.dataTransfer.types.includes(IMAGE_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setSlot(e.clientX < r.left + r.width / 2 ? id : nextId);
  };
  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFileOver(false);
    if (hasFiles(e)) {
      onUpload(Array.from(e.dataTransfer.files));
      return;
    }
    const id = e.dataTransfer.getData(IMAGE_TYPE);
    if (id && slot !== undefined) onMove(id, slot);
    setSlot(undefined);
  };

  return (
    <div
      className={`dw-gallery${fileOver ? ' is-over' : ''}`}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setFileOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false); }}
      onDrop={drop}
    >
      {images.map((image, i) => {
        const count = comments.get(image.id) ?? 0;
        return (
          <article
            key={image.id}
            className={`dw-shot${image.picked ? ' is-picked' : ''}${slot === image.id ? ' is-before' : ''}`}
            data-image-id={image.id}
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(IMAGE_TYPE, image.id); }}
            onDragEnd={() => setSlot(undefined)}
            onDragOver={(e) => onCardOver(e, image.id, images[i + 1]?.id ?? null)}
          >
            <button type="button" className="dw-shot-open" aria-label={`시안 ${i + 1} 크게 보기`} onClick={() => onOpen(image.id)}>
              <img src={imageUrl(image.path)} alt="" loading="lazy" draggable={false} />
              <i className="dw-shot-no">{i + 1}</i>
              {image.picked && <b className="dw-shot-pick">채택</b>}
            </button>
            <div className="dw-shot-foot">
              <TagSelect value={image.rank} options={IMAGE_RANKS} label="우선순위" emptyLabel="순위 없음" onChange={(rank) => onRank(image.id, rank)} />
              <button type="button" className={`dw-shot-btn${image.picked ? ' is-on' : ''}`} onClick={() => onPick(image)}>{image.picked ? '채택 취소' : '채택'}</button>
              <button type="button" className="dw-shot-btn" onClick={() => onOpen(image.id)}>피드백 {count}</button>
            </div>
            <p className="dw-shot-meta">{image.uploader_name}</p>
          </article>
        );
      })}
      <div className={`dw-shot-add${slot === null ? ' is-before' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(IMAGE_TYPE)) { e.preventDefault(); e.stopPropagation(); setSlot(null); } }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="시안 파일 선택"
          onChange={(e) => { onUpload(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? '올리는 중…' : '여러 장 선택'}
        </button>
        <span>{images.length === 0 ? emptyText : '또는 끌어다 놓기'}</span>
      </div>
    </div>
  );
}
