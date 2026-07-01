import { useState, useRef, useEffect, useCallback } from 'react';
import { Level, SunDirection, Tile, GameObject, TriangleCorner } from '../../types';
import { createDefaultTile, createLevel, cloneLevel, deserializeLevel } from '../../utils/level';
import { encodeLevelCode, decodeLevelCode } from '../../utils/levelCode';
import Grid from './Grid';
import './Editor.css';

type EditorTool =
  | 'none'
  | 'select'
  | 'warm'
  | 'cool'
  | 'flake'
  | 'goal'
  | 'rowTunnel'
  | 'columnTunnel'
  | 'soulSwap'
  | 'keyTile'
  | 'edgeArch1'
  | 'edgeArch2'
  | 'player'
  | 'snowballLarge'
  | 'snowballSmall'
  | 'snowman1'
  | 'snowman2'
  | 'snowman3'
  | 'wall'
  | 'block'
  | 'tree'
  | 'laser'
  | 'triangle'
  | 'eraser';

const DRAG_TOOLS: EditorTool[] = ['warm', 'cool', 'flake', 'soulSwap', 'keyTile', 'wall', 'eraser'];
// NOTE: 'eraser' is intentionally NOT an edge tool. If it were, selecting the
// eraser would put the grid in edge-mode, whose edge-hit strips intercept clicks
// near cell borders — making it hard to erase tile flags (flake/goal/tunnel/
// footplate). Edge arches are cleared by right-clicking a cell (or by right-
// clicking the edge while an edge-arch tool is active).
const EDGE_TOOLS: EditorTool[] = ['edgeArch1', 'edgeArch2'];

const TRI_LABEL: Record<TriangleCorner, string> = { tl: '◤', tr: '◥', bl: '◣', br: '◢' };

interface Pos { r: number; c: number; }
interface BBox { minR: number; maxR: number; minC: number; maxC: number; }

interface SnapshotCell { r: number; c: number; tile: Tile; obj: GameObject | null; }

type DragState =
  | { kind: 'select'; anchor: Pos; current: Pos }
  | { kind: 'move'; anchor: Pos; current: Pos; snapshot: SnapshotCell[]; bbox: BBox };

const cellKey = (r: number, c: number) => `${r},${c}`;

function rectKeys(a: Pos, b: Pos): Set<string> {
  const r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r);
  const c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
  const s = new Set<string>();
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      s.add(cellKey(r, c));
  return s;
}

function bboxFromKeys(keys: Set<string>): BBox {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const k of keys) {
    const [r, c] = k.split(',').map(Number);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return { minR, maxR, minC, maxC };
}

function clampDelta(bbox: BBox, raw: { dr: number; dc: number }, w: number, h: number) {
  return {
    dr: Math.max(-bbox.minR, Math.min(h - 1 - bbox.maxR, raw.dr)),
    dc: Math.max(-bbox.minC, Math.min(w - 1 - bbox.maxC, raw.dc)),
  };
}

interface EditorProps {
  level: Level;
  setLevel: (level: Level) => void;
}

