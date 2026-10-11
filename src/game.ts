export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
}

import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { initial, advance, lastFall } from "./model";
import { action, pointer } from "./controls";
import { debug } from "./debug";
import { render } from "./render";
export type FacetDebugApi = typeof debug;
export interface VisualStep {
  readonly swap: { readonly a: CellRef; readonly b: CellRef } | null;
  readonly seed: readonly number[] | null;
  readonly before: readonly GemState[];
  readonly cleared: readonly {
    readonly gem: GemState;
    readonly wave: number;
  }[];
  readonly created: readonly number[];
}
export interface AssetSet {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
// Presentation history never participates in acceptance, scoring, or gravity.
export interface FacetState {
  readonly assets: AssetSet | null;
  readonly visual: VisualStep | null;
  readonly opening: number;
}
export const BACKGROUND = "#101d24";
export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const imageNames = [
      "board-frame",
      "brilliant",
      "star",
      ...C.GEM_KINDS.flatMap((k) =>
        Array.from({ length: 4 }, (_, i) => `${k}-${i}`),
      ),
      ...Array.from({ length: 4 }, (_, i) => `prism-${i}`),
      ...C.GEM_KINDS.flatMap((k) =>
        Array.from({ length: 6 }, (_, i) => `break/${k}/${i}`),
      ),
      ...Array.from({ length: 8 }, (_, i) => `prism-turn/${i}`),
    ];
    const images = Object.fromEntries(
      await Promise.all(
        imageNames.map(async (name) => [
          name,
          await api.assets.loadImage(`gems/${name}.png`),
        ]),
      ),
    );
    const systems = Object.fromEntries(
      await Promise.all(
        ["clear", "flawed", "cut", "aura"].map(async (name) => [
          name,
          JSON.parse(
            await (await api.assets.load(`fx/${name}/system.json`)).text(),
          ) as ParticleSystem,
        ]),
      ),
    );
    await Promise.all(
      Object.values(C.CUES).map((name) =>
        api.audio.load(
          name,
          `audio/${name === "clear" ? "shatter" : name}.wav`,
        ),
      ),
    );
    await Promise.all(
      Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
        api.audio.load(`ladder-${i + 1}`, `audio/ladder-${i + 1}.wav`),
      ),
    );
    await Promise.all(
      ["title", "play"].map((name) =>
        api.audio.load(`music-${name}`, `audio/${name}.wav`),
      ),
    );
    for (const key of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "Board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    api.diagnostics.register("Target", (s) => C.LEVEL_TARGET_STEP * s.level);
    api.diagnostics.register("Multiplier", (s) =>
      Math.min(s.chainStep, C.MAX_MULTIPLIER),
    );
    api.diagnostics.register("Fall", (s) => lastFall(s));
    api.diagnostics.register("Legal swap", (s) => debug.snapshot(s).legalSwap);
    api.diagnostics.register(
      "Selection / offer",
      (s) =>
        `${s.selection ? `${s.selection.col},${s.selection.row}` : "—"} / ${s.offer ? `${s.offer.col},${s.offer.row}` : "—"}`,
    );
    api.diagnostics.register(
      "Pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [{ ...initial(), assets: { images, systems } }, debug];
  },
  update(state, api, dt) {
    let next: FacetState = { ...state, simTime: state.simTime + dt };
    const cues = new Set<string>();
    const collect = (before: FacetState, after: FacetState) => {
      if (
        after.selection &&
        JSON.stringify(before.selection) !== JSON.stringify(after.selection)
      )
        cues.add(C.CUES.select);
      if (after.phase === "swapping" && before.phase !== "swapping")
        cues.add(C.CUES.swap);
      if (
        after.refusal &&
        after.refusal !== before.refusal &&
        after.refusal.timer === 0
      )
        cues.add(C.CUES.refuse);
    };
    const presses = Object.fromEntries(
      C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
    );
    if (presses.mute) api.audio.setMuted(!api.audio.muted());
    const originalScreen = next.screen;
    for (const a of ["up", "down", "confirm", "pause", "back"])
      if (
        presses[a] &&
        (!(a === "back") ||
          originalScreen === "howto" ||
          originalScreen === "gameover")
      )
        next = action(next, a);
    for (const p of api.input.pointerSamples())
      if (p.primary && (p.type === "move" || p.button === "primary")) {
        const before = next;
        next = pointer(next, p.type, p.x, p.y, p.device);
        collect(before, next);
      }
    const before = next;
    // Consume time at transition boundaries so a long frame can include several steps.
    let left = dt;
    while (left > 1e-9) {
      const quantum = Math.min(left, 1 / 120);
      const prior = next;
      next = advance(next, quantum);
      left -= quantum;
      if (
        next.phase === "resolving" &&
        (prior.phase === "swapping" || next.chainStep !== prior.chainStep)
      ) {
        cues.add(C.CUES.clear);
        if (next.visual?.created.length) cues.add(C.CUES.cut);
        const cleared = next.visual?.cleared ?? [];
        if (
          prior.board.cells.some(
            (g) =>
              g.strain === C.MAX_STRAIN - 1 &&
              !cleared.some(
                (c) => c.gem.col === g.col && c.gem.row === g.row,
              ) &&
              cleared.some(
                (c) =>
                  Math.abs(c.gem.col - g.col) + Math.abs(c.gem.row - g.row) ===
                  1,
              ),
          )
        )
          cues.add(C.CUES.flaw);
      }
      const landAt =
        prior.lastWaves * C.WAVE_SECONDS +
        lastFall(prior) * C.FALL_SECONDS_PER_ROW;
      if (
        prior.phase === "resolving" &&
        prior.stepTimer < landAt &&
        next.stepTimer >= landAt &&
        lastFall(prior) > C.LAND_MIN_ROWS
      )
        cues.add(C.CUES.land);
    }
    if (before.screen !== next.screen && next.screen === "levelclear")
      cues.add(C.CUES.levelUp);
    if (before.screen !== next.screen && next.screen === "gameover")
      cues.add(C.CUES.gameOver);
    for (const cue of cues) {
      api.audio.play(cue);
      if (cue === C.CUES.clear)
        api.audio.play(
          `ladder-${Math.max(1, Math.min(next.chainStep || next.bestChain, C.MAX_MULTIPLIER))}`,
        );
    }
    const theme =
      next.screen === "title" || next.screen === "howto" ? "title" : "play";
    api.audio.stop(`music-${theme === "title" ? "play" : "title"}`);
    api.audio.loop(`music-${theme}`);
    const p = api.input.pointer();
    return {
      ...next,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      muted: api.audio.muted(),
    };
  },
  render,
};
