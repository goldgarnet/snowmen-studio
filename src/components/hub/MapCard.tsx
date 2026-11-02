import type { MapRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import StarRating from './StarRating';
import MapThumbnail from './MapThumbnail';
import ClearChips from './ClearChips';

interface MapCardProps {
  map: MapRow;
  onOpen: (map: MapRow) => void;
  /** 내 칩을 누를 때 부르는 콜백 (허브 '내가 안 푼 맵' 거르기용) */
  onToggleMine?: (mapId: string) => void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 카드 = 여는 버튼(썸네일 + 제목줄) + 그 아래 '풀었어요' 칩 줄.
// 칩 줄에는 누를 수 있는 내 칩이 있어 버튼 안에 넣을 수 없으므로(버튼 중첩 금지) 형제로 둔다.
export default function MapCard({ map, onOpen, onToggleMine }: MapCardProps) {
  return (
    <div className="map-card">
      <button type="button" className="map-card-open" onClick={() => onOpen(map)}>
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
      <div className="map-card-clears">
        <ClearChips mapId={map.id} onToggle={onToggleMine} />
      </div>
    </div>
  );
}
