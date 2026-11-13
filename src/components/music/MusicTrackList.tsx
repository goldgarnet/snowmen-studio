import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { MusicSample } from '../../api/music';
import { formatDate, formatTime } from '../../lib/music';
import { useMusic } from '../../context/MusicContext';
import { DragIcon, Equalizer, MoreIcon, PauseIcon, PlayIcon } from './icons';
import { usePlayerState, type MusicTrack } from './player';

// 곡 목록 표 — 번호(누르면 재생) · 제목 · 챕터 · 올린 날 · 길이 · ⋯ 메뉴.
// 곡을 누르면 이 목록 전체가 재생 대기열이 된다(유튜브 뮤직처럼). 플레이리스트에서는 끌어서 순서를 바꾼다.

export interface TrackRow {
  sample: MusicSample;
  track: MusicTrack;
  itemId?: string;   // 플레이리스트의 줄 id
}

interface MusicTrackListProps {
  rows: TrackRow[];
  source: string;                    // 대기열 이름 (모든 곡 · 챕터 1 · 설원 · 플레이리스트 이름)
  showChapter: boolean;
  canManage: boolean;                // 곡 정보 수정 · 삭제 (올리는 두 계정)
  playlistMode: boolean;             // 이 플레이리스트에서 빼기 · 순서 바꾸기
  reorderEnabled: boolean;           // 플레이리스트에서만 순서를 바꾼다
  onSaveToPlaylist: (sample: MusicSample) => void;
  onDownload: (sample: MusicSample) => void;
  onEdit: (sample: MusicSample) => void;
  onDelete: (sample: MusicSample) => void;
  onRemoveFromPlaylist: (itemId: string) => void;
  onMove: (from: number, to: number) => void;
}

