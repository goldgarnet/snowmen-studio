import type { MapRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import StarRating from './StarRating';

interface MapCardProps {
  map: MapRow;
  onOpen: (map: MapRow) => void;
}

export default function MapCard({ map, onOpen }: MapCardProps) {
  return (
    <button className="map-card" onClick={() => onOpen(map)}>
      <div className="map-card-head">
        <span className="map-card-title">{map.title || '제목 없음'}</span>
        <span className={`badge badge-${map.status}`}>{STATUS_LABEL[map.status]}</span>
      </div>
      <div className="map-card-author">🎨 {map.author_name || '익명'}</div>
      {map.comment && <div className="map-card-comment">{map.comment}</div>}
      <div className="map-card-foot">
        {map.difficulty != null
          ? <StarRating value={map.difficulty} size={15} />
          : <span className="map-card-nodiff">난이도 미지정</span>}
        <span className="map-card-play">플레이 →</span>
      </div>
    </button>
  );
}
