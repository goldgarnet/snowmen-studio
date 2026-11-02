import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClearsContext, MEMBER_LOOKUP, type ClearsStatus, type ClearsValue } from './ClearsContext';
import { MEMBERS } from '../lib/members';
import {
  EMPTY_INDEX, indexPairs, keepLocalChecks, summarizeMap, withCheck, withMapReplaced,
  type SolveIndex,
} from '../lib/solvedChecks';
import {
  isMissingTableError, listAllClears, listAllSolutionAuthors, listClearsForMap,
  listProfileNames, listSolutionAuthorsForMap, setMyClear,
} from '../api/clears';

const MIGRATION_FILE = 'supabase/migrations/2026-11-02_map_clears.sql';

let warnedMissing = false;   // 테이블 없음 경고는 한 세션에 한 번만

function warnUnavailable(e: unknown) {
  if (isMissingTableError(e)) {
    if (warnedMissing) return;
    warnedMissing = true;
    console.warn(`[풀었어요 체크] map_clears 테이블이 아직 없어 기능을 숨깁니다. ${MIGRATION_FILE} 를 Supabase SQL Editor 에서 실행하세요.`);
  } else {
    console.warn('[풀었어요 체크] 체크 목록을 읽지 못했습니다:', e);
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// 로그인한 사용자 한 명 기준으로 모든 맵의 체크(map_clears)와 풀이 작성자(solutions)를
// 한 번에 읽어 두고, 허브 카드 · 맵 상세가 같은 상태를 보게 한다.
export default function ClearsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [status, setStatus] = useState<ClearsStatus>('loading');
  const [tableMissing, setTableMissing] = useState(false);
  const [index, setIndex] = useState<SolveIndex>(EMPTY_INDEX);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const inflightRef = useRef<Promise<void> | null>(null);
  const missingRef = useRef(false);   // 테이블 없음 확인됨 → 맵 단위 읽기는 건너뜀 (전체 읽기만 다시 시도)
  const busyRef = useRef(new Set<string>());
  // 서버에서 읽어 오는 사이에 내가 체크를 바꾼 맵, 그리고 아직 저장 중인 맵은 도착한
  // (바꾸기 전일 수 있는) 값으로 덮어쓰지 않는다. 바꿀 때 · 저장이 끝났을 때 순번을 올려 두고
  // 읽기 시작 순번과 비교한다.
  const seqRef = useRef(0);
  const touchedRef = useRef(new Map<string, number>());

  const reload = useCallback((): Promise<void> => {
    if (inflightRef.current) return inflightRef.current;   // 이미 읽는 중이면 그 결과를 같이 기다린다
    const startSeq = seqRef.current;
    const run = (async () => {
      try {
        const [checks, sols] = await Promise.all([
          listAllClears(),
          listAllSolutionAuthors().catch((e: unknown) => {
            console.warn('[풀었어요 체크] 풀이 목록을 읽지 못해 자동 표시는 뺍니다:', e);
            return [];
          }),
        ]);
        const fresh: SolveIndex = { checks: indexPairs(checks), solutions: indexPairs(sols) };
        const touched = [...touchedRef.current]
          .filter(([mapId, seq]) => seq > startSeq || busyRef.current.has(mapId))
          .map(([mapId]) => mapId);
        missingRef.current = false;
        setTableMissing(false);
        setIndex((local) => keepLocalChecks(fresh, local, touched));
        setStatus('ready');
      } catch (e) {
        if (isMissingTableError(e)) { missingRef.current = true; setTableMissing(true); }
        warnUnavailable(e);
        // 테이블이 없으면 숨긴다. 이미 보이던 중 잠깐 실패한 거면 있던 값을 그대로 둔다.
        setStatus((s) => (s === 'ready' && !isMissingTableError(e) ? s : 'off'));
        return;
      } finally {
        inflightRef.current = null;
      }
      try { setNames(await listProfileNames()); } catch { /* 이름은 '+N' 툴팁용 — 없어도 된다 */ }
    })();
    inflightRef.current = run;
    return run;
  }, []);

  const reloadMap = useCallback(async (mapId: string): Promise<void> => {
    if (missingRef.current) return;
    const startSeq = seqRef.current;
    try {
      const [checks, sols] = await Promise.all([
        listClearsForMap(mapId),
        listSolutionAuthorsForMap(mapId).catch(() => null),
      ]);
      const touchedLater = (touchedRef.current.get(mapId) ?? 0) > startSeq || busyRef.current.has(mapId);
      setIndex((local) => withMapReplaced(
        local,
        mapId,
        touchedLater ? (local.checks.get(mapId) ?? []) : checks,
        sols ?? (local.solutions.get(mapId) ?? []),
      ));
    } catch (e) {
      warnUnavailable(e);
      if (isMissingTableError(e)) { missingRef.current = true; setTableMissing(true); setStatus('off'); }
    }
  }, []);

  const toggleMine = useCallback((mapId: string) => {
    if (busyRef.current.has(mapId)) return;   // 저장 중 연타 무시
    const on = !(index.checks.get(mapId)?.has(userId) ?? false);
    busyRef.current.add(mapId);
    setBusy(new Set(busyRef.current));
    touchedRef.current.set(mapId, ++seqRef.current);
    setIndex((cur) => withCheck(cur, mapId, userId, on));   // 즉시 반영
    void setMyClear(mapId, userId, on)
      .catch((e: unknown) => {
        setIndex((cur) => withCheck(cur, mapId, userId, !on));   // 실패 → 되돌림
        alert('풀었어요 체크 저장 실패: ' + errorText(e));
      })
      .finally(() => {
        touchedRef.current.set(mapId, ++seqRef.current);
        busyRef.current.delete(mapId);
        setBusy(new Set(busyRef.current));
      });
  }, [index, userId]);

  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);

  const value = useMemo<ClearsValue>(() => ({
    status,
    tableMissing,
    summarize: (mapId) => summarizeMap(index, mapId, MEMBERS, MEMBER_LOOKUP, userId),
    toggleMine,
    isBusy: (mapId) => busy.has(mapId),
    nameOf: (id) => names.get(id) ?? null,
    reload,
    reloadMap,
  }), [status, tableMissing, index, userId, toggleMine, busy, names, reload, reloadMap]);

  return <ClearsContext.Provider value={value}>{children}</ClearsContext.Provider>;
}
