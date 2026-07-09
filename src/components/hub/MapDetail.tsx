import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { MapRow, SolutionRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import { setReview, updateMap, deleteMap, unpublishMap, registeredToISO, isoToDateStr } from '../../api/maps';
import { insertSolution } from '../../api/solutions';
import StarRating from './StarRating';
import StatusControl from './StatusControl';
import CommentList from './CommentList';
import UploadForm, { UploadPayload } from './UploadForm';
import MapThumbnail from './MapThumbnail';
import SpoilerText from './SpoilerText';
import ConfirmModal from '../common/ConfirmModal';
import SolutionRecorder from './SolutionRecorder';
import SolutionPlayer from './SolutionPlayer';
import SolutionList from './SolutionList';

interface MapDetailProps {
  map: MapRow;
  onBack: () => void;
  // Kept for the hub's plain-play path; the detail screen now plays via the
  // capture surface so a clear can be registered as a solution.
  onPlay: (map: MapRow) => void;
  onChanged: (updated?: MapRow) => void;
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MapDetail({ map: initial, onBack, onChanged }: MapDetailProps) {
  const { profile } = useAuth();
  const [map, setMap] = useState<MapRow>(initial);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pendingDiff, setPendingDiff] = useState<number | null>(null); // meeting-difficulty change awaiting confirm
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // 'record'/'play' capture a new solution; 'view' replays a chosen one.
  const [solutionMode, setSolutionMode] = useState<'record' | 'play' | 'view' | null>(null);
  const [viewSolution, setViewSolution] = useState<SolutionRow | null>(null);
  const [solToken, setSolToken] = useState(0); // bump to reload the solution list

  const isOwner = profile?.id === map.owner_id;
  const showFlash = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1500); };

  const changeStatus = async (status: MapRow['status']) => {
    setBusy(true);
    try {
      await setReview(map.id, { status });
      const updated = { ...map, status };
      setMap(updated); onChanged(updated);
    } catch (e) { alert('상태 변경 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  // Meeting difficulty change is confirmed via a modal first.
  const confirmDifficulty = async () => {
    if (pendingDiff == null) return;
    setBusy(true);
    try {
      await setReview(map.id, { difficulty: pendingDiff });
      const updated = { ...map, difficulty: pendingDiff };
      setMap(updated); onChanged(updated);
      setPendingDiff(null);
      showFlash('회의 난이도가 반영되었습니다');
    } catch (e) { alert('난이도 변경 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const saveEdit = async (p: UploadPayload) => {
    const updated = await updateMap(map.id, {
      title: p.title, author_name: p.author_name, comment: p.comment,
      author_difficulty: p.difficulty, created_at: registeredToISO(p.registered_on),
    });
    setMap(updated); onChanged(updated); setEditing(false);
    showFlash('수정되었습니다');
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteMap(map.id); onChanged(); onBack(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); setBusy(false); }
  };

  // Owner takes their map off the hub. It becomes a private draft again (kept in
  // 맵 제작), so it drops out of the hub list — return there afterward.
  const doUnpublish = async () => {
    setBusy(true);
    try { await unpublishMap(map.id); onChanged(); onBack(); }
    catch (e) { alert('비공개 전환 실패: ' + (e as Error).message); setBusy(false); }
  };

  const copyCode = () => { navigator.clipboard.writeText(map.code); showFlash('맵 코드 복사됨'); };

  // Anyone who clears the map can register that run as their own solution.
  const registerSolution = async (moves: string, turnCount: number) => {
    if (!profile) return;
    await insertSolution({
      map_id: map.id,
      author_id: profile.id,
      author_name: profile.name,
      moves,
      turn_count: turnCount,
    });
    setSolutionMode(null);
    setSolToken((t) => t + 1);
    showFlash('풀이가 등록되었습니다');
  };

  // Full-screen sub-views: recording a new solution, playing to register one, or
  // replaying a chosen solution.
  if (solutionMode === 'record') {
    return (
      <SolutionRecorder
        code={map.code}
        onSave={registerSolution}
        onCancel={() => setSolutionMode(null)}
      />
    );
  }
  if (solutionMode === 'play') {
    return (
      <SolutionRecorder
        variant="play"
        title={`바로 플레이 · ${map.title || '플레이'}`}
        code={map.code}
        onSave={registerSolution}
        onCancel={() => setSolutionMode(null)}
      />
    );
  }
  if (solutionMode === 'view' && viewSolution) {
    return (
      <SolutionPlayer
        code={map.code}
        solution={viewSolution.moves}
        title={`${viewSolution.author_name}의 풀이`}
        onClose={() => { setSolutionMode(null); setViewSolution(null); }}
      />
    );
  }

  return (
    <div className="map-detail">
      <div className="detail-topbar">
        <button className="btn" onClick={onBack}>← 허브로</button>
        {flash && <span className="detail-flash">{flash}</span>}
        {isOwner && (
          <div className="detail-owner-actions">
            <button className="btn" onClick={() => setEditing(true)}>수정</button>
            <button className="btn" onClick={() => setConfirmUnpublish(true)}>비공개로 전환</button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>삭제</button>
          </div>
        )}
      </div>

      <div className="detail-scroll">
        <div className="detail-columns">
          {/* ---- left ---- */}
          <div className="detail-main">
            <div className="detail-header">
              <h1 className="detail-title">{map.title || '제목 없음'}</h1>
              <span className={`badge badge-${map.status}`}>{STATUS_LABEL[map.status]}</span>
            </div>

            <div className="detail-thumb"><MapThumbnail code={map.code} /></div>

            <button
              className="btn btn-primary detail-play"
              onClick={() => setSolutionMode('play')}
            >▶ 바로 플레이</button>
            <div className="detail-play-hint">클리어하면 이 플레이를 풀이로 등록할 수 있어요.</div>

            <SolutionList
              mapId={map.id}
              mapOwnerId={map.owner_id}
              reloadToken={solToken}
              onView={(s) => { setViewSolution(s); setSolutionMode('view'); }}
              onRegister={() => setSolutionMode('record')}
            />

            {map.comment && (
              <div className="detail-comment-card">
                <div className="detail-mini-label">코멘트</div>
                <p><SpoilerText text={map.comment} /></p>
              </div>
            )}

            <div className="detail-info-grid">
              <div className="detail-info">
                <div className="detail-mini-label">제작자</div>
                <div className="detail-info-val">{map.author_name || '익명'}</div>
              </div>
              <div className="detail-info">
                <div className="detail-mini-label">등록일</div>
                <div className="detail-info-val">{fullDate(map.created_at)}</div>
              </div>
              <div className="detail-info">
                <div className="detail-mini-label">출제자 난이도</div>
                <div className="detail-info-val">
                  {map.author_difficulty != null
                    ? <StarRating value={map.author_difficulty} size={16} />
                    : <span className="detail-muted">미지정</span>}
                </div>
              </div>
              <div className="detail-info detail-info-clickable" onClick={copyCode}>
                <div className="detail-mini-label">맵 코드 (복사)</div>
                <div className="detail-info-code">{map.code.slice(0, 18)}{map.code.length > 18 ? '…' : ''}</div>
              </div>
            </div>
          </div>

          {/* ---- right: review ---- */}
          <div className="detail-review">
            <div className="review-title">회의 검토</div>
            <div className="review-sub">결정 사항과 피드백을 기록해요.</div>

            <div className="review-block">
              <div className="review-label">회의 결정 난이도 <span className="review-hint">누구나 조정</span></div>
              <div className="review-diff-row">
                <StarRating value={map.difficulty} onChange={(v) => setPendingDiff(v)} size={26} />
                <span className="difficulty-num">
                  {map.difficulty != null ? map.difficulty.toFixed(1) : '미결정'}
                </span>
              </div>
            </div>

            <div className="review-block">
              <div className="review-label">회의 결정 <span className="review-hint">누구나 변경</span></div>
              <StatusControl value={map.status} disabled={busy} onChange={changeStatus} />
            </div>

            <div className="review-block">
              <CommentList mapId={map.id} />
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <UploadForm
          title="맵 수정"
          submitLabel="저장"
          initial={{
            author_name: map.author_name ?? '',
            code: map.code,
            title: map.title ?? '',
            comment: map.comment ?? '',
            difficulty: map.author_difficulty,
            registered_on: isoToDateStr(map.created_at),
          }}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      )}

      {pendingDiff != null && (
        <ConfirmModal
          title="회의 난이도 변경"
          message={<>회의 결정 난이도를 <b>{pendingDiff.toFixed(1)}</b> (으)로 변경할까요?</>}
          confirmLabel="변경"
          busy={busy}
          onConfirm={confirmDifficulty}
          onCancel={() => setPendingDiff(null)}
        />
      )}

      {confirmUnpublish && (
        <ConfirmModal
          title="비공개로 전환"
          message={<>이 맵을 허브에서 내리고 <b>비공개</b>로 전환할까요? 내 <b>맵 제작</b> 목록에는 그대로 남아, 언제든 다시 공개할 수 있습니다.</>}
          confirmLabel="비공개로 전환"
          busy={busy}
          onConfirm={doUnpublish}
          onCancel={() => setConfirmUnpublish(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="맵 삭제"
          message="이 맵을 삭제할까요? 되돌릴 수 없습니다."
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
