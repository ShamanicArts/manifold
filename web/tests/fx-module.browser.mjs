import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const address = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/fx-module.html", address).href);
  const rect = (id) =>
    page.locator(`#widget-${id}`).evaluate((
      element,
    ) => [
      element.style.left,
      element.style.top,
      element.style.width,
      element.style.height,
    ]);
  const clickSlider = async (id, fraction) => {
    const slider = page.locator(`#widget-${id}`);
    const box = await slider.boundingBox();
    await slider.click({ position: { x: box.width * fraction, y: box.height / 2 } });
  };
  const selectEffect = async (index) => {
    const dropdown = page.locator("#widget-type_dropdown");
    await dropdown.focus();
    await dropdown.press("Home");
    for (let n = 0; n < index; n++) await dropdown.press("ArrowDown");
  };
  assert.deepEqual(await rect("fxRoot"), ["0px", "0px", "472px", "208px"]);
  assert.deepEqual(await rect("xy_pad"), ["10px", "10px", "226px", "188px"]);
  assert.deepEqual(await rect("type_dropdown"), [
    "242px",
    "10px",
    "220px",
    "20px",
  ]);
  assert.deepEqual(await rect("param5"), ["242px", "174px", "220px", "18px"]);
  assert.equal(await page.locator(".project-slider input[type=range]").count(), 0);
  assert.equal(await page.locator("#widget-param1 canvas").count(), 1);
  const sliderPixels = await page.locator("#widget-param1 canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const y = Math.round(canvas.height / 2);
    return [0.25, 0.75].map((fraction) =>
      [...context.getImageData(Math.round(canvas.width * fraction), y, 1, 1).data]);
  });
  assert.ok(sliderPixels[0][1] > sliderPixels[1][1], "filled portion uses the source color");
  assert.equal(await page.locator("#widget-type_dropdown").getAttribute("data-option-count"), "21");
  assert.equal(await page.locator("#widget-type_dropdown canvas").count(), 1);
  await page.locator("#widget-type_dropdown").click();
  const effectOverlay = page.locator('.project-dropdown-overlay[aria-label="type dropdown options"]');
  assert.equal(await effectOverlay.isVisible(), true);
  const overlayScale = await effectOverlay.evaluate((element) =>
    element.getBoundingClientRect().height / element.clientHeight);
  await effectOverlay.click({ position: { x: 30, y: 47 * overlayScale } });
  assert.equal(await page.locator("#widget-type_dropdown").getAttribute("data-value"), "1");
  assert.equal(await page.locator("#widget-filter_graph").isVisible(), false);

  await selectEffect(6);
  assert.equal(await page.locator("#widget-filter_graph").isVisible(), true);
  assert.equal(
    await page.locator("#widget-visual_mode_dots button").count(),
    2,
  );
  await page.locator("[data-mode=xy]").click();
  assert.equal(await page.locator("#widget-xy_pad").isVisible(), true);
  await page.locator("[data-view=compact]").click();
  assert.deepEqual(await rect("xy_pad"), ["10px", "10px", "216px", "188px"]);
  assert.equal(await page.locator("#widget-type_dropdown").isVisible(), false);
  await page.locator("[data-view=split]").click();
  await selectEffect(0);
  await clickSlider("param1", .83);
  await page.locator("#widget-param1").focus();
  await page.locator("#widget-param1").press("ArrowLeft");
  assert.equal(Number(await page.locator("#widget-param1").getAttribute("aria-valuenow")).toFixed(2), "0.82");
  await page.locator("#widget-param1").press("ArrowRight");
  await selectEffect(7);
  assert.equal(await page.locator("#widget-param3").isVisible(), false);
  await selectEffect(0);
  assert.equal(Number(await page.locator("#widget-param1").getAttribute("aria-valuenow")).toFixed(2), "0.83");
  const hostDownloadPromise = page.waitForEvent("download");
  await page.locator("#save-host-state").click();
  const hostDownload = await hostDownloadPromise;
  const hostPath = await hostDownload.path();
  const hostProject = JSON.parse(await readFile(hostPath, "utf8"));
  assert.equal(hostProject.id, "manifold.standalone-fx-module");
  assert.equal(hostProject.typeParameters["0"][0].toFixed(2), "0.83");
  assert.equal(hostProject.signal.initialParameters.length, 7);
  await clickSlider("param1", .2);
  await page.locator("#open-state").setInputFiles(hostPath);
  await page.waitForFunction(() =>
    Number(document.querySelector("#widget-param1").getAttribute("aria-valuenow")).toFixed(2) === "0.83"
  );
  const editor = await browser.newPage({ viewport: { width: 500, height: 246 } });
  await editor.addInitScript(() => {
    window.__ipcMessages = [];
    window.ipc = { postMessage: (message) => window.__ipcMessages.push(JSON.parse(message)) };
  });
  await editor.goto(new URL("/fx-module.html?editor=1", address).href);
  assert.equal((await editor.locator("#plugin-shell").boundingBox()).width, 472);
  assert.equal(await editor.locator("#widget-param1 canvas").count(), 1);
  assert.equal(await editor.locator(".project-slider input[type=range]").count(), 0);
  assert.equal(await editor.locator(".topbar").isVisible(), false);
  const editorSlider = editor.locator("#widget-param1");
  const editorBox = await editorSlider.boundingBox();
  await editorSlider.click({ position: { x: editorBox.width * .7, y: editorBox.height / 2 } });
  const messages = await editor.evaluate(() => window.__ipcMessages);
  assert.equal(messages.at(-1).kind, "parameter");
  assert.equal(messages.at(-1).id, 2);
  assert.ok(Math.abs(messages.at(-1).value - .7) < .02);
  await editor.evaluate((document) => window.manifoldEditorReceive(document), hostProject);
  assert.equal(Number(await editorSlider.getAttribute("aria-valuenow")).toFixed(2), "0.83");
  await editor.screenshot({ path: "/tmp/manifold-fx-editor-mode.png" });
  await editor.close();
  await page.locator("#settings-toggle").click();
  assert.equal(await page.locator("#settings-overlay").isVisible(), true);
  await page.locator("#settings-close").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save-state").click();
  const download = await downloadPromise;
  await clickSlider("param1", .2);
  await page.locator("#open-state").setInputFiles(await download.path());
  await page.waitForFunction(() =>
    Number(document.querySelector("#widget-param1").getAttribute("aria-valuenow")).toFixed(2) === "0.83"
  );
  assert.equal(Number(await page.locator("#widget-param1").getAttribute("aria-valuenow")).toFixed(2), "0.83");
  await clickSlider("mix_knob", .8);
  await page.locator("#audio-toggle").click();
  await page.waitForFunction(() =>
    document.getElementById("engine-indicator").textContent === "Rust/Wasm live"
  );
  await page.waitForTimeout(700);
  assert.notEqual(await page.locator("#output-db").textContent(), "−∞ dB");
  await selectEffect(8);
  await page.locator("#audio-toggle").click();
  assert.deepEqual(errors, []);

  await selectEffect(0);
  await page.locator("#widget-type_dropdown").evaluate((element) => element.blur());
  await page.screenshot({ path: "/tmp/manifold-fx-compact-slider-port.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.scrollWidth > innerWidth
    ),
    false,
  );
  console.log(
    "Standalone FX project UI: source geometry, modes, graph, state, and live Rust/Wasm audio verified.",
  );
} finally {
  await browser.close();
  await server.close();
}
