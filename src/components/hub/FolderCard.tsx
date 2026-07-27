import type { FolderRow, MapRow } from '../../api/types';
import FolderGlyph from './FolderGlyph';

interface FolderCardProps {
  folder: FolderRow;
  maps: MapRow[];               // member maps (for the count)
  onOpen: (folder: FolderRow) => void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A folder shown in a card grid (hub main list). A yellow folder icon stands in for a
// thumbnail, with a member-count badge.
export default function FolderCard({ folder, maps, onOpen }: FolderCardProps) {
  return (
    <button className="map-card folder-card" onClick={() => onOpen(folder)}>
      <div className="map-card-thumb folder-card-thumb">
        <FolderGlyph />
        <span className="badge folder-card-badge">📁 {maps.length}</span>
      </div>
      <div className="map-card-body">
        <div className="map-card-titlerow">
          <span className="map-card-title">📁 {folder.name || '이름 없는 폴더'}</span>
        </div>
        <div className="map-card-metarow">
          <span>@{folder.author_name || '익명'}</span>
          <span>{shortDate(folder.created_at)}</span>
        </div>
      </div>
    </button>
  );
}
