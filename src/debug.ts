import * as C from "./constants";
import type { FacetState, Screen, PointerDevice } from "./game";
import {
  type State,
  initial,
  validCell,
  integer,
  token,
  deal,
  letters,
  requestSwap,
  legal,
  hold,
  lastFall,
  cellX,
  cellY,
} from "./model";
import { targets, pointer } from "./controls";
function numberField(
  s: State,
  key:
    | "score"
    | "level"
    | "levelScore"
    | "bestMove"
    | "bestChain"
    | "moveScore"
    | "menuIndex",
  value: number,
): FacetState {
  integer(value, key === "level" ? 1 : 0);
  return { ...s, [key]: value };
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => ({ ...initial(s.muted), assets: s.assets }),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot: (s: State) => ({
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: hold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legal(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  }),
  setScreen: (s: State, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: State, v: number) => numberField(s, "menuIndex", v),
  loadBoard: (s: State, rows: readonly string[]): FacetState => {
    if (rows.length !== C.GRID_ROWS) throw new Error("Expected eight rows");
    const cells = rows.flatMap((r, row) => {
      const ts = r.trim().split(/\s+/);
      if (ts.length !== C.GRID_COLS) throw new Error("Expected eight columns");
      return ts.map((t, col) => token(t, col, row));
    });
    return { ...s, board: { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells } };
  },
  dealBoard: (s: State): FacetState => ({
    ...s,
    board: deal(),
    opening: C.GRID_ROWS * C.FALL_SECONDS_PER_ROW,
  }),
  clearBoard: (s: State): FacetState => ({
    ...s,
    board: { cols: 0, rows: 0, cells: [] },
  }),
  setGem: (s: State, col: number, row: number, t: string): FacetState => {
    validCell(col, row);
    if (!s.board.cells.length) throw new Error("No board");
    const g = token(t, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((old) =>
          old.col === col && old.row === row ? g : { ...old },
        ),
      },
    };
  },
  setRefillKinds: (s: State, col: number, kinds: string): FacetState => {
    validCell(col, 0);
    if ([...kinds].some((k) => !letters.includes(k)))
      throw new Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: Array(C.GRID_COLS).fill(""),
  }),
  setScore: (s: State, v: number) => numberField(s, "score", v),
  setLevel: (s: State, v: number) => numberField(s, "level", v),
  setLevelScore: (s: State, v: number) => numberField(s, "levelScore", v),
  setBestChain: (s: State, v: number) => numberField(s, "bestChain", v),
  setBestMove: (s: State, v: number) => numberField(s, "bestMove", v),
  setMoveScore: (s: State, v: number) => numberField(s, "moveScore", v),
  setSelection: (s: State, col: number, row: number): FacetState => {
    validCell(col, row);
    return { ...s, selection: { col, row } };
  },
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer: (s: State, col: number, row: number): FacetState => {
    validCell(col, row);
    return { ...s, offer: { col, row } };
  },
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    visual: null,
  }),
  requestSwap: (
    s: State,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ) => requestSwap(s, { col: colA, row: rowA }, { col: colB, row: rowB }),
  pointerDown: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointer(s, "down", x, y, device),
  pointerMove: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointer(s, "move", x, y, device),
  pointerUp: (s: State, device: PointerDevice = "mouse") =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
