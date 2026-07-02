import { useMemo } from 'react';
import { decodeLevelCode } from '../../utils/levelCode';
import Grid from '../editor/Grid';
import './MapThumbnail.css';

interface MapThumbnailProps {
  code: string;
  className?: string;
}

// Faithful miniature of a real map. It renders the *actual* board component in a
// read-only "thumbnail" mode, so the preview matches the real render exactly
// (tiles, objects, tunnels, buttons, walls, laser beams). Nothing is stored: the
// image is derived on the fly from the map code that already exists, so this adds
// no server storage — only a little client-side render work.
export default function MapThumbnail({ code, className }: MapThumbnailProps) {
  const level = useMemo(() => decodeLevelCode(code), [code]);

  if (!level || level.width === 0 || level.height === 0) {
    return (
      <div className={`map-thumb map-thumb-fallback ${className ?? ''}`}>
        <span className="mt-fallback-head" />
        <span className="mt-fallback-body" />
      </div>
    );
  }

  return (
    <div className={`map-thumb ${className ?? ''}`}>
      <Grid level={level} thumbnail />
    </div>
  );
}