export default function MusicTrackList(props: MusicTrackListProps) {
  const { rows, source, showChapter, canManage, playlistMode, reorderEnabled } = props;
  const { player } = useMusic();
  const state = usePlayerState(player);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const tracks = rows.map((r) => r.track);

  const endDrag = () => { setDragFrom(null); setDropAt(null); };

  const onDragStart = (e: DragEvent<HTMLElement>, index: number) => {
    const row = e.currentTarget.closest<HTMLElement>('.music-tr');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', rows[index].sample.id);
    if (row) e.dataTransfer.setDragImage(row, 24, row.offsetHeight / 2);
    setDragFrom(index);
  };
  const onDragOver = (e: DragEvent<HTMLElement>, index: number) => {
    if (dragFrom == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < box.top + box.height / 2 ? index : index + 1);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (dragFrom == null) return;
    e.preventDefault();
    if (dropAt != null) {
      const to = dropAt > dragFrom ? dropAt - 1 : dropAt;
      if (to !== dragFrom) props.onMove(dragFrom, to);
    }
    endDrag();
  };

  return (
    <div className={`music-table${showChapter ? '' : ' no-chapter'}`} role="table" aria-label="곡 목록">
      <div className="music-tr music-thead" role="row">
        <span className="music-td no" role="columnheader">#</span>
        <span className="music-td title" role="columnheader">제목</span>
        {showChapter && <span className="music-td chapter" role="columnheader">챕터</span>}
        <span className="music-td date" role="columnheader">올린 날</span>
        <span className="music-td dur" role="columnheader">길이</span>
        <span className="music-td more" role="columnheader"><span className="sr-only">메뉴</span></span>
      </div>
      {rows.map((row, i) => {
        const { sample, track } = row;
        const isCurrent = state.current?.id === sample.id;
        const playing = isCurrent && state.playing;
        const title = sample.title.trim() || '제목 없음';
        const rowKey = row.itemId ?? sample.id;
        const classes = ['music-tr'];
        if (isCurrent) classes.push('current');
        if (dragFrom === i) classes.push('dragging');
        if (dropAt === i && dragFrom != null) classes.push('drop-before');
        if (dropAt === i + 1 && i === rows.length - 1 && dragFrom != null) classes.push('drop-after');
        return (
          <div
            key={rowKey}
            id={`track-${sample.id}`}
            className={classes.join(' ')}
            role="row"
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('button, a, input, .music-menu')) return;
              player.playList(tracks, sample.id, { source });
            }}
            onDragOver={reorderEnabled ? (e) => onDragOver(e, i) : undefined}
            onDrop={reorderEnabled ? onDrop : undefined}
          >
            <span className="music-td no" role="cell">
              {reorderEnabled && (
                <span
                  className="music-drag"
                  draggable
                  onDragStart={(e) => onDragStart(e, i)}
                  onDragEnd={endDrag}
                  title="끌어서 순서 바꾸기"
                  aria-hidden="true"
                ><DragIcon /></span>
              )}
              <button
                type="button"
                className={`music-row-play${isCurrent ? ' current' : ''}`}
                onClick={() => player.toggleTrack(tracks, sample.id, source)}
                aria-label={playing ? `${title} 멈춤` : `${title} 재생`}
                title={playing ? '멈춤' : '재생'}
              >
                {isCurrent
                  ? <><span className="music-row-idle">{playing ? <Equalizer /> : <PlayIcon size={15} />}</span><span className="music-row-hover">{playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</span></>
                  : <><span className="music-row-idle music-num">{i + 1}</span><span className="music-row-hover"><PlayIcon size={15} /></span></>}
              </button>
            </span>
            <span className="music-td title" role="cell">
              <button type="button" className="music-title-btn" onClick={() => player.toggleTrack(tracks, sample.id, source)}
                title={sample.file_name || title}>{title}</button>
              <span className="music-sub">
                @{sample.uploader_name || '익명'}{sample.note ? ` · ${sample.note}` : ''}
              </span>
            </span>
            {showChapter && <span className="music-td chapter" role="cell">{track.album}</span>}
            <span className="music-td date" role="cell">{formatDate(sample.created_at)}</span>
            <span className="music-td dur" role="cell">{formatTime(sample.duration_sec)}</span>
            <span className="music-td more" role="cell">
              <TrackMenu
                open={menuFor === rowKey}
                onOpen={() => setMenuFor(rowKey)}
                onClose={() => setMenuFor(null)}
                title={title}
                items={[
                  { label: '다음에 재생', run: () => player.enqueue(track, 'next') },
                  { label: '대기열에 추가', run: () => player.enqueue(track, 'end') },
                  { label: '플레이리스트에 저장…', run: () => props.onSaveToPlaylist(sample) },
                  ...(playlistMode && row.itemId ? [
                    { label: '위로', run: () => props.onMove(i, i - 1), disabled: !reorderEnabled || i === 0 },
                    { label: '아래로', run: () => props.onMove(i, i + 1), disabled: !reorderEnabled || i === rows.length - 1 },
                    { label: '이 플레이리스트에서 빼기', run: () => props.onRemoveFromPlaylist(row.itemId!) },
                  ] : []),
                  { label: '받기 (원본 파일)', run: () => props.onDownload(sample) },
                  ...(canManage ? [
                    { label: '곡 정보 수정', run: () => props.onEdit(sample), divider: true },
                    { label: '곡 삭제', run: () => props.onDelete(sample), danger: true },
                  ] : []),
                ]}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

function TrackMenu({ open, onOpen, onClose, title, items }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  title: string;
  items: MenuItem[];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [upward, setUpward] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    if (open) { onClose(); return; }
    // 화면 아래쪽 줄은 메뉴를 위로 연다(아래 플레이어 · 화면 끝에 가리지 않게).
    const box = e.currentTarget.getBoundingClientRect();
    setUpward(box.bottom > window.innerHeight * 0.55);
    onOpen();
  };

  return (
    <span className="music-menu" ref={ref}>
      <button type="button" className="music-more-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open}
        aria-label={`${title} 메뉴`} title="더 보기"><MoreIcon /></button>
      {open && (
        <span className={`music-menu-pop${upward ? ' up' : ''}`} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`${item.danger ? 'danger' : ''}${item.divider ? ' divider' : ''}`}
              disabled={item.disabled}
              onClick={() => { onClose(); item.run(); }}
            >{item.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
