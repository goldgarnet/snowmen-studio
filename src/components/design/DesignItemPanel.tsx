import { useState, type DragEvent } from 'react';
import { imageUrl, type DesignImage, type DesignItem } from '../../api/design';
import { imageWarnings } from '../../lib/designBoard';
import { useEscapeKey } from '../../lib/useEscapeKey';
import EditableText from './EditableText';

const when = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function DesignItemPanel({
  item, images, uploading, onPatch, onUpload, onRemoveImage, onRemove, onClose,
}: {
  item: DesignItem;
  images: DesignImage[];   // 최근 것부터
  uploading: boolean;
  onPatch: (patch: Partial<DesignItem>) => void;
  onUpload: (files: File[]) => void;
  onRemoveImage: (image: DesignImage) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [over, setOver] = useState(false);
  const current = images[0];
  const warnings = current ? imageWarnings(item, current.file_name, current.width, current.height) : [];

  // 글을 고치는 중이면 Esc 는 칸만 벗어나 저장하고, 한 번 더 누르면 닫는다.
  useEscapeKey(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
    else onClose();
  }, true);

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    onUpload(Array.from(e.dataTransfer.files));
  };

  return (
    <aside className="dw-panel" aria-label={`${item.name || '항목'} 상세`}>
      <header className="dw-panel-head">
        <EditableText className="dw-panel-title" label="요소명" placeholder="요소명" value={item.name}
          onSave={(name) => onPatch({ name })} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </header>

      <div
        className={`dw-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {current
          ? <img src={imageUrl(current.path)} alt={current.file_name} />
          : <p>{uploading ? '올리는 중…' : '그림을 여기로 끌어다 놓으세요'}</p>}
      </div>
      {warnings.map((w) => <p key={w} className="dw-warning">{w}</p>)}

      <label className="field-label">파일명</label>
      <EditableText className="field-input" label="파일명" value={item.file_name} onSave={(file_name) => onPatch({ file_name })} />
      <label className="field-label">제작 크기</label>
      <EditableText className="field-textarea" label="제작 크기" multiline rows={2} placeholder="256 × 256 px" value={item.spec}
        onSave={(spec) => onPatch({ spec })} />
      <label className="field-label">세부 설명</label>
      <EditableText className="field-textarea" label="세부 설명" multiline rows={5} value={item.description}
        onSave={(description) => onPatch({ description })} />

      {images.length > 0 && (
        <>
          <label className="field-label">올린 그림 {images.length}개</label>
          <ul className="dw-versions">
            {images.map((image) => (
              <li key={image.id}>
                <a href={imageUrl(image.path)} target="_blank" rel="noreferrer"><img src={imageUrl(image.path)} alt="" loading="lazy" /></a>
                <div>
                  <b>{image.file_name}</b>
                  <span>{image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}{image.uploader_name} · {when(image.created_at)}</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemoveImage(image)}>삭제</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="btn btn-danger btn-sm dw-panel-remove" onClick={onRemove}>항목 삭제</button>
    </aside>
  );
}
