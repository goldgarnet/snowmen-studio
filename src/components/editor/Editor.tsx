import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Level, SunDirection, Tile, GameObject, TriangleCorner } from '../../types';
import { createDefaultTile, createLevel, cloneLevel, deserializeLevel } from '../../utils/level';
import { encodeLevelCode, decodeLevelCode } from '../../utils/levelCode';
import Grid from './Grid';
import './Editor.css';

type EditorTool =
  | 'select'
  | 'warm'
  | 'cool'
  | 'removeGround'
  | 'restoreGround'
  | 'flake'
  | 'goal'
  | 'rowTunnel'
  | 'columnTunnel'
  | 'soulSwap'
  | 'keyTile'
  | 'yellowButton'
  | 'yellowWall'
  | 'orangeButton'
  | 'orangeWall'
  | 'hole'
  | 'crackWarm'
  | 'crackCool'
  | 'portal'
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

type TerrainFillMode = 'warm' | 'cool';
type Hotkey = { code: string; label: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };

const DRAG_TOOLS: EditorTool[] = ['warm', 'cool', 'removeGround', 'restoreGround', 'flake', 'soulSwap', 'keyTile', 'yellowButton', 'yellowWall', 'orangeButton', 'orangeWall', 'hole', 'crackWarm', 'crackCool', 'wall', 'eraser'];

// Object tools place an object in the cell; they clear any hole there first (an object
// can't sit on a hole), matching the "no objects on holes" rule.
const OBJECT_TOOLS: EditorTool[] = ['player', 'snowballLarge', 'snowballSmall', 'snowman1', 'snowman2', 'snowman3', 'wall', 'block', 'tree', 'laser'];
// NOTE: 'eraser' is intentionally NOT an edge tool. If it were, selecting the
// eraser would put the grid in edge-mode, whose edge-hit strips intercept clicks
// near cell borders — making it hard to erase tile flags (flake/goal/tunnel/
// footplate). Edge arches are cleared by right-clicking a cell (or by right-
// clicking the edge while an edge-arch tool is active).
const EDGE_TOOLS: EditorTool[] = ['edgeArch1', 'edgeArch2'];

// Tool shortcuts follow the editor's top-to-bottom, left-to-right layout. Use
// KeyboardEvent.code below so they work even while a Korean IME is active.
const TOOL_HOTKEYS: Partial<Record<EditorTool, Hotkey>> = {
  select: { code: 'Backquote', label: '`' },
  removeGround: { code: 'KeyX', label: 'X' },
  restoreGround: { code: 'KeyX', label: 'X', shiftKey: true },
  warm: { code: 'KeyH', label: 'H' },
  cool: { code: 'KeyC', label: 'C' },
  crackWarm: { code: 'KeyD', label: 'D' },
  crackCool: { code: 'KeyD', label: 'D', shiftKey: true },
  edgeArch1: { code: 'BracketLeft', label: '[' },
  edgeArch2: { code: 'BracketRight', label: ']' },
  hole: { code: 'Digit0', label: '0' },
  goal: { code: 'KeyG', label: 'G' },
  player: { code: 'KeyP', label: 'P' },
  wall: { code: 'KeyW', label: 'W' },
  tree: { code: 'KeyT', label: 'T' },
  snowballLarge: { code: 'Digit2', label: '2', shiftKey: true },
  snowballSmall: { code: 'Digit1', label: '1', shiftKey: true },
  block: { code: 'KeyB', label: 'B' },
  flake: { code: 'KeyF', label: 'F' },
  columnTunnel: { code: 'KeyG', label: 'G', shiftKey: true },
  rowTunnel: { code: 'KeyV', label: 'V', shiftKey: true },
  snowman1: { code: 'Digit1', label: '1' },
  snowman2: { code: 'Digit2', label: '2' },
  snowman3: { code: 'Digit3', label: '3' },
  triangle: { code: 'KeyV', label: 'V' },
  keyTile: { code: 'KeyK', label: 'K' },
  yellowWall: { code: 'KeyY', label: 'Y' },
  yellowButton: { code: 'KeyY', label: 'Y', shiftKey: true },
  orangeWall: { code: 'KeyO', label: 'O' },
  orangeButton: { code: 'KeyO', label: 'O', shiftKey: true },
  laser: { code: 'KeyL', label: 'L' },
  soulSwap: { code: 'KeyS', label: 'S' },
  portal: { code: 'KeyR', label: 'R' },
  eraser: { code: 'KeyE', label: 'E' },
};

