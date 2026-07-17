import { useState, useCallback, useRef, useEffect } from 'react';
import { Level } from '../../types';
import { yellowWallsSolid, orangeWallsSolid } from '../../engine/helpers';
import './Grid.css';

interface GridProps {
  level: Level;
  onCellClick?: (row: number, col: number) => void;
  onCellDrag?: (row: number, col: number) => void;
  onCellErase?: (row: number, col: number) => void;
  onEdgeClick?: (row: number, col: number, side: 'top' | 'left') => void;
  onEdgeErase?: (row: number, col: number, side: 'top' | 'left') => void;
  edgeMode?: boolean;
  highlightPlayer?: boolean;
  // Read-only, cropped miniature render (used for map thumbnails). Disables all
  // interaction, fills the frame (no reserved margin), and allows tiny cells.
  thumbnail?: boolean;
  selectedCells?: Set<string>;
  previewSelectionCells?: Set<string> | null;
  moveGhost?: {
    srcBBox: { minR: number; maxR: number; minC: number; maxC: number };
    delta: { dr: number; dc: number };
  } | null;
}

export default function Grid({
  level, onCellClick, onCellDrag, onCellErase, onEdgeClick, onEdgeErase, edgeMode, highlightPlayer,
  thumbnail, selectedCells, previewSelectionCells, moveGhost,
}: GridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isRightDragging, setIsRightDragging] = useState(false);

  // Reset drag flags if the mouse is released anywhere (even outside the grid).
  useEffect(() => {
    const onUp = () => { setIsDragging(false); setIsRightDragging(false); };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  // Responsive cell sizing: measure the wrapper and fill available space.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setBox({ w: cr.width, h: cr.height });
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Cap max cell size to 72 so small maps don't dominate the screen.
  // Also reserve a comfortable outer margin (~8% of the smaller box dimension).
  // Thumbnail mode fills the frame (no margin) and allows very small cells so any
  // map fits its card faithfully.
  const cellSize = (level.width > 0 && level.height > 0 && box.w > 0 && box.h > 0)
    ? Math.max(thumbnail ? 3 : 16, Math.min(thumbnail ? 300 : 72, Math.floor(Math.min(
        (box.w * (thumbnail ? 1 : 0.92)) / level.width,
        (box.h * (thumbnail ? 1 : 0.92)) / level.height
      ))))
    : (thumbnail ? 10 : 40);

  const handleMouseDown = useCallback((row: number, col: number) => {
    setIsDragging(true);
    onCellClick?.(row, col);
  }, [onCellClick]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (isDragging) {
      (onCellDrag ?? onCellClick)?.(row, col);
    }
  }, [isDragging, onCellDrag, onCellClick]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (level.width === 0 || level.height === 0) {
    return <div ref={wrapperRef} className="grid-wrapper" />;
  }

  const gridW = cellSize * level.width;
  const gridH = cellSize * level.height;

  // Edge hit dimensions. Strip is thick perpendicular to the edge for easy
  // clicking, but trimmed at both ends so it never enters the corner squares
  // shared with perpendicular edges — preventing the "selecting corners" feel.
  const hitThick = Math.max(14, Math.min(22, Math.round(cellSize * 0.3)));
  const cornerTrim = hitThick / 2 + 2;
  const archThick = Math.max(5, Math.round(cellSize * 0.16));

  // Enumerate interior edges.
  const horzEdges: { row: number; col: number; level: number }[] = [];
  for (let r = 1; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      horzEdges.push({ row: r, col: c, level: level.tiles[r][c].edgeArchTop ?? 0 });
    }
  }
  const vertEdges: { row: number; col: number; level: number }[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 1; c < level.width; c++) {
      vertEdges.push({ row: r, col: c, level: level.tiles[r][c].edgeArchLeft ?? 0 });
    }
  }

  // Goal is "locked" (shown muted) when key footplates exist and any is uncovered
  // by an object (the player counts too) — mirrors the engine's isGoalActive rule.
  let goalActive = true;
  for (let r = 0; r < level.height && goalActive; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isKeyTile && !level.objects[r][c]) { goalActive = false; break; }
    }
  }

  // Yellow walls are solid (visible/blocking) unless all yellow buttons are pressed.
  const yellowSolid = yellowWallsSolid(level);
  // Orange walls are solid until every orange button has latched (persisted state).
  const orangeSolid = orangeWallsSolid(level);

  return (
    <div ref={wrapperRef} className="grid-wrapper">
      <div className="grid-stack"
        style={{ position: 'relative', width: gridW, height: gridH }}
        onContextMenu={(e) => e.preventDefault()}>
        <div
          className={`grid ${edgeMode ? 'edge-mode' : ''} ${thumbnail ? 'thumb' : ''}`}
          style={{
            gridTemplateColumns: `repeat(${level.width}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${level.height}, ${cellSize}px)`,
          }}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {Array.from({ length: level.height }, (_, row) =>
            Array.from({ length: level.width }, (_, col) => {
              const tile = level.tiles[row][col];
              const obj = level.objects[row][col];
              const key = `${row},${col}`;
              const isSelected = !!(previewSelectionCells ?? selectedCells)?.has(key);

              const tileClasses = [
                'grid-cell',
                tile.isWarm ? 'warm' : 'cool',
                tile.isShade ? 'shaded' : '',
                tile.isFlake ? 'flake' : '',
                tile.isGoal ? 'goal' : '',
                tile.isGoal && !goalActive ? 'goal-locked' : '',
                tile.isRowArch ? 'row-arch' : '',
                tile.isColumnArch ? 'col-arch' : '',
                tile.isSoulSwap ? 'soul' : '',
                tile.isKeyTile ? 'key' : '',
                tile.isYellowButton ? 'ybutton' : '',
                tile.isYellowWall ? (yellowSolid ? 'ywall ywall-solid' : 'ywall ywall-open') : '',
                tile.isHole ? 'hole' : '',
              ].filter(Boolean).join(' ');

              return (
                <div
                  key={`${row}-${col}`}
                  className={tileClasses}
                  onMouseDown={thumbnail ? undefined : (e) => {
                    if (e.button === 2) {
                      e.preventDefault();
                      setIsRightDragging(true);
                      onCellErase?.(row, col);
                    } else if (e.button === 0) {
                      handleMouseDown(row, col);
                    }
                  }}
                  onMouseEnter={thumbnail ? undefined : () => {
                    if (isRightDragging) onCellErase?.(row, col);
                    else handleMouseEnter(row, col);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ width: cellSize, height: cellSize, position: 'relative' }}
                >
                  {tile.isGoal && <GoalOverlay size={cellSize} locked={!goalActive} />}
                  {tile.isFlake && !obj && <FlakeOverlay size={cellSize} />}
                  {(tile.isRowArch || tile.isColumnArch) && (
                    <TunnelOverlay size={cellSize} isRow={tile.isRowArch} />
                  )}
                  {tile.isSoulSwap && <SoulSwapOverlay size={cellSize} />}
                  {tile.isKeyTile && <GreenButtonOverlay size={cellSize} />}
                  {tile.isYellowButton && <YellowButtonOverlay size={cellSize} />}
                  {tile.isYellowWall && <YellowWallOverlay size={cellSize} solid={yellowSolid} />}
                  {tile.isOrangeButton && <OrangeButtonOverlay size={cellSize} pressed={!!tile.orangePressed} />}
                  {tile.isOrangeWall && <OrangeWallOverlay size={cellSize} solid={orangeSolid} />}
                  {tile.isHole && <HoleOverlay size={cellSize} />}
                  {tile.isCrack && <CrackOverlay size={cellSize} warm={!!tile.isWarm} armed={!!tile.crackArmed} />}
                  {tile.isPortal && <PortalOverlay size={cellSize} />}
                  {tile.triangle && <TriangleOverlay corner={tile.triangle} size={cellSize} />}
                  {obj && (
                    <div className={`object obj-${obj.type} size-${obj.size} ${highlightPlayer && obj.type === 'player' ? 'player-highlight' : ''} ${obj.isMelting ? 'melting' : ''}`}>
                      {renderObject(obj, cellSize)}
                    </div>
                  )}
                  {isSelected && <div className="cell-selection-overlay" />}
                </div>
              );
            })
          )}
        </div>

        {/* Move ghost: dashed rectangle at the destination bbox while dragging a selection */}
        {moveGhost && (
          <div className="move-ghost" style={{
            position: 'absolute',
            left: (moveGhost.srcBBox.minC + moveGhost.delta.dc) * cellSize,
            top: (moveGhost.srcBBox.minR + moveGhost.delta.dr) * cellSize,
            width: (moveGhost.srcBBox.maxC - moveGhost.srcBBox.minC + 1) * cellSize,
            height: (moveGhost.srcBBox.maxR - moveGhost.srcBBox.minR + 1) * cellSize,
            pointerEvents: 'none',
            zIndex: 7,
          }} />
        )}

        {/* Laser beam overlay */}
        <LaserBeamOverlay level={level} cellSize={cellSize} />

        {/* Arch visuals overlay (absolute pixel positioning over the grid) */}
        <div className="edge-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {horzEdges.filter(e => e.level > 0).map(e => (
            <ArchSegment key={`ah-${e.row}-${e.col}`}
              left={e.col * cellSize}
              top={e.row * cellSize - archThick / 2}
              width={cellSize}
              height={archThick}
              level={e.level}
              orientation="horizontal" />
          ))}
          {vertEdges.filter(e => e.level > 0).map(e => (
            <ArchSegment key={`av-${e.row}-${e.col}`}
              left={e.col * cellSize - archThick / 2}
              top={e.row * cellSize}
              width={archThick}
              height={cellSize}
              level={e.level}
              orientation="vertical" />
          ))}
        </div>

        {/* Edge hit strips — strictly on edges, never on corners */}
        {edgeMode && (
          <div className="edge-hits" style={{ position: 'absolute', inset: 0 }}>
            {horzEdges.map(e => (
              <div key={`hh-${e.row}-${e.col}`} className="edge-hit edge-hit-h"
                style={{
                  position: 'absolute',
                  left: e.col * cellSize + cornerTrim,
                  top: e.row * cellSize - hitThick / 2,
                  width: Math.max(0, cellSize - 2 * cornerTrim),
                  height: hitThick,
                }}
                onMouseDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.button === 0) onEdgeClick?.(e.row, e.col, 'top');
                  else if (ev.button === 2) { ev.preventDefault(); onEdgeErase?.(e.row, e.col, 'top'); }
                }}
                onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); }} />
            ))}
            {vertEdges.map(e => (
              <div key={`vh-${e.row}-${e.col}`} className="edge-hit edge-hit-v"
                style={{
                  position: 'absolute',
                  left: e.col * cellSize - hitThick / 2,
                  top: e.row * cellSize + cornerTrim,
                  width: hitThick,
                  height: Math.max(0, cellSize - 2 * cornerTrim),
                }}
                onMouseDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.button === 0) onEdgeClick?.(e.row, e.col, 'left');
                  else if (ev.button === 2) { ev.preventDefault(); onEdgeErase?.(e.row, e.col, 'left'); }
                }}
                onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArchSegment({ left, top, width, height, level, orientation }: {
  left: number; top: number; width: number; height: number; level: number; orientation: 'horizontal' | 'vertical';
}) {
  // Height-1 arch: gold single bar. Height-2 arch: deeper copper double bar so
  // it reads as taller / more permissive at a glance.
  const isH = orientation === 'horizontal';
  const barColor = level === 2 ? '#d96b3e' : '#c9a44a';
  const capColor = level === 2 ? '#7a3a1c' : '#8a6a26';
  return (
    <div style={{ position: 'absolute', left, top, width, height, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        left: isH ? '4%' : '50%',
        top: isH ? '50%' : '4%',
        transform: isH ? 'translateY(-50%)' : 'translateX(-50%)',
        width: isH ? '92%' : '40%',
        height: isH ? '40%' : '92%',
        background: barColor,
        borderRadius: 2,
      }} />
      {level === 2 && (
        <div style={{
          position: 'absolute',
          left: isH ? '4%' : '50%',
          top: isH ? '50%' : '4%',
          transform: isH
            ? 'translate(0, calc(-50% - 4px))'
            : 'translate(calc(-50% + 4px), 0)',
          width: isH ? '92%' : '24%',
          height: isH ? '24%' : '92%',
          background: barColor,
          opacity: 0.65,
          borderRadius: 2,
        }} />
      )}
      <div style={{
        position: 'absolute',
        left: isH ? 0 : '50%',
        top: isH ? '50%' : 0,
        transform: isH ? 'translateY(-50%)' : 'translateX(-50%)',
        width: isH ? '5%' : '60%',
        height: isH ? '60%' : '5%',
        background: capColor,
        borderRadius: 1,
      }} />
      <div style={{
        position: 'absolute',
        left: isH ? '95%' : '50%',
        top: isH ? '50%' : '95%',
        transform: isH ? 'translateY(-50%)' : 'translateX(-50%)',
        width: isH ? '5%' : '60%',
        height: isH ? '60%' : '5%',
        background: capColor,
        borderRadius: 1,
      }} />
    </div>
  );
}

