import { useMemo, useState, type KeyboardEvent } from 'react';
import type { MusicComment, MusicSample, MusicStatus } from '../../api/music';
import { commentMarks, formatBytes, formatTime, formatWhen, validPeaks } from '../../lib/music';
import StatusControl from '../hub/StatusControl';
import Waveform from './Waveform';
import { PauseIcon, PlayIcon, Spinner } from './icons';
import { usePlayerTime, type MusicPlayer } from './player';

interface MusicSampleRowProps {
  sample: MusicSample;
  no: number;                 // 칸 안 번호 (올린 순서)
  player: MusicPlayer;
  current: boolean;           // 지금 곡
  playing: boolean;
  loading: boolean;
  duration: number;           // 모르면 0
  error: string | null;
  queue: string[];            // 이 줄을 눌러 틀 때의 재생 목록 (앞뒤 곡 · 이어 듣기)
  comments: MusicComment[];
  mine: boolean;              // 내가 올린 곡 — 고치기 · 지우기
  userId: string;
  compact?: boolean;          // 채택곡 모아 듣기: 재생 · 파형만
  feedbackOpen?: boolean;
  statusBusy?: boolean;
  onToggleFeedback?: () => void;
  onStatus?: (status: MusicStatus) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onAddComment?: (body: string, atSec: number | null) => Promise<void>;
  onDeleteComment?: (comment: MusicComment) => Promise<void>;
}