const TERRAIN_FILL_HOTKEYS: Record<TerrainFillMode, Hotkey> = {
  warm: { code: 'KeyH', label: 'H', shiftKey: true },
  cool: { code: 'KeyC', label: 'C', shiftKey: true },
};

function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey) {
  const hasControl = event.ctrlKey || event.metaKey;
  return hotkey.code === event.code
    && Boolean(hotkey.shiftKey) === event.shiftKey
    && Boolean(hotkey.ctrlKey) === hasControl
    && Boolean(hotkey.altKey) === event.altKey;
}

function hotkeyLabel(hotkey: Hotkey) {
  const prefix = hotkey.ctrlKey ? 'C' : hotkey.altKey ? 'A' : hotkey.shiftKey ? '⬆' : '';
  return `${prefix}${hotkey.label}`;
}

function hotkeyTitle(hotkey: Hotkey) {
  const prefix = hotkey.ctrlKey ? 'Ctrl+' : hotkey.altKey ? 'Option+' : hotkey.shiftKey ? 'Shift+' : '';
  return `${prefix}${hotkey.label}`;
}

const TRI_LABEL: Record<TriangleCorner, string> = { tl: '◤', tr: '◥', bl: '◣', br: '◢' };

interface Pos { r: number; c: number; }
interface BBox { minR: number; maxR: number; minC: number; maxC: number; }

interface SnapshotCell { r: number; c: number; tile: Tile; obj: GameObject | null; }
interface EdgeArchSnapshot {
  row: number;
  col: number;
  field: 'edgeArchTop' | 'edgeArchLeft';
  value: number;
}

type DragState =
  | { kind: 'select'; anchor: Pos; current: Pos }
  | {
      kind: 'move'; anchor: Pos; current: Pos; snapshot: SnapshotCell[];
      edges: EdgeArchSnapshot[]; bbox: BBox; copy: boolean;
    };

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
  onHistoryChange?: (history: EditorHistoryState) => void;
}

export interface EditorHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditorToolbarApi {
  undo: () => void;
  redo: () => void;
  reset: () => void;
  exportCode: () => void;
  openImport: () => void;
}

