import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MapRow, FolderRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import { listPublishedMaps } from '../../api/maps';
import { listPublishedFolders } from '../../api/folders';
import {
  ChapterRow, StageRow,
  listChapters, insertChapter, updateChapter, deleteChapter,
  listStages, listAllStages, insertStage, updateStage, deleteStage, reorderStages,
} from '../../api/chapters';
import MapThumbnail from '../hub/MapThumbnail';
import StarRating from '../hub/StarRating';
import ConfirmModal from '../common/ConfirmModal';
import PlayView from '../editor/PlayView';
import './chapters.css';

// 스테이지 번호는 저장되지 않고 위치에서 파생된다: "챕터번호-순번" (예: 2-1).
const stageNo = (ch: ChapterRow, idx: number) => `${ch.number}-${idx + 1}`;

// ---------- 챕터 생성/수정 모달 ----------

interface ChapterFormProps {
  title: string;
  initial?: Partial<Pick<ChapterRow, 'number' | 'name' | 'description'>>;
  submitLabel: string;
  onSubmit: (p: { number: number; name: string; description: string | null }) => Promise<void>;
  onCancel: () => void;
}

function ChapterFormModal({ title, initial, submitLabel, onSubmit, onCancel }: ChapterFormProps) {
  const [number, setNumber] = useState(String(initial?.number ?? 1));
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = parseInt(number, 10);
    if (isNaN(n) || n < 0) { setError('챕터 번호를 숫자로 입력하세요.'); return; }
    if (!name.trim()) { setError('챕터 이름을 입력하세요.'); return; }
    setBusy(true);
    try { await onSubmit({ number: n, name: name.trim(), description: description.trim() || null }); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 className="modal-title">{title}</h3>
        <div className="upload-grid">
          <div>
            <label className="field-label">챕터 번호 *</label>
            <input className="field-input" type="number" min={0} value={number}
              onChange={(e) => setNumber(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label">챕터 이름 *</label>
            <input className="field-input" value={name} autoFocus
              onChange={(e) => setName(e.target.value)} placeholder="예: 첫걸음" disabled={busy} />
          </div>
        </div>
        <label className="field-label" style={{ marginTop: 12 }}>설명</label>
        <textarea className="field-textarea" rows={3} value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="(선택) 챕터 컨셉, 등장 메커닉 등" disabled={busy} />
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? '저장 중…' : submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 스테이지 추가(맵 선택) 모달 ----------

type PickerSort = 'accepted' | 'latest';

interface MapPickerProps {
  maps: MapRow[];                          // all published maps (standalone + folder members)
  folderNames: Map<string, string>;        // folder_id → 폴더 이름
  placedNos: Map<string, string>;          // map_id → 이미 배치된 스테이지 번호 (전 챕터)
  onPick: (map: MapRow) => void;
  onCancel: () => void;
}

function MapPickerModal({ maps, folderNames, placedNos, onPick, onCancel }: MapPickerProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | MapRow['status']>('all');
  const [sort, setSort] = useState<PickerSort>('accepted');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = maps.filter((m) => {
      if (status !== 'all' && m.status !== status) return false;
      if (!q) return true;
      const folder = m.folder_id ? (folderNames.get(m.folder_id) ?? '') : '';
      return `${m.title ?? ''} ${m.author_name ?? ''} ${folder}`.toLowerCase().includes(q);
    });
    // 채택 우선: 채택 → 검토중 → 보류 → 반려, 그 안에서 최신순.
    const rank: Record<string, number> = { accepted: 0, pending: 1, held: 2, rejected: 3 };
    return filtered.sort((a, b) => {
      if (sort === 'accepted' && rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.created_at.localeCompare(a.created_at);
    });
  }, [maps, folderNames, query, status, sort]);

  const FILTERS: { key: 'all' | MapRow['status']; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'accepted', label: '채택' },
    { key: 'pending', label: '검토중' },
    { key: 'held', label: '보류' },
    { key: 'rejected', label: '반려' },
  ];

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal stage-picker" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">스테이지로 추가할 맵 선택</h3>

        <div className="stage-picker-toolbar">
          <div className="hub-filters">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip${status === f.key ? ' active' : ''}`}
                onClick={() => setStatus(f.key)}>{f.label}</button>
            ))}
          </div>
          <select className="field-input stage-picker-sort" value={sort}
            onChange={(e) => setSort(e.target.value as PickerSort)}>
            <option value="accepted">채택 우선</option>
            <option value="latest">최신순</option>
          </select>
        </div>
        <input className="field-input" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 · 제작자 · 폴더 이름 검색" autoFocus />

        <div className="stage-picker-list">
          {visible.length === 0 ? (
            <div className="stage-picker-empty">조건에 맞는 맵이 없습니다.</div>
          ) : visible.map((m) => {
            const placed = placedNos.get(m.id);
            return (
              <div className="stage-picker-row" key={m.id}>
                <div className="stage-picker-thumb"><MapThumbnail code={m.code} /></div>
                <div className="stage-picker-info">
                  <div className="stage-picker-titlerow">
                    <span className="stage-picker-title">{m.title || '제목 없음'}</span>
                    <span className={`badge badge-${m.status}`}>{STATUS_LABEL[m.status]}</span>
                    {m.folder_id && (
                      <span className="badge badge-draft">📁 {folderNames.get(m.folder_id) ?? '폴더'}</span>
                    )}
                    {placed && <span className="badge badge-private" title="다른 스테이지에 이미 배치된 맵입니다">배치됨 {placed}</span>}
                  </div>
                  <div className="stage-picker-meta">
                    <span>@{m.author_name || '익명'}</span>
                    {(m.difficulty ?? m.author_difficulty) != null && (
                      <StarRating value={m.difficulty ?? m.author_difficulty} size={13} />
                    )}
                  </div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => onPick(m)}>추가</button>
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 메인: 챕터 구성 ----------

export default function ChapterComposer() {
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [allStages, setAllStages] = useState<StageRow[]>([]);   // 전 챕터 (배치 표시용)
  const [stages, setStages] = useState<StageRow[]>([]);          // 선택된 챕터의 스테이지
  const [hubMaps, setHubMaps] = useState<MapRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [showNewChapter, setShowNewChapter] = useState(false);
  const [editingChapter, setEditingChapter] = useState<ChapterRow | null>(null);
  const [deleteChapterTarget, setDeleteChapterTarget] = useState<ChapterRow | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteStageTarget, setDeleteStageTarget] = useState<StageRow | null>(null);
  const [playStage, setPlayStage] = useState<{ code: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 로컬 편집 드래프트 (blur 시 저장): stage id → 필드별 텍스트
  const [drafts, setDrafts] = useState<Record<string, { description: string; requires: string; unlocks: string }>>({});

  const selected = chapters.find((c) => c.id === selectedId) ?? null;
  const showFlash = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1600); };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [chs, all, maps] = await Promise.all([listChapters(), listAllStages(), listPublishedMaps()]);
      setChapters(chs); setAllStages(all); setHubMaps(maps);
    } catch (e) { console.error(e); }
    try { setFolders(await listPublishedFolders()); } catch { setFolders([]); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadStages = useCallback(async (chapterId: string) => {
    setStagesLoading(true);
    try {
      const rows = await listStages(chapterId);
      setStages(rows);
      // 드래프트를 서버 값으로 초기화
      const d: typeof drafts = {};
      for (const s of rows) d[s.id] = { description: s.description ?? '', requires: s.requires ?? '', unlocks: s.unlocks ?? '' };
      setDrafts(d);
    } catch (e) { console.error(e); }
    finally { setStagesLoading(false); }
  }, []);

  useEffect(() => { if (selectedId) loadStages(selectedId); else setStages([]); }, [selectedId, loadStages]);

  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  // map_id → 배치된 스테이지 번호 (전 챕터). 챕터 번호와 챕터 안 순서로 계산.
  const placedNos = useMemo(() => {
    const byChapter = new Map<string, StageRow[]>();
    for (const s of allStages) {
      const arr = byChapter.get(s.chapter_id);
      if (arr) arr.push(s); else byChapter.set(s.chapter_id, [s]);
    }
    const result = new Map<string, string>();
    for (const ch of chapters) {
      const arr = (byChapter.get(ch.id) ?? []).sort((a, b) =>
        a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at));
      arr.forEach((s, i) => result.set(s.map_id, stageNo(ch, i)));
    }
    return result;
  }, [allStages, chapters]);

  // ----- 챕터 CRUD -----
  const doCreateChapter = async (p: { number: number; name: string; description: string | null }) => {
    const row = await insertChapter(p);
    setShowNewChapter(false);
    await refresh();
    setSelectedId(row.id);
  };

  const doEditChapter = async (p: { number: number; name: string; description: string | null }) => {
    if (!editingChapter) return;
    await updateChapter(editingChapter.id, p);
    setEditingChapter(null);
    showFlash('챕터를 수정했습니다');
    refresh();
  };

  const doDeleteChapter = async () => {
    if (!deleteChapterTarget) return;
    setBusy(true);
    try {
      await deleteChapter(deleteChapterTarget.id);
      if (selectedId === deleteChapterTarget.id) setSelectedId(null);
      setDeleteChapterTarget(null);
      refresh();
    } catch (e) { alert('삭제 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  // ----- 스테이지 -----
  const addStage = async (map: MapRow) => {
    if (!selectedId) return;
    try {
      await insertStage({ chapter_id: selectedId, map_id: map.id, sort_order: stages.length });
      setShowPicker(false);
      showFlash('스테이지를 추가했습니다');
      loadStages(selectedId);
      listAllStages().then(setAllStages).catch(() => {});
    } catch (e) { alert('추가 실패: ' + (e as Error).message); }
  };

  const removeStage = async () => {
    if (!deleteStageTarget || !selectedId) return;
    setBusy(true);
    try {
      await deleteStage(deleteStageTarget.id);
      setDeleteStageTarget(null);
      // 남은 스테이지 순번을 촘촘하게 다시 매긴다 (번호가 위치에서 파생되므로).
      const remaining = stages.filter((s) => s.id !== deleteStageTarget.id).map((s) => s.id);
      await reorderStages(remaining);
      loadStages(selectedId);
      listAllStages().then(setAllStages).catch(() => {});
    } catch (e) { alert('제거 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const moveStage = async (idx: number, dir: -1 | 1) => {
    if (!selectedId) return;
    const to = idx + dir;
    if (to < 0 || to >= stages.length) return;
    const next = [...stages];
    [next[idx], next[to]] = [next[to], next[idx]];
    setStages(next); // 낙관적 갱신 — 번호가 즉시 따라 바뀐다
    try { await reorderStages(next.map((s) => s.id)); }
    catch (e) { alert('순서 변경 실패: ' + (e as Error).message); loadStages(selectedId); }
  };

  // blur 시 변경된 필드만 저장.
  const saveDraft = async (s: StageRow, field: 'description' | 'requires' | 'unlocks') => {
    const draft = drafts[s.id];
    if (!draft) return;
    const value = draft[field].trim() || null;
    if (value === (s[field] ?? null)) return;
    try {
      await updateStage(s.id, { [field]: value });
      setStages((prev) => prev.map((x) => (x.id === s.id ? { ...x, [field]: value } : x)));
      showFlash('저장됨');
    } catch (e) { alert('저장 실패: ' + (e as Error).message); }
  };

  const setDraft = (id: string, field: 'description' | 'requires' | 'unlocks', value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  // ---- 플레이 서브모드: 스테이지의 맵을 클릭하면 곧바로 플레이 화면으로 ----
  if (playStage) {
    return (
      <PlayView
        code={playStage.code}
        title={playStage.title}
        backLabel="챕터 구성으로"
        onClose={() => setPlayStage(null)}
      />
    );
  }

  return (
    <div className="chapters">
      <div className="chapters-head">
        <div>
          <h1 className="hub-title">챕터 구성</h1>
          <p className="hub-sub">
            게임에 들어갈 챕터와 스테이지를 배치해요. 스테이지 번호는 순서에 따라 자동으로 매겨집니다.
            <br />스테이지의 맵 이미지나 제목을 클릭하면 바로 플레이할 수 있어요.
          </p>
        </div>
        {flash && <span className="detail-flash">{flash}</span>}
      </div>

      <div className="chapters-body">
        {/* ---- 왼쪽: 챕터 목록 ---- */}
        <aside className="chapters-side">
          <button className="btn btn-primary chapters-new" onClick={() => setShowNewChapter(true)}>+ 새 챕터</button>
          {loading ? (
            <div className="chapters-side-empty">불러오는 중…</div>
          ) : chapters.length === 0 ? (
            <div className="chapters-side-empty">아직 챕터가 없습니다.</div>
          ) : (
            <div className="chapters-list">
              {chapters.map((ch) => (
                <button key={ch.id}
                  className={`chapters-item${ch.id === selectedId ? ' active' : ''}`}
                  onClick={() => setSelectedId(ch.id)}>
                  <span className="chapters-item-num">챕터 {ch.number}</span>
                  <span className="chapters-item-name">{ch.name || '이름 없음'}</span>
                  <span className="chapters-item-count">
                    {allStages.filter((s) => s.chapter_id === ch.id).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ---- 오른쪽: 선택된 챕터 ---- */}
        <section className="chapters-main">
          {!selected ? (
            <div className="hub-empty">왼쪽에서 챕터를 선택하거나 새 챕터를 만드세요.</div>
          ) : (
            <>
              <div className="chapter-header">
                <div className="chapter-header-info">
                  <h2>챕터 {selected.number} · {selected.name || '이름 없음'}</h2>
                  {selected.description && <p className="chapter-desc">{selected.description}</p>}
                </div>
                <div className="chapter-header-actions">
                  <button className="btn" onClick={() => setEditingChapter(selected)}>챕터 수정</button>
                  <button className="btn btn-danger" onClick={() => setDeleteChapterTarget(selected)}>챕터 삭제</button>
                  <button className="btn btn-primary" onClick={() => setShowPicker(true)}>+ 스테이지 추가</button>
                </div>
              </div>

              {stagesLoading ? (
                <div className="hub-empty">불러오는 중…</div>
              ) : stages.length === 0 ? (
                <div className="hub-empty">아직 스테이지가 없습니다. <b>스테이지 추가</b>로 허브의 맵을 배치하세요.</div>
              ) : (
                <div className="stage-list">
                  {stages.map((s, i) => (
                    <div className="stage-row" key={s.id}>
                      <div className="stage-no">{stageNo(selected, i)}</div>
                      <div
                        className={`stage-thumb${s.map ? ' stage-thumb-playable' : ''}`}
                        title={s.map ? '클릭하면 바로 플레이' : undefined}
                        onClick={() => s.map && setPlayStage({
                          code: s.map.code,
                          title: `${stageNo(selected, i)} · ${s.map.title || '제목 없음'}`,
                        })}
                      >
                        {s.map ? <MapThumbnail code={s.map.code} /> : <div className="stage-thumb-missing">맵 없음</div>}
                        {s.map && <span className="stage-thumb-play">▶</span>}
                      </div>
                      <div className="stage-fields">
                        <div className="stage-map-line">
                          <span
                            className={`stage-map-title${s.map ? ' stage-map-title-playable' : ''}`}
                            title={s.map ? '클릭하면 바로 플레이' : undefined}
                            onClick={() => s.map && setPlayStage({
                              code: s.map.code,
                              title: `${stageNo(selected, i)} · ${s.map.title || '제목 없음'}`,
                            })}
                          >{s.map?.title || '제목 없음'}</span>
                          {s.map && <span className={`badge badge-${s.map.status}`}>{STATUS_LABEL[s.map.status]}</span>}
                          {s.map?.folder_id && (
                            <span className="badge badge-draft">📁 {folderNames.get(s.map.folder_id) ?? '폴더'}</span>
                          )}
                          <span className="stage-map-author">@{s.map?.author_name || '익명'}</span>
                        </div>
                        <input className="field-input stage-input" value={drafts[s.id]?.description ?? ''}
                          onChange={(e) => setDraft(s.id, 'description', e.target.value)}
                          onBlur={() => saveDraft(s, 'description')}
                          placeholder="스테이지 설명 (선택)" />
                        <div className="stage-links">
                          <label>
                            <span className="stage-links-label">선행 스테이지</span>
                            <input className="field-input stage-input" value={drafts[s.id]?.requires ?? ''}
                              onChange={(e) => setDraft(s.id, 'requires', e.target.value)}
                              onBlur={() => saveDraft(s, 'requires')}
                              placeholder="예: 1-3, 2-1" />
                          </label>
                          <label>
                            <span className="stage-links-label">해금 스테이지</span>
                            <input className="field-input stage-input" value={drafts[s.id]?.unlocks ?? ''}
                              onChange={(e) => setDraft(s.id, 'unlocks', e.target.value)}
                              onBlur={() => saveDraft(s, 'unlocks')}
                              placeholder="예: 2-3, 3-1" />
                          </label>
                        </div>
                      </div>
                      <div className="stage-actions">
                        <button className="btn btn-sm" onClick={() => moveStage(i, -1)} disabled={i === 0} title="위로">↑</button>
                        <button className="btn btn-sm" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1} title="아래로">↓</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteStageTarget(s)}>제거</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {showNewChapter && (
        <ChapterFormModal title="새 챕터" submitLabel="만들기"
          initial={{ number: (chapters.at(-1)?.number ?? 0) + 1 }}
          onSubmit={doCreateChapter} onCancel={() => setShowNewChapter(false)} />
      )}

      {editingChapter && (
        <ChapterFormModal title="챕터 수정" submitLabel="저장"
          initial={editingChapter}
          onSubmit={doEditChapter} onCancel={() => setEditingChapter(null)} />
      )}

      {deleteChapterTarget && (
        <ConfirmModal
          title="챕터 삭제"
          message={<>'챕터 {deleteChapterTarget.number} · {deleteChapterTarget.name}' 을(를) 삭제할까요? 안의 <b>스테이지 배치도 함께 삭제</b>됩니다 (맵 자체는 허브에 그대로 남습니다).</>}
          confirmLabel="삭제" danger busy={busy}
          onConfirm={doDeleteChapter} onCancel={() => setDeleteChapterTarget(null)} />
      )}

      {deleteStageTarget && (
        <ConfirmModal
          title="스테이지 제거"
          message={<>이 스테이지를 챕터에서 제거할까요? 맵 자체는 허브에 그대로 남습니다.</>}
          confirmLabel="제거" danger busy={busy}
          onConfirm={removeStage} onCancel={() => setDeleteStageTarget(null)} />
      )}

      {showPicker && (
        <MapPickerModal
          maps={hubMaps}
          folderNames={folderNames}
          placedNos={placedNos}
          onPick={addStage}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
