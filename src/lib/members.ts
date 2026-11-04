// ============================================================
//  팀 멤버 ↔ 스튜디오 계정 매칭 표 ('풀었어요' 체크 칩에 쓰임)
//
//  · 칩은 이 배열 순서대로, short(짧은 이름)로 보인다.
//  · accountIds = Supabase profiles.id (= 로그인 계정 uid). 한 사람에 계정 여럿을 넣어도 된다
//    — 그 사람의 계정 중 하나라도 체크했으면 칩이 채워진다.
//  · 이 표에 없는 계정이 푼 것은 칩 없이 '+N' 으로만 센다.
//  · 바꾸는 법: 이 배열만 고치면 된다 (DB 는 손대지 않아도 됨).
//    계정 id 는 Supabase 대시보드 → Table Editor → profiles 에서 username 으로 찾는다.
//  · 2026-11-02 사용자 확정: 아래 7개 계정만. (vksthdud01 — 이름이 '홍은기'인 둘째 계정 — 은 넣지 않음)
// ============================================================

/** 가입 신청을 승인하는 계정(luffy84). 실제 권한은 DB 의 is_signup_approver 가 정한다. */
export const SIGNUP_APPROVER_ID = 'b807cfa1-b912-4a27-a0a5-af2a302e4577';

export interface Member {
  /** 전체 이름 (칩 툴팁에 보임) */
  name: string;
  /** 칩에 보이는 짧은 이름 (성 빼고 두 글자) */
  short: string;
  /** 이 사람의 스튜디오 계정 id 들 (profiles.id) */
  accountIds: readonly string[];
}

export const MEMBERS: readonly Member[] = [
  { name: '김정훈', short: '정훈', accountIds: ['b807cfa1-b912-4a27-a0a5-af2a302e4577'] }, // luffy84
  { name: '나인석', short: '인석', accountIds: ['be7ab8f9-e055-4b0b-951d-27a62b034a5c'] }, // nainseok
  { name: '황정빈', short: '정빈', accountIds: ['01bf932f-c8f4-4837-8ed1-417a3e1ee791'] }, // jbin1003
  { name: '차선제', short: '선제', accountIds: ['330b65b0-6457-4e33-af15-f97365a06596'] }, // cktjswp1105
  { name: '정은후', short: '은후', accountIds: ['3183a48a-e592-48cd-aafd-abd324ccb043'] }, // bluecap06
  { name: '홍은기', short: '은기', accountIds: ['88f7ede6-15c5-4f2d-8178-b517617ed457'] }, // ghddmsrl01
  { name: '노희윤', short: '희윤', accountIds: ['815054ec-be0a-407a-809a-d1ff623d0b3f'] }, // NHY (profiles.name 은 'NHY')
];
