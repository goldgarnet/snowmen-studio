import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { compareMapOrder, listPublishedMaps } from '../../api/maps';
import { listPublishedFolders } from '../../api/folders';
import type { FolderRow, MapRow, StatusFilter } from '../../api/types';
import { STATUS_FILTERS, STATUS_LABEL } from '../../api/types';
import { MEMBER_LOOKUP, useClears } from '../../context/ClearsContext';
import { MEMBERS } from '../../lib/members';
import { memberSolveTitle, otherNames, type MemberSolve } from '../../lib/solvedChecks';
import { boardTotals, buildBoardRows, filterBoardRows, orderHubMaps } from '../../lib/solvedBoard';
import { getHubCache, setHubCache } from '../../lib/hubState';
import * as nav from '../../lib/nav';
import '../hub/hub.css';
import './solved.css';

// '푼 맵 현황' — 맵(행) × 멤버(열) 표 하나.
//   · 행 = 허브에 올라온 맵 (허브와 같은 목록 API · 같은 순서), 열 = members.ts 순서의 멤버 + 푼 사람 수.
//   · 칸의 뜻은 '풀었어요' 칩과 같다: 채운 ✓ = 직접 체크 · 점선 ✓ = 풀이 등록(자동) · 빈칸 = 아직.
//   · 내 열의 칸만 눌러서 켜고 끈다 — ClearsProvider 의 같은 토글이라 카드 칩 · 맵 상세와 같은 상태다.
//   · map_clears 테이블이 없으면(관리자 SQL 적용 전) 한 줄 안내만 보인다.

interface SolvedBoardProps {
  /** 로그인한 내 계정 id (profiles.id) — 멤버 표에서 내 열을 찾는다 */
  myUserId: string;
  /** 맵 상세 주소 (제목 링크 — 가운데 클릭으로 새 탭에서도 열린다) */
  mapHref: (mapId: string) => string;
  /** 맵 상세로 이동 (앱 안) */
  onOpenMap: (mapId: string) => void;
}

interface BoardView {
  query: string;
  status: StatusFilter;
  unsolvedOnly: boolean;
}

// 보던 조건(검색 · 거르기)은 맵 상세에 다녀와도 그대로 둔다. 페이지를 새로 열면 처음부터.
let lastView: BoardView = { query: '', status: 'all', unsolvedOnly: false };
// 표 스크롤 위치와 마지막으로 연 맵 — 상세 · 다른 탭에 다녀와도 보던 줄로 돌아온다(허브의 '보던 쪽'과 같은 뜻).
// 표는 .app-main 이 아니라 .board-scroll 안에서 스크롤하므로 nav.useScrollRestore 대신 여기서 기억한다.
let lastScroll: { top: number; left: number } | null = null;
let lastOpenedMapId: string | null = null;
function rememberBoardScroll(el: HTMLElement): void { lastScroll = { top: el.scrollTop, left: el.scrollLeft }; }
function rememberOpenedMap(id: string): void { lastOpenedMapId = id; }

