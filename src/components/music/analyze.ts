import { computePeaks, PEAK_BARS } from '../../lib/music';

// 올리기 전에 브라우저에서 곡 길이와 파형을 잰다. 서버는 파일을 열어 보지 않는다.

export interface AudioFacts {
  durationSec: number | null;
  peaks: number[] | null;
}

// 파형만 그리면 되므로 낮은 표본률로 푼다 — 20MB mp3(20분 남짓)도 100MB 안쪽 메모리로 끝난다.
// 낮은 표본률을 받지 않는 브라우저는 다음 값으로.
const ANALYSIS_RATES = [8000, 22050];

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineContext(): OfflineCtor | null {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

export async function analyzeAudio(file: File): Promise<AudioFacts> {
  const Offline = offlineContext();
  if (Offline) {
    for (const rate of ANALYSIS_RATES) {
      let context: OfflineAudioContext;
      try { context = new Offline(1, 1, rate); }
      catch { continue; }
      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        return { durationSec: buffer.duration, peaks: computePeaks(channels, PEAK_BARS) };
      } catch {
        break;   // 이 브라우저가 못 푸는 형식 — 길이만 재 본다
      }
    }
  }
  return { durationSec: await metadataDuration(file), peaks: null };
}

function metadataDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
