import type { RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import type { GemState } from "./game";
import * as C from "./constants";
import { type State, cellX, cellY, index, same } from "./model";
import { targets, menuItems, offeredGem } from "./controls";
const gold = "#dec18a",
  ink = "#f4eddf",
  muted = "#95acae";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 18,
  color = ink,
  align: CanvasTextAlign = "left",
  serif = false,
) {
  ctx.font = `${serif ? "normal" : "500"} ${size}px ${serif ? "Georgia, serif" : '"Trebuchet MS", sans-serif'}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#40534f",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#15262ce8";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#776c4c";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: State,
  name: string,
  x: number,
  y: number,
  scale = 1,
) {
  const image = s.assets?.images[name];
  if (image)
    ctx.drawImage(
      image,
      x - 32 * scale,
      y - 32 * scale,
      64 * scale,
      64 * scale,
    );
}
function gem(
  ctx: CanvasRenderingContext2D,
  s: State,
  g: DeepReadonly<GemState>,
  x: number,
  y: number,
) {
  const turn = `prism-turn/${Math.floor(s.simTime * 8) % 8}`;
  if (g.cut === "prism" && g.strain === 0) sprite(ctx, s, turn, x, y);
  else {
    sprite(ctx, s, `${g.kind ?? "prism"}-${g.strain}`, x, y);
    if (g.cut === "prism") {
      ctx.globalAlpha = 0.3;
      sprite(ctx, s, turn, x, y);
      ctx.globalAlpha = 1;
    }
  }
  if (g.cut === "brilliant" || g.cut === "star") sprite(ctx, s, g.cut, x, y);
  if (g.cut !== "plain")
    effect(
      ctx,
      s,
      "aura",
      x,
      y,
      (s.simTime + g.col * 0.1 + g.row * 0.17) % 1.2,
      index(g),
    );
}
function effect(
  ctx: CanvasRenderingContext2D,
  s: State,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  const system = s.assets?.systems[name];
  if (!system || age < 0 || age > 1.3) return;
  const sim = new ParticleSimulator(system as ParticleSystem, {
    seed: seed + 71 + s.score * 7,
  });
  let ms = age * 1000;
  while (ms > 0) {
    const dt = Math.min(ms, 1000 / 60);
    sim.step(dt);
    ms -= dt;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    const [r, g, b] = p.color;
    ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${p.opacity})`;
    const radius = Math.max(0.4, p.size);
    ctx.beginPath();
    ctx.arc(x + p.position[0], y - p.position[1], radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function field(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(
    C.STAGE_CX,
    330,
    20,
    C.STAGE_CX,
    330,
    780,
  );
  bg.addColorStop(0, "#283b3c");
  bg.addColorStop(1, "#101b23");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#293a3b";
  ctx.lineWidth = 1;
  for (let x = -300; x < 1500; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 600, C.STAGE_H);
    ctx.stroke();
  }
  for (const x of [40, 1240]) {
    rule(ctx, x, 32, 1);
    ctx.fillStyle = "#817451";
    ctx.fillRect(x, 32, 1, 656);
  }
  text(ctx, "F / 01", 76, 46, 12, gold);
  text(ctx, "THE LAPIDARY COLLECTION", 1204, 46, 12, muted, "right");
  text(ctx, C.TITLE_TEXT, 76, 691, 13, gold);
  text(ctx, "M  SOUND", 1204, 691, 12, muted, "right");
}
function board(ctx: CanvasRenderingContext2D, s: State) {
  if (!s.board.cells.length) return;
  const frame = s.assets?.images["board-frame"];
  if (frame) ctx.drawImage(frame, C.BOARD_CX - 304, C.BOARD_CY - 304);
  ctx.save();
  ctx.beginPath();
  ctx.rect(C.BOARD_CX - 288, C.BOARD_CY - 288, 576, 576);
  ctx.clip();
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  // Old positions remain visible until their wave breaks.
  if (s.phase === "resolving" && s.visual)
    for (const c of s.visual.cleared) {
      const age = s.stepTimer - c.wave * C.WAVE_SECONDS;
      const x = cellX(c.gem.col),
        y = cellY(c.gem.row);
      if (age < 0) gem(ctx, s, c.gem, x, y);
      else if (age < 0.3 && c.gem.kind)
        sprite(
          ctx,
          s,
          `break/${c.gem.kind}/${Math.min(5, Math.floor(age / 0.05))}`,
          x,
          y,
        );
    }
  if (s.phase === "resolving" && s.visual && s.stepTimer < shatter) {
    for (const old of s.visual.before) {
      if (!s.visual.cleared.some((c) => same(c.gem, old)))
        gem(ctx, s, old, cellX(old.col), cellY(old.row));
    }
  }
  for (let i = 0; i < s.board.cells.length; i++) {
    const original = s.board.cells[i];
    const g = s.offer ? offeredGem(s, i) : original;
    let x = cellX(original.col),
      y = cellY(original.row);
    if (s.phase === "swapping" && s.visual?.swap) {
      const { a, b } = s.visual.swap;
      if (same(original, a) || same(original, b)) {
        const from = same(original, a) ? b : a;
        const t = Math.min(1, s.swapTimer / C.SWAP_SECONDS);
        const ease = t * t * (3 - 2 * t);
        x = cellX(from.col) + (x - cellX(from.col)) * ease;
        y = cellY(from.row) + (y - cellY(from.row)) * ease;
      }
    }
    if (s.phase === "resolving") {
      if (s.stepTimer < shatter) continue;
      const duration = original.fell * C.FALL_SECONDS_PER_ROW;
      if (duration > 0) {
        const t = Math.min(1, Math.max(0, (s.stepTimer - shatter) / duration));
        y -= original.fell * C.CELL_PITCH * (1 - t * t);
      }
    } else if (s.opening > 0) {
      const elapsed = C.GRID_ROWS * C.FALL_SECONDS_PER_ROW - s.opening;
      const duration = original.fell * C.FALL_SECONDS_PER_ROW;
      const t = Math.min(1, elapsed / duration);
      y -= original.fell * C.CELL_PITCH * (1 - t * t);
    }
    gem(ctx, s, g, x, y);
  }
  ctx.restore();
  if (s.phase === "resolving" && s.visual) {
    for (const c of s.visual.cleared) {
      const age = s.stepTimer - c.wave * C.WAVE_SECONDS;
      effect(
        ctx,
        s,
        c.gem.strain === C.MAX_STRAIN ? "flawed" : "clear",
        cellX(c.gem.col),
        cellY(c.gem.row),
        age,
        index(c.gem),
      );
    }
    for (const i of s.visual.created)
      effect(
        ctx,
        s,
        "cut",
        cellX(i % C.GRID_COLS),
        cellY(Math.floor(i / C.GRID_COLS)),
        s.stepTimer,
        i,
      );
  }
  if (s.selection) {
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      cellX(s.selection.col) - 33,
      cellY(s.selection.row) - 33,
      66,
      66,
    );
  }
  if (s.offer) {
    ctx.strokeStyle = "#a3e7d0";
    ctx.lineWidth = 2;
    ctx.strokeRect(cellX(s.offer.col) - 33, cellY(s.offer.row) - 33, 66, 66);
  }
  if (s.refusal)
    for (const c of [s.refusal.a, s.refusal.b]) {
      ctx.strokeStyle = "#ff8790";
      ctx.lineWidth = 3;
      ctx.strokeRect(cellX(c.col) - 32, cellY(c.row) - 32, 64, 64);
    }
}
function button(
  ctx: CanvasRenderingContext2D,
  t: { x: number; y: number; w: number; h: number },
  label: string,
  active: boolean,
) {
  ctx.fillStyle = active ? "#dbc08a" : "#192b31";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = active ? "#fff0cb" : "#59645a";
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + t.h / 2 + 7,
    20,
    active ? "#192a2c" : ink,
    "center",
  );
  if (active) {
    text(ctx, "›", t.x + 24, t.y + t.h / 2 + 8, 25, "#4c4b37");
    text(ctx, "‹", t.x + t.w - 24, t.y + t.h / 2 + 8, 25, "#4c4b37");
  }
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  text(ctx, C.HUD_SCORE_LABEL, 365, 48, 12, gold);
  text(ctx, s.score.toLocaleString(), 365, 79, 27, ink);
  text(
    ctx,
    `${C.HUD_LEVEL_LABEL}  ${String(s.level).padStart(2, "0")}`,
    640,
    48,
    13,
    gold,
    "center",
  );
  ctx.fillStyle = "#0c1a21";
  ctx.fillRect(550, 64, 180, 8);
  ctx.fillStyle = gold;
  ctx.fillRect(
    550,
    64,
    180 * Math.min(1, s.levelScore / (C.LEVEL_TARGET_STEP * s.level)),
    8,
  );
  text(
    ctx,
    `${s.levelScore} / ${C.LEVEL_TARGET_STEP * s.level}`,
    640,
    91,
    12,
    muted,
    "center",
  );
  if (s.phase === "resolving") {
    text(ctx, C.HUD_CHAIN_LABEL, 911, 48, 12, gold, "right");
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      911,
      81,
      28,
      gold,
      "right",
    );
  }
  text(ctx, "MAKE A LINE.", 78, 245, 24, ink, "left", true);
  text(ctx, "LEAVE A FLAW.", 78, 278, 24, gold, "left", true);
  rule(ctx, 78, 303, 198);
  text(ctx, "Swap neighboring stones.", 78, 339, 15, muted);
  text(ctx, "Three of a kind shatter.", 78, 363, 15, muted);
  text(ctx, "PRESSURE", 1000, 249, 12, gold);
  for (let i = 0; i < 4; i++) {
    sprite(ctx, s, `ruby-${i}`, 1014 + i * 48, 292, 0.65);
    text(
      ctx,
      ["CLEAN", "I", "II", "FLAW"][i],
      1014 + i * 48,
      333,
      10,
      i === 3 ? gold : muted,
      "center",
    );
  }
  text(ctx, "Flawed stones join a clear", 1000, 367, 14, muted);
  text(ctx, "beside them. Double points.", 1000, 389, 14, muted);
  rule(ctx, 1000, 413, 204);
  text(ctx, "THE CUTS", 1000, 445, 12, gold);
  for (const [i, n] of ["brilliant", "star", "prism"].entries()) {
    gem(
      ctx,
      s,
      {
        col: 0,
        row: i,
        kind: n === "prism" ? null : "beryl",
        cut: n as "brilliant" | "star" | "prism",
        strain: 0,
        fell: 0,
      },
      1015,
      486 + i * 66,
    );
    text(ctx, n.toUpperCase(), 1062, 481 + i * 66, 13, ink);
    text(
      ctx,
      ["Clears its ring", "Row + column", "Every matching kind"][i],
      1062,
      501 + i * 66,
      12,
      muted,
    );
  }
  text(ctx, "HOLD → OFFER → RELEASE", 640, 712, 12, muted, "center");
  const t = targets(s)[0];
  button(ctx, t, C.PAUSE_LABEL, false);
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (s.screen === "playing") {
    board(ctx, s);
    hud(ctx, s);
    return;
  }
  if (["paused", "levelclear", "gameover"].includes(s.screen)) {
    board(ctx, s);
    ctx.fillStyle = "#0b1723dc";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    panel(ctx, 414, 180, 452, 418);
  }
  if (s.screen === "title") {
    text(
      ctx,
      "AN EXERCISE IN BEAUTIFUL DESTRUCTION",
      640,
      129,
      13,
      gold,
      "center",
    );
    text(ctx, C.TITLE_TEXT, 640, 280, 112, ink, "center", true);
    rule(ctx, 480, 306, 320, gold);
    text(ctx, C.TAGLINE_TEXT, 640, 349, 17, gold, "center");
    for (const [i, k] of C.GEM_KINDS.entries()) {
      sprite(ctx, s, `${k}-0`, 244 + i * 132, 625, 0.8);
    }
    text(
      ctx,
      "SEVEN STONES. EVERY CLEAR LEAVES ITS MARK.",
      640,
      674,
      12,
      muted,
      "center",
    );
    // Engraved diamond ornaments keep the title's field open.
    for (const x of [225, 1055]) {
      ctx.strokeStyle = "#6c6c53";
      ctx.beginPath();
      ctx.moveTo(x, 215);
      ctx.lineTo(x + 48, 263);
      ctx.lineTo(x, 311);
      ctx.lineTo(x - 48, 263);
      ctx.closePath();
      ctx.stroke();
      sprite(ctx, s, "prism-0", x, 263, 1.1);
    }
  } else if (s.screen === "howto") {
    text(ctx, "THE ART OF PRESSURE", 80, 122, 44, ink, "left", true);
    text(
      ctx,
      "A stone remembers every line that breaks beside it.",
      80,
      160,
      19,
      gold,
    );
    const columns = [
      {
        x: 80,
        title: "01 / THE MOVE",
        lines: [
          "Seven kinds of gem fill the bench. Take hold of one",
          "with a mouse, pen, or finger. Carry it onto a neighbor",
          "and let go. Bring it back to cancel the offer.",
          "",
          "Three or more alike in a line shatter. A swap that",
          "breaks nothing is refused. Stones fall into the gaps;",
          "another line begins a chain, worth more at each step.",
        ],
      },
      {
        x: 665,
        title: "02 / THE PRESSURE",
        lines: [
          "Every gem beside a clear takes strain. Three hits",
          "leave a flaw: a cracked-through stone that shatters",
          "with any clear it touches, and earns double points.",
          "",
          "Four in a line leave a brilliant: it breaks its ring.",
          "Five leave a prism: swap it to clear every matching kind.",
          "Crossed lines leave a star: it clears a row and column.",
        ],
      },
    ];
    for (const col of columns) {
      rule(ctx, col.x, 197, 510);
      text(ctx, col.title, col.x, 232, 15, gold);
      col.lines.forEach((l, i) => text(ctx, l, col.x, 272 + i * 27, 17, ink));
    }
    rule(ctx, 80, 481, 1120);
    text(ctx, "03 / THE ROUND", 80, 516, 15, gold);
    text(
      ctx,
      "Reach the level target to open the next bench. The round ends when no productive move remains.",
      80,
      553,
      17,
      ink,
    );
    text(
      ctx,
      "Arrows: menus  ·  Enter / Space: choose  ·  Esc / P: pause  ·  M: mute  ·  Esc: back",
      320,
      650,
      15,
      muted,
    );
    button(ctx, targets(s)[0], C.BACK_LABEL, false);
    return;
  } else {
    const heading =
      s.screen === "paused"
        ? C.PAUSED_TITLE_TEXT
        : s.screen === "levelclear"
          ? C.LEVELCLEAR_TITLE_TEXT
          : C.GAMEOVER_TITLE_TEXT;
    text(
      ctx,
      heading,
      640,
      265,
      s.screen === "gameover" ? 34 : 42,
      ink,
      "center",
      true,
    );
    if (s.screen === "paused")
      text(ctx, "The bench can wait.", 640, 318, 18, gold, "center");
    if (s.screen === "levelclear") {
      text(
        ctx,
        `${C.HUD_LEVEL_LABEL} ${s.level}  /  COMPLETE`,
        640,
        307,
        14,
        gold,
        "center",
      );
      text(
        ctx,
        `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
        640,
        350,
        14,
        muted,
        "center",
      );
    }
    if (s.screen === "gameover") {
      text(
        ctx,
        `${C.HUD_SCORE_LABEL}  ${s.score}`,
        640,
        316,
        26,
        gold,
        "center",
      );
      text(
        ctx,
        `${C.HUD_LEVEL_LABEL}  ${s.level}`,
        640,
        352,
        14,
        muted,
        "center",
      );
    }
  }
  const items = menuItems(s.screen);
  targets(s).forEach((t, i) => button(ctx, t, items[i], s.menuIndex === i));
  text(
    ctx,
    "↑ ↓  CHOOSE     ENTER  CONFIRM     M  SOUND",
    640,
    screenFooter(s.screen),
    11,
    muted,
    "center",
  );
}
function screenFooter(screen: string) {
  return screen === "title" ? 590 : 627;
}
