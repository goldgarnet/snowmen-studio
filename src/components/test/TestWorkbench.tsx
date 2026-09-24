import { useMemo, useState } from 'react';
import Grid from '../editor/Grid';
import {
  runTestCase,
  testCases,
  type TestCaseDefinition,
  type TestFrame,
  type TestPriority,
} from '../../test-cases/catalog';
import './TestWorkbench.css';

type Filter = 'all' | TestPriority;

const PRIORITIES: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'P0', label: 'P0 핵심' },
  { value: 'P1', label: 'P1 확장' },
  { value: 'P2', label: 'P2 안전성' },
];

function actionLabel(action: string): string {
  return action === 'wait' ? '대기' : ({ up: '↑', down: '↓', left: '←', right: '→' }[action] ?? action);
}

function countObjects(level: TestFrame['level']): string {
  const counts = new Map<string, number>();
  for (const row of level.objects) {
    for (const object of row) {
      if (object) counts.set(object.type, (counts.get(object.type) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return '오브젝트 없음';
  return [...counts.entries()].map(([type, count]) => `${type} ${count}`).join(' · ');
}

function frameLabel(frame: { phase: string; turnIndex: number }): string {
  if (frame.phase === 'initial') return '초기 상태';
  if (frame.phase === 'final') return '최종 상태';
  return `턴 ${frame.turnIndex + 1} · ${frame.phase}`;
}

function frameTone(phase: string): string {
  if (phase === 'movement') return 'movement';
  if (phase === 'resolved') return 'resolved';
  if (phase === 'impact') return 'impact';
  return phase === 'turn-end' ? 'turn-end' : 'neutral';
}

export default function TestWorkbench() {
  const [priority, setPriority] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('P0-17');
  const [frameIndex, setFrameIndex] = useState(0);

  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return testCases.filter((testCase) => (
      (priority === 'all' || testCase.priority === priority) &&
      (!normalized || `${testCase.id} ${testCase.title} ${testCase.category} ${testCase.summary}`.toLowerCase().includes(normalized))
    ));
  }, [priority, query]);

  const selectedCase = testCases.find((testCase) => testCase.id === selectedId) ?? testCases[0];
  const run = useMemo(() => runTestCase(selectedCase), [selectedCase]);
  const timeline = useMemo(() => {
    if (!run) return [];
    return [
      { phase: 'initial', turnIndex: -1, level: run.initialLevel },
      ...run.frames,
      { phase: 'final', turnIndex: run.turns.length - 1, level: run.finalLevel },
    ];
  }, [run]);
  const currentFrame = timeline[Math.min(frameIndex, Math.max(0, timeline.length - 1))];

  const selectCase = (testCase: TestCaseDefinition) => {
    setSelectedId(testCase.id);
    setFrameIndex(0);
  };

  const executableCount = testCases.filter((testCase) => testCase.build).length;
  const currentFrameLabel = currentFrame ? frameLabel(currentFrame) : '시각화 보드 없음';

  return (
    <div className="test-workbench">
      <div className="test-workbench-head">
        <div>
          <div className="test-kicker">ENGINE TEST WORKBENCH</div>
          <h1>이동·충돌 테스트 시각화</h1>
          <p>Godot 구현과 에디터 엔진의 상태·tick·프레임을 비교하는 개발용 화면입니다.</p>
        </div>
        <div className="test-head-stats">
          <span><b>{testCases.length}</b> 전체 케이스</span>
          <span><b>{executableCount}</b> 브라우저 실행</span>
        </div>
      </div>

      <div className="test-workbench-layout">
        <aside className="test-case-panel">
          <div className="test-case-tools">
            <input
              className="field-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ID · 제목 · 규칙 검색"
              aria-label="테스트 케이스 검색"
            />
            <div className="test-filter-row">
              {PRIORITIES.map((item) => (
                <button
                  key={item.value}
                  className={`test-filter-chip ${priority === item.value ? 'active' : ''}`}
                  onClick={() => setPriority(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="test-case-list">
            {filteredCases.map((testCase) => (
              <button
                key={testCase.id}
                className={`test-case-item ${selectedCase.id === testCase.id ? 'selected' : ''}`}
                onClick={() => selectCase(testCase)}
              >
                <span className={`test-priority priority-${testCase.priority.toLowerCase()}`}>{testCase.priority}</span>
                <span className="test-case-copy">
                  <b>{testCase.id} · {testCase.title}</b>
                  <small>{testCase.category}{testCase.build ? ' · 실행 가능' : ' · 체크리스트'}</small>
                </span>
              </button>
            ))}
            {filteredCases.length === 0 && <div className="test-empty">검색 결과가 없습니다.</div>}
          </div>
        </aside>

        <main className="test-detail-panel">
          <div className="test-detail-head">
            <div>
              <div className="test-detail-id">
                <span className={`test-priority priority-${selectedCase.priority.toLowerCase()}`}>{selectedCase.priority}</span>
                {selectedCase.id} · {selectedCase.category}
              </div>
              <h2>{selectedCase.title}</h2>
              <p>{selectedCase.summary}</p>
            </div>
            <div className="test-detail-actions">
              {selectedCase.actions && (
                <div className="test-action-sequence" aria-label="입력 순서">
                  {selectedCase.actions.map((action, index) => <kbd key={`${action}-${index}`}>{actionLabel(action)}</kbd>)}
                </div>
              )}
              <span className={`test-run-badge ${run ? 'ready' : ''}`}>{run ? '엔진 실행 가능' : '명세 케이스'}</span>
              {run && <span className="test-run-status">최종 상태 · {run.status}</span>}
            </div>
          </div>

          {run && currentFrame ? (
            <>
              <div className="test-board-card">
                <div className="test-board-toolbar">
                  <div>
                    <strong>{currentFrameLabel}</strong>
                    <span>{currentFrame.phase === 'initial' || currentFrame.phase === 'final' ? '상태 스냅샷' : '엔진 프레임'}</span>
                  </div>
                  <span className={`test-phase test-phase-${frameTone(currentFrame.phase)}`}>{currentFrame.phase}</span>
                </div>
                <div className="test-board-shell">
                  <Grid level={currentFrame.level} highlightPlayer />
                </div>
                <div className="test-board-caption">{countObjects(currentFrame.level)}</div>
              </div>

              <div className="test-timeline-card">
                <div className="test-timeline-head">
                  <span>프레임 타임라인</span>
                  <span>{Math.min(frameIndex + 1, timeline.length)} / {timeline.length}</span>
                </div>
                <input
                  className="test-timeline-range"
                  type="range"
                  min={0}
                  max={Math.max(0, timeline.length - 1)}
                  value={Math.min(frameIndex, Math.max(0, timeline.length - 1))}
                  onChange={(event) => setFrameIndex(Number(event.target.value))}
                  aria-label="테스트 프레임 선택"
                />
                <div className="test-timeline-buttons">
                  {timeline.map((frame, index) => (
                    <button
                      key={`${frame.phase}-${index}`}
                      className={`test-frame-button ${index === frameIndex ? 'active' : ''}`}
                      onClick={() => setFrameIndex(index)}
                    >
                      <span className={`test-phase-dot test-phase-${frameTone(frame.phase)}`} />
                      {frameLabel(frame)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="test-spec-card">
              <div className="test-spec-icon">☷</div>
              <h3>체크리스트 케이스</h3>
              <p>현재 브라우저 워크벤치에는 대표 실행 보드가 연결되어 있지 않습니다. Godot에서 이 케이스를 구현한 뒤 동일한 초기 상태·입력·기대 결과를 연결하세요.</p>
            </div>
          )}

          <section className="test-expected-card">
            <div className="test-section-label">EXPECTED RESULT</div>
            <p>{selectedCase.expected}</p>
            <div className="test-detail-note">
              <span>검증 포인트</span>
              <b>최종 상태뿐 아니라 중간 tick에서 버튼·벽·레이저·점유 상태가 바뀌는 시점도 비교하세요.</b>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
