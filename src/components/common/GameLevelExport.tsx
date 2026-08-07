import { useMemo, useRef, useState } from 'react';
import { buildGameLevel, gameLevelText, gameLevelFileName } from '../../utils/gameLevel';

interface Props {
  /** 맵 코드(base62). 이 문자열 하나가 맵 전체다. */
  code: string;
  /** 맵 제목. 그대로 게임의 레벨 이름이 된다 (번호를 뽑아내거나 하지 않는다). */
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
 *
 * ⚠ 레벨 번호는 **사용자가 정한다.** 챕터 순서가 아직 안 정해졌고 제목에 번호를
 *   붙이는 규칙도 없어서, 제목에서 추측하면 조용히 틀린 번호가 나간다.
 */
export default function GameLevelExport({ code, title, onClose }: Props) {
  const [levelNo, setLevelNo] = useState<number>(1);
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const text = useMemo(
    () => gameLevelText(buildGameLevel(code, levelNo, title)),
    [code, levelNo, title],
  );

  const setNo = (v: number) => {
    setLevelNo(Math.max(1, Math.min(99, v || 1)));
    setTouched(true);
  };

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
            몇 번 레벨로 넣을까요?
            <div className="export-lv-input">
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setNo(levelNo - 1)} aria-label="번호 줄이기">−</button>
              <input
                type="number" min={1} max={99} value={levelNo}
                onChange={(e) => setNo(Number(e.target.value))}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setNo(levelNo + 1)} aria-label="번호 늘리기">+</button>
            </div>
          </label>
          <div className="export-path">
            <span className="export-path-label">저장할 파일</span>
            <code>{gameLevelFileName(levelNo)}</code>
          </div>
        </div>

        {!touched && (
          <p className="export-warn">
            챕터 순서가 아직 정해지지 않아 <b>기본값 1</b>로 두었습니다 — 넣을 자리에 맞게 바꿔주세요.
          </p>
        )}

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
