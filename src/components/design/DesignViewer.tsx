import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { downloadUrl, imageUrl, IMAGE_RANKS, type DesignComment, type DesignImage } from '../../api/design';
import { viewerZoom } from '../../lib/designBoard';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { PickButton, type SlotChoice } from './DesignGallery';
import { TagSelect } from './tags';

const when = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 그림을 보며 피드백을 다는 화면. 원본 크기로 보이고, 화면보다 큰 그림만 줄인다.
// 그림을 누르면 그 자리에 번호를 찍어 피드백을 남길 수 있다.
export default function DesignViewer({
  title, images, comments, startId, userId, ranked, slotChoices, onClose, onRank, onPick, onAddComment, onRemoveComment, onRemoveImage,
}: {
  title: string;
  images: DesignImage[];
  comments: DesignComment[];   // 이 그림들의 피드백, 오래된 것부터
  startId: string;
  userId: string;
  ranked: boolean;             // 시안 · 가이드면 우선순위와 채택을 보여 준다
  slotChoices: SlotChoice[];   // 채택할 때 고를 파일 칸
  onClose: () => void;
  onRank: (id: string, rank: string) => void;
  onPick: (image: DesignImage, slotId?: string) => void;
  onAddComment: (imageId: string, body: string, pin: { x: number; y: number } | null) => void;
  onRemoveComment: (comment: DesignComment) => void;
  onRemoveImage: (image: DesignImage) => void;
}) {
  const [currentId, setCurrentId] = useState(startId);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [body, setBody] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<Record<string, { w: number; h: number }>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const index = Math.max(0, images.findIndex((i) => i.id === currentId));
  const current = images[index];

  const go = (delta: number) => {
    if (images.length === 0) return;
    setCurrentId(images[(index + delta + images.length) % images.length].id);
    setPin(null);
  };

  useEscapeKey(() => {
    if (document.activeElement === inputRef.current) inputRef.current?.blur();
    else onClose();
  }, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') setCurrentId((id) => stepFrom(images, id, -1));
      if (e.key === 'ArrowRight') setCurrentId((id) => stepFrom(images, id, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images]);

  if (!current) return null;

  const own = comments.filter((c) => c.image_id === current.id);
  const pinned = own.filter((c) => c.pin_x != null && c.pin_y != null);
  const nw = current.width ?? natural[current.id]?.w ?? 0;
  const nh = current.height ?? natural[current.id]?.h ?? 0;
  const zoom = viewerZoom(nw, nh, box.w, box.h, parseFloat(getComputedStyle(document.body).zoom) || 1);

  const placePin = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPin({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    inputRef.current?.focus();
  };
  const submit = () => {
    if (!body.trim()) return;
    onAddComment(current.id, body.trim(), pin);
    setBody('');
    setPin(null);
  };

  return (
    <div className="dw-view" role="dialog" aria-label={`${title} 크게 보기`}>
      <div className="dw-view-main">
        <header className="dw-view-bar">
          <button type="button" className="dw-view-arrow" aria-label="이전 그림" onClick={() => go(-1)}>‹</button>
          <b>{index + 1} / {images.length}</b>
          <button type="button" className="dw-view-arrow" aria-label="다음 그림" onClick={() => go(1)}>›</button>
          <span className="dw-view-title">{title}</span>
          {ranked && <TagSelect value={current.rank} options={IMAGE_RANKS} label="우선순위" emptyLabel="순위 없음" onChange={(rank) => onRank(current.id, rank)} />}
          {ranked && <PickButton image={current} slots={slotChoices} onPick={onPick} />}
          <a className="dw-shot-btn" href={downloadUrl(current.path, current.file_name)}>받기</a>
          <button type="button" className="dw-shot-btn" onClick={() => onRemoveImage(current)}>삭제</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>닫기</button>
        </header>
        <div className="dw-view-stage" ref={stageRef}>
          <div
            className="dw-view-frame"
            style={zoom ? { width: nw * zoom, height: nh * zoom } : undefined}
            onClick={placePin}
          >
            <img
              key={current.id}
              src={imageUrl(current.path)}
              alt={current.file_name}
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                setNatural((n) => ({ ...n, [current.id]: { w, h } }));
              }}
            />
            {pinned.map((c, i) => (
              <i key={c.id} className={`dw-pin${hovered === c.id ? ' is-hot' : ''}`} style={{ left: `${(c.pin_x as number) * 100}%`, top: `${(c.pin_y as number) * 100}%` }}>{i + 1}</i>
            ))}
            {pin && <i className="dw-pin is-new" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}>{pinned.length + 1}</i>}
          </div>
        </div>
        {images.length > 1 && (
          <div className="dw-view-strip">
            {images.map((image, i) => (
              <button
                key={image.id}
                type="button"
                className={image.id === current.id ? 'is-on' : ''}
                aria-label={`${i + 1}번 그림`}
                onClick={() => { setCurrentId(image.id); setPin(null); }}
              >
                <img src={imageUrl(image.path)} alt="" draggable={false} />
                {image.picked && <b>채택</b>}
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="dw-view-side">
        <h3>피드백 <small>{own.length}</small></h3>
        <p className="dw-view-file">
          {current.file_name}
          <span>{current.width && current.height ? `${current.width} × ${current.height} px · ` : ''}{current.uploader_name} · {when(current.created_at)}</span>
        </p>
        <ul className="dw-comments">
          {own.map((c) => {
            const no = c.pin_x != null ? pinned.indexOf(c) + 1 : null;
            return (
              <li key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)}>
                <div className="dw-comment-head">
                  {no != null && <i className="dw-pin-no">{no}</i>}
                  <b>{c.author_name}</b>
                  <span>{when(c.created_at)}</span>
                  {c.author_id === userId && <button type="button" onClick={() => onRemoveComment(c)}>삭제</button>}
                </div>
                <p>{c.body}</p>
              </li>
            );
          })}
          {own.length === 0 && <li className="dw-comments-empty">아직 피드백이 없습니다.</li>}
        </ul>
        <div className="dw-comment-form">
          <p>
            {pin
              ? <>그림의 <b>{pinned.length + 1}번 위치</b>에 남깁니다. <button type="button" onClick={() => setPin(null)}>위치 빼기</button></>
              : '그림을 누르면 그 위치에 번호를 찍습니다.'}
          </p>
          <textarea
            ref={inputRef}
            className="field-textarea"
            rows={3}
            placeholder="피드백을 적어 주세요."
            aria-label="피드백"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={!body.trim()} onClick={submit}>피드백 남기기</button>
        </div>
      </aside>
    </div>
  );
}

function stepFrom(images: DesignImage[], id: string, delta: number): string {
  const at = images.findIndex((i) => i.id === id);
  return images[(at + delta + images.length) % images.length]?.id ?? id;
}
