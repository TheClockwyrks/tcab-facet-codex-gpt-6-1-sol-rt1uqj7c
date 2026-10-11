import type { DeepReadonly } from "ts-essentials";
import type {
  FacetState,
  GemState,
  BoardState,
  CellRef,
  GemKind,
  Cut,
} from "./game";
import * as C from "./constants";
export type State = DeepReadonly<FacetState>;
export const letters = "RACJBSM";
export const index = (c: CellRef) => c.row * C.GRID_COLS + c.col;
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const same = (a: CellRef | null, b: CellRef | null) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export function validCell(col: number, row: number) {
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    row < 0 ||
    col >= C.GRID_COLS ||
    row >= C.GRID_ROWS
  )
    throw new RangeError("Cell outside board");
}
export function integer(n: number, min = 0) {
  if (!Number.isInteger(n) || n < min)
    throw new RangeError("Invalid whole number");
  return n;
}
export function token(t: string, col: number, row: number): GemState {
  const m = /^([RACJBSMX])([0-3])([bs]?)$/.exec(t);
  if (!m || (m[1] === "X" && m[3])) throw new Error("Invalid gem token: " + t);
  return {
    col,
    row,
    kind: m[1] === "X" ? null : C.GEM_KINDS[letters.indexOf(m[1])],
    strain: Number(m[2]),
    cut:
      m[1] === "X"
        ? "prism"
        : m[3] === "b"
          ? "brilliant"
          : m[3] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function initial(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array(C.GRID_COLS).fill(""),
    visual: null,
    opening: 0,
    assets: null,
  };
}
export interface Run {
  cells: number[];
  axis: "h" | "v";
}
export function runs(board: DeepReadonly<BoardState>): Run[] {
  const out: Run[] = [];
  for (const axis of ["h", "v"] as const)
    for (let a = 0; a < C.GRID_ROWS; a++) {
      let start = 0;
      while (start < C.GRID_COLS) {
        const ids: number[] = [];
        const id =
          axis === "h" ? a * C.GRID_COLS + start : start * C.GRID_COLS + a;
        const kind = board.cells[id]?.kind;
        let end = start;
        while (end < C.GRID_COLS) {
          const i =
            axis === "h" ? a * C.GRID_COLS + end : end * C.GRID_COLS + a;
          if (!kind || board.cells[i]?.kind !== kind) break;
          ids.push(i);
          end++;
        }
        if (ids.length >= C.MATCH_MIN) out.push({ cells: ids, axis });
        start = Math.max(start + 1, end);
      }
    }
  return out;
}
function exchanged(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): BoardState {
  const cells = board.cells.map((g) => ({ ...g }));
  const ai = index(a),
    bi = index(b);
  cells[ai] = { ...board.cells[bi], ...a, fell: 0 };
  cells[bi] = { ...board.cells[ai], ...b, fell: 0 };
  return { ...board, cells };
}
export function productive(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): boolean {
  if (!adjacent(a, b) || !board.cells[index(a)] || !board.cells[index(b)])
    return false;
  return (
    board.cells[index(a)].cut === "prism" ||
    board.cells[index(b)].cut === "prism" ||
    runs(exchanged(board, a, b)).length > 0
  );
}
export function legal(board: DeepReadonly<BoardState>): boolean {
  for (const g of board.cells)
    for (const d of [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ])
      if (d.col < C.GRID_COLS && d.row < C.GRID_ROWS && productive(board, g, d))
        return true;
  return false;
}
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
        } while (
          (col >= 2 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legal(board)) return board;
  }
}
export function requestSwap(s: State, a: CellRef, b: CellRef): FacetState {
  validCell(a.col, a.row);
  validCell(b.col, b.row);
  if (!s.board.cells[index(a)] || !s.board.cells[index(b)])
    throw new Error("No board in play");
  if (s.phase !== "idle" || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const ga = s.board.cells[index(a)],
    gb = s.board.cells[index(b)];
  const board = exchanged(s.board, a, b);
  let seed: number[] | null = null;
  if (ga.cut === "prism" || gb.cut === "prism")
    seed =
      ga.cut === "prism" && gb.cut === "prism"
        ? s.board.cells.map((_, i) => i)
        : board.cells
            .map((g, i) =>
              g.kind === (ga.cut === "prism" ? gb.kind : ga.kind) ||
              i === (ga.cut === "prism" ? index(b) : index(a))
                ? i
                : -1,
            )
            .filter((i) => i >= 0);
  return {
    ...s,
    board,
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    visual: {
      swap: { a, b },
      seed,
      before: s.board.cells.map((g) => ({ ...g })),
      cleared: [],
      created: [],
    },
  };
}
function neighbors(i: number, diagonal = false): number[] {
  const out: number[] = [];
  const row = Math.floor(i / C.GRID_COLS),
    col = i % C.GRID_COLS;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (
        (dx || dy) &&
        (diagonal || Math.abs(dx) + Math.abs(dy) === 1) &&
        col + dx >= 0 &&
        col + dx < C.GRID_COLS &&
        row + dy >= 0 &&
        row + dy < C.GRID_ROWS
      )
        out.push((row + dy) * C.GRID_COLS + col + dx);
  return out;
}
export function resolve(s: State): FacetState {
  const rs = runs(s.board);
  const seed =
    s.chainStep === 1 && s.visual?.seed
      ? s.visual.seed
      : rs.flatMap((r) => r.cells);
  const waves = new Map<number, number>();
  const queue: number[] = [];
  for (const i of seed)
    if (!waves.has(i)) {
      waves.set(i, 0);
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = s.board.cells[i];
    let additions = neighbors(i).filter(
      (j) => s.board.cells[j].strain === C.MAX_STRAIN,
    );
    if (g.cut === "brilliant") additions = additions.concat(neighbors(i, true));
    if (g.cut === "star")
      additions = additions.concat(
        s.board.cells
          .map((gg, j) => (gg.col === g.col || gg.row === g.row ? j : -1))
          .filter((j) => j >= 0),
      );
    for (const j of additions)
      if (!waves.has(j)) {
        waves.set(j, waves.get(i)! + 1);
        queue.push(j);
      }
  }
  const created = new Map<number, Cut>();
  const priority = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  function create(i: number, cut: Cut) {
    if (priority[cut] > priority[created.get(i) ?? "plain"])
      created.set(i, cut);
  }
  if (!(s.chainStep === 1 && s.visual?.seed)) {
    for (const r of rs)
      if (r.cells.length >= 4) {
        const swap = s.visual?.swap;
        const choices = swap
          ? r.cells.filter((i) => i === index(swap.a) || i === index(swap.b))
          : [];
        create(
          choices[0] ?? r.cells[Math.floor((r.cells.length - 1) / 2)],
          r.cells.length >= 5 ? "prism" : "brilliant",
        );
      }
    for (const h of rs.filter((r) => r.axis === "h"))
      for (const v of rs.filter((r) => r.axis === "v"))
        for (const i of h.cells) if (v.cells.includes(i)) create(i, "star");
  }
  let points = 0;
  for (const i of queue)
    points +=
      (s.board.cells[i].strain === C.MAX_STRAIN
        ? C.FLAWED_SCORE
        : C.BASE_SCORE) * Math.min(s.chainStep, C.MAX_MULTIPLIER);
  const survivors: (GemState | null)[] = s.board.cells.map((g, i) =>
    waves.has(i)
      ? null
      : {
          ...g,
          strain: neighbors(i).some((j) => waves.has(j))
            ? Math.min(C.MAX_STRAIN, g.strain + 1)
            : g.strain,
          fell: 0,
        },
  );
  for (const [i, cut] of created) {
    survivors[i] = {
      ...s.board.cells[i],
      cut,
      kind: cut === "prism" ? null : s.board.cells[i].kind,
      strain: 0,
      fell: 0,
    };
  }
  const cells: GemState[] = Array(C.GRID_COLS * C.GRID_ROWS);
  for (let col = 0; col < C.GRID_COLS; col++) {
    const column = survivors.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const empty = C.GRID_ROWS - column.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      if (row < empty) {
        const posed = s.refillKinds[col][row];
        cells[row * C.GRID_COLS + col] = {
          col,
          row,
          kind: posed
            ? C.GEM_KINDS[letters.indexOf(posed)]
            : C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)],
          cut: "plain",
          strain: 0,
          fell: empty,
        };
      } else {
        const g = column[row - empty];
        cells[row * C.GRID_COLS + col] = { ...g, row, fell: row - g.row };
      }
    }
  }
  return {
    ...s,
    board: { ...s.board, cells },
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    lastCleared: queue.length,
    lastPoints: points,
    lastWaves: Math.max(0, ...waves.values()),
    bestChain: Math.max(s.bestChain, s.chainStep),
    stepTimer: 0,
    visual: {
      swap: s.visual?.swap ?? null,
      seed: null,
      before: s.board.cells.map((g) => ({ ...g })),
      cleared: queue.map((i) => ({
        gem: { ...s.board.cells[i] },
        wave: waves.get(i)!,
      })),
      created: [...created.keys()],
    },
  };
}
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const hold = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export function advance(s: State, dt: number): FacetState {
  let next: FacetState = { ...s };
  if (next.screen !== "playing") return next;
  if (next.refusal)
    next = {
      ...next,
      refusal:
        next.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...next.refusal, timer: next.refusal.timer + dt },
    };
  if (next.opening > 0)
    next = { ...next, opening: Math.max(0, next.opening - dt) };
  let left = dt;
  while (left > 0 && next.phase !== "idle" && next.screen === "playing") {
    const swapping = next.phase === "swapping";
    const remaining =
      (swapping ? C.SWAP_SECONDS : hold(next)) -
      (swapping ? next.swapTimer : next.stepTimer);
    const amount = Math.min(left, Math.max(0, remaining));
    left -= amount;
    next = swapping
      ? { ...next, swapTimer: next.swapTimer + amount }
      : { ...next, stepTimer: next.stepTimer + amount };
    if (amount + 1e-10 < remaining) break;
    if (swapping)
      next = resolve({
        ...next,
        phase: "resolving",
        swapTimer: 0,
        chainStep: 1,
      });
    else if (runs(next.board).length)
      next = resolve({ ...next, chainStep: next.chainStep + 1 });
    else {
      next = {
        ...next,
        phase: "idle",
        chainStep: 0,
        stepTimer: 0,
        bestMove: Math.max(next.bestMove, next.moveScore),
        visual: null,
      };
      if (next.levelScore >= C.LEVEL_TARGET_STEP * next.level)
        next = {
          ...next,
          screen: "levelclear",
          menuIndex: 0,
          armedTarget: null,
        };
      else if (!legal(next.board))
        next = { ...next, screen: "gameover", menuIndex: 0, armedTarget: null };
    }
  }
  return next;
}
