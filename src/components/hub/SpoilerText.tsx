import { useState } from 'react';
import './SpoilerText.css';

// Discord-style spoilers: text wrapped in ||double pipes|| renders as a hidden
// block that reveals on click. Each spoiler reveals independently.
interface Part { spoiler: boolean; text: string; }

function parse(text: string): Part[] {
  const parts: Part[] = [];
  const re = /\|\|([\s\S]+?)\|\|/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ spoiler: false, text: text.slice(last, m.index) });
    parts.push({ spoiler: true, text: m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ spoiler: false, text: text.slice(last) });
  return parts;
}

function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  // Colors are inline so the revealed/hidden state always wins over any cascade.
  const style: React.CSSProperties = revealed
    ? { background: 'var(--accent-soft)', color: 'var(--text)', cursor: 'default', userSelect: 'text' }
    : { background: 'var(--spoiler-bg)', color: 'transparent', cursor: 'pointer', userSelect: 'none' };
  return (
    <span
      className="spoiler"
      style={style}
      role="button"
      tabIndex={0}
      title={revealed ? '' : '클릭하면 내용을 볼 수 있어요'}
      onClick={(e) => { e.stopPropagation(); if (!revealed) setRevealed(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRevealed(true); } }}
    >
      {text}
    </span>
  );
}

export default function SpoilerText({ text }: { text: string }) {
  const parts = parse(text);
  return (
    <>
      {parts.map((p, i) =>
        p.spoiler ? <Spoiler key={i} text={p.text} /> : <span key={i}>{p.text}</span>
      )}
    </>
  );
}