function GoalOverlay({ size, locked }: { size: number; locked?: boolean }) {
  if (locked) {
    // Goal disabled by uncovered key footplates: muted grey star with a padlock.
    return (
      <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40">
        <polygon points="20,6 23.5,15 33,15 25.5,21 28,30 20,25 12,30 14.5,21 7,15 16.5,15"
          fill="none" stroke="#8a94a2" strokeWidth="1.3" opacity="0.45" />
        <rect x="15" y="20" width="10" height="8" rx="1.5" fill="#5a6470" opacity="0.9" />
        <path d="M17,20 v-2.2 a3,3 0 0 1 6,0 V20" fill="none" stroke="#5a6470"
          strokeWidth="1.7" opacity="0.9" />
        <circle cx="20" cy="23.5" r="1.2" fill="#cdd4dc" />
      </svg>
    );
  }
  return (
    <svg className="tile-overlay goal-overlay" width={size} height={size} viewBox="0 0 40 40">
      <defs>
        <radialGradient id="goal-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#50e880" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#30c060" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#20a050" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="url(#goal-glow)" />
      <polygon points="20,6 23.5,15 33,15 25.5,21 28,30 20,25 12,30 14.5,21 7,15 16.5,15"
        fill="none" stroke="#3cb868" strokeWidth="1.3" opacity="0.55" />
      <polygon points="20,10 22.5,16 29,16 24,20.5 26,27 20,23 14,27 16,20.5 11,16 17.5,16"
        fill="#40d870" opacity="0.3" />
    </svg>
  );
}