export default function MusicSampleRow(props: MusicSampleRowProps) {
  const { sample, no, player, current, playing, loading, duration, error, queue, comments, mine, compact, feedbackOpen } = props;
  const title = sample.title.trim() || '제목 없음';
  const peaks = useMemo(() => validPeaks(sample.peaks), [sample.peaks]);
  const marks = useMemo(() => (compact ? [] : commentMarks(comments, duration)), [compact, comments, duration]);

  return (
    <div className={`music-row${current ? ' current' : ''}${compact ? ' compact' : ''}`} id={`music-${sample.id}`}>
      <button
        type="button"
        className={`music-play${playing ? ' playing' : ''}`}
        aria-label={playing ? `${title} 멈춤` : `${title} 재생`}
        title={playing ? '멈춤' : '재생'}
        onClick={() => player.toggle(sample.id, queue)}
      >
        {current && loading && !playing ? <Spinner /> : playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="music-row-body">
        <div className="music-row-top">
          <span className="music-no">#{no}</span>
          <span className="music-title" title={sample.file_name || title}>{title}</span>
          <span className="music-meta">
            @{sample.uploader_name || '익명'} · {formatWhen(sample.created_at)}
            {!compact && sample.size_bytes ? ` · ${formatBytes(sample.size_bytes)}` : ''}
          </span>
        </div>

        <RowWave
          sample={sample}
          title={title}
          peaks={peaks}
          player={player}
          current={current}
          duration={duration}
          queue={queue}
          marks={marks}
          compact={compact}
        />

        {current && error && <div className="music-inline-error" role="alert">{error}</div>}
        {!compact && sample.note && <p className="music-note">{sample.note}</p>}

        {!compact && (
          <div className="music-row-actions">
            <StatusControl value={sample.status} disabled={props.statusBusy} onChange={(s) => props.onStatus?.(s)} />
            <span className="music-row-tools">
              <button
                type="button"
                className={`music-tool${feedbackOpen ? ' active' : ''}`}
                aria-expanded={feedbackOpen}
                onClick={props.onToggleFeedback}
              >
                피드백{comments.length > 0 && <span className="music-tool-count">{comments.length}</span>}
              </button>
              <button type="button" className="music-tool" onClick={props.onDownload} title={sample.file_name}>받기</button>
              {mine && <button type="button" className="music-tool" onClick={props.onEdit}>수정</button>}
              {mine && <button type="button" className="music-tool danger" onClick={props.onDelete}>삭제</button>}
            </span>
          </div>
        )}

        {!compact && feedbackOpen && (
          <MusicFeedback
            sample={sample}
            comments={comments}
            userId={props.userId}
            current={current}
            player={player}
            queue={queue}
            onAdd={props.onAddComment}
            onDelete={props.onDeleteComment}
          />
        )}
      </div>
    </div>
  );
}

// 파형과 시간 — 재생 위치를 받아 다시 그리는 것은 지금 곡의 이 부분뿐이다.
function RowWave({ sample, title, peaks, player, current, duration, queue, marks, compact }: {
  sample: MusicSample;
  title: string;
  peaks: number[] | null;
  player: MusicPlayer;
  current: boolean;
  duration: number;
  queue: string[];
  marks: ReturnType<typeof commentMarks>;
  compact?: boolean;
}) {
  const time = usePlayerTime(player, current);
  return (
    <div className="music-row-wave">
      <Waveform
        peaks={peaks}
        duration={duration}
        time={current ? time : 0}
        active={current}
        label={title}
        marks={marks}
        compact={compact}
        onSeek={(ratio) => player.seekTo(sample.id, ratio, queue)}
        onMark={(at) => player.play(sample.id, { at, queue })}
      />
      <span className="music-row-time">
        {current && <><b>{formatTime(time)}</b> / </>}
        {formatTime(duration > 0 ? duration : null)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- 피드백

function MusicFeedback({ sample, comments, userId, current, player, queue, onAdd, onDelete }: {
  sample: MusicSample;
  comments: MusicComment[];
  userId: string;
  current: boolean;
  player: MusicPlayer;
  queue: string[];
  onAdd?: (body: string, atSec: number | null) => Promise<void>;
  onDelete?: (comment: MusicComment) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [at, setAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 지점을 아직 고르지 않았으면 체크 칸 옆에 지금 듣는 위치를 보여 준다.
  const now = usePlayerTime(player, current && at == null);

  const submit = async () => {
    const text = body.trim();
    if (!text || busy || !onAdd) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(text, at);
      setBody('');
      setAt(null);
    } catch (e) {
      setError(`등록하지 못했어요: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment: MusicComment) => {
    if (!onDelete) return;
    setError(null);
    try { await onDelete(comment); }
    catch (e) { setError(`지우지 못했어요: ${(e as Error).message}`); }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); }
  };

  return (
    <div className="music-feedback">
      {comments.length === 0 ? (
        <p className="music-feedback-empty">아직 피드백이 없어요.</p>
      ) : (
        <ul className="music-feedback-list">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="music-feedback-head">
                {c.at_sec != null && (
                  <button
                    type="button"
                    className="music-time-chip"
                    title="이 지점부터 듣기"
                    onClick={() => player.play(sample.id, { at: c.at_sec ?? 0, queue })}
                  >
                    {formatTime(c.at_sec)}
                  </button>
                )}
                <b>{c.author_name || '익명'}</b>
                <span className="music-feedback-when">{formatWhen(c.created_at)}</span>
                {c.author_id === userId && (
                  <button type="button" className="music-link-btn" onClick={() => void remove(c)}>삭제</button>
                )}
              </div>
              <p className="music-feedback-body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="music-feedback-form">
        <textarea
          className="field-textarea"
          rows={2}
          maxLength={1000}
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="이 곡에 대한 의견을 남겨 주세요 (Ctrl+Enter로 등록)"
          aria-label={`${sample.title || '이 곡'} 피드백`}
        />
        <div className="music-feedback-actions">
          {current || at != null ? (
            <label className="music-at-toggle">
              <input
                type="checkbox"
                checked={at != null}
                disabled={busy}
                onChange={(e) => setAt(e.target.checked ? Math.round(player.getTime() * 10) / 10 : null)}
              />
              {at != null ? `${formatTime(at)} 지점에 달기` : `지금 듣는 지점(${formatTime(now)})에 달기`}
            </label>
          ) : (
            <span className="music-feedback-tip">곡을 틀어 두고 쓰면 듣는 지점에 달 수 있어요</span>
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={!body.trim() || busy} onClick={() => void submit()}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </div>
        {error && <div className="music-inline-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
