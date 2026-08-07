import { useMemo, useRef, useState } from 'react';
import { splitLeadingNumber, buildGameLevel, gameLevelText, gameLevelFileName } from '../../utils/gameLevel';

interface Props {
  /** 맵 코드(base62). 이 문자열 하나가 맵 전체다. */
  code: string;
  /** 맵 제목. "2. 눈꽃과 크기 변화" 처럼 앞에 번호가 있으면 레벨 번호로 쓴다. */
  title: string;
  onClose: () => void;
}

/**
 * snowmen-adventure 의 `levels/L<n>.json` 에 **그대로 붙여넣을 JSON** 을 보여주고 복사한다.
 *
 * 왜 "복사" 만으로 부족한가:
 *  - 클립보드에 뭐가 들어갔는지 확인할 방법이 없다 (레벨 번호를 잘못 넣어도 모른다).
 *  - 브라우저/환경에 따라 navigator.clipboard 가 막히면 조용히 실패한다.
 * → 텍스트를 화면에 띄우고, 복사 실패 시 직접 긁어갈 수 있게 한다.
 */
export default function GameLevelExport({ code, title, onClose }: Props) {
  const parsed = useMemo(() => splitLeadingNumber(title || ''), [title]);
  const [levelNo, setLevelNo] = useState<number>(parsed.num ?? 1);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const text = useMemo(
    () => gameLevelText(buildGameLevel(code, levelNo, parsed.name)),
    [code, levelNo, parsed.name],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      // 클립보드 API 가 막힌 환경(비 HTTPS 등) → 전체 선택만 해주고 안내한다
      taRef.current?.focus();
      taRef.current?.select();
      setCopied('fail');
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">게임에 넣기</h3>

        <div className="export-row">
          <label className="export-lv">
            레벨 번호
            <input
              type="number" min={1} max={99} value={levelNo}
              onChange={(e) => setLevelNo(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
          </label>
          <div className="export-path">
            <span className="export-path-label">저장할 파일</span>
            <code>{gameLevelFileName(levelNo)}</code>
          </div>
        </div>

        <textarea
          ref={taRef}
          className="export-json"
          readOnly
          value={text}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />

        <p className="export-hint">
          위 내용을 <code>{gameLevelFileName(levelNo)}</code> 에 <b>통째로</b> 붙여넣으세요.
          게임은 레벨에 들어갈 때마다 파일을 다시 읽으므로 <b>재빌드가 필요 없습니다.</b>
          {parsed.num == null && (
            <> 제목에 번호가 없어서 레벨 번호를 <b>1</b>로 잡았습니다 — 위에서 바꿔주세요.</>
          )}
        </p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" onClick={copy}>
            {copied === 'ok' ? '✓ 복사됨' : copied === 'fail' ? '전체 선택됨 — Ctrl+C' : '📋 복사'}
          </button>
        </div>
      </div>
    </div>
  );
}