function FlakeOverlay({ size }: { size: number }) {
  return (
    <svg className="tile-overlay flake-overlay" width={size} height={size} viewBox="0 0 40 40">
      <g transform="translate(20,20)" stroke="#4a90d9" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7">
        {[0, 60, 120].map(angle => (
          <g key={angle} transform={`rotate(${angle})`}>
            <line x1="0" y1="-10" x2="0" y2="10" />
            <line x1="0" y1="-7" x2="-3" y2="-10" />
            <line x1="0" y1="-7" x2="3" y2="-10" />
            <line x1="0" y1="7" x2="-3" y2="10" />
            <line x1="0" y1="7" x2="3" y2="10" />
          </g>
        ))}
        <circle cx="0" cy="0" r="1.5" fill="#4a90d9" stroke="none" />
      </g>
    </svg>
  );
}

function TunnelOverlay({ size, isRow }: { size: number; isRow: boolean }) {
  return (
    <svg className="tile-overlay arch-overlay" width={size} height={size} viewBox="0 0 40 40">
      {isRow ? (
        <g>
          <rect x="3" y="0" width="4" height="40" fill="#6a6a80" rx="1.5" opacity="0.7" />
          <rect x="33" y="0" width="4" height="40" fill="#6a6a80" rx="1.5" opacity="0.7" />
          <path d="M3,4 Q20,-4 37,4" fill="none" stroke="#6a6a80" strokeWidth="2.5" opacity="0.7" />
          <line x1="18" y1="16" x2="22" y2="16" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
          <line x1="20" y1="14" x2="20" y2="18" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
          <line x1="18" y1="24" x2="22" y2="24" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
          <line x1="20" y1="22" x2="20" y2="26" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
        </g>
      ) : (
        <g>
          <rect x="0" y="3" width="40" height="4" fill="#6a6a80" rx="1.5" opacity="0.7" />
          <rect x="0" y="33" width="40" height="4" fill="#6a6a80" rx="1.5" opacity="0.7" />
          <path d="M4,3 Q-4,20 4,37" fill="none" stroke="#6a6a80" strokeWidth="2.5" opacity="0.7" />
          <line x1="16" y1="18" x2="16" y2="22" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
          <line x1="14" y1="20" x2="18" y2="20" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
          <line x1="24" y1="18" x2="24" y2="22" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
          <line x1="22" y1="20" x2="26" y2="20" stroke="#8888aa" strokeWidth="1" opacity="0.5" />
        </g>
      )}
    </svg>
  );
}

