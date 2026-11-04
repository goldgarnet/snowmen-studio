import { useState } from 'react';
import {
  DESIGN_ALPHAS, DESIGN_ASSIGNEES, DESIGN_CATEGORIES, DESIGN_PRIORITIES, DESIGN_STATUSES,
  type DesignFile, type DesignGroup, type DesignImage, type DesignItem, type DesignStatus,
} from '../../api/design';
import { ideaList, textLines } from '../../lib/designBoard';
import { useEscapeKey } from '../../lib/useEscapeKey';
import DesignFileCard from './DesignFileCard';
import EditableText, { EditableBlock } from './EditableText';
import { TagSelect } from './tags';

const PLACEMENT_TEXT: Record<string, string> = {
  tile: '캔버스를 꽉 채워 정사각으로 그립니다. 게임이 칸 모양에 맞춰 눕힙니다.',
  mark: '캔버스 가운데에 놓습니다. 바닥에 붙은 모습으로 세로를 0.86배 눌러 그립니다.',
  stand: '가로 가운데에 놓고, 발(공 바닥 · 밑동)을 아래 여백 선에 맞춥니다.',
  solid: '캔버스 맨 아래 가운데에 붙입니다. 앞면이 아래, 윗면이 위입니다.',
  arch: '기둥 발을 캔버스 맨 아래에 맞춥니다.',
  center: '캔버스 가운데에 놓습니다.',
  screen: '화면 전체 그림입니다. 캔버스를 꽉 채웁니다.',
};

export default function DesignItemPanel({
  item, group, files, images, busyFiles, onPatch, onPickFile, onPatchFile, onAddFile, onRemoveFile, onRemoveImage, onRemove, onClose,
}: {
  item: DesignItem;
  group: DesignGroup | undefined;
  files: DesignFile[];
  images: DesignImage[];   // 이 항목의 그림, 최근 것부터
  busyFiles: Set<string>;
  onPatch: (patch: Partial<DesignItem>) => void;
  onPickFile: (file: DesignFile, picked: File[]) => void;
  onPatchFile: (id: string, patch: Partial<DesignFile>) => void;
  onAddFile: () => void;
  onRemoveFile: (file: DesignFile) => void;
  onRemoveImage: (image: DesignImage) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [guide, setGuide] = useState(true);
  const placement = PLACEMENT_TEXT[files.find((f) => f.canvas_w)?.placement ?? ''];
  const filled = files.filter((f) => images.some((i) => i.file_id === f.id)).length;

  // 글을 고치는 중이면 Esc 는 칸만 벗어나 저장하고, 한 번 더 누르면 닫는다.
  useEscapeKey(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
    else onClose();
  }, true);

  return (
    <>
      <div className="dw-panel-back" onClick={onClose} />
      <aside className={`dw-panel c-${group?.color ?? 'gray'}`} aria-label={`${item.name || '항목'} 상세`}>
        <header className="dw-panel-head">
          <div className="dw-panel-crumb"><i />{group?.name}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </header>
        <EditableText className="dw-panel-title" label="요소명" placeholder="요소명" value={item.name} onSave={(name) => onPatch({ name })} />

        <div className="dw-props">
          <div><span>담당자</span><TagSelect value={item.assignee} options={DESIGN_ASSIGNEES} label="담당자" emptyLabel="담당 미정" onChange={(assignee) => onPatch({ assignee })} /></div>
          <div><span>상태</span><TagSelect value={item.status} options={DESIGN_STATUSES} label="상태" onChange={(status) => onPatch({ status: status as DesignStatus })} /></div>
          <div><span>우선 순위</span><TagSelect value={item.priority} options={DESIGN_PRIORITIES} label="우선 순위" emptyLabel="없음" onChange={(priority) => onPatch({ priority })} /></div>
          <div><span>분류</span><TagSelect value={item.category} options={DESIGN_CATEGORIES} label="분류" emptyLabel="없음" onChange={(category) => onPatch({ category })} /></div>
          <div><span>투명 여부</span><TagSelect value={item.alpha} options={DESIGN_ALPHAS} label="투명 여부" emptyLabel="없음" onChange={(alpha) => onPatch({ alpha })} /></div>
        </div>

        {item.is_new && (
          <p className="dw-callout">게임에 아직 그림 자리가 없는 새 항목입니다. 크기와 파일명은 바뀔 수 있습니다.</p>
        )}

        <section className="dw-sec">
          <h3>설명</h3>
          <EditableBlock label="설명" placeholder="무엇을 그리는지 적어 주세요." value={item.description} onSave={(description) => onPatch({ description })}>
            {textLines(item.description).map((line) => <p key={line} className="dw-desc-text">{line}</p>)}
          </EditableBlock>
        </section>

        <section className="dw-sec">
          <h3>지킬 것</h3>
          {placement && <p className="dw-place"><b>그리는 위치</b> {placement}</p>}
          <EditableBlock label="지킬 것" placeholder="한 줄에 하나씩 적어 주세요." rows={5} value={item.rules} onSave={(rules) => onPatch({ rules })}>
            <ul className="dw-rules">{textLines(item.rules).map((line) => <li key={line}>{line}</li>)}</ul>
          </EditableBlock>
          <p className="dw-common">모든 그림 공통: PNG · sRGB · 투명 여백 자르지 않기 · 그림자 넣지 않기(엔진이 그림)</p>
        </section>

        <section className="dw-sec">
          <div className="dw-sec-head">
            <h3>파일 <small>{filled} / {files.length}</small></h3>
            <label className="dw-guide-toggle">
              <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> 규격선 보기
            </label>
          </div>
          {guide && (
            <p className="dw-guide-legend">
              <span><i className="is-canvas" />점선: 캔버스</span>
              <span><i className="is-body" />파란 상자: 본체</span>
              <span><i className="is-ground" />주황 선: 아래 여백</span>
            </p>
          )}
          <div className="dw-files">
            {files.map((file) => (
              <DesignFileCard
                key={file.id}
                file={file}
                images={images.filter((i) => i.file_id === file.id)}
                guide={guide}
                busy={busyFiles.has(file.id)}
                onPick={(picked) => onPickFile(file, picked)}
                onPatch={(patch) => onPatchFile(file.id, patch)}
                onRemove={() => onRemoveFile(file)}
                onRemoveImage={onRemoveImage}
              />
            ))}
            <button type="button" className="dw-file-add" onClick={onAddFile}>+ 파일 칸 추가</button>
          </div>
        </section>

        <section className="dw-sec">
          <h3>참고 아이디어</h3>
          <EditableBlock label="참고 아이디어" placeholder="쉼표로 나누어 적어 주세요." rows={2} value={item.ideas} onSave={(ideas) => onPatch({ ideas })}>
            <ul className="dw-ideas">{ideaList(item.ideas).map((idea) => <li key={idea}>{idea}</li>)}</ul>
          </EditableBlock>
        </section>

        <button type="button" className="btn btn-danger btn-sm dw-panel-remove" onClick={onRemove}>항목 삭제</button>
      </aside>
    </>
  );
}
