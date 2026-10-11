/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type FacetState, type FacetDebugApi, BACKGROUND } from "./game";
import { debug } from "./debug";
import {
  initial,
  advance,
  resolve,
  runs,
  deal,
  legal,
  cellX,
  cellY,
} from "./model";
import { action, targets, offeredGem } from "./controls";
import * as C from "./constants";
const rows = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => "RACJBSM"[(r * 2 + c) % 7] + "0").join(
    " ",
  ),
);
function board() {
  return debug.setScreen(debug.loadBoard(initial(), rows), "playing");
}
function set(s: FacetState, c: number, r: number, t: string) {
  return debug.setGem(s, c, r, t);
}
function stableRefill(s: FacetState) {
  for (let c = 0; c < 8; c++)
    s = debug.setRefillKinds(
      s,
      c,
      Array.from({ length: 8 }, (_, r) => "RACJBSM"[(r * 2 + c + 3) % 7]).join(
        "",
      ),
    );
  return s;
}
function line(s: FacetState, length = 3) {
  for (let c = 0; c < length; c++) s = set(s, c, 4, "R0");
  return s;
}
function step(s: FacetState) {
  return resolve({ ...s, phase: "resolving", chainStep: 1 });
}
let engine: Engine<FacetState, FacetDebugApi>;
const eventTarget = new EventTarget();
function dispatch(type: string, properties: Record<string, unknown>) {
  eventTarget.dispatchEvent(Object.assign(new Event(type), properties));
}
beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({ duration: 1 });
      }
    },
  );
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    layout: C.LAYOUT,
    game,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => eventTarget,
    },
  });
  await engine.initialize();
});
afterAll(() => {
  engine.destroy();
  vi.unstubAllGlobals();
});
describe("engine and state contract", () => {
  it("loads the genuine assets before returning its complete initial state", () => {
    expect(engine.state.screen).toBe("title");
    expect(Object.keys(engine.state.assets!.images)).toHaveLength(85);
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(engine.diagnostics().length).toBeGreaterThan(16);
  });
  it("advances with an engine clock and freezes board time on menus", async () => {
    engine.apply((s) => ({
      ...debug.requestSwap(line(board()), 0, 4, 1, 4),
      assets: s.assets,
    }));
    engine.apply((s) => debug.setScreen(s, "paused"));
    await engine.advance(12);
    expect(engine.state.swapTimer).toBe(0);
    expect(engine.state.simTime).toBeCloseTo(0.2);
    engine.apply((s) => debug.setScreen(s, "playing"));
    await engine.advance(11);
    expect(engine.state.phase).toBe("resolving");
    expect(engine.state.lastCleared).toBeGreaterThanOrEqual(3);
  });
  it("reset restores declared fields but preserves assets and mute", () => {
    let s = debug.setScore(board(), 512);
    s = { ...s, muted: true, simTime: 4 };
    const r = debug.reset(s);
    expect(r).toEqual({ ...initial(true), assets: s.assets });
  });
  it("reports derived values immediately and returns detached snapshots", () => {
    const s = debug.setLevel(board(), 4);
    const snap = debug.snapshot(s);
    expect(snap.levelTarget).toBe(8000);
    expect(snap.board.cells[0].x).toBe(cellX(0));
    snap.refillKinds[0] = "RRR";
    expect(s.refillKinds[0]).toBe("");
    expect(debug.reconcile(s)).toEqual(s);
  });
  it("poses only the requested fields", () => {
    const s = { ...board(), score: 500, selection: { col: 2, row: 2 } };
    expect(debug.loadBoard(s, rows).selection).toEqual(s.selection);
    expect(debug.dealBoard(s).score).toBe(500);
    expect(debug.clearBoard(s).score).toBe(500);
    expect(debug.setMenuIndex(s, 99).menuIndex).toBe(99);
  });
  it("rejects invalid domains loudly", () => {
    expect(() => debug.loadBoard(initial(), ["R0"])).toThrow();
    expect(() => debug.setGem(board(), 0, 0, "X0b")).toThrow();
    expect(() => debug.setGem(board(), 8, 0, "R0")).toThrow();
    expect(() => debug.setLevel(initial(), 0)).toThrow();
    expect(() => debug.setRefillKinds(initial(), 0, "X")).toThrow();
    expect(() => debug.pointerDown(initial(), NaN, 4)).toThrow();
    expect(() => debug.setScore(initial(), -1)).toThrow();
  });
});
describe("match and pressure rules", () => {
  it("deals no runs, guarantees a move, and gives every gem an incoming fall", () => {
    for (let i = 0; i < 12; i++) {
      const b = deal();
      expect(runs(b)).toHaveLength(0);
      expect(legal(b)).toBe(true);
      expect(
        b.cells.every(
          (g) => g.fell >= g.row + 1 && g.strain === 0 && g.cut === "plain",
        ),
      ).toBe(true);
    }
  });
  it("counts maximal horizontal and vertical runs, excluding prisms", () => {
    let s = line(board(), 5);
    for (let r = 2; r < 7; r++) s = set(s, 2, r, "R0");
    expect(runs(s.board).map((r) => r.cells.length)).toEqual([5, 5]);
    s = set(s, 2, 4, "X0");
    expect(runs(s.board)).toHaveLength(0);
  });
  it("refuses nonadjacent, unproductive, and busy swaps without changing the board", () => {
    let s = board();
    for (const pair of [
      [0, 0, 2, 0],
      [0, 0, 1, 0],
    ]) {
      const n = debug.requestSwap(
        s,
        ...(pair as [number, number, number, number]),
      );
      expect(n.board).toEqual(s.board);
      expect(n.refusal).not.toBeNull();
    }
    s = line(s);
    const busy = debug.requestSwap(
      debug.requestSwap(s, 0, 4, 1, 4),
      0,
      4,
      1,
      4,
    );
    expect(busy.phase).toBe("swapping");
    expect(busy.refusal).not.toBeNull();
  });
  it("scores flaws twice and propagates through orthogonal flaws in shortest waves", () => {
    let s = line(board());
    s = set(s, 2, 3, "A3");
    s = set(s, 2, 2, "C3");
    s = set(s, 3, 2, "J3");
    s = set(s, 3, 3, "B2");
    const n = step(s);
    expect(n.lastCleared).toBe(6);
    expect(n.lastWaves).toBe(3);
    expect(n.lastPoints).toBe(90);
    expect(
      n.board.cells.some((g) => g.kind === "beryl" && g.strain === 3),
    ).toBe(true);
  });
  it("brilliant expansion includes diagonals and star expansion includes the whole cross", () => {
    let s = line(board());
    s = set(s, 1, 4, "R0b");
    expect(step(s).lastCleared).toBe(9);
    s = set(s, 1, 4, "R0s");
    expect(step(s).lastCleared).toBe(15);
  });
  it("creates brilliant, prism, and crossing star at the correct places", () => {
    expect(
      step(line(board(), 4)).board.cells.some(
        (g) => g.cut === "brilliant" && g.col === 1,
      ),
    ).toBe(true);
    expect(
      step(line(board(), 5)).board.cells.some(
        (g) => g.cut === "prism" && g.kind === null && g.col === 2,
      ),
    ).toBe(true);
    let s = line(board());
    s = set(s, 1, 3, "R0");
    s = set(s, 1, 5, "R0");
    expect(
      step(s).board.cells.some((g) => g.cut === "star" && g.col === 1),
    ).toBe(true);
  });
  it("chooses the lower swap index for a run prize and respects prism precedence", () => {
    let s = debug.requestSwap(line(board(), 4), 2, 4, 3, 4);
    let n = advance(s, C.SWAP_SECONDS);
    expect(
      n.board.cells.some((g) => g.cut === "brilliant" && g.col === 2),
    ).toBe(true);
    s = line(board(), 5);
    s = set(s, 2, 3, "R0");
    s = set(s, 2, 5, "R0");
    n = step(s);
    expect(n.board.cells.some((g) => g.cut === "prism" && g.col === 2)).toBe(
      true,
    );
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(false);
  });
  it("prism exchange clears the prism and every target-kind stone including the traded gem", () => {
    let s = set(board(), 0, 0, "X0");
    const count = s.board.cells.filter(
      (g) => g.kind === s.board.cells[1].kind,
    ).length;
    s = debug.requestSwap(s, 0, 0, 1, 0);
    const n = advance(s, C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(count + 1);
    expect(
      n.visual!.cleared.some((c) => c.gem.col === 0 && c.gem.row === 0),
    ).toBe(true);
  });
  it("two prisms clear all cells without making prizes", () => {
    let s = set(set(board(), 0, 0, "X0"), 1, 0, "X0");
    s = advance(debug.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(s.lastCleared).toBe(64);
    expect(s.lastPoints).toBe(640);
    expect(s.visual!.created).toHaveLength(0);
  });
  it("settles in order and refills from posed row kinds, keeping fell at rest", () => {
    const s = stableRefill(line(board()));
    const old = s.board.cells.find((g) => g.col === 0 && g.row === 3)!;
    const n = step(s);
    const moved = n.board.cells.find((g) => g.col === 0 && g.row === 4)!;
    expect(moved.kind).toBe(old.kind);
    expect(moved.fell).toBe(1);
    expect(n.board.cells[0].kind).toBe("jade");
    const rest = advance(n, 2);
    expect(rest.board.cells.some((g) => g.fell > 0)).toBe(true);
  });
  it("caps the multiplier and records move and chain statistics", () => {
    const n = resolve({
      ...line(board()),
      phase: "resolving",
      chainStep: 20,
      moveScore: 100,
    });
    expect(n.lastPoints).toBe(240);
    expect(n.moveScore).toBe(340);
    expect(n.bestChain).toBe(20);
  });
  it("integrates the same stable chain independently of frame partitions", () => {
    const s = debug.requestSwap(stableRefill(line(board())), 0, 4, 1, 4);
    const one = advance(s, 0.48);
    let many = s;
    for (let i = 0; i < 48; i++) many = advance(many, 0.01);
    expect(many.board).toEqual(one.board);
    expect(many.score).toBe(one.score);
    expect(many.stepTimer).toBeCloseTo(one.stepTimer);
  });
  it("awards level completion before a no-move ending and keeps the finished board", () => {
    const s = { ...stableRefill(line(board())), levelScore: 2000 };
    const n = advance(step(s), 4);
    expect(n.screen).toBe("levelclear");
    expect(n.bestMove).toBeGreaterThan(0);
    const next = action(n, "confirm");
    expect(next.level).toBe(2);
    expect(next.score).toBe(n.score);
    expect(next.levelScore).toBe(0);
  });
  it("ends a round on a board with no legal swap after its chain rests", () => {
    expect(legal(board().board)).toBe(false);
    const s = { ...board(), phase: "resolving" as const, chainStep: 1 };
    const n = advance(s, 1);
    expect(n.screen).toBe("gameover");
    expect(action(n, "back").board).toEqual(n.board);
  });
});
describe("pointer and menus", () => {
  it("offers exchanged art and plays only on release for every device", () => {
    for (const device of ["mouse", "pen", "touch"] as const) {
      let s = line(board());
      s = debug.pointerDown(s, cellX(0), cellY(4), device);
      s = debug.pointerMove(s, cellX(1), cellY(4), device);
      expect(s.phase).toBe("idle");
      expect(s.offer).toEqual({ col: 1, row: 4 });
      expect(offeredGem(s, 32)).toBe(s.board.cells[33]);
      s = debug.pointerUp(s, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.pointer.device).toBe(device);
    }
  });
  it("withdraws an offer when brought back and supports two-press swapping", () => {
    let s = line(board());
    s = debug.pointerDown(s, cellX(0), cellY(4));
    s = debug.pointerMove(s, cellX(1), cellY(4));
    s = debug.pointerMove(s, cellX(0), cellY(4));
    s = debug.pointerUp(s);
    expect(s.phase).toBe("idle");
    expect(s.selection).toEqual({ col: 0, row: 4 });
    s = debug.pointerDown(s, cellX(1), cellY(4));
    s = debug.pointerUp(s);
    expect(s.phase).toBe("swapping");
  });
  it("keeps the offer over distant cells and clears selection on an outside press", () => {
    let s = debug.setOffer(debug.setSelection(board(), 0, 0), 1, 0);
    s = debug.pointerDown(s, cellX(0), cellY(0));
    s = debug.pointerMove(s, cellX(1), cellY(0));
    s = debug.pointerMove(s, cellX(6), cellY(6));
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = debug.pointerDown(s, 12, 12);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("breaks exact hit ties in reading order", () => {
    const s = debug.pointerDown(board(), cellX(0) + C.GEM_HIT_R, cellY(0));
    expect(s.selection).toEqual({ col: 0, row: 0 });
  });
  it("works every target with a fingertip and disarms a canceled release", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      const s = debug.setScreen(board(), screen);
      for (const t of targets(s)) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        let n = debug.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2, "touch");
        expect(n.armedTarget).toBe(t.id);
        n = debug.pointerUp(n, "touch");
        expect(n.armedTarget).toBeNull();
      }
      const t = targets(s)[0];
      const n = debug.pointerUp(
        debug.pointerMove(debug.pointerDown(s, t.x + 2, t.y + 2), 0, 0),
      );
      expect(n.screen).toBe(s.screen);
    }
  });
  it("wraps menus, backs out of help, pauses, resumes, and quits completely", () => {
    let s = action(initial(), "up");
    expect(s.menuIndex).toBe(1);
    s = action(s, "confirm");
    expect(s.screen).toBe("howto");
    s = action(s, "back");
    expect(s.menuIndex).toBe(1);
    s = action(s, "down");
    s = action(s, "confirm");
    expect(s.screen).toBe("playing");
    s = action(s, "pause");
    expect(s.screen).toBe("paused");
    s = action(s, "pause");
    expect(s.screen).toBe("playing");
    s = action(action(s, "pause"), "down");
    s = action(s, "confirm");
    expect(s.screen).toBe("title");
    expect(s.board.cells).toHaveLength(0);
    expect(s.phase).toBe("idle");
  });
  it("does not mutate the incoming state on poses or updates", () => {
    const s = board();
    const before = JSON.stringify(s);
    debug.pointerDown(s, cellX(0), cellY(0));
    advance(s, 0.5);
    debug.setBestMove(s, 300);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("live input and produced graphics through the engine", () => {
  it("samples keyboard actions, pointer edges, and audio events in the frame", async () => {
    engine.apply((s) => debug.reset(s));
    dispatch("keydown", { code: "ArrowDown", repeat: false });
    await engine.advance(1);
    dispatch("keyup", { code: "ArrowDown" });
    expect(engine.state.menuIndex).toBe(1);
    dispatch("keydown", { code: "Enter", repeat: false });
    await engine.advance(1);
    dispatch("keyup", { code: "Enter" });
    expect(engine.state.screen).toBe("howto");
    dispatch("keydown", { code: "Escape", repeat: false });
    await engine.advance(1);
    dispatch("keyup", { code: "Escape" });
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    engine.apply((s) => ({ ...line(board()), assets: s.assets }));
    const played: string[] = [];
    const off = engine.events.on("cue:played", (e) => played.push(e.cue));
    for (const [type, c] of [
      ["pointerdown", 0],
      ["pointermove", 1],
      ["pointerup", 1],
    ] as const) {
      dispatch(type, {
        clientX: cellX(c),
        clientY: cellY(4),
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      await engine.advance(1);
    }
    expect(engine.state.phase).toBe("swapping");
    expect(played).toContain(C.CUES.select);
    expect(played).toContain(C.CUES.swap);
    await engine.advance(11);
    expect(played).toContain(C.CUES.clear);
    dispatch("keydown", { code: "KeyM", repeat: false });
    await engine.advance(1);
    dispatch("keyup", { code: "KeyM" });
    expect(engine.state.muted).toBe(true);
    dispatch("keydown", { code: "KeyP", repeat: false });
    await engine.advance(1);
    dispatch("keyup", { code: "KeyP" });
    expect(engine.state.screen).toBe("paused");
    const timer = engine.state.stepTimer;
    await engine.advance(12);
    expect(engine.state.stepTimer).toBe(timer);
    off();
  });
  it("renders every screen and all strain and cut treatments from loaded assets", async () => {
    engine.apply((s) => ({ ...board(), assets: s.assets }));
    engine.apply((s) =>
      debug.setGem(
        debug.setGem(debug.setGem(s, 0, 0, "X3"), 1, 0, "B1b"),
        2,
        0,
        "M2s",
      ),
    );
    for (const name of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      engine.apply((s) => debug.setScreen(s, name));
      await engine.advance(1);
      expect(engine.state.screen).toBe(name);
    }
    engine.apply((s) => debug.setScreen(s, "playing"));
    engine.apply((s) => debug.requestSwap(s, 0, 0, 1, 0));
    await engine.advance(60);
    expect(engine.state.score).toBeGreaterThan(0);
  });
  it("covers the independent debug poses without incidental transactions", () => {
    let s = board();
    s = debug.setBestChain(s, 7);
    s = debug.setBestMove(s, 123);
    s = debug.setMoveScore(s, 55);
    s = debug.setRefillKinds(s, 0, "RAC");
    s = debug.clearRefillKinds(s);
    s = debug.clearRefusal(s);
    s = debug.clearOffer(s);
    s = debug.clearSelection(s);
    s = debug.clearChain(s);
    expect(s.bestChain).toBe(7);
    expect(s.bestMove).toBe(123);
    expect(s.moveScore).toBe(55);
    expect(s.phase).toBe("idle");
    expect(s.refillKinds).toEqual(Array(8).fill(""));
  });
});