function SoulSwapOverlay({ size }: { size: number }) {
  return (
    <svg className="tile-overlay soul-overlay" width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="14" fill="none" stroke="#a86cff" strokeWidth="1" opacity="0.35" />
      <path d="M20,8 A12,12 0 1 1 8,20" fill="none" stroke="#b98cff" strokeWidth="2.4"
        strokeLinecap="round" opacity="0.85" />
      <path d="M20,32 A12,12 0 1 1 32,20" fill="none" stroke="#b98cff" strokeWidth="2.4"
        strokeLinecap="round" opacity="0.85" />
      <circle cx="20" cy="20" r="3" fill="#d9b8ff" opacity="0.9" />
    </svg>
  );
}

// Green button (formerly the key footplate): gates the goal.
function GreenButtonOverlay({ size }: { size: number }) {
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="12" fill="none" stroke="#2f9e57" strokeWidth="1.2" strokeDasharray="2.5 2.5" opacity="0.7" />
      <circle cx="20" cy="20" r="9" fill="#3fbf6a" stroke="#268a48" strokeWidth="1.8" opacity="0.92" />
      <circle cx="20" cy="20" r="4.5" fill="#8fe6ab" opacity="0.9" />
    </svg>
  );
}

// Yellow button: pressing all of them removes every yellow wall.
function YellowButtonOverlay({ size }: { size: number }) {
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="12" fill="none" stroke="#c99a1e" strokeWidth="1.2" strokeDasharray="2.5 2.5" opacity="0.7" />
      <circle cx="20" cy="20" r="9" fill="#f2c53a" stroke="#bd9018" strokeWidth="1.8" opacity="0.95" />
      <circle cx="20" cy="20" r="4.5" fill="#ffe89a" opacity="0.95" />
    </svg>
  );
}

