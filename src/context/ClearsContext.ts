import { createContext, useContext } from 'react';
import { MEMBERS } from '../lib/members';
import { EMPTY_INDEX, buildAccountLookup, summarizeMap, type MapSolveSummary } from '../lib/solvedChecks';

// '풀었어요' 체크 상태를 앱 전체(허브 카드 · 폴더 · 맵 상세 · 챕터 구성)가 함께 쓴다.
// 'off' = 기능을 숨김 (map_clears 테이블이 아직 없거나 읽기에 실패함).
export type ClearsStatus = 'loading' | 'ready' | 'off';

export interface ClearsValue {
  status: ClearsStatus;
  /** 'off' 인 까닭이 map_clears 테이블 없음(관리자 SQL 적용 전)인가 — 아니면 그냥 읽기 실패 */
  tableMissing: boolean;
  /** 한 맵의 멤버별 상태 + '+N' + 내 체크 여부 */
  summarize: (mapId: string) => MapSolveSummary;
  /** 내 체크를 켜고 끈다 (즉시 반영, 실패하면 되돌리고 알림) */
  toggleMine: (mapId: string) => void;
  /** 그 맵의 내 체크를 저장하는 중인가 */
  isBusy: (mapId: string) => boolean;
  /** 계정 id → 이름 (모르면 null) */
  nameOf: (userId: string) => string | null;
  /** 모든 맵을 다시 읽는다 (허브 새로고침 때) */
  reload: () => Promise<void>;
  /** 한 맵만 다시 읽는다 (맵 상세를 열 때 · 풀이를 지웠을 때) */
  reloadMap: (mapId: string) => Promise<void>;
}

/** 계정 id → MEMBERS 안의 위치 (members.ts 표에서 한 번만 만든다) */
export const MEMBER_LOOKUP = buildAccountLookup(MEMBERS);

// Provider 밖(예: 테스트 하네스)에서는 기능이 꺼진 것처럼 동작한다.
const OFF: ClearsValue = {
  status: 'off',
  tableMissing: false,
  summarize: (mapId) => summarizeMap(EMPTY_INDEX, mapId, MEMBERS, MEMBER_LOOKUP, null),
  toggleMine: () => {},
  isBusy: () => false,
  nameOf: () => null,
  reload: async () => {},
  reloadMap: async () => {},
};

export const ClearsContext = createContext<ClearsValue>(OFF);

export const useClears = () => useContext(ClearsContext);
