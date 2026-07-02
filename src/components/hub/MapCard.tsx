import type { MapRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import StarRating from './StarRating';
import MapThumbnail from './MapThumbnail';

interface MapCardProps {
  map: MapRow;
  onOpen: (map: MapRow) => void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MapCard({ map, onOpen }: MapCardProps) {
  return (
    <button className="map-card" onClick={() => onOpen(map)}>
      <div className="map-card-thumb">
        <MapThumbnail code={map.code} />
        <span className={`badge badge-${map.status} map-card-badge`}>{STATUS_LABEL[map.status]}</span>
      </div>
      <div className="map-card-body">
        <div className="map-card-titlerow">
          <span className="map-card-title">{map.title || '제목 없음'}</span>
          {(map.difficulty ?? map.author_difficulty) != null && (
            <StarRating value={map.difficulty ?? map.author_difficulty} size={13} />
          )}
        </div>
        <div className="map-card-metarow">
          <span>@{map.author_name || '익명'}</span>
          <span>{shortDate(map.created_at)}</span>
        </div>
      </div>
    </button>
  );
}