// Yellow wall: solid unless all yellow buttons are pressed; when "open" it shows a
// faint dashed outline of where it will reappear.
function YellowWallOverlay({ size, solid }: { size: number; solid: boolean }) {
  if (solid) {
    // zIndex 3 (above objects at z2) so an object trapped inside the partition is
    // hidden behind the wall — it reads as sealed inside, not sitting on top.
    return (
      <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40" style={{ zIndex: 3 }}>
        <rect x="1" y="1" width="38" height="38" rx="3" fill="#e6b422" stroke="#b5860f" strokeWidth="2" />
        <line x1="0" y1="20" x2="40" y2="20" stroke="#c99320" strokeWidth="1.5" />
        <line x1="20" y1="0" x2="20" y2="20" stroke="#c99320" strokeWidth="1.5" />
        <line x1="10" y1="20" x2="10" y2="40" stroke="#c99320" strokeWidth="1.5" />
        <line x1="30" y1="20" x2="30" y2="40" stroke="#c99320" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40">
      <rect x="3" y="3" width="34" height="34" rx="3" fill="rgba(230,180,34,0.10)"
        stroke="#e6b422" strokeWidth="1.4" strokeDasharray="3 3" opacity="0.65" />
    </svg>
  );
}

// Orange button: like a yellow button but latching. `pressed` shows the latched state.
function OrangeButtonOverlay({ size, pressed }: { size: number; pressed: boolean }) {
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="12" fill="none" stroke="#c96a1e" strokeWidth="1.2" strokeDasharray="2.5 2.5" opacity="0.7" />
      <circle cx="20" cy="20" r="9" fill={pressed ? '#a8500d' : '#f2913a'} stroke="#bd6018" strokeWidth="1.8" opacity="0.95" />
      <circle cx="20" cy="20" r="4.5" fill={pressed ? '#d69a5e' : '#ffd19a'} opacity="0.95" />
    </svg>
  );
}

// Orange wall: solid until every orange button has latched; when open, a faint dashed
// outline of where it will (permanently) stay gone.
function OrangeWallOverlay({ size, solid }: { size: number; solid: boolean }) {
  if (solid) {
    // zIndex 3 (above objects) so a trapped object is hidden inside — see YellowWallOverlay.
    return (
      <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40" style={{ zIndex: 3 }}>
        <rect x="1" y="1" width="38" height="38" rx="3" fill="#e07b22" stroke="#a85410" strokeWidth="2" />
        <line x1="0" y1="20" x2="40" y2="20" stroke="#c56320" strokeWidth="1.5" />
        <line x1="20" y1="0" x2="20" y2="20" stroke="#c56320" strokeWidth="1.5" />
        <line x1="10" y1="20" x2="10" y2="40" stroke="#c56320" strokeWidth="1.5" />
        <line x1="30" y1="20" x2="30" y2="40" stroke="#c56320" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40">
      <rect x="3" y="3" width="34" height="34" rx="3" fill="rgba(224,123,34,0.08)"
        stroke="#e07b22" strokeWidth="1.4" strokeDasharray="3 3" opacity="0.55" />
    </svg>
  );
}

// Hole: a dark pit that swallows objects that move onto it.
function HoleOverlay({ size }: { size: number }) {
  // A hole is a MISSING tile — render the whole cell as a dark void, not a round pit.
  // Full-bleed dark fill (the cell also gets the `.hole` class for background/borders),
  // with a slightly lighter rim and darker center to suggest depth. No <defs>/gradient
  // so many holes on one map don't share an SVG id.
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40"
      preserveAspectRatio="none" style={{ zIndex: 1 }}>
      <rect x="0" y="0" width="40" height="40" fill="#07070c" />
      <rect x="4" y="4" width="32" height="32" fill="#000000" opacity="0.6" />
    </svg>
  );
}