export default function Editor({ level, setLevel }: EditorProps) {
  const [selectedTool, setSelectedTool] = useState<EditorTool>('warm');
  const [treeHeight, setTreeHeight] = useState<number>(2);
  const [laserDir, setLaserDir] = useState<'right'|'left'|'up'|'down'>('right');
  const [triCorner, setTriCorner] = useState<TriangleCorner>('tl');
  const [showImportExport, setShowImportExport] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [copyMsg, setCopyMsg] = useState(false);
  const dragLevelRef = useRef<Level | null>(null);

  // === Undo / redo stacks ===
  const [undoStack, setUndoStack] = useState<Level[]>([]);
  const [redoStack, setRedoStack] = useState<Level[]>([]);
  // Snapshot the current level as one undo step. Call at the start of each discrete
  // edit gesture (e.g. mousedown), not on every drag frame.
  const pushUndo = () => {
    setUndoStack((s) => [...s, cloneLevel(level)]);
    setRedoStack([]);
  };
  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, cloneLevel(level)]);
    setLevel(prev);
  };
  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s, cloneLevel(level)]);
    setLevel(next);
  };

  // === Selection / move state (used by the 'select' tool) ===
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);

  const previewSelection = drag?.kind === 'select'
    ? rectKeys(drag.anchor, drag.current)
    : null;

  const moveDelta = drag?.kind === 'move'
    ? clampDelta(
        drag.bbox,
        { dr: drag.current.r - drag.anchor.r, dc: drag.current.c - drag.anchor.c },
        level.width, level.height
      )
    : null;

  const moveGhost = drag?.kind === 'move' && moveDelta
    ? { srcBBox: drag.bbox, delta: moveDelta }
    : null;

  const handleSelectStart = (r: number, c: number) => {
    const key = cellKey(r, c);
    if (selection.has(key)) {
      // Start a move drag of the existing selection.
      const cells: SnapshotCell[] = [];
      for (const k of selection) {
        const [rs, cs] = k.split(',').map(Number);
        cells.push({
          r: rs, c: cs,
          tile: { ...level.tiles[rs][cs] },
          obj: level.objects[rs][cs] ? { ...level.objects[rs][cs]! } : null,
        });
      }
      setDrag({
        kind: 'move',
        anchor: { r, c },
        current: { r, c },
        snapshot: cells,
        bbox: bboxFromKeys(selection),
      });
    } else {
      // Start a fresh rubber-band selection. Clear the current selection so the
      // preview doesn't overlap stale highlights.
      setSelection(new Set());
      setDrag({ kind: 'select', anchor: { r, c }, current: { r, c } });
    }
  };

  const handleSelectMove = (r: number, c: number) => {
    setDrag((d) => {
      if (!d) return d;
      if (d.current.r === r && d.current.c === c) return d;
      return { ...d, current: { r, c } } as DragState;
    });
  };

  const finalizeDrag = useCallback(() => {
    if (!drag) return;
    if (drag.kind === 'select') {
      setSelection(rectKeys(drag.anchor, drag.current));
    } else {
      const raw = { dr: drag.current.r - drag.anchor.r, dc: drag.current.c - drag.anchor.c };
      const delta = clampDelta(drag.bbox, raw, level.width, level.height);
      if (delta.dr !== 0 || delta.dc !== 0) {
        setUndoStack((s) => [...s, cloneLevel(level)]);
        setRedoStack([]);
        const newLevel = cloneLevel(level);
        // Clear source cells first (in case source and destination overlap).
        for (const cell of drag.snapshot) {
          newLevel.tiles[cell.r][cell.c] = createDefaultTile();
          newLevel.objects[cell.r][cell.c] = null;
        }
        // Apply moved cells at destination.
        const newSel = new Set<string>();
        for (const cell of drag.snapshot) {
          const nr = cell.r + delta.dr;
          const nc = cell.c + delta.dc;
          newLevel.tiles[nr][nc] = cell.tile;
          newLevel.objects[nr][nc] = cell.obj;
          newSel.add(cellKey(nr, nc));
        }
        setLevel(newLevel);
        setSelection(newSel);
      }
    }
    setDrag(null);
  }, [drag, level, setLevel]);

  useEffect(() => {
    const onUp = () => finalizeDrag();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [finalizeDrag]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore key events when typing in inputs/textareas.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        setSelection(new Set());
        setDrag(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0 && selectedTool === 'select') {
        setUndoStack((s) => [...s, cloneLevel(level)]);
        setRedoStack([]);
        const newLevel = cloneLevel(level);
        for (const k of selection) {
          const [r, c] = k.split(',').map(Number);
          newLevel.tiles[r][c] = createDefaultTile();
          newLevel.objects[r][c] = null;
        }
        setLevel(newLevel);
        setSelection(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, level, selectedTool, setLevel]);

  // Undo/redo keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoStack, redoStack, level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selection when switching away from select tool.
  useEffect(() => {
    if (selectedTool !== 'select') {
      setSelection(new Set());
      setDrag(null);
    }
  }, [selectedTool]);

  // Drop selection keys that are now out of bounds after a map resize.
  useEffect(() => {
    setSelection((sel) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of sel) {
        const [r, c] = k.split(',').map(Number);
        if (r < level.height && c < level.width) next.add(k);
        else changed = true;
      }
      return changed ? next : sel;
    });
  }, [level.width, level.height]);

  // Local string state for width/height inputs so users can clear them.
  const [widthInput, setWidthInput] = useState<string>(level.width.toString());
  const [heightInput, setHeightInput] = useState<string>(level.height.toString());
  useEffect(() => { setWidthInput(level.width.toString()); }, [level.width]);
  useEffect(() => { setHeightInput(level.height.toString()); }, [level.height]);

  const handleWidthChange = (raw: string) => {
    setWidthInput(raw);
    if (raw === '') { resizeMap(0, level.height); return; }
    const n = parseInt(raw, 10);
    if (!isNaN(n)) resizeMap(n, level.height);
  };
  const handleHeightChange = (raw: string) => {
    setHeightInput(raw);
    if (raw === '') { resizeMap(level.width, 0); return; }
    const n = parseInt(raw, 10);
    if (!isNaN(n)) resizeMap(level.width, n);
  };

  const handleCellClick = (row: number, col: number) => {
    if (selectedTool === 'select') {
      handleSelectStart(row, col);
      return;
    }
    if (selectedTool === 'none') return; // no active tool — clicks do nothing
    pushUndo();
    const newLevel = cloneLevel(level);
    applyTool(newLevel, row, col, selectedTool);
    if (DRAG_TOOLS.includes(selectedTool)) {
      dragLevelRef.current = newLevel;
    }
    setLevel(newLevel);
  };

  const handleCellDrag = (row: number, col: number) => {
    if (selectedTool === 'select') {
      handleSelectMove(row, col);
      return;
    }
    if (!DRAG_TOOLS.includes(selectedTool)) return;
    const base = dragLevelRef.current ?? level;
    const newLevel = cloneLevel(base);
    applyTool(newLevel, row, col, selectedTool);
    dragLevelRef.current = newLevel;
    setLevel(newLevel);
  };

  // Right-click: erase a cell back to the default state (cool, empty, no flags).
  // This intentionally clears edgeArchTop/Left too because createDefaultTile()
  // returns a fully-default tile.
  const eraseDragRef = useRef<Level | null>(null);
  const eraseCell = (row: number, col: number) => {
    if (eraseDragRef.current === null) pushUndo(); // one undo step per right-drag
    const base = eraseDragRef.current ?? level;
    const newLevel = cloneLevel(base);
    newLevel.tiles[row][col] = createDefaultTile();
    newLevel.objects[row][col] = null;
    eraseDragRef.current = newLevel;
    setLevel(newLevel);
  };

  // Right-click on an edge strip: clear just that edge arch.
  const eraseEdge = (row: number, col: number, side: 'top' | 'left') => {
    pushUndo();
    const newLevel = cloneLevel(level);
    const tile = newLevel.tiles[row][col];
    if (side === 'top') tile.edgeArchTop = 0;
    else tile.edgeArchLeft = 0;
    setLevel(newLevel);
  };

  // Reset the right-drag accumulator whenever the global mouseup fires.
  useEffect(() => {
    const onUp = () => { eraseDragRef.current = null; };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const handleEdgeClick = (row: number, col: number, side: 'top' | 'left') => {
    if (!EDGE_TOOLS.includes(selectedTool)) return;
    pushUndo();
    const newLevel = cloneLevel(level);
    const tile = newLevel.tiles[row][col];
    if (selectedTool === 'edgeArch1' || selectedTool === 'edgeArch2') {
      const targetLevel = selectedTool === 'edgeArch1' ? 1 : 2;
      const field: 'edgeArchTop' | 'edgeArchLeft' = side === 'top' ? 'edgeArchTop' : 'edgeArchLeft';
      // Toggle: if same level is already set, clear; otherwise set to targetLevel.
      tile[field] = (tile[field] ?? 0) === targetLevel ? 0 : targetLevel;
    } else if (selectedTool === 'eraser') {
      if (side === 'top') tile.edgeArchTop = 0;
      else tile.edgeArchLeft = 0;
    }
    setLevel(newLevel);
  };

  const applyTool = (lv: Level, row: number, col: number, tool: EditorTool) => {
    const tile = lv.tiles[row][col];

    switch (tool) {
      case 'warm':
        tile.isWarm = true;
        tile.isFlake = false;
        break;
      case 'cool':
        tile.isWarm = false;
        break;
      case 'flake':
        tile.isFlake = true;
        tile.isWarm = false;
        break;
      case 'goal':
        for (let r = 0; r < lv.height; r++)
          for (let c = 0; c < lv.width; c++)
            lv.tiles[r][c].isGoal = false;
        tile.isGoal = true;
        break;
      case 'rowTunnel':
        tile.isRowArch = true;
        tile.isColumnArch = false;
        tile.isShade = true;
        tile.isWarm = false;
        break;
      case 'columnTunnel':
        tile.isColumnArch = true;
        tile.isRowArch = false;
        tile.isShade = true;
        tile.isWarm = false;
        break;
      case 'soulSwap':
        tile.isSoulSwap = true;
        break;
      case 'keyTile':
        tile.isKeyTile = true;
        break;
      case 'edgeArch1':
      case 'edgeArch2':
        // Edge arches are placed via handleEdgeClick, not cell click. No-op here.
        break;
      case 'player':
        for (let r = 0; r < lv.height; r++)
          for (let c = 0; c < lv.width; c++)
            if (lv.objects[r][c]?.type === 'player') lv.objects[r][c] = null;
        lv.objects[row][col] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
        break;
      case 'snowballLarge':
        lv.objects[row][col] = { type: 'snowball', size: 2, isMelting: false, createdAt: 0 };
        break;
      case 'snowballSmall':
        lv.objects[row][col] = { type: 'snowball', size: 1, isMelting: false, createdAt: 0 };
        break;
      case 'snowman1':
        lv.objects[row][col] = { type: 'snowman', size: 1, isMelting: false, createdAt: 0 };
        break;
      case 'snowman2':
        lv.objects[row][col] = { type: 'snowman', size: 2, isMelting: false, createdAt: 0 };
        break;
      case 'snowman3':
        lv.objects[row][col] = { type: 'snowman', size: 3, isMelting: false, createdAt: 0 };
        break;
      case 'wall':
        lv.objects[row][col] = { type: 'wall', size: 100, isMelting: false, createdAt: 0 };
        break;
      case 'block':
        lv.objects[row][col] = { type: 'block', size: 1, isMelting: false, createdAt: 0 };
        break;
      case 'tree':
        lv.objects[row][col] = { type: 'tree', size: 100, isMelting: false, treeHeight, createdAt: 0 };
        break;
      case 'laser':
        lv.objects[row][col] = { type: 'laser', size: 1, isMelting: false, laserDirection: laserDir, createdAt: 0 };
        break;
      case 'triangle':
        tile.triangle = triCorner;
        break;
      case 'eraser':
        lv.objects[row][col] = null;
        tile.isFlake = false;
        tile.isGoal = false;
        tile.isRowArch = false;
        tile.isColumnArch = false;
        tile.isShade = false;
        tile.isSoulSwap = false;
        tile.isKeyTile = false;
        tile.triangle = undefined;
        // Note: edge arches are erased via handleEdgeClick when clicking edges.
        break;
    }
  };

  const resizeMap = (newWidth: number, newHeight: number) => {
    const w = Math.max(0, Math.min(30, newWidth));
    const h = Math.max(0, Math.min(30, newHeight));
    pushUndo();
    const newLevel: Level = {
      width: w,
      height: h,
      sunDirection: level.sunDirection,
      hasShadow: level.hasShadow,
      soulSwapEnabled: level.soulSwapEnabled,
      tiles: [],
      objects: [],
    };
    for (let r = 0; r < h; r++) {
      newLevel.tiles.push([]);
      newLevel.objects.push([]);
      for (let c = 0; c < w; c++) {
        if (r < level.height && c < level.width) {
          newLevel.tiles[r].push({ ...level.tiles[r][c] });
          newLevel.objects[r].push(level.objects[r][c] ? { ...level.objects[r][c]! } : null);
        } else {
          newLevel.tiles[r].push(createDefaultTile());
          newLevel.objects[r].push(null);
        }
      }
    }
    setLevel(newLevel);
  };

  const resetMap = () => {
    pushUndo();
    setLevel(createLevel(level.width, level.height));
  };

  const fillAll = (warm: boolean) => {
    pushUndo();
    const newLevel = cloneLevel(level);
    for (let r = 0; r < newLevel.height; r++)
      for (let c = 0; c < newLevel.width; c++) {
        newLevel.tiles[r][c].isWarm = warm;
        if (warm) newLevel.tiles[r][c].isFlake = false;
      }
    setLevel(newLevel);
  };

  const toggleShadow = () => {
    pushUndo();
    const newLevel = cloneLevel(level);
    newLevel.hasShadow = !newLevel.hasShadow;
    setLevel(newLevel);
  };

  const toggleSoulSwap = () => {
    pushUndo();
    const newLevel = cloneLevel(level);
    newLevel.soulSwapEnabled = !newLevel.soulSwapEnabled;
    setLevel(newLevel);
  };

  const setSun = (dir: SunDirection) => {
    pushUndo();
    setLevel({ ...cloneLevel(level), sunDirection: dir });
  };

  const handleExport = () => {
    const code = encodeLevelCode(level);
    setJsonText(code);
    navigator.clipboard.writeText(code).then(() => {
      setCopyMsg(true);
      setTimeout(() => setCopyMsg(false), 2000);
    });
    setShowImportExport(true);
  };

  const handleImport = () => {
    const text = jsonText.trim();
    const imported = text.startsWith('{')
      ? deserializeLevel(text)
      : decodeLevelCode(text);
    if (imported) {
      pushUndo();
      setLevel(imported);
      setShowImportExport(false);
    } else {
      alert('잘못된 레벨 코드입니다');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText).then(() => {
      setCopyMsg(true);
      setTimeout(() => setCopyMsg(false), 2000);
    });
  };

  const tileTools: { id: EditorTool; label: string; emoji: string }[] = [
    { id: 'warm', label: '따뜻함', emoji: '🟧' },
    { id: 'cool', label: '차가움', emoji: '🟦' },
    { id: 'flake', label: '눈꽃', emoji: '❄️' },
    { id: 'goal', label: '골', emoji: '⭐' },
    { id: 'columnTunnel', label: '가로 터널', emoji: '🚇' },
    { id: 'rowTunnel', label: '세로 터널', emoji: '🚇' },
    { id: 'soulSwap', label: '영혼 발판', emoji: '🌀' },
    { id: 'keyTile', label: '열쇠 발판', emoji: '🗝️' },
  ];

  const objectTools: { id: EditorTool; label: string; emoji: string }[] = [
    { id: 'player', label: '플레이어', emoji: '⛄' },
    { id: 'wall', label: '벽', emoji: '🧱' },
    { id: 'laser', label: '레이저', emoji: '🔴' },
    { id: 'triangle', label: '삼각 벽', emoji: '📐' },
    { id: 'block', label: '블록', emoji: '📦' },
    { id: 'tree', label: '나무', emoji: '🌲' },
    { id: 'snowballLarge', label: '큰 눈덩이', emoji: '⚪' },
    { id: 'snowballSmall', label: '작은 눈덩이', emoji: '🔵' },
  ];

  const snowmanTools: { id: EditorTool; label: string; emoji: string }[] = [
    { id: 'snowman1', label: '눈사람 1', emoji: '⛄' },
    { id: 'snowman2', label: '눈사람 2', emoji: '⛄' },
    { id: 'snowman3', label: '눈사람 3', emoji: '⛄' },
  ];

  return (
    <div className="editor">
      <div className="editor-sidebar">
        <section className="editor-section">
          <h3>맵</h3>
          <div className="size-controls">
            <label>
              가로:
              <input type="number" min={0} max={30} value={widthInput}
                onChange={(e) => handleWidthChange(e.target.value)} />
            </label>
            <label>
              세로:
              <input type="number" min={0} max={30} value={heightInput}
                onChange={(e) => handleHeightChange(e.target.value)} />
            </label>
          </div>
          <button className={`shadow-toggle ${level.hasShadow ? 'on' : 'off'}`}
            onClick={toggleShadow}>
            그림자: {level.hasShadow ? 'ON' : 'OFF'}
          </button>
          <button className={`shadow-toggle ${level.soulSwapEnabled ? 'on' : 'off'}`}
            onClick={toggleSoulSwap}
            title="켜면 시뮬레이터에서 M키로 눈사람 큐를 순회하며 영혼을 옮길 수 있습니다.">
            영혼 이동(M): {level.soulSwapEnabled ? 'ON' : 'OFF'}
          </button>
          {level.hasShadow && (
            <div className="sun-section">
              <span className="sun-label">해 방향</span>
              <div className="sun-controls">
                {(['left', 'right', 'up', 'down'] as SunDirection[]).map((dir) => (
                  <button key={dir}
                    className={level.sunDirection === dir ? 'active' : ''}
                    onClick={() => setSun(dir)}>
                    {dir === 'left' ? '←' : dir === 'right' ? '→' : dir === 'up' ? '↑' : '↓'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="editor-section">
          <button className={`tool-btn select-btn-full ${selectedTool === 'select' ? 'active' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'select' ? 'none' : 'select')}
            title="드래그로 영역 선택 후, 다시 드래그하면 이동. 다시 누르면 해제. Delete로 삭제, Esc로 해제.">
            <span className="tool-emoji">🔲</span>선택 / 이동
          </button>
          {selectedTool === 'select' && (
            <div className="select-hint">
              드래그: 선택 · 선택된 칸 다시 드래그: 이동 · Delete: 삭제 · Esc: 해제
            </div>
          )}
        </section>

        <section className="editor-section">
          <h3>타일</h3>
          <div className="tool-group-2col">
            {tileTools.map((tool) => (
              <button key={tool.id}
                className={`tool-btn ${selectedTool === tool.id ? 'active' : ''}`}
                onClick={() => setSelectedTool(tool.id)}>
                <span className="tool-emoji">{tool.emoji}</span>{tool.label}
              </button>
            ))}
          </div>
          <div className="tool-group-2col" style={{ marginTop: 6 }}>
            <button className={`tool-btn arch-btn ${selectedTool === 'edgeArch1' ? 'active' : ''}`}
              onClick={() => setSelectedTool('edgeArch1')}>
              <span className="tool-emoji">🏛️</span>높이 1 아치
            </button>
            <button className={`tool-btn arch-btn ${selectedTool === 'edgeArch2' ? 'active' : ''}`}
              onClick={() => setSelectedTool('edgeArch2')}>
              <span className="tool-emoji">🏛️</span>높이 2 아치
            </button>
          </div>
        </section>

        <section className="editor-section">
          <h3>오브젝트</h3>
          <div className="tool-group-2col">
            {objectTools.map((tool) => (
              <button key={tool.id}
                className={`tool-btn ${selectedTool === tool.id ? 'active' : ''}`}
                onClick={() => setSelectedTool(tool.id)}>
                <span className="tool-emoji">{tool.emoji}</span>{tool.label}
              </button>
            ))}
          </div>
          <div className="tool-group-3col" style={{ marginTop: 4 }}>
            {snowmanTools.map((tool) => (
              <button key={tool.id}
                className={`tool-btn ${selectedTool === tool.id ? 'active' : ''}`}
                onClick={() => setSelectedTool(tool.id)}>
                <span className="tool-emoji">{tool.emoji}</span>{tool.label}
              </button>
            ))}
          </div>
          {selectedTool === 'tree' && (
            <div className="tree-height-input">
              <label>
                높이:
                <input type="number" min={0.5} step={0.5} value={treeHeight}
                  onChange={(e) => setTreeHeight(Number(e.target.value))} />
              </label>
            </div>
          )}
          {selectedTool === 'laser' && (
            <div className="tree-height-input">
              <span style={{fontSize:12,color:'#aaa',marginBottom:4,display:'block'}}>발사 방향</span>
              <div style={{display:'flex',gap:4}}>
                {(['left','right','up','down'] as const).map(d => (
                  <button key={d}
                    style={{flex:1,padding:'3px 0',fontSize:13,background:laserDir===d?'#c03020':'transparent',color:laserDir===d?'#fff':'#ccc',border:'1px solid #555',borderRadius:4,cursor:'pointer'}}
                    onClick={() => setLaserDir(d)}>
                    {d==='left'?'←':d==='right'?'→':d==='up'?'↑':'↓'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedTool === 'triangle' && (
            <div className="tree-height-input">
              <span style={{fontSize:12,color:'#aaa',marginBottom:4,display:'block'}}>삼각 벽 방향 (직각 = 솔리드 모서리)</span>
              <div style={{display:'flex',gap:4}}>
                {(['tl','tr','bl','br'] as TriangleCorner[]).map(corner => (
                  <button key={corner}
                    style={{flex:1,padding:'3px 0',fontSize:16,background:triCorner===corner?'#3a6ec2':'transparent',color:triCorner===corner?'#fff':'#ccc',border:'1px solid #555',borderRadius:4,cursor:'pointer'}}
                    onClick={() => setTriCorner(corner)}>
                    {TRI_LABEL[corner]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="editor-section">
          <button className={`tool-btn eraser-btn-full ${selectedTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setSelectedTool('eraser')}>
            <span className="tool-emoji">🧹</span>지우개
          </button>
        </section>

        <section className="editor-section">
          <h3>동작</h3>
          <div className="action-row">
            <button onClick={undo} disabled={undoStack.length === 0}>↩ 실행취소</button>
            <button onClick={redo} disabled={redoStack.length === 0}>↪ 다시실행</button>
          </div>
          <div className="action-col" style={{ marginTop: 6 }}>
            <button onClick={() => fillAll(true)}>🟧 따뜻한 칸으로 채우기</button>
            <button onClick={() => fillAll(false)}>🟦 차가운 칸으로 채우기</button>
            <button onClick={resetMap} className="danger-btn">🗑️ 초기화</button>
          </div>
          <div className="action-row" style={{ marginTop: 6 }}>
            <button onClick={handleExport}>내보내기</button>
            <button onClick={() => { setJsonText(''); setShowImportExport(true); }}>불러오기</button>
          </div>
        </section>
      </div>

      <div className="editor-grid-area">
        <Grid level={level}
          onCellClick={handleCellClick}
          onCellDrag={handleCellDrag}
          onEdgeClick={handleEdgeClick}
          onCellErase={eraseCell}
          onEdgeErase={eraseEdge}
          edgeMode={EDGE_TOOLS.includes(selectedTool)}
          selectedCells={selection}
          previewSelectionCells={previewSelection}
          moveGhost={moveGhost} />
      </div>

      {copyMsg && <div className="toast">클립보드에 복사되었습니다!</div>}

      {showImportExport && (
        <div className="modal-overlay" onClick={() => setShowImportExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>레벨 코드 불러오기 / 내보내기</h3>
            <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)}
              rows={4} placeholder="레벨 코드를 여기에 붙여넣으세요..." />
            <div className="modal-buttons">
              <button onClick={handleImport}>불러오기</button>
              <button onClick={handleCopy}>복사</button>
              <button onClick={() => setShowImportExport(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
