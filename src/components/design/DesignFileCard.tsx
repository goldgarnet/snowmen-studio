import { useId, useRef, useState, type DragEvent } from 'react';
import { downloadUrl, imageUrl, type DesignFile, type DesignImage } from '../../api/design';
import { bodyBox, sizeProblem } from '../../lib/designBoard';
import EditableText from './EditableText';

const when = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const looksLikeImage = (name: string) => /\.(png|jpe?g|webp|gif)$/i.test(name);

/** 규격대로 그린 캔버스. 그림이 있으면 그 위에 본체 상자와 아래 여백 선을 겹쳐 위치를 바로 확인한다. */
function CanvasStage({ file, url, guide }: { file: DesignFile; url: string | null; guide: boolean }) {
  const id = useId();
  const w = file.canvas_w;
  const h = file.canvas_h;
  if (!w || !h) {
    return url
      ? <img className="dw-stage-img" src={url} alt="" />
      : <div className="dw-stage-free">크기 자유</div>;
  }
  const box = bodyBox(file);
  const cell = Math.max(w, h) / 14;
  const groundY = file.bottom_px ? h - file.bottom_px : null;
  const faceY = box && file.face_px ? box.y + box.h - file.face_px : null;
  return (
    <svg className="dw-stage-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${w} × ${h} px 캔버스`}>
      <defs>
        <pattern id={id} width={cell * 2} height={cell * 2} patternUnits="userSpaceOnUse">
          <rect width={cell * 2} height={cell * 2} className="dw-check-a" />
          <rect width={cell} height={cell} className="dw-check-b" />
          <rect x={cell} y={cell} width={cell} height={cell} className="dw-check-b" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} />
      {url && <image href={url} width={w} height={h} preserveAspectRatio="xMidYMid meet" />}
      {guide && box && <rect x={box.x} y={box.y} width={box.w} height={box.h} className={url ? 'dw-guide-body is-over' : 'dw-guide-body'} />}
      {guide && faceY != null && box && <line x1={box.x} x2={box.x + box.w} y1={faceY} y2={faceY} className="dw-guide-face" />}
      {guide && groundY != null && <line x1={0} x2={w} y1={groundY} y2={groundY} className="dw-guide-ground" />}
      <rect width={w} height={h} className="dw-guide-canvas" />
    </svg>
  );
}

function NumberCell({ value, label, onSave }: { value: number | null; label: string; onSave: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="dw-num">
      <span>{label}</span>
      <input
        inputMode="numeric"
        value={draft ?? (value ?? '')}
        onFocus={() => setDraft(String(value ?? ''))}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => {
          const next = draft ? Number(draft) : null;
          if (draft !== null && next !== value) onSave(next);
          setDraft(null);
        }}
      />
    </label>
  );
}

export default function DesignFileCard({ file, images, guide, busy, onPick, onPatch, onRemove, onRemoveImage }: {
  file: DesignFile;
  images: DesignImage[];   // 최근 것부터
  guide: boolean;
  busy: boolean;
  onPick: (picked: File[]) => void;
  onPatch: (patch: Partial<DesignFile>) => void;
  onRemove: () => void;
  onRemoveImage: (image: DesignImage) => void;
}) {
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = images[0];
  const problem = current ? sizeProblem(file, current.width, current.height) : null;
  const url = current && looksLikeImage(current.file_name) ? imageUrl(current.path) : null;
  const saveName = file.file_name || current?.file_name || '';

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    onPick(Array.from(e.dataTransfer.files).slice(0, 1));
  };

  return (
    <article className={`dw-file${current ? ' is-filled' : ''}${problem ? ' has-problem' : ''}`} data-file-id={file.id}>
      <div
        className={`dw-stage${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <CanvasStage file={file} url={url} guide={guide} />
        {current && !url && <span className="dw-stage-note">{current.file_name}</span>}
        {busy && <span className="dw-stage-note">올리는 중…</span>}
      </div>

      <div className="dw-file-body">
        <div className="dw-file-head">
          <b>{file.label || '파일'}</b>
          <span className={`dw-file-state${problem ? ' is-warn' : current ? ' is-ok' : ''}`}>
            {problem ? '확인 필요' : current ? '올림' : '아직 없음'}
          </span>
        </div>
        {file.file_name
          ? <code className="dw-file-name">{file.file_name}</code>
          : <span className="dw-file-name is-free">파일명 자유</span>}

        {editing ? (
          <div className="dw-file-edit">
            <EditableText className="field-input" label="라벨" placeholder="라벨" value={file.label} onSave={(label) => onPatch({ label })} />
            <EditableText className="field-input" label="파일명" placeholder="파일명" value={file.file_name} onSave={(file_name) => onPatch({ file_name })} />
            <div className="dw-nums">
              <NumberCell label="캔버스 가로" value={file.canvas_w} onSave={(canvas_w) => onPatch({ canvas_w })} />
              <NumberCell label="캔버스 세로" value={file.canvas_h} onSave={(canvas_h) => onPatch({ canvas_h })} />
              <NumberCell label="본체 가로" value={file.body_w} onSave={(body_w) => onPatch({ body_w })} />
              <NumberCell label="본체 세로" value={file.body_h} onSave={(body_h) => onPatch({ body_h })} />
              <NumberCell label="아래 여백" value={file.bottom_px} onSave={(bottom_px) => onPatch({ bottom_px })} />
            </div>
            <EditableText className="field-input" label="규격 메모" placeholder="규격 메모" value={file.spec_note} onSave={(spec_note) => onPatch({ spec_note })} />
            <EditableText className="field-input" label="파일 설명" placeholder="파일 설명" value={file.note} onSave={(note) => onPatch({ note })} />
          </div>
        ) : (
          <>
            <dl className="dw-spec">
              {file.canvas_w && file.canvas_h ? <div><dt>캔버스</dt><dd>{file.canvas_w} × {file.canvas_h} px</dd></div> : null}
              {file.body_w && file.body_h ? <div><dt>{file.placement === 'arch' ? '통과 공간' : '본체'}</dt><dd>{file.body_w} × {file.body_h} px</dd></div> : null}
              {file.bottom_px ? <div><dt>아래 여백</dt><dd>{file.bottom_px} px</dd></div> : null}
            </dl>
            {file.spec_note && <p className="dw-file-spec-note">{file.spec_note}</p>}
            {file.note && <p className="dw-file-note">{file.note}</p>}
          </>
        )}

        {problem && <p className="dw-file-warn">{problem}</p>}

        <div className="dw-file-actions">
          <input
            ref={inputRef}
            type="file"
            hidden
            aria-label={`${file.label || '파일'} 파일 선택`}
            onChange={(e) => { onPick(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {current ? '새 버전 올리기' : '파일 선택'}
          </button>
          {current && <a className="btn btn-sm" href={downloadUrl(current.path, saveName)}>받기</a>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((v) => !v)}>{editing ? '완료' : '수정'}</button>
        </div>
        {editing && <button type="button" className="dw-link-danger" onClick={onRemove}>이 파일 칸 삭제</button>}

        {images.length > 0 && (
          <>
            <button type="button" className="dw-history-toggle" aria-expanded={history} onClick={() => setHistory((v) => !v)}>
              올린 기록 {images.length}개 {history ? '접기' : '보기'}
            </button>
            {history && (
              <ul className="dw-history">
                {images.map((image, i) => (
                  <li key={image.id}>
                    <div>
                      <b>{i === 0 ? '최신 · ' : ''}{image.file_name}</b>
                      <span>{image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}{image.uploader_name} · {when(image.created_at)}</span>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemoveImage(image)}>삭제</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </article>
  );
}