// Cracked tile: turns into a hole one turn after something steps on it. Warm/cold tints
// the cracks; `armed` (about to crumble) reddens and thickens them.
function CrackOverlay({ size, warm, armed }: { size: number; warm: boolean; armed: boolean }) {
  const stroke = armed ? '#d8382b' : warm ? '#96552c' : '#59636f';
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40" style={{ zIndex: 1 }}>
      <g stroke={stroke} strokeWidth={armed ? 2.1 : 1.5} fill="none" opacity="0.85" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20,2 L17,12 L23,20 L18,30 L21,38" />
        <path d="M17,12 L7,15" />
        <path d="M23,20 L34,17" />
        <path d="M18,30 L9,34" />
        <path d="M23,20 L31,31" />
      </g>
    </svg>
  );
}

// Portal: teal swirl. A map has exactly two; entering one relocates you to the other.
function PortalOverlay({ size }: { size: number }) {
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40" style={{ zIndex: 1 }}>
      <circle cx="20" cy="20" r="14" fill="none" stroke="#22c4d4" strokeWidth="1" opacity="0.35" />
      <ellipse cx="20" cy="20" rx="12" ry="12" fill="rgba(34,196,212,0.14)" stroke="#22c4d4" strokeWidth="2" />
      <path d="M20,9 A11,11 0 0 1 31,20" fill="none" stroke="#7fe6f0" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      <path d="M20,31 A11,11 0 0 1 9,20" fill="none" stroke="#7fe6f0" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      <circle cx="20" cy="20" r="3.3" fill="#c8f6fc" opacity="0.95" />
    </svg>
  );
}

function TriangleOverlay({ corner, size }: { corner: string; size: number }) {
  // Small corner wedge (~quarter cell) with the hypotenuse drawn as a mirror line.
  // The two leg edges (at the right-angle corner) are the solid sides.
  const wedge: Record<string, string> = {
    tl: '0,0 24,0 0,24',
    tr: '40,0 16,0 40,24',
    bl: '0,40 24,40 0,16',
    br: '40,40 16,40 40,16',
  };
  const mirror: Record<string, [number, number, number, number]> = {
    tl: [24, 0, 0, 24],
    tr: [16, 0, 40, 24],
    bl: [24, 40, 0, 16],
    br: [16, 40, 40, 16],
  };
  const m = mirror[corner] ?? mirror.tl;
  return (
    <svg className="tile-overlay" width={size} height={size} viewBox="0 0 40 40" style={{ zIndex: 3 }}>
      <polygon points={wedge[corner] ?? wedge.tl} fill="#6b7a8c" stroke="#3c4654"
        strokeWidth="1.2" strokeLinejoin="round" />
      <line x1={m[0]} y1={m[1]} x2={m[2]} y2={m[3]} stroke="#bcd0e6" strokeWidth="1.6" opacity="0.9" />
    </svg>
  );
}

const LASER_BLOCKERS = new Set(['wall', 'block', 'tree', 'laser']);
const BEAM_DIRS: Record<string, [number, number]> = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
};