const Editor = forwardRef<EditorToolbarApi, EditorProps>(function Editor({ level, setLevel, onHistoryChange }, ref) {
  const [selectedTool, setSelectedTool] = useState<EditorTool>('select');
  const [terrainFillMode, setTerrainFillMode] = useState<TerrainFillMode | null>(null);
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
  const pushUndo = useCallback(() => {
    setUndoStack((s) => [...s, cloneLevel(level)]);
    setRedoStack([]);
  }, [level]);
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, cloneLevel(level)]);
    setLevel(prev);
  }, [level, setLevel, undoStack]);
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s, cloneLevel(level)]);
    setLevel(next);
  }, [level, redoStack, setLevel]);

  useEffect(() => {
    onHistoryChange?.({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
  }, [onHistoryChange, redoStack.length, undoStack.length]);

  // === Selection / move state (used by the 'select' tool) ===
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const pendingToggleRef = useRef<Pos | null>(null);

  const selectTool = useCallback((tool: EditorTool) => {
    // Selection/movement is the resting state. Choosing an already-active tool
    // therefore returns to it instead of leaving the grid without an interaction.
    const nextTool = tool === 'select' || selectedTool === tool ? 'select' : tool;
    setSelectedTool(nextTool);
    if (nextTool !== 'select') {
      setSelection(new Set());
    }
    setDrag(null);
  }, [selectedTool]);

  const clampSelectionToBounds = useCallback((width: number, height: number) => {
    setSelection((sel) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of sel) {
        const [r, c] = k.split(',').map(Number);
        if (r < height && c < width) next.add(k);
        else changed = true;
      }
      return changed ? next : sel;
    });
  }, []);

  const clearSelection = useCallback(() => {
    pendingToggleRef.current = null;
    setSelection(new Set());
    setDrag(null);
  }, []);

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
    ? {
        sourceCells: drag.snapshot.map(({ r, c }) => ({ row: r, col: c })),
        delta: moveDelta,
        copy: drag.copy,
        copyMarker: {
          row: drag.anchor.r + moveDelta.dr,
          col: drag.anchor.c + moveDelta.dc,
        },
      }
    : null;

  const handleSelectStart = (r: number, c: number, toggleCell = false) => {
    const key = cellKey(r, c);
    pendingToggleRef.current = null;
    if (selection.has(key)) {
      // Ctrl/Cmd-dragging an existing selection duplicates it. A modifier click
      // without movement still removes that cell from the multi-selection.
      const cells: SnapshotCell[] = [];
      for (const selectedKey of selection) {
        const [rs, cs] = selectedKey.split(',').map(Number);
        cells.push({
          r: rs, c: cs,
          // Edge arches are moved separately because an edge can be stored in
          // an adjacent, unselected cell (for example a selected cell's bottom
          // or right boundary).
          tile: { ...level.tiles[rs][cs], edgeArchTop: 0, edgeArchLeft: 0 },
          obj: level.objects[rs][cs] ? { ...level.objects[rs][cs]! } : null,
        });
      }
      const edgeMap = new Map<string, EdgeArchSnapshot>();
      const addEdge = (edgeRow: number, edgeCol: number, field: EdgeArchSnapshot['field']) => {
        const value = level.tiles[edgeRow][edgeCol][field] ?? 0;
        if (value > 0) edgeMap.set(`${edgeRow},${edgeCol},${field}`, { row: edgeRow, col: edgeCol, field, value });
      };
      for (const selectedKey of selection) {
        const [rs, cs] = selectedKey.split(',').map(Number);
        if (rs > 0) addEdge(rs, cs, 'edgeArchTop');
        if (cs > 0) addEdge(rs, cs, 'edgeArchLeft');
        if (rs + 1 < level.height) addEdge(rs + 1, cs, 'edgeArchTop');
        if (cs + 1 < level.width) addEdge(rs, cs + 1, 'edgeArchLeft');
      }
      const edges = [...edgeMap.values()];
      const bbox = bboxFromKeys(selection);
      for (const edge of edges) {
        bbox.minR = Math.min(bbox.minR, edge.row);
        bbox.maxR = Math.max(bbox.maxR, edge.row);
        bbox.minC = Math.min(bbox.minC, edge.col);
        bbox.maxC = Math.max(bbox.maxC, edge.col);
      }
      setDrag({
        kind: 'move',
        anchor: { r, c },
        current: { r, c },
        snapshot: cells,
        edges,
        bbox,
        copy: toggleCell,
      });
      return;
    }
    if (toggleCell) {
      // Defer Ctrl/Cmd individual selection until mouseup. This keeps a held
      // modifier available to begin a copy drag without changing selection on
      // mousedown first.
      pendingToggleRef.current = { r, c };
      setDrag(null);
      return;
    }
    // Start a fresh rubber-band selection. Clear the current selection so the
    // preview doesn't overlap stale highlights.
    setSelection(new Set());
    setDrag({ kind: 'select', anchor: { r, c }, current: { r, c } });
  };

  const handleSelectMove = (r: number, c: number) => {
    setDrag((d) => {
      if (!d) return d;
      if (d.current.r === r && d.current.c === c) return d;
      return { ...d, current: { r, c } } as DragState;
    });
  };

  const finalizeDrag = useCallback(() => {
    if (!drag) {
      const pendingToggle = pendingToggleRef.current;
      if (pendingToggle) {
        const key = cellKey(pendingToggle.r, pendingToggle.c);
        setSelection((current) => {
          const next = new Set(current);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        pendingToggleRef.current = null;
      }
      return;
    }
    pendingToggleRef.current = null;
    if (drag.kind === 'select') {
      setSelection(rectKeys(drag.anchor, drag.current));
    } else {
      const raw = { dr: drag.current.r - drag.anchor.r, dc: drag.current.c - drag.anchor.c };
      const delta = clampDelta(drag.bbox, raw, level.width, level.height);
      if (delta.dr !== 0 || delta.dc !== 0) {
        setUndoStack((s) => [...s, cloneLevel(level)]);
        setRedoStack([]);
        const newLevel = cloneLevel(level);
        // A regular move clears sources first (including overlapping moves).
        // Copy-move deliberately keeps every source cell intact.
        if (!drag.copy) {
          for (const cell of drag.snapshot) {
            newLevel.tiles[cell.r][cell.c] = createDefaultTile();
            newLevel.objects[cell.r][cell.c] = null;
          }
          for (const edge of drag.edges) newLevel.tiles[edge.row][edge.col][edge.field] = 0;
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
        for (const edge of drag.edges) {
          const edgeRow = edge.row + delta.dr;
          const edgeCol = edge.col + delta.dc;
          newLevel.tiles[edgeRow][edgeCol][edge.field] = edge.value;
        }
        setLevel(newLevel);
        setSelection(newSel);
      } else if (drag.copy) {
        // Preserve Ctrl/Cmd-click deselection when no drag movement occurred.
        setSelection((current) => {
          const next = new Set(current);
          next.delete(cellKey(drag.anchor.r, drag.anchor.c));
          return next;
        });
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
        if (selectedTool !== 'select') setSelectedTool('select');
        else setSelection(new Set());
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

  // Local string state for width/height inputs so users can clear them.
  const [widthInput, setWidthInput] = useState<string>(level.width.toString());
  const [heightInput, setHeightInput] = useState<string>(level.height.toString());

  // A map dimension may be 1..30 (1-wide/1-tall maps are allowed; the map code stores a
  // dimension of 1 via a reserved 5-bit pattern — see levelCode). Keep the raw text in
  // local state so the field can be cleared/partially typed, but only actually resize on
  // a valid dimension, and snap the field back on blur.
  const DIM_MIN = 1, DIM_MAX = 30;
  const handleWidthChange = (raw: string) => {
    setWidthInput(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= DIM_MIN && n <= DIM_MAX) resizeMap(n, level.height);
  };
  const handleHeightChange = (raw: string) => {
    setHeightInput(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= DIM_MIN && n <= DIM_MAX) resizeMap(level.width, n);
  };
  const handleWidthBlur = () => {
    const n = parseInt(widthInput, 10);
    if (isNaN(n) || n < DIM_MIN || n > DIM_MAX) setWidthInput(level.width.toString());
  };
  const handleHeightBlur = () => {
    const n = parseInt(heightInput, 10);
    if (isNaN(n) || n < DIM_MIN || n > DIM_MAX) setHeightInput(level.height.toString());
  };

  const handleCellClick = (row: number, col: number, toggleSelection = false) => {
    if (selectedTool === 'select') {
      handleSelectStart(row, col, toggleSelection);
      return;
    }
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

  // Right-click uses the eraser tool's exact rules, which deliberately preserve
  // edge arches. Edge arches have their own precise right-click action when an
  // edge-arch tool is active.
  const eraseDragRef = useRef<Level | null>(null);
  const eraseCell = (row: number, col: number) => {
    if (eraseDragRef.current === null) pushUndo(); // one undo step per right-drag
    const base = eraseDragRef.current ?? level;
    const newLevel = cloneLevel(base);
    applyTool(newLevel, row, col, 'eraser');
    eraseDragRef.current = newLevel;
    setLevel(newLevel);
  };

  // Right-clicking an edge arch can continue across other edge strips. Keep the
  // in-progress level locally so that the whole gesture is one undo step.
  const eraseEdgeDragRef = useRef<Level | null>(null);
  const eraseEdge = (row: number, col: number, side: 'top' | 'left') => {
    const base = eraseEdgeDragRef.current ?? level;
    const field: 'edgeArchTop' | 'edgeArchLeft' = side === 'top' ? 'edgeArchTop' : 'edgeArchLeft';
    if (!base.tiles[row][col][field]) return;
    if (eraseEdgeDragRef.current === null) pushUndo();
    const newLevel = cloneLevel(base);
    const tile = newLevel.tiles[row][col];
    tile[field] = 0;
    eraseEdgeDragRef.current = newLevel;
    setLevel(newLevel);
  };

  // Reset right-drag accumulators whenever the global mouseup fires.
  useEffect(() => {
    const onUp = () => {
      eraseDragRef.current = null;
      eraseEdgeDragRef.current = null;
    };
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

  const removeGround = (lv: Level, row: number, col: number) => {
    lv.tiles[row][col] = { ...createDefaultTile(), isVoid: true };
    lv.objects[row][col] = null;
    // Edge arches belong to their lower/right cell. Clear every edge touching
    // the removed cell so restoring ground cannot reveal a dangling arch.
    if (row + 1 < lv.height) lv.tiles[row + 1][col].edgeArchTop = 0;
    if (col + 1 < lv.width) lv.tiles[row][col + 1].edgeArchLeft = 0;
  };

  const applyTool = (lv: Level, row: number, col: number, tool: EditorTool) => {
    const tile = lv.tiles[row][col];

    // Removed ground is deliberately inert. Restore it (or right-click it) before
    // painting terrain or placing an object, so invisible authored data cannot hide
    // inside the board mask.
    if (tile.isVoid && tool !== 'removeGround' && tool !== 'restoreGround') return;

    // Placing an object clears a hole in that cell (no objects on holes).
    if (OBJECT_TOOLS.includes(tool)) tile.isHole = false;

    switch (tool) {
      case 'removeGround': {
        removeGround(lv, row, col);
        break;
      }
      case 'restoreGround':
        lv.tiles[row][col] = createDefaultTile();
        lv.objects[row][col] = null;
        break;
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
      case 'yellowButton':
        tile.isYellowButton = true;
        break;
      case 'yellowWall':
        tile.isYellowWall = true;
        break;
      case 'orangeButton':
        tile.isOrangeButton = true;
        break;
      case 'orangeWall':
        tile.isOrangeWall = true;
        break;
      case 'hole':
        // A hole can't hold an object, a portal, or a crack.
        tile.isHole = true;
        tile.isCrack = false;
        tile.crackArmed = false;
        tile.isPortal = false;
        lv.objects[row][col] = null;
        break;
      case 'crackWarm':
        tile.isCrack = true;
        tile.isWarm = true;
        tile.isFlake = false;
        tile.isHole = false;
        break;
      case 'crackCool':
        tile.isCrack = true;
        tile.isWarm = false;
        tile.isHole = false;
        break;
      case 'portal':
        tile.isPortal = true;
        tile.isHole = false;
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
        if (terrainFillMode && tile.isWarm !== (terrainFillMode === 'warm')) {
          // A terrain-fill mode treats the opposite temperature as erasable
          // paint, not as removable ground.
          tile.isWarm = terrainFillMode === 'warm';
          if (tile.isWarm) tile.isFlake = false;
          break;
        }
        lv.objects[row][col] = null;
        tile.isFlake = false;
        tile.isGoal = false;
        tile.isRowArch = false;
        tile.isColumnArch = false;
        tile.isShade = false;
        tile.isSoulSwap = false;
        tile.isKeyTile = false;
        tile.isYellowButton = false;
        tile.isYellowWall = false;
        tile.isOrangeButton = false;
        tile.isOrangeWall = false;
        tile.orangePressed = false;
        tile.isHole = false;
        tile.isCrack = false;
        tile.crackArmed = false;
        tile.isPortal = false;
        tile.triangle = undefined;
        // Note: edge arches are erased via handleEdgeClick when clicking edges.
        break;
    }
  };

  const resizeMap = (newWidth: number, newHeight: number) => {
    // Clamp to the valid map range: 1..30.
    const w = Math.max(1, Math.min(30, newWidth));
    const h = Math.max(1, Math.min(30, newHeight));
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
    setWidthInput(w.toString());
    setHeightInput(h.toString());
    clampSelectionToBounds(w, h);
    setLevel(newLevel);
  };

  const resetMap = useCallback(() => {
    pushUndo();
    setLevel(createLevel(level.width, level.height));
  }, [level.height, level.width, pushUndo, setLevel]);

  const fillAll = useCallback((warm: boolean) => {
    pushUndo();
    const newLevel = cloneLevel(level);
    for (let r = 0; r < newLevel.height; r++)
      for (let c = 0; c < newLevel.width; c++) {
        if (newLevel.tiles[r][c].isVoid) continue;
        newLevel.tiles[r][c].isWarm = warm;
        if (warm) newLevel.tiles[r][c].isFlake = false;
    }
    setLevel(newLevel);
  }, [level, pushUndo, setLevel]);

  const applyTerrainFill = useCallback((mode: TerrainFillMode) => {
    setTerrainFillMode(mode);
    fillAll(mode === 'warm');
  }, [fillAll]);

  // Tool selection shortcuts use name-based keys, with modifiers denoting a
  // related variant (for example Shift+1/2 for snowball size). `code` keeps the
  // mapping independent of the active IME.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

      const terrainEntry = (Object.entries(TERRAIN_FILL_HOTKEYS) as [TerrainFillMode, Hotkey][])
        .find(([, hotkey]) => matchesHotkey(e, hotkey));
      if (terrainEntry) {
        e.preventDefault();
        applyTerrainFill(terrainEntry[0]);
        return;
      }

      const entry = (Object.entries(TOOL_HOTKEYS) as [EditorTool, Hotkey][])
        .find(([, hotkey]) => matchesHotkey(e, hotkey));
      if (!entry) return;

      e.preventDefault();
      selectTool(entry[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyTerrainFill, selectTool]);

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

  const cycleSun = () => {
    const directions: SunDirection[] = ['left', 'up', 'right', 'down'];
    const current = directions.indexOf(level.sunDirection);
    setSun(directions[(current + 1) % directions.length]);
  };

  const handleExport = useCallback(() => {
    const code = encodeLevelCode(level);
    setJsonText(code);
    navigator.clipboard.writeText(code).then(() => {
      setCopyMsg(true);
      setTimeout(() => setCopyMsg(false), 2000);
    });
    setShowImportExport(true);
  }, [level]);

  const handleImport = () => {
    const text = jsonText.trim();
    const imported = text.startsWith('{')
      ? deserializeLevel(text)
      : decodeLevelCode(text);
    if (imported) {
      pushUndo();
      setWidthInput(imported.width.toString());
      setHeightInput(imported.height.toString());
      clampSelectionToBounds(imported.width, imported.height);
      setLevel(imported);
      setShowImportExport(false);
    } else {
      alert('잘못된 레벨 코드입니다');
    }
  };

  const openImport = useCallback(() => {
    setJsonText('');
    setShowImportExport(true);
  }, []);

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    reset: resetMap,
    exportCode: handleExport,
    openImport,
  }), [undo, redo, resetMap, handleExport, openImport]);

  // Tool metadata (label + emoji). The tile/object *grouping* below is purely a
  // visual arrangement in the editor — the underlying tools/logic are unchanged
  // (e.g. tunnels/buttons/soul-plate/triangle still set tile flags internally).
  const TOOL_META: Record<string, { label: string; emoji: string }> = {
    warm: { label: '따뜻함', emoji: '🟧' },
    cool: { label: '차가움', emoji: '🟦' },
    goal: { label: '골', emoji: '⭐' },
    player: { label: '플레이어', emoji: '⛄' },
    wall: { label: '벽', emoji: '🧱' },
    tree: { label: '나무', emoji: '🌲' },
    snowballLarge: { label: '크기 2', emoji: '⚪' },
    snowballSmall: { label: '크기 1', emoji: '🔵' },
    block: { label: '블록', emoji: '📦' },
    flake: { label: '눈꽃', emoji: '❄️' },
    columnTunnel: { label: '가로', emoji: '🚇' },
    rowTunnel: { label: '세로', emoji: '🚇' },
    snowman1: { label: '크기 1', emoji: '⛄' },
    snowman2: { label: '크기 2', emoji: '⛄' },
    snowman3: { label: '크기 3', emoji: '⛄' },
    triangle: { label: '삼각 벽', emoji: '◢' },
    yellowWall: { label: '벽', emoji: '🟨' },
    keyTile: { label: '초록 버튼', emoji: '🟢' },
    yellowButton: { label: '버튼', emoji: '🟡' },
    laser: { label: '레이저', emoji: '🔴' },
    soulSwap: { label: '영혼 발판', emoji: '🌀' },
    orangeButton: { label: '버튼', emoji: '🟠' },
    orangeWall: { label: '벽', emoji: '🔶' },
    hole: { label: '구멍', emoji: '🕳️' },
    crackWarm: { label: '따뜻함', emoji: '♨️' },
    crackCool: { label: '차가움', emoji: '🧊' },
    portal: { label: '포탈', emoji: '🟣' },
    removeGround: { label: '땅 제거', emoji: '×' },
    restoreGround: { label: '땅 복원', emoji: '⬜' },
  };

  // "타일" section: per-cell terrain features, grouped like the object tools.
  // Ground removal/restoration instead live beside the map-wide terrain fills.
  const tileGroups: { label: string; tools: EditorTool[] }[] = [
    { label: '기본', tools: ['warm', 'cool'] },
    { label: '균열', tools: ['crackWarm', 'crackCool'] },
    { label: '아치', tools: ['edgeArch1', 'edgeArch2'] },
    { label: '기타', tools: ['hole', 'goal'] },
  ];

  // "오브젝트" section: related tools are shown as clearly-labelled button groups.
  const objectGroups: {
    label?: string;
    tools?: EditorTool[];
    columns?: number;
    subgroups?: { label: string; tools: EditorTool[] }[];
  }[] = [
    { label: '기본', tools: ['player'] },
    { label: '눈사람', tools: ['snowman1', 'snowman2', 'snowman3'] },
    {
      subgroups: [
        { label: '눈덩이', tools: ['snowballSmall', 'snowballLarge'] },
        { label: '눈꽃', tools: ['flake'] },
      ],
    },
    { label: '장애물', tools: ['wall', 'tree', 'triangle', 'block'], columns: 2 },
    { label: '터널', tools: ['columnTunnel', 'rowTunnel'] },
    { label: '노랑', tools: ['yellowWall', 'yellowButton'] },
    { label: '주황', tools: ['orangeWall', 'orangeButton'] },
    { label: '특수', tools: ['keyTile', 'laser', 'soulSwap', 'portal'], columns: 2 },
  ];

  // Portals must come in pairs (exactly 0 or 2). Count them for an inline warning.
  let portalCount = 0;
  for (let r = 0; r < level.height; r++)
    for (let c = 0; c < level.width; c++)
      if (level.tiles[r][c].isPortal) portalCount++;
  const portalWarning = portalCount !== 0 && portalCount !== 2;

  const hotkeyBadge = (id: EditorTool) => {
    const hotkey = TOOL_HOTKEYS[id];
    return hotkey && (
      <kbd className="tool-hotkey" aria-label={`${hotkeyTitle(hotkey)} 키`}>
        {hotkeyLabel(hotkey)}
      </kbd>
    );
  };

  const renderToolRow = (ids: EditorTool[], columns = ids.length) => (
    <div className="tool-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6 }}>
      {ids.map((id) => {
        if (id === 'edgeArch1' || id === 'edgeArch2') {
          return (
            <button key={id}
              className={`tool-btn ${selectedTool === id ? 'active' : ''}`}
              onClick={() => selectTool(id)}
              title={`단축키: ${hotkeyTitle(TOOL_HOTKEYS[id]!)}`}>
              <span className={`tool-emoji arch-tool-icon ${id === 'edgeArch2' ? 'arch-tool-icon-tall' : ''}`}>
                🏛️{id === 'edgeArch2' && <span>🏛️</span>}
              </span>
              {id === 'edgeArch1' ? '높이 1' : '높이 2'}{hotkeyBadge(id)}
            </button>
          );
        }
        const m = TOOL_META[id];
        return (
          <button key={id}
            className={`tool-btn ${selectedTool === id ? 'active' : ''}`}
            onClick={() => selectTool(id)}
            title={`단축키: ${hotkeyTitle(TOOL_HOTKEYS[id]!)}`}>
            <span className={`tool-emoji ${id === 'removeGround' ? 'ground-remove-icon' : ''}`}>{m.emoji}</span>{m.label}{hotkeyBadge(id)}
          </button>
        );
      })}
    </div>
  );

  const renderTriangleDirectionControl = () => (
    <div className="triangle-direction-control">
      <span>삼각 방향</span>
      <div>
        {(['tl', 'tr', 'bl', 'br'] as TriangleCorner[]).map((corner) => (
          <button key={corner}
            className={triCorner === corner ? 'active' : ''}
            onClick={() => setTriCorner(corner)}>
            {TRI_LABEL[corner]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="editor">
      <div className="editor-sidebar">
        <section className="editor-section">
          <h3>맵</h3>
          <div className="size-controls">
            <label>
              가로:
              <input type="number" min={1} max={30} value={widthInput}
                onChange={(e) => handleWidthChange(e.target.value)}
                onBlur={handleWidthBlur} />
            </label>
            <label>
              세로:
              <input type="number" min={1} max={30} value={heightInput}
                onChange={(e) => handleHeightChange(e.target.value)}
                onBlur={handleHeightBlur} />
            </label>
          </div>
          <div className="shadow-control">
            <button className={`shadow-toggle ${level.hasShadow ? 'on' : 'off'}`} onClick={toggleShadow}>
              그림자: {level.hasShadow ? 'ON' : 'OFF'}
            </button>
            {level.hasShadow && (
              <button className="shadow-direction-cycle" onClick={cycleSun}
                title="클릭해 해 방향 변경"
                aria-label="해 방향 변경">
                {level.sunDirection === 'left' ? '←' : level.sunDirection === 'right' ? '→' : level.sunDirection === 'up' ? '↑' : '↓'}
              </button>
            )}
          </div>
          <button className={`shadow-toggle ${level.soulSwapEnabled ? 'on' : 'off'}`}
            onClick={toggleSoulSwap}
            title="켜면 시뮬레이터에서 M키로 눈사람 큐를 순회하며 영혼을 옮길 수 있습니다.">
            영혼 이동(M): {level.soulSwapEnabled ? 'ON' : 'OFF'}
          </button>
        </section>

        <section className="editor-section">
          <h3>지형</h3>
          <div className="tool-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            <button
              className={`tool-btn terrain-fill-button ${terrainFillMode === 'warm' ? 'active' : ''}`}
              onClick={() => applyTerrainFill('warm')}
              aria-pressed={terrainFillMode === 'warm'}
              title={`단축키: ${hotkeyTitle(TERRAIN_FILL_HOTKEYS.warm)}`}>
              <span className="tool-emoji">🟧</span>따뜻한 지형
              <kbd className="tool-hotkey" aria-label="Shift+H 키">{hotkeyLabel(TERRAIN_FILL_HOTKEYS.warm)}</kbd>
            </button>
            <button
              className={`tool-btn terrain-fill-button ${terrainFillMode === 'cool' ? 'active' : ''}`}
              onClick={() => applyTerrainFill('cool')}
              aria-pressed={terrainFillMode === 'cool'}
              title={`단축키: ${hotkeyTitle(TERRAIN_FILL_HOTKEYS.cool)}`}>
              <span className="tool-emoji">🟦</span>차가운 지형
              <kbd className="tool-hotkey" aria-label="Shift+C 키">{hotkeyLabel(TERRAIN_FILL_HOTKEYS.cool)}</kbd>
            </button>
          </div>
          <div className="tool-rows" style={{ marginTop: 6 }}>
            {renderToolRow(['removeGround', 'restoreGround'])}
          </div>
        </section>

        <section className="editor-section">
          <h3>타일</h3>
          <div className="tool-groups">
            {tileGroups.map((group) => (
              <div className="tool-group" key={group.label}>
                <div className="tool-group-label">{group.label}</div>
                {renderToolRow(group.tools)}
              </div>
            ))}
          </div>
        </section>

        <section className="editor-section">
          <h3>오브젝트</h3>
          <div className="tool-groups">
            {objectGroups.map((group) => (
              <div className="tool-group" key={group.label ?? 'snow-tools'}>
                {group.label && <div className="tool-group-label">{group.label}</div>}
                {group.subgroups ? (
                  <div className="tool-subgroups">
                    {group.subgroups.map((subgroup) => (
                      <div className="tool-subgroup" key={subgroup.label}>
                        <div className="tool-group-label">{subgroup.label}</div>
                        {renderToolRow(subgroup.tools)}
                      </div>
                    ))}
                  </div>
                ) : renderToolRow(group.tools!, group.columns)}
                {group.label === '장애물' && selectedTool === 'triangle' && renderTriangleDirectionControl()}
              </div>
            ))}
          </div>
          {portalWarning && (
            <div className="select-hint" style={{ color: '#e6a23c' }}>
              ⚠️ 포탈은 정확히 2개여야 합니다 (현재 {portalCount}개). 개수가 맞지 않으면 순간이동이 작동하지 않습니다.
            </div>
          )}
          {selectedTool === 'tree' && (
            <div className="tree-height-input">
              <label>
                높이:
                <input type="number" min={1} max={31} step={1} value={treeHeight}
                  onChange={(e) => {
                    const nextHeight = Number(e.target.value);
                    if (Number.isFinite(nextHeight)) setTreeHeight(Math.min(31, Math.max(1, Math.round(nextHeight))));
                  }} />
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
        </section>

        <section className="editor-section">
          <button className={`tool-btn eraser-btn-full ${selectedTool === 'eraser' ? 'active' : ''}`}
            onClick={() => selectTool('eraser')}
            title="단축키: V">
            <span className="tool-emoji">🧹</span>지우개{hotkeyBadge('eraser')}
          </button>
        </section>

      </div>

      <div className="editor-grid-area">
        <Grid level={level}
          onCellClick={handleCellClick}
          onCellDrag={handleCellDrag}
          onBackgroundClick={clearSelection}
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
              <button onClick={() => setShowImportExport(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Editor;
