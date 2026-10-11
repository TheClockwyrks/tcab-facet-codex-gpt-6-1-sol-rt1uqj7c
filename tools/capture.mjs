/* global document, window, console */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173");
await page.waitForTimeout(1000);
await page.screenshot({ path: "showcase/title.png" });
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.screenshot({ path: "showcase/howto.png" });
await page.keyboard.press("Escape");
await page.keyboard.press("ArrowUp");
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
await page.screenshot({ path: "showcase/board.png" });
const recording = await page.evaluate(async () => {
  const { game, BACKGROUND } = await import("/src/game.ts");
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const old = document.getElementById("stage");
  const canvas = document.createElement("canvas");
  canvas.id = "capture";
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;";
  old.style.display = "none";
  document.body.appendChild(canvas);
  const engine = createEngine({
    canvas,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  const d = engine.debug;
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => "RACJBSM"[(r * 2 + c) % 7] + "0").join(
      " ",
    ),
  );
  engine.apply((s) => d.setScreen(d.loadBoard(s, rows), "playing"));
  // A real accepted swap ignites a worn corner and its earned cuts.
  engine.apply((s) => d.setGem(s, 1, 4, "R0b"));
  engine.apply((s) => d.setGem(s, 2, 4, "R0"));
  engine.apply((s) => d.setGem(s, 3, 4, "A0"));
  engine.apply((s) => d.setGem(s, 3, 3, "R0"));
  for (const [c, r] of [
    [3, 5],
    [4, 5],
    [4, 4],
    [5, 4],
    [5, 3],
    [6, 3],
    [6, 2],
    [5, 2],
  ])
    engine.apply((s) => d.setGem(s, c, r, "J3"));
  engine.apply((s) => d.setGem(s, 5, 3, "J3s"));
  for (let c = 0; c < 8; c++)
    engine.apply((s) =>
      d.setRefillKinds(
        s,
        c,
        Array.from(
          { length: 8 },
          (_, r) => "RACJBSM"[(r * 2 + c + 3) % 7],
        ).join(""),
      ),
    );
  await engine.advance(1);
  engine.startRecording();
  engine.apply((s) => d.requestSwap(s, 3, 3, 3, 4));
  await engine.advance(22);
  window.captureEngine = engine;
  window.captureAdvance = async (n) => engine.advance(n);
  window.captureStop = () => engine.stopRecording();
  return null;
});
void recording;
await page.screenshot({ path: "showcase/pressure.png" });
await page.evaluate(() => window.captureAdvance(218));
const replay = await page.evaluate(() => window.captureStop());
await writeFile("showcase/pressure.json.gz", gzipSync(JSON.stringify(replay)));
console.log(
  JSON.stringify({
    errors,
    frames: replay.frames.length,
    images: replay.images.length,
  }),
);
await browser.close();
