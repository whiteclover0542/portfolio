// 카드 1~5 통과 기준을 실제로 확인하기 위한 자동화 스크립트.
// Chrome DevTools Protocol의 WebAuthn 가상 인증기를 이용해 진짜 등록/로그인 의식을 수행하고,
// 부정 케이스(challenge 재사용, 남의 패스키, 다른 계정 지정)는 직접 fetch로 재현한다.
// 실행 결과는 콘솔에 출력하고, 스크린샷은 과제8/evidence/, 텍스트 로그는 과제8/evidence/log.md에 남긴다.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const evidenceDir = path.join(process.cwd(), "과제8", process.env.EVIDENCE_DIR || "evidence");
fs.mkdirSync(evidenceDir, { recursive: true });

const sections = [];
function record(title, text) {
  const block = `\n## ${title}\n\n\`\`\`\n${text}\n\`\`\`\n`;
  sections.push(block);
  console.log(`\n=== ${title} ===\n${text}`);
}

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

async function setPresence(cdp, authenticatorId, enabled) {
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled });
}

async function main() {
  // PW_CHANNEL=chrome 로 설치된 시스템 Chrome 사용 (playwright 번들 다운로드가 막힌 환경용)
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const context = await browser.newContext();
  const page = await context.newPage();

  let capturedLoginVerifyBody = null;
  page.on("request", (req) => {
    if (req.url().includes("/api/login-verify") && req.method() === "POST") {
      capturedLoginVerifyBody = req.postData();
    }
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await page.goto(BASE);

  // ---------------------------------------------------------------
  // 카드1: 로그인 전 상태 — 비공개 영역이 화면에 없고, API도 401
  // ---------------------------------------------------------------
  await page.waitForFunction(() => document.getElementById("private-content").hidden === true);
  await page.screenshot({ path: path.join(evidenceDir, "01-locked-public-private-split.png"), fullPage: true });
  const htmlBeforeLogin = await page.content();
  const leaksPrivateText = htmlBeforeLogin.includes("준비 중인 프로젝트 메모");
  record(
    "카드1: 로그인 전 페이지 소스에 비공개 내용 포함 여부",
    `포함됨(문제) = ${leaksPrivateText} (false여야 통과)`
  );

  const privateNoAuth = await page.evaluate(async () => {
    const r = await fetch("/api/private");
    return { status: r.status, body: await r.json() };
  });
  record("카드1: 비로그인 상태로 /api/private 직접 요청", JSON.stringify(privateNoAuth, null, 2));

  // ---------------------------------------------------------------
  // 카드2/3: Alice 계정 — 패스키 2개 등록
  // ---------------------------------------------------------------
  const va1 = await addAuthenticator(cdp); // alice의 노트북
  await page.fill("#pk-username", "alice-demo");

  page.once("dialog", (d) => d.accept("alice-노트북"));
  await page.click("#pk-register-btn");
  await page.waitForSelector("#private-content:not([hidden])", { timeout: 15000 });
  record("카드2: Alice 패스키#1 등록 상태 메시지", await page.locator("#pk-status").innerText());
  record("카드2: Alice 패스키#1 등록 직후 요청 로그", await page.locator("#pk-log").textContent());
  record("카드1: Alice 비공개 메모 (3개 이상)", await page.locator("#pk-notes").innerText());
  await page.screenshot({ path: path.join(evidenceDir, "02-alice-logged-in-private-visible.png"), fullPage: true });

  // register-options를 두 번 호출해 challenge가 매번 다른지 확인
  const twoRegOptions = await page.evaluate(async () => {
    const a = await (await fetch("/api/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice-demo" }),
    })).json();
    const b = await (await fetch("/api/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice-demo" }),
    })).json();
    return { challengeA: a.challenge, challengeB: b.challenge, same: a.challenge === b.challenge };
  });
  record("카드2: 등록용 challenge 두 번 요청 비교 (같으면 문제)", JSON.stringify(twoRegOptions, null, 2));

  // 등록 검증 실패(취소·위조 등으로 attestationResponse가 잘못된 경우) → 아무것도 저장되지 않아야 함
  const failedRegistration = await page.evaluate(async () => {
    await fetch("/api/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "cancel-test" }),
    });
    const r = await fetch("/api/register-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "cancel-test",
        attestationResponse: { id: "garbage", rawId: "garbage", type: "public-key", response: {} },
      }),
    });
    const verifyResult = { status: r.status, body: await r.json() };
    // 검증 실패 후 "cancel-test" 계정으로 로그인을 시도해서 credential이 하나도 저장되지 않았음을 확인
    // (0개면 login-options가 404 "등록된 패스키가 없습니다"를 돌려준다)
    const loginAttempt = await fetch("/api/login-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "cancel-test" }),
    });
    return { verifyResult, credentialSavedCheck: { status: loginAttempt.status, body: await loginAttempt.json() } };
  });
  record(
    "카드2: 등록 취소/위조 시나리오 — 검증 실패 응답과, 그 뒤에도 이 계정에 저장된 패스키가 0개임을 확인",
    JSON.stringify(failedRegistration, null, 2)
  );

  // 두 번째 패스키 (다른 기기 시뮬레이션)
  const va2 = await addAuthenticator(cdp, { transport: "usb" });
  await setPresence(cdp, va1, false); // "노트북은 지금 옆에 없다" 시뮬레이션
  page.once("dialog", (d) => d.accept("alice-폰"));
  await page.click("#pk-add-btn");
  await page.waitForFunction(
    () => document.getElementById("pk-status").textContent.includes("등록 완료"),
    { timeout: 15000 }
  );
  record("카드4: Alice 패스키#2(폰) 등록 상태", await page.locator("#pk-status").innerText());
  await setPresence(cdp, va1, true);

  const listWithTwo = await page.locator("#pk-list").innerText();
  record("카드4: 패스키 목록 (2개, 이름+등록일)", listWithTwo);
  await page.screenshot({ path: path.join(evidenceDir, "03-alice-two-passkeys-list.png"), fullPage: true });

  // 삭제 전 credential id들을 서버 응답에서 직접 확보 (증거·재사용 목적)
  const beforeDelete = await page.evaluate(async () => (await fetch("/api/passkeys")).json());
  record("카드4: 삭제 전 /api/passkeys 응답", JSON.stringify(beforeDelete, null, 2));
  const cred1 = beforeDelete.passkeys.find((p) => p.name === "alice-노트북");
  const cred2 = beforeDelete.passkeys.find((p) => p.name === "alice-폰");

  // ---------------------------------------------------------------
  // 카드3: 로그아웃 → 재로그인 (남은 인증기로)
  // ---------------------------------------------------------------
  // 로그아웃 전 세션 쿠키 값을 확보해둔다 (브라우저 fetch는 Cookie 헤더를 직접 못 바꾸므로
  // Node의 fetch로 별도 요청해서 "로그아웃한 옛 쿠키 재사용" 시나리오를 재현한다).
  const cookiesBeforeLogout = await context.cookies();
  const oldSessionCookie = cookiesBeforeLogout.find((c) => c.name === "pk_session");

  await page.click("#pk-logout-btn");
  await page.waitForFunction(() => document.getElementById("private-content").hidden === true);
  const afterLogoutSession = await page.evaluate(async () => (await fetch("/api/session")).json());
  record("카드3: 로그아웃 직후 /api/session", JSON.stringify(afterLogoutSession, null, 2));

  if (oldSessionCookie) {
    const reuseRes = await fetch(`${BASE}/api/private`, {
      headers: { Cookie: `pk_session=${oldSessionCookie.value}` },
    });
    record(
      "카드3: 로그아웃한 옛 세션 쿠키를 그대로 재사용해 /api/private 요청 (거절되어야 함)",
      JSON.stringify({ status: reuseRes.status, body: await reuseRes.json() }, null, 2)
    );
  }

  await page.fill("#pk-username", "alice-demo");
  await page.click("#pk-login-btn");
  await page.waitForSelector("#private-content:not([hidden])", { timeout: 15000 });
  record("카드3: 재로그인 성공 상태", await page.locator("#pk-status").innerText());
  const loginLog = await page.locator("#pk-log").textContent();
  record("카드3: 로그인 성공 시점 요청 로그", loginLog);

  // 방금 성공한 login-verify 요청 바디를 그대로 재전송 → challenge 재사용 거부 확인
  const replayResult = await page.evaluate(async (body) => {
    const r = await fetch("/api/login-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return { status: r.status, body: await r.json() };
  }, capturedLoginVerifyBody);
  record("카드3: 이미 성공 처리된 로그인 요청을 그대로 재전송 (challenge 재사용) 결과", JSON.stringify(replayResult, null, 2));

  // ---------------------------------------------------------------
  // 카드4: 패스키 하나 삭제 → 남은 것으로 로그인 가능 / 지운 것은 불가
  // ---------------------------------------------------------------
  page.once("dialog", (d) => d.accept()); // window.confirm
  await page.locator("#pk-list li", { hasText: "alice-노트북" }).locator("button").click();
  await page.waitForFunction(() => document.getElementById("pk-status").textContent.includes("삭제"));
  record("카드4: alice-노트북 패스키 삭제 후 상태", await page.locator("#pk-status").innerText());
  await page.screenshot({ path: path.join(evidenceDir, "04-after-delete-one-passkey.png"), fullPage: true });

  // 지운 패스키 id로 로그인 시도 (서버가 목록에서 못 찾아 거절하는지 직접 확인)
  const loginOptsForReplay = await page.evaluate(async () => {
    const r = await fetch("/api/login-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice-demo" }),
    });
    return r.json();
  });
  const deletedCredLoginAttempt = await page.evaluate(
    async ({ credId }) => {
      const r = await fetch("/api/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice-demo",
          assertionResponse: { id: credId, rawId: credId, type: "public-key", response: {} },
        }),
      });
      return { status: r.status, body: await r.json() };
    },
    { credId: cred1.id }
  );
  record(
    "카드4: 삭제된 패스키(alice-노트북) id로 로그인 시도 결과 (거절되어야 함)",
    JSON.stringify(deletedCredLoginAttempt, null, 2)
  );

  // 로그아웃 후, 남은 인증기(va2, 폰)만 활성화한 채 다시 로그인 → 성공해야 함
  await page.click("#pk-logout-btn");
  await page.waitForFunction(() => document.getElementById("private-content").hidden === true);
  await page.fill("#pk-username", "alice-demo");
  await page.click("#pk-login-btn");
  await page.waitForSelector("#private-content:not([hidden])", { timeout: 15000 });
  record("카드4: 남은 패스키(폰)로 재로그인 성공", await page.locator("#pk-status").innerText());
  await page.click("#pk-logout-btn");
  await page.waitForFunction(() => document.getElementById("private-content").hidden === true);

  // ---------------------------------------------------------------
  // 카드5: 두 번째 계정(Bob) 생성 + 교차 접근 시도
  // ---------------------------------------------------------------
  const va3 = await addAuthenticator(cdp, { transport: "usb" });
  await setPresence(cdp, va2, false);
  await page.fill("#pk-username", "bob-demo");
  page.once("dialog", (d) => d.accept("bob-노트북"));
  await page.click("#pk-register-btn");
  await page.waitForSelector("#private-content:not([hidden])", { timeout: 15000 });
  record("카드5: Bob 계정 등록/로그인 상태", await page.locator("#pk-status").innerText());
  record("카드5: Bob 비공개 메모 (Alice와 다름)", await page.locator("#pk-notes").innerText());
  const bobPasskeys = await page.evaluate(async () => (await fetch("/api/passkeys")).json());
  const bobCred = bobPasskeys.passkeys[0];
  await setPresence(cdp, va2, true);

  await page.click("#pk-logout-btn");
  await page.waitForFunction(() => document.getElementById("private-content").hidden === true);

  // (a) alice의 credential id로 bob 계정에 로그인 시도 → 거절
  // 먼저 bob-demo용 로그인 challenge를 정식으로 발급받은 뒤(진짜 로그인 시도처럼),
  // 그 challenge에 대해 다른 사람(alice)의 credential id로 서명한 척 응답을 보낸다.
  const aliceIntoBob = await page.evaluate(
    async ({ credId }) => {
      await fetch("/api/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "bob-demo" }),
      });
      const r = await fetch("/api/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "bob-demo",
          assertionResponse: { id: credId, rawId: credId, type: "public-key", response: {} },
        }),
      });
      return { status: r.status, body: await r.json() };
    },
    { credId: cred2.id }
  );
  record("카드5: Alice의 패스키 id로 bob-demo 계정 로그인 시도 (거절되어야 함)", JSON.stringify(aliceIntoBob, null, 2));

  // (b) bob의 credential id로 alice 계정에 로그인 시도 → 거절 (반대 방향)
  const bobIntoAlice = await page.evaluate(
    async ({ credId }) => {
      await fetch("/api/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice-demo" }),
      });
      const r = await fetch("/api/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice-demo",
          assertionResponse: { id: credId, rawId: credId, type: "public-key", response: {} },
        }),
      });
      return { status: r.status, body: await r.json() };
    },
    { credId: bobCred.id }
  );
  record("카드5: Bob의 패스키 id로 alice-demo 계정 로그인 시도 (반대 방향, 거절되어야 함)", JSON.stringify(bobIntoAlice, null, 2));

  // (c) alice로 정상 로그인 후, 쿼리스트링에 다른 계정을 지정해도 내 자료만 오는지 확인
  await setPresence(cdp, va3, false);
  await page.fill("#pk-username", "alice-demo");
  await page.click("#pk-login-btn");
  await page.waitForSelector("#private-content:not([hidden])", { timeout: 15000 });
  const crossQuery = await page.evaluate(async () => {
    const mine = await (await fetch("/api/private")).json();
    const spoofed = await (await fetch("/api/private?username=bob-demo")).json();
    const spoofedBody = await (
      await fetch("/api/private", {
        method: "GET",
        headers: { "X-Debug-Username": "bob-demo" },
      })
    ).json();
    return { mine, spoofedByQuery: spoofed, spoofedByHeader: spoofedBody };
  });
  record(
    "카드5: alice 세션으로 로그인한 채 쿼리·헤더에 bob-demo를 지정해도 내(alice) 자료만 오는지",
    JSON.stringify(crossQuery, null, 2)
  );
  await setPresence(cdp, va3, true);

  await browser.close();

  const outPath = path.join(evidenceDir, "log.md");
  fs.writeFileSync(outPath, `# 패스키 흐름 자동 검증 로그\n\n실행 시각: ${new Date().toISOString()}\n${sections.join("\n")}`, "utf8");
  console.log(`\n\n전체 로그 저장됨: ${outPath}`);
}

main().catch((err) => {
  console.error("테스트 실패:", err);
  process.exit(1);
});