function LaserBeamOverlay({ level, cellSize }: { level: Level; cellSize: number }) {
  const beams: React.ReactElement[] = [];
  const gw = level.width;
  const gh = level.height;

  for (let row = 0; row < gh; row++) {
    for (let col = 0; col < gw; col++) {
      const obj = level.objects[row]?.[col];
      if (!obj || obj.type !== 'laser') continue;

      const dir = (obj as { laserDirection?: string }).laserDirection ?? 'right';
      const [dx, dy] = BEAM_DIRS[dir] ?? [1, 0];
      let cx = col + dx;
      let cy = row + dy;
      let endCol = col;
      let endRow = row;

      while (cx >= 0 && cy >= 0 && cx < gw && cy < gh) {
        const hit = level.objects[cy]?.[cx];
        if (hit && LASER_BLOCKERS.has(hit.type)) break;
        endCol = cx; endRow = cy;
        if (level.tiles[cy]?.[cx]?.triangle) break; // triangle stops the beam at this cell
        cx += dx; cy += dy;
      }

      if (endCol === col && endRow === row) continue; // beam immediately blocked

      const startX = (col + 0.5 + dx * 0.5) * cellSize;
      const startY = (row + 0.5 + dy * 0.5) * cellSize;
      const stopX  = (endCol + 0.5 + dx * 0.5) * cellSize;
      const stopY  = (endRow  + 0.5 + dy * 0.5) * cellSize;

      const beamW = dx !== 0 ? Math.abs(stopX - startX) : cellSize * 0.22;
      const beamH = dy !== 0 ? Math.abs(stopY - startY) : cellSize * 0.22;
      const bx = Math.min(startX, stopX) - (dx !== 0 ? 0 : beamW / 2);
      const by = Math.min(startY, stopY) - (dy !== 0 ? 0 : beamH / 2);

      beams.push(
        <g key={`beam-${row}-${col}`}>
          <rect x={bx} y={by} width={beamW} height={beamH}
            fill="rgba(255,40,10,0.22)" rx={3} />
          {dx !== 0
            ? <line x1={bx} y1={(row + 0.5) * cellSize} x2={bx + beamW} y2={(row + 0.5) * cellSize}
                stroke="rgba(255,90,30,0.7)" strokeWidth={2} />
            : <line x1={(col + 0.5) * cellSize} y1={by} x2={(col + 0.5) * cellSize} y2={by + beamH}
                stroke="rgba(255,90,30,0.7)" strokeWidth={2} />}
        </g>
      );
    }
  }

  if (beams.length === 0) return null;
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
      width={gw * cellSize} height={gh * cellSize}>
      {beams}
    </svg>
  );
}