function BoardCell({ cell, myCheck, busy, onToggle }: {
  cell: MemberSolve;
  myCheck: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const title = memberSolveTitle(cell, myCheck);
  if (cell.mine) {
    // 저장 중에도 disabled 가 아니라 aria-disabled 로 흐리게만 한다. disabled 가 되면 크롬이 포커스를 body 로
    // 옮겨, 키보드 · 스크린리더로 누른 사람이 표 안의 자리를 잃고 바로 다시 눌러 되돌릴 수도 없다.
    // 저장 중에 또 누르는 것은 toggleMine 이 무시한다.
    return (
      <td className="board-col-member is-me">
        <button
          type="button"
          className="board-cell-btn"
          title={title}
          aria-label={title}
          aria-pressed={myCheck}
          aria-disabled={busy}
          onClick={onToggle}
        >
          <span className={`board-mark is-${cell.state}`} aria-hidden="true">{cell.state === 'none' ? '' : '✓'}</span>
        </button>
      </td>
    );
  }
  return (
    <td className="board-col-member" title={title}>
      {cell.state !== 'none' && (
        <span className={`board-mark is-${cell.state}`} role="img" aria-label={title}>✓</span>
      )}
    </td>
  );
}

export default function SolvedBoard({ myUserId, mapHref, onOpenMap }: SolvedBoardProps) {
  const clears = useClears();
  const { reload: reloadClears } = clears;
  // 다시 마운트되면 허브와 같은 목록 캐시로 바로 그리고('불러오는 중…' 없이) 뒤에서 새로 받는다.
  const [maps, setMaps] = useState<MapRow[]>(() => getHubCache()?.maps ?? []);
  const [folders, setFolders] = useState<FolderRow[]>(() => getHubCache()?.folders ?? []);
  const [loading, setLoading] = useState(() => !getHubCache());
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<BoardView>(lastView);
  // '내가 안 푼 맵만'을 켠 채 방금 체크한 맵 — 누르자마자 줄이 사라지지 않게 남겨 둔다 (필터를 다시 켜면 비움).
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());

  // 맵 목록(허브와 같은 API)과 '풀었어요' 체크를 새로 읽는다 — 그새 다른 사람이 체크했을 수 있다.
  // 체크 읽기(reloadClears)는 실패해도 던지지 않고 상태(status · tableMissing)로 알려 준다.
  const load = useCallback(async () => {
    const cached = !!getHubCache();
    if (!cached) setLoading(true);
    setLoadFailed(false);
    try {
      const [, mapList, folderList] = await Promise.all([
        reloadClears(),
        listPublishedMaps(),
        // 폴더 테이블이 아직 없으면(마이그레이션 전) 폴더 없이 — 허브와 같다.
        listPublishedFolders().catch((e: unknown) => { console.error(e); return [] as FolderRow[]; }),
      ]);
      setMaps(mapList);
      setFolders(folderList);
      setHubCache(mapList, folderList);
    } catch (e) {
      console.error(e);
      // 캐시로 이미 그리고 있으면 그대로 둔다(잠깐의 오류로 표를 지우지 않는다).
      if (!cached) setLoadFailed(true);
    }
    setLoading(false);
  }, [reloadClears]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const entries = useMemo(() => orderHubMaps(maps, folders, compareMapOrder), [maps, folders]);
  const rows = useMemo(
    () => buildBoardRows(entries, clears.summarize, myUserId),
    [entries, clears.summarize, myUserId],
  );
  const visible = useMemo(() => filterBoardRows(rows, { ...view, keep }), [rows, view, keep]);
  const totals = useMemo(() => boardTotals(visible, MEMBERS), [visible]);
  const myIndex = MEMBER_LOOKUP.get(myUserId) ?? -1;

  useEffect(() => { lastView = view; }, [view]);
  const updateView = (patch: Partial<BoardView>) => setView((v) => ({ ...v, ...patch }));

  const toggleMine = (mapId: string) => {
    if (view.unsolvedOnly) setKeep((k) => new Set(k).add(mapId));
    clears.toggleMine(mapId);
  };

  const openMap = (e: MouseEvent<HTMLAnchorElement>, mapId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // 새 탭 등은 브라우저에 맡긴다
    e.preventDefault();
    rememberOpenedMap(mapId);
    onOpenMap(mapId);
  };

  const missing = clears.status === 'off' && clears.tableMissing;
  const busyLoading = loading || clears.status === 'loading';
  const ready = !missing && !busyLoading && !loadFailed && clears.status === 'ready';

  // 표가 그려지면 한 번, 기억해 둔 표 스크롤과 페이지(.app-main) 스크롤을 되살리고 방금 연 맵 링크에 초점을 준다.
  const hasTable = ready && visible.length > 0;
  nav.useScrollRestore(hasTable);
  useLayoutEffect(() => {
    if (!hasTable || restoredRef.current) return;
    restoredRef.current = true;
    const el = scrollRef.current;
    if (!el) return;
    if (lastScroll) { el.scrollTop = lastScroll.top; el.scrollLeft = lastScroll.left; }
    const id = lastOpenedMapId;
    if (!id) return;
    const link = Array.from(el.querySelectorAll<HTMLAnchorElement>('a.board-map-link'))
      .find((a) => a.getAttribute('href') === mapHref(id));
    link?.focus({ preventScroll: true });
  }, [hasTable, mapHref]);

  let body: ReactNode;
  if (missing) {
    body = <div className="hub-empty">아직 준비 중이에요 (관리자가 SQL 적용 필요)</div>;
  } else if (busyLoading) {
    body = <div className="hub-empty">불러오는 중…</div>;
  } else if (!ready) {
    body = (
      <div className="hub-empty">
        푼 맵 현황을 불러오지 못했습니다.
        <button type="button" className="btn btn-sm board-retry" onClick={() => { void load(); }}>다시 시도</button>
      </div>
    );
  } else {
    const emptyText = rows.length === 0
      ? '아직 허브에 올라온 맵이 없습니다.'
      : view.unsolvedOnly && view.status === 'all' && !view.query.trim()
        ? '안 푼 맵이 없어요. 허브의 맵을 모두 풀었어요!'
        : '조건에 맞는 맵이 없습니다.';
    const total = MEMBERS.length;

    body = (
      <>
        <div className="hub-toolbar board-toolbar">
          <div className="hub-filters">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip${view.status === f.key ? ' active' : ''}`}
                onClick={() => updateView({ status: f.key })}
              >
                {f.label}
              </button>
            ))}
            {/* 상태(하나만 고름)와 따로 켜고 끄는 거르기 — 구분선으로 나눠 둔다 */}
            <span className="board-filter-mine">
              <span className="board-filter-sep" aria-hidden="true" />
              <button
                type="button"
                className={`chip${view.unsolvedOnly ? ' active' : ''}`}
                aria-pressed={view.unsolvedOnly}
                title="내 칸이 빈 맵만 봅니다 (풀이를 등록한 맵은 푼 것으로 칩니다)"
                onClick={() => { setKeep(new Set()); updateView({ unsolvedOnly: !view.unsolvedOnly }); }}
              >
                내가 안 푼 맵만
              </button>
            </span>
          </div>
          <input
            className="field-input hub-search"
            value={view.query}
            onChange={(e) => updateView({ query: e.target.value })}
            placeholder="제목 · 제작자 · 폴더 이름 검색"
            aria-label="맵 검색"
          />
        </div>

        <div className="board-legend">
          <span className="board-legend-item"><span className="board-mark is-checked" aria-hidden="true">✓</span>풀었어요 체크</span>
          <span className="board-legend-item"><span className="board-mark is-solution" aria-hidden="true">✓</span>풀이 등록 (자동)</span>
          <span className="board-legend-item">빈칸 = 아직</span>
          <span className="board-legend-hint">
            {myIndex >= 0
              ? '파란 내 열의 칸을 누르면 켜고 꺼요'
              : '내 계정은 멤버 표에 없어 체크할 수 없어요'}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="hub-empty">{emptyText}</div>
        ) : (
          <div
            className="board-scroll"
            ref={scrollRef}
            onScroll={(e) => rememberBoardScroll(e.currentTarget)}
          >
            <table className="board-table" aria-label="맵별 멤버 풀이 현황">
              <thead>
                <tr>
                  <th scope="col" className="board-col-title">맵 · 제작자</th>
                  <th scope="col" className="board-col-status">상태</th>
                  {MEMBERS.map((m, i) => (
                    <th
                      key={m.name}
                      scope="col"
                      className={`board-col-member${i === myIndex ? ' is-me' : ''}`}
                      title={i === myIndex ? `${m.name} (나)` : m.name}
                    >
                      <span className="board-member-name">{m.short}</span>
                      {i === myIndex && <span className="board-me">나</span>}
                    </th>
                  ))}
                  <th scope="col" className="board-col-count">푼 사람 수</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const title = row.map.title || '제목 없음';
                  const author = row.map.author_name || '익명';
                  const busy = clears.isBusy(row.map.id);
                  return (
                    <tr key={row.map.id}>
                      <th scope="row" className="board-col-title">
                        <div className="board-title-cell">
                          <a
                            className="board-map-link"
                            href={mapHref(row.map.id)}
                            title={title}
                            onClick={(e) => openMap(e, row.map.id)}
                          >
                            {title}
                          </a>
                          <div className="board-map-meta">
                            <span className="board-author" title={`제작자: ${author}`}>@{author}</span>
                            {row.folderName && (
                              <span className="board-folder" title={`폴더: ${row.folderName}`}>📁 {row.folderName}</span>
                            )}
                          </div>
                        </div>
                      </th>
                      <td className="board-col-status">
                        <span className={`badge badge-${row.map.status}`}>{STATUS_LABEL[row.map.status]}</span>
                      </td>
                      {row.cells.map((cell) => (
                        <BoardCell
                          key={cell.member.name}
                          cell={cell}
                          myCheck={row.myCheck}
                          busy={busy}
                          onToggle={() => toggleMine(row.map.id)}
                        />
                      ))}
                      <td
                        className={`board-col-count${row.solvedMembers === total ? ' is-full' : row.solvedMembers === 0 ? ' is-zero' : ''}`}
                        title={`멤버 ${total}명 중 ${row.solvedMembers}명이 풀었어요`}
                      >
                        <span className="board-count-num">{row.solvedMembers}</span>
                        <span className="board-count-of">/{total}</span>
                        {row.others.length > 0 && (
                          <span className="clear-more board-more" title={`멤버 표 밖 계정: ${otherNames(row.others, clears.nameOf)}`}>
                            +{row.others.length}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="board-col-title">
                    푼 맵 수 <span className="board-foot-of">({visible.length}개 중)</span>
                  </th>
                  <td className="board-col-status" />
                  {totals.map((t, i) => (
                    <td
                      key={t.member.name}
                      className={`board-col-member board-total${i === myIndex ? ' is-me' : ''}`}
                      title={`${t.member.name} — 맵 ${visible.length}개 중 ${t.solved}개 (직접 체크 ${t.checked} · 풀이 등록 ${t.solution})`}
                    >
                      {t.solved}
                    </td>
                  ))}
                  <td className="board-col-count" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="board">
      <div className="hub-head">
        <div>
          <h1 className="hub-title">푼 맵 현황</h1>
          {!missing && <p className="hub-sub">허브에 올라온 맵마다 누가 풀었는지 한눈에 봐요.</p>}
        </div>
        {ready && (
          <div className="hub-stats">
            <div className="hub-stat"><div className="hub-stat-num">{rows.length}</div><div className="hub-stat-label">전체 맵</div></div>
            <div className="hub-stat">
              <div className="hub-stat-num accepted">{rows.filter((r) => r.solvedByMe).length}</div>
              <div className="hub-stat-label">내가 푼 맵</div>
            </div>
          </div>
        )}
      </div>
      {body}
    </div>
  );
}
