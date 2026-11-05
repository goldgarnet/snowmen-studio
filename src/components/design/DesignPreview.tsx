import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../api/design';
import type { DesignFile, DesignImage } from '../../api/design';
import { listPublishedMaps } from '../../api/maps';
import type { MapRow } from '../../api/types';
import { artChapter, previewArt, type PreviewArt } from '../../lib/designBoard';
import { showroomLevel } from '../../lib/designShowroom';

// 게임에서 보기 — 진짜 게임의 웹 빌드를 띄우고 올린 그림을 넣어 본다.
//   · 올린 파일은 그대로 보이고, 올리지 않은 요소는 유리처럼 자리만 비친다.
//   · 다른 사람이 올린 그림은 이 창으로 돌아올 때 들어온다(작업 공간의 다시 읽기).

type Phase = 'loading' | 'ready' | 'failed' | 'exited';

const CHAPTERS = [1, 2, 3, 4, 5, 6, 7];   // 게임 폴더 ch1~ch7 = 이야기 챕터 0~6
const PLAYER_SIZES = [1, 2, 3];
const chapterName = (n: number) => `챕터 ${n - 1} · ch${n}`;

export default function DesignPreview({ files, images }: { files: DesignFile[]; images: DesignImage[] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const sent = useRef(new Map<string, string>());   // 게임에 들어간 키 → 그림 id
  const [boot, setBoot] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [problem, setProblem] = useState('');
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [target, setTarget] = useState('showroom');
  const [chapter, setChapter] = useState(1);
  const [playerSize, setPlayerSize] = useState(2);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [used, setUsed] = useState<string[]>([]);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [waiting, setWaiting] = useState(0);

  const art = useMemo(() => previewArt(files, images), [files, images]);
  const picked = maps.find((m) => m.id === target);
  const mapCode = picked?.code;
  const level = useMemo(() => {
    if (target === 'showroom') return showroomLevel(playerSize);
    return mapCode ? { code: mapCode } : null;
  }, [target, playerSize, mapCode]);
  const title = target === 'showroom' ? '전시 맵' : picked?.title || '제목 없음';

  useEffect(() => {
    let active = true;
    void listPublishedMaps().then((rows) => { if (active) setMaps(rows.filter((m) => m.code)); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const post = (message: object, transfer: Transferable[] = []) =>
      frame.current?.contentWindow?.postMessage(message, window.location.origin, transfer);
    const fail = (message: string) => {
      setProblem(/not found/i.test(message) ? '게임 데이터가 아직 저장소에 올라가지 않았습니다.' : message);
      setPhase('failed');
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as { from?: string; type?: string; key?: string; ok?: boolean; used?: string[]; message?: string };
      if (m?.from !== 'game-preview') return;
      if (m.type === 'loaded') {
        api.downloadGamePack()
          .then((pck) => post({ type: 'boot', pck }, [pck]))
          .catch((err: unknown) => fail((err as Error).message));
      }
      if (m.type === 'ready') setPhase('ready');
      if (m.type === 'error') fail(m.message ?? '');
      if (m.type === 'exit') setPhase('exited');
      if (m.type === 'report') setUsed(m.used ?? []);
      if (m.type === 'result' && m.key) {
        const key = m.key;
        setFailed((cur) => {
          const next = new Set(cur);
          if (m.ok) next.delete(key); else next.add(key);
          return next;
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const command = (message: object) =>
    frame.current?.contentWindow?.postMessage({ type: 'cmd', message }, window.location.origin);

  // 볼 화면을 고르면 그 화면으로 간다. 게임을 바로 움직일 수 있게 키보드도 넘겨 준다.
  useEffect(() => {
    if (phase !== 'ready') return;
    if (target === 'world') command({ cmd: 'world', chapter });
    else if (level) command({ cmd: 'level', chapter, level: { id: 'preview', name: title, ...level } });
    frame.current?.contentWindow?.focus();
  }, [phase, target, chapter, level, title]);

  // 게임에 들어간 그림을 지금 목록에 맞춘다. 바뀐 파일만 다시 보낸다.
  useEffect(() => {
    if (phase !== 'ready') return;
    let stopped = false;
    const wanted = art.filter((a) => !off.has(a.key));
    for (const key of [...sent.current.keys()]) {
      if (wanted.some((a) => a.key === key)) continue;
      command({ cmd: 'remove', key });
      sent.current.delete(key);
    }
    const fresh = wanted.filter((a) => sent.current.get(a.key) !== a.imageId);
    void (async () => {
      setWaiting(fresh.length);
      for (const one of fresh) {
        if (stopped) return;
        try {
          const response = await fetch(api.imageUrl(one.path));
          if (!response.ok) throw new Error(String(response.status));
          const bytes = await response.arrayBuffer();
          if (stopped) return;
          frame.current?.contentWindow?.postMessage({ type: 'art', key: one.key, bytes }, window.location.origin, [bytes]);
          sent.current.set(one.key, one.imageId);
        } catch {
          setFailed((cur) => new Set(cur).add(one.key));
        }
        setWaiting((n) => n - 1);
      }
    })();
    return () => { stopped = true; };
  }, [phase, art, off]);

  const restart = () => {
    sent.current.clear();
    setUsed([]);
    setProblem('');
    setPhase('loading');
    setBoot((n) => n + 1);
  };

  const toggle = (key: string) => setOff((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const onScreen = (a: PreviewArt) => used.includes(a.key);
  const shown = art.filter((a) => !off.has(a.key) && onScreen(a)).length;
  const ordered = [...art].sort((a, b) => Number(onScreen(b)) - Number(onScreen(a)) || a.key.localeCompare(b.key));

  const tagOf = (a: PreviewArt) => {
    if (off.has(a.key)) return <span className="dw-tag c-gray">꺼 둠</span>;
    if (failed.has(a.key)) return <span className="dw-tag c-red">읽지 못함</span>;
    if (onScreen(a)) return <span className="dw-tag c-green">이 화면에 나옴</span>;
    const only = artChapter(a.key);
    if (only && only !== chapter) return <span className="dw-tag c-blue">{chapterName(only)}에서 나옴</span>;
    return <span className="dw-tag c-gray">이 화면엔 없음</span>;
  };

  return (
    <div className="dw-game">
      <div className="dw-game-bar">
        <select className="dw-filter dw-game-map" aria-label="볼 화면" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="showroom">전시 맵 (모든 요소)</option>
          <option value="world">월드맵</option>
          {maps.length > 0 && (
            <optgroup label="팀 맵">
              {maps.map((m) => (
                <option key={m.id} value={m.id}>{m.title || '제목 없음'} · {m.author_name || '작성자 미상'}</option>
              ))}
            </optgroup>
          )}
        </select>
        <select className="dw-filter" aria-label="챕터" value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>
          {CHAPTERS.map((n) => <option key={n} value={n}>{chapterName(n)}</option>)}
        </select>
        {target === 'showroom' && (
          <div className="dw-chips" role="group" aria-label="플레이어 크기">
            {PLAYER_SIZES.map((n) => (
              <button key={n} type="button" aria-pressed={playerSize === n} className={playerSize === n ? 'active' : ''} onClick={() => setPlayerSize(n)}>
                크기 {n}
              </button>
            ))}
          </div>
        )}
        <span className="dw-game-status">
          {waiting > 0 ? `그림 넣는 중… ${waiting}장 남음` : `올린 그림 ${art.length - off.size}장 · 이 화면에 ${shown}장`}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={restart}>게임 다시 켜기</button>
      </div>

      <div className="dw-game-body">
        <div className="dw-game-main">
          <div className="dw-game-stage">
            <iframe key={boot} ref={frame} title="게임 미리보기" src="/game-preview/index.html" allow="fullscreen 'none'" />
            {phase !== 'ready' && (
              <div className="dw-game-cover" role="status">
                {phase === 'loading' && <p>게임을 여는 중…</p>}
                {phase === 'exited' && <p>게임이 꺼졌습니다. ‘게임 다시 켜기’를 눌러 주세요.</p>}
                {phase === 'failed' && (
                  <>
                    <p>게임을 열지 못했습니다.</p>
                    <p className="dw-game-why">{problem}</p>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="dw-game-hint">게임 화면을 한 번 누른 뒤 방향키로 움직입니다. 올린 파일은 그대로 보이고, 아직 올리지 않은 요소는 유리처럼 자리만 보입니다.</p>
        </div>

        <aside className="dw-game-side" aria-label="올린 그림">
          <h2>올린 그림 <span>{art.length}</span></h2>
          {art.length === 0 ? (
            <p className="dw-game-none">아직 올린 그림이 없습니다. 보드에서 파일을 올리면 여기로 바로 들어옵니다.</p>
          ) : (
            <ul>
              {ordered.map((a) => (
                <li key={a.key} className={off.has(a.key) ? 'is-off' : ''}>
                  <img src={api.imageUrl(a.path)} alt="" loading="lazy" />
                  <div>
                    <b title={a.fileName}>{a.fileName}</b>
                    {tagOf(a)}
                    {a.sizeNote && <small>{a.sizeNote}</small>}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" aria-pressed={off.has(a.key)} onClick={() => toggle(a.key)}>
                    {off.has(a.key) ? '켜기' : '끄기'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
