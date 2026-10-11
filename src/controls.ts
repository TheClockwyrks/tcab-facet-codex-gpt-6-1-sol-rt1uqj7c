import * as C from "./constants";
import type { FacetState, PointerDevice, Screen, CellRef } from "./game";
import {
  type State,
  same,
  adjacent,
  cellX,
  cellY,
  initial,
  deal,
  requestSwap,
  index,
} from "./model";
export interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export function targets(s: State): Target[] {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1056, y: 40, w: 144, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 80, y: 610, w: 160, h: C.TARGET_MIN_H }];
  return [0, 1].map((i) => ({
    id: `menu-${i}`,
    x: 480,
    y: 410 + i * 88,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
export const menuItems = (screen: Screen): readonly string[] =>
  screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSED_ITEMS
      : screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : screen === "gameover"
          ? C.GAMEOVER_ITEMS
          : [];
export function screen(s: State, to: Screen, menuIndex = 0): FacetState {
  return { ...s, screen: to, menuIndex, armedTarget: null };
}
function quit(s: State): FacetState {
  return {
    ...screen(s, "title"),
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    visual: null,
    opening: 0,
  };
}
export function start(s: State): FacetState {
  return {
    ...initial(s.muted),
    assets: s.assets,
    simTime: s.simTime,
    pointer: s.pointer,
    screen: "playing",
    board: deal(),
    opening: C.GRID_ROWS * C.FALL_SECONDS_PER_ROW,
  };
}
export function confirm(s: State): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? start(s) : screen(s, "howto");
  if (s.screen === "paused")
    return s.menuIndex === 0 ? screen(s, "playing") : quit(s);
  if (s.screen === "gameover") return s.menuIndex === 0 ? start(s) : quit(s);
  if (s.screen === "levelclear")
    return s.menuIndex === 0
      ? {
          ...screen(s, "playing"),
          level: s.level + 1,
          levelScore: 0,
          bestMove: 0,
          bestChain: 0,
          board: deal(),
          opening: C.GRID_ROWS * C.FALL_SECONDS_PER_ROW,
          selection: null,
          offer: null,
          refusal: null,
        }
      : quit(s);
  return { ...s };
}
export function action(s: State, name: string): FacetState {
  if (name === "pause" && (s.screen === "playing" || s.screen === "paused"))
    return screen(s, s.screen === "playing" ? "paused" : "playing");
  if (name === "back" && s.screen === "howto") return screen(s, "title", 1);
  if (name === "back" && s.screen === "gameover") return screen(s, "title");
  if (name === "confirm") return confirm(s);
  if ((name === "up" || name === "down") && menuItems(s.screen).length)
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "up" ? -1 : 1) + menuItems(s.screen).length) %
        menuItems(s.screen).length,
    };
  return { ...s };
}
export function hit(s: State, x: number, y: number): CellRef | null {
  let nearest: CellRef | null = null,
    best = C.GEM_HIT_R * C.GEM_HIT_R;
  for (const g of s.board.cells) {
    const d = (x - cellX(g.col)) ** 2 + (y - cellY(g.row)) ** 2;
    if (d <= best && (d < best || !nearest)) {
      best = d;
      nearest = { col: g.col, row: g.row };
    }
  }
  return nearest;
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  let n: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
      device,
    },
  };
  const target = targets(n).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (type === "down") {
    n = { ...n, armedTarget: target?.id ?? null };
    if (target) {
      if (target.id.startsWith("menu-"))
        n = { ...n, menuIndex: Number(target.id.slice(5)) };
      return n;
    }
    if (n.screen === "playing") {
      const c = hit(n, x, y);
      if (!c) return { ...n, selection: null, offer: null };
      if (!n.selection || (!same(c, n.selection) && !adjacent(c, n.selection)))
        return { ...n, selection: c, offer: null };
      return { ...n, offer: same(c, n.selection) ? null : c };
    }
  }
  if (type === "move") {
    if (!n.pointer.down && target?.id.startsWith("menu-"))
      n = { ...n, menuIndex: Number(target.id.slice(5)) };
    if (
      n.screen === "playing" &&
      n.pointer.down &&
      n.selection &&
      !n.armedTarget
    ) {
      const c = hit(n, x, y);
      if (c && same(c, n.selection)) n = { ...n, offer: null };
      else if (c && adjacent(c, n.selection)) n = { ...n, offer: c };
    }
  }
  if (type === "up") {
    const armed = n.armedTarget;
    n = { ...n, armedTarget: null };
    if (armed) {
      if (target?.id === armed)
        return action(
          n,
          armed === "pause" ? "pause" : armed === "back" ? "back" : "confirm",
        );
      return n;
    }
    if (n.screen === "playing" && n.offer && n.selection) {
      n = requestSwap(n, n.selection, n.offer);
      return { ...n, selection: null, offer: null };
    }
  }
  return n;
}
export function offeredGem(s: State, i: number) {
  if (s.selection && s.offer) {
    if (i === index(s.selection)) return s.board.cells[index(s.offer)];
    if (i === index(s.offer)) return s.board.cells[index(s.selection)];
  }
  return s.board.cells[i];
}