function renderObject(obj: { type: string; size: number; isMelting: boolean; treeHeight?: number; triangleCorner?: string }, cellSize: number) {
  const s = cellSize * 0.85;
  switch (obj.type) {
    case 'player': {
      const scale = obj.size === 1 ? 0.65 : obj.size === 2 ? 0.85 : 1;
      return (
        <svg width={s} height={s} viewBox="0 0 40 40">
          <g transform={`translate(20,22) scale(${scale}) translate(-20,-22)`}>
            <circle cx="20" cy="27" r="9" fill="#fff" stroke="#456" strokeWidth="1.5" />
            <circle cx="20" cy="15" r="6.5" fill="#fff" stroke="#456" strokeWidth="1.5" />
            <circle cx="17.5" cy="14" r="1.3" fill="#111" />
            <circle cx="22.5" cy="14" r="1.3" fill="#111" />
            <line x1="14" y1="20" x2="8" y2="16" stroke="#654" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="26" y1="20" x2="32" y2="16" stroke="#654" strokeWidth="1.5" strokeLinecap="round" />
          </g>
          {obj.isMelting && <g className="melting-sweat">
            <ellipse cx="7" cy="20" rx="2.5" ry="4" fill="#3cc8ff" opacity="0.9" />
            <circle cx="7" cy="16.5" r="2" fill="#3cc8ff" opacity="0.9" />
            <ellipse cx="33" cy="22" rx="2.5" ry="4" fill="#3cc8ff" opacity="0.8" />
            <circle cx="33" cy="18.5" r="2" fill="#3cc8ff" opacity="0.8" />
            <ellipse cx="15" cy="33" rx="2" ry="3" fill="#3cc8ff" opacity="0.7" />
            <circle cx="15" cy="30.5" r="1.6" fill="#3cc8ff" opacity="0.7" />
          </g>}
          <text x="34" y="10" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#345" opacity="0.8">{obj.size}</text>
        </svg>
      );
    }
    case 'snowball': {
      const r = obj.size === 1 ? 10 : 14;
      return (
        <svg width={s} height={s} viewBox="0 0 40 40">
          <circle cx="20" cy="20" r={r} fill="#e8f0ff" stroke="#99b" strokeWidth="1.2" />
        </svg>
      );
    }
    case 'snowman': {
      const scale = obj.size === 1 ? 0.65 : obj.size === 2 ? 0.85 : 1;
      const filterId = `snowman-glow-${Math.random().toString(36).slice(2, 6)}`;
      return (
        <svg width={s} height={s} viewBox="0 0 40 40">
          <defs>
            <filter id={filterId}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform={`translate(20,22) scale(${scale}) translate(-20,-22)`}>
            <circle cx="20" cy="27" r="9" fill="#e0eaff" stroke="#6af" strokeWidth="1.8" filter={`url(#${filterId})`} />
            <circle cx="20" cy="15" r="6.5" fill="#e0eaff" stroke="#6af" strokeWidth="1.8" filter={`url(#${filterId})`} />
          </g>
          <text x="34" y="10" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#46a" opacity="0.8">{obj.size}</text>
        </svg>
      );
    }
    case 'block': {
      if (obj.triangleCorner) {
        // Triangle block: an actual half-cell triangle (block-colored) sitting in the
        // corner, with the hypotenuse drawn as the reflecting mirror face. The solid
        // legs are the two cell edges at the right-angle corner.
        const tri: Record<string, string> = {
          tl: '3,3 37,3 3,37', tr: '37,3 3,3 37,37', bl: '3,37 3,3 37,37', br: '37,37 37,3 3,37',
        };
        const mirror: Record<string, [number, number, number, number]> = {
          tl: [37, 3, 3, 37], br: [37, 3, 3, 37], tr: [3, 3, 37, 37], bl: [3, 3, 37, 37],
        };
        const ml = mirror[obj.triangleCorner] ?? mirror.tl;
        return (
          <svg width={cellSize} height={cellSize} viewBox="0 0 40 40">
            <polygon points={tri[obj.triangleCorner] ?? tri.tl} fill="#8b6914" stroke="#5a4510"
              strokeWidth="1.5" strokeLinejoin="round" />
            <line x1={ml[0]} y1={ml[1]} x2={ml[2]} y2={ml[3]} stroke="#e8dcc0" strokeWidth="1.6"
              strokeLinecap="round" opacity="0.9" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 40 40">
          <rect x="6" y="6" width="28" height="28" fill="#8b6914" stroke="#5a4510" strokeWidth="1.5" rx="2" />
        </svg>
      );
    }
    case 'wall':
      return (
        <svg width={cellSize} height={cellSize} viewBox="0 0 40 40">
          <rect x="0" y="0" width="40" height="40" fill="#666" />
          <line x1="0" y1="20" x2="40" y2="20" stroke="#555" strokeWidth="1" />
          <line x1="20" y1="0" x2="20" y2="20" stroke="#555" strokeWidth="1" />
          <line x1="10" y1="20" x2="10" y2="40" stroke="#555" strokeWidth="1" />
          <line x1="30" y1="20" x2="30" y2="40" stroke="#555" strokeWidth="1" />
          <rect x="0" y="0" width="40" height="40" fill="none" stroke="#444" strokeWidth="1" />
        </svg>
      );
    case 'tree': {
      const h = obj.treeHeight ?? 1;
      const hLabel = h % 1 === 0 ? h.toString() : h.toFixed(1);
      return (
        <svg width={s} height={s} viewBox="0 0 40 40">
          <polygon points="20,4 32,32 8,32" fill="#2d7a2d" stroke="#1a5a1a" strokeWidth="1" />
          <rect x="17" y="32" width="6" height="6" fill="#5a3a1a" />
          <text x="20" y="22" textAnchor="middle" fontSize="8" fill="#fff">{hLabel}</text>
        </svg>
      );
    }
    case 'laser': {
      const dir = (obj as { laserDirection?: string }).laserDirection ?? 'right';
      const arrowPts: Record<string, string> = {
        right: '26,20 14,13 14,27', left: '14,20 26,13 26,27',
        up:    '20,13 13,26 27,26', down:  '20,27 13,14 27,14',
      };
      return (
        <svg width={s} height={s} viewBox="0 0 40 40">
          <rect x="4" y="4" width="32" height="32" fill="#3a2845" stroke="#5a3060" strokeWidth="1.5" rx="3" />
          <polygon points={arrowPts[dir] ?? arrowPts.right} fill="#ff4422" opacity="0.9" />
          <circle cx="20" cy="20" r="4" fill="none" stroke="#ff6644" strokeWidth="1.5" opacity="0.6" />
        </svg>
      );
    }
    default:
      return null;
  }
}
