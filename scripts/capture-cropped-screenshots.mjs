// 제출용으로 PRIVATE 구역만 잘라서 찍는 스크린샷 스크립트.
// 실제 배포 주소에 대해 가상 인증기로 등록/로그인/기기추가/삭제를 수행하며
// 그때그때 #private-zone 요소만 캡처한다 (풀페이지 스크린샷 대신).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TEST_BASE_URL || "https://whiteclover-portfolio.vercel.app";
const outDir = path.join(process.cwd(), "과제8", "evidence-prod", "cropped");
fs.mkdirSync(outDir, { recursive: true });

async function addAuthenticator(cdp, opts = {}) {
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      ...opts,
    },
  });
  return authenticatorId;
}

async function shot(page, name) {
  await page.locator("#private-zone").screenshot({ path: path.join(outDir, name) });
  console.log("saved", name);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 720, height: 1000 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  const username = `crop-demo-${Date.now().toString(36)}`;
  await page.goto(BASE);

  // 1. 잠긴 상태
  await page.waitForFunction(() => document.getElementById("private-content").hidden === true);
  await shot(page, "01-locked.png");

  // 2. 첫 패스키 등록 -> 바로 로그인됨
  const va1 = await addAuthenticator(cdp);
  await page.fill("#pk-username", username);
  page.once("dialog", (d) => d.accept("내-노트북"));
  await page.click("#pk-register-btn");
  await page.waitForSelector("#private-content:not([hidden])", { timeout: 15000 });
  await shot(page, "02-registered-logged-in.png");

  // 3. 두 번째 패스키 등록(기기 분실 대비)
  const va2 = await addAuthenticator(cdp, { transport: "usb" });
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId: va1, enabled: false });
  page.once("dialog", (d) => d.accept("내-폰"));
  await page.click("#pk-add-btn");
  await page.waitForFunction(() => document.getElementById("pk-status").textContent.includes("등록 완료"), {
    timeout: 15000,
  });
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId: va1, enabled: true });
  await shot(page, "03-two-passkeys.png");

  // 4. 하나 삭제
  page.once("dialog", (d) => d.accept());
  await page.locator("#pk-list li", { hasText: "내-노트북" }).locator("button").click();
  await page.waitForFunction(() => document.getElementById("pk-status").textContent.includes("삭제"));
  await shot(page, "04-after-delete-one.png");

  await browser.close();
  console.log("done ->", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
