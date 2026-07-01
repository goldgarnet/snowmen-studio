import { useMemo } from 'react';
import { decodeLevelCode } from '../../utils/levelCode';
import type { Tile, GameObject } from '../../types';
import './MapThumbnail.css';

// Colors mirror the real board (Grid.css) so the preview reads like the map.
function tileColor(t: Tile): string {
  if (t.isRowArch || t.isColumnArch) return '#95a0b0';
  if (t.isShade) return t.isWarm ? '#b0a08a' : '#8a9ab0';
  if (t.isGoal) return '#cfeecc';
  if (t.isFlake) return '#dceeff';
  return t.isWarm ? '#f5e6c8' : '#d0e8f8';
}

// A tiny object marker centered in its cell.
function objectMarker(o: GameObject): React.ReactNode {
  switch (o.type) {
    case 'wall': return <span className="mt-obj mt-wall" />;
    case 'block': return <span className="mt-obj mt-block" />;
    case 'tree': return <span className="mt-obj mt-tree" />;
    case 'laser': return <span className="mt-obj mt-laser" />;
    case 'player': return <span className="mt-obj mt-player" />;
    case 'snowman': return <span className="mt-obj mt-snowman" />;
    case 'snowball': return <span className="mt-obj mt-snowball" />;
    default: return null;
  }
}

interface MapThumbnailProps {
  code: string;
  className?: string;
}

// Cropped mini-preview of a real map. The inner board is sized to *cover* the
// (aspect-controlled) frame — larger maps get a centered crop that shows the
// interior features without exposing an awkward border. Invalid codes fall back
// to a neutral snowman placeholder so cards never break.
export default function MapThumbnail({ code, className }: MapThumbnailProps) {
  const level = useMemo(() => decodeLevelCode(code), [code]);

  if (!level) {
    return (
      <div className={`map-thumb map-thumb-fallback ${className ?? ''}`}>
        <span className="mt-fallback-head" />
        <span className="mt-fallback-body" />
      </div>
    );
  }

  const { width: cols, height: rows } = level;

  return (
    <div className={`map-thumb ${className ?? ''}`}>
      <div
        className="map-thumb-inner"
        style={{
          aspectRatio: `${cols} / ${rows}`,
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {level.tiles.map((rowArr, r) =>
          rowArr.map((tile, c) => {
            const obj = level.objects[r]?.[c] ?? null;
            return (
              <div key={`${r}-${c}`} className="mt-cell" style={{ background: tileColor(tile) }}>
                {obj && objectMarker(obj)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
