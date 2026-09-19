#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const MARK_START = "<!-- regen:start -->";
const MARK_END = "<!-- regen:end -->";
const DAY_MS = 86400000;
const PEOPLE_WORDS = ["협업", "동료", "팀", "피드백", "함께"];

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const has = (v) => typeof v === "string" && v.trim() !== "";
const pct = (a, b) => (b === 0 ? 0 : Math.round((a * 100) / b));
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function dayNumber(date, where) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
    throw new Error(`${where}: 날짜는 YYYY-MM-DD 형식이어야 합니다 (받은 값: ${JSON.stringify(date)})`);
  }
  return Date.parse(date + "T00:00:00Z") / DAY_MS;
}

function readList(file) {
  const data = JSON.parse(fs.readFileSync(path.join(HERE, file), "utf8"));
  if (!Array.isArray(data)) throw new Error(`${file}: 배열이어야 합니다`);
  return data;
}

function loadInput() {
  const rituals = readList("input/rituals.json");
  const seen = new Set();
  for (const r of rituals) {
    dayNumber(r.date, "input/rituals.json");
    if (seen.has(r.date)) throw new Error(`input/rituals.json: 같은 날짜가 두 번 있습니다 (${r.date})`);
    seen.add(r.date);
  }
  const assignments = readList("input/assignments.json");
  for (const a of assignments) if (a.status === "submitted") dayNumber(a.submittedAt, "input/assignments.json");
  const attendance = readList("input/attendance.json");
  for (const a of attendance) dayNumber(a.date, "input/attendance.json");

  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return {
    rituals: [...rituals].sort(byDate),
    assignments: [...assignments].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    attendance: [...attendance].sort(byDate),
  };
}

export function computeStats({ rituals, assignments, attendance }) {
  if (rituals.length === 0) throw new Error("input/rituals.json: 기록이 비어 있습니다");

  let longest = { days: 0 };
  let run = null;
  let comebacks = 0;
  let longestGapDays = 0;
  for (const r of rituals) {
    const n = dayNumber(r.date, "rituals");
    if (run && n === run.endN + 1) {
      run.end = r.date;
      run.endN = n;
      run.days++;
    } else {
      if (run) {
        comebacks++;
        longestGapDays = Math.max(longestGapDays, n - run.endN - 1);
      }
      run = { start: r.date, end: r.date, endN: n, days: 1 };
    }
    if (run.days > longest.days) longest = { days: run.days, start: run.start, end: run.end };
  }

  const submitted = assignments
    .filter((a) => a.status === "submitted")
    .map((a) => a.submittedAt)
    .sort();

  return {
    period: { start: rituals[0].date, end: rituals.at(-1).date },
    recordDays: rituals.length,
    morning: rituals.filter((r) => has(r.morning)).length,
    closing: rituals.filter((r) => has(r.closing)).length,
    longestStreak: longest,
    comebacks,
    longestGapDays,
    assignments: { total: assignments.length, submitted: submitted.length, lastSubmittedAt: submitted.at(-1) ?? null },
    attendance: {
      total: attendance.length,
      present: attendance.filter((a) => a.present === true).length,
      lastDate: attendance.at(-1)?.date ?? null,
    },
  };
}

function buildCandidates(s, rituals) {
  const out = new Map();
  const add = (ability, text, date, evidence) => {
    const id = `${ability}-${sha256(ability + "\n" + text).slice(0, 8)}`;
    if (!out.has(id)) out.set(id, { id, ability, text, date, evidence });
  };

  add(
    "자기조절력",
    `${s.period.start}부터 ${s.period.end}까지 ${s.recordDays}일을 기록했고(아침 기록 ${s.morning}회), 가장 길게는 ${s.longestStreak.days}일 연속으로 이어갔습니다.`,
    s.longestStreak.end,
    `내 리추얼 기록: 아침 ${s.morning}건, 최장 연속 ${s.longestStreak.start}~${s.longestStreak.end}`
  );
  add(
    "자기조절력",
    `마무리 기록은 ${s.closing}회로, 기록한 ${s.recordDays}일 중 ${pct(s.closing, s.recordDays)}%의 날을 돌아보며 닫았습니다.`,
    s.period.end,
    `내 리추얼 기록: 마무리 ${s.closing}건 / 기록일 ${s.recordDays}일`
  );
  if (s.comebacks > 0) {
    add(
      "자기동기력",
      `기록이 끊긴 뒤에도 ${s.comebacks}번 다시 시작했고, 가장 긴 공백은 ${s.longestGapDays}일이었습니다.`,
      s.period.end,
      `내 리추얼 기록: 공백 뒤 재개 ${s.comebacks}회, 최장 공백 ${s.longestGapDays}일`
    );
  }
  if (s.assignments.total > 0) {
    add(
      "자기동기력",
      `과제 ${s.assignments.total}개 중 ${s.assignments.submitted}개를 제출했습니다.`,
      s.assignments.lastSubmittedAt ?? s.period.end,
      `내 제출 현황: 제출 ${s.assignments.submitted}/${s.assignments.total}`
    );
  }
  if (s.attendance.total > 0) {
    add(
      "대인관계력",
      `출석 대상 ${s.attendance.total}일 중 ${s.attendance.present}일 출석했습니다.`,
      s.attendance.lastDate,
      `내 출석 기록: 출석 ${s.attendance.present}/${s.attendance.total}`
    );
  }
  for (const r of rituals) {
    for (const [field, label] of [["morning", "아침"], ["closing", "마무리"]]) {
      const t = r[field];
      if (!has(t) || !PEOPLE_WORDS.some((w) => t.includes(w))) continue;
      const quote = t.trim().length > 60 ? t.trim().slice(0, 60) + "…" : t.trim();
      add("대인관계력", `${r.date}의 기록: "${quote}"`, r.date, `내 리추얼 기록 ${r.date} ${label}`);
    }
  }
  return [...out.values()];
}

function renderMarkdown(s, candidates) {
  const lines = [
    "# 재생성 결과",
    "",
    "## 숫자",
    "",
    "| 항목 | 값 | 출처 |",
    "| --- | ---: | --- |",
    `| 기간 | ${s.period.start} ~ ${s.period.end} | 내 리추얼 기록 |`,
    `| 기록한 날 | ${s.recordDays}일 | 내 리추얼 기록 |`,
    `| 아침 기록 | ${s.morning}회 | 내 리추얼 기록 |`,
    `| 마무리 기록 | ${s.closing}회 | 내 리추얼 기록 |`,
    `| 최장 연속 | ${s.longestStreak.days}일 (${s.longestStreak.start}~${s.longestStreak.end}) | 내 리추얼 기록 |`,
    `| 공백 뒤 재개 | ${s.comebacks}회 (최장 공백 ${s.longestGapDays}일) | 내 리추얼 기록 |`,
    `| 과제 제출 | ${s.assignments.submitted}/${s.assignments.total} | 내 제출 현황 |`,
    `| 출석 | ${s.attendance.present}/${s.attendance.total}일 | 내 출석 기록 |`,
    "",
    "## 문단 후보",
    "",
    "승인할 후보의 id를 `approved.json` 배열에 넣은 뒤 `node regen.mjs apply`를 실행하세요.",
  ];
  for (const ability of ["자기조절력", "대인관계력", "자기동기력"]) {
    lines.push("", `### ${ability}`, "");
    const list = candidates.filter((c) => c.ability === ability);
    if (list.length === 0) lines.push("- (후보 없음 — 입력 자료에서 근거를 찾지 못했습니다)");
    for (const c of list) lines.push(`- \`${c.id}\` — ${c.text}`, `  - 날짜: ${c.date} · 근거: ${c.evidence}`);
  }
  return lines.join("\n") + "\n";
}

function generate() {
  const input = loadInput();
  const stats = computeStats(input);
  const candidates = buildCandidates(stats, input.rituals);
  return {
    stats,
    candidates,
    files: {
      "stats.json": JSON.stringify(stats, null, 2) + "\n",
      "candidates.json": JSON.stringify(candidates, null, 2) + "\n",
      "candidates.md": renderMarkdown(stats, candidates),
    },
  };
}

function writeOutput(outDir) {
  const { files, candidates } = generate();
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), content, "utf8");
  console.log(`생성 완료: ${outDir} (문단 후보 ${candidates.length}개)`);
}

function apply(sitePath) {
  const { stats: s, candidates } = generate();
  const approved = JSON.parse(fs.readFileSync(path.join(HERE, "approved.json"), "utf8"));
  if (!Array.isArray(approved)) throw new Error("approved.json: id 배열이어야 합니다");
  const chosen = candidates.filter((c) => approved.includes(c.id));
  const stale = approved.filter((id) => !candidates.some((c) => c.id === id));
  if (stale.length) {
    console.warn(`주의: 승인했지만 이번 결과에 없는 id ${stale.length}개 (입력이 바뀌어 문장이 달라졌습니다 — 다시 승인하세요): ${stale.join(", ")}`);
  }

  const html = fs.readFileSync(sitePath, "utf8");
  const i = html.indexOf(MARK_START);
  const j = html.indexOf(MARK_END);
  if (i < 0 || j < i) throw new Error(`${sitePath}에 ${MARK_START} … ${MARK_END} 구간이 없습니다`);
  const indent = html.slice(html.lastIndexOf("\n", i) + 1, i);

  const block = [
    `<ul class="regen-stats">`,
    `  <li><strong>${s.recordDays}일</strong> 기록 <small>출처: 내 리추얼 기록 · ${s.period.start}~${s.period.end}</small></li>`,
    `  <li><strong>아침 ${s.morning}회 · 마무리 ${s.closing}회</strong> <small>출처: 내 리추얼 기록</small></li>`,
    `  <li><strong>다시 시작 ${s.comebacks}회</strong> 최장 공백 ${s.longestGapDays}일 <small>출처: 내 리추얼 기록</small></li>`,
    ...(s.assignments.total ? [`  <li><strong>제출 ${s.assignments.submitted}/${s.assignments.total}</strong> <small>출처: 내 제출 현황</small></li>`] : []),
    ...(s.attendance.total ? [`  <li><strong>출석 ${s.attendance.present}/${s.attendance.total}일</strong> <small>출처: 내 출석 기록</small></li>`] : []),
    `</ul>`,
    ...chosen.map(
      (c) => `<p class="regen-sentence">${esc(c.text)} <small>${esc(c.ability)} · ${esc(c.date)} · 근거: ${esc(c.evidence)}</small></p>`
    ),
  ];

  const next = html.slice(0, i + MARK_START.length) + "\n" + block.map((l) => indent + l + "\n").join("") + indent + html.slice(j);
  fs.writeFileSync(sitePath, next, "utf8");
  console.log(`반영 완료: ${sitePath} (숫자 + 승인된 문장 ${chosen.length}개)`);
}

function check() {
  const runs = path.join(HERE, "runs");
  fs.rmSync(runs, { recursive: true, force: true });
  for (const n of ["1", "2"]) {
    const r = spawnSync(process.execPath, [SELF, "generate", "--out", path.join(runs, n)], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const names = [...new Set([...fs.readdirSync(path.join(runs, "1")), ...fs.readdirSync(path.join(runs, "2"))])].sort();
  let same = true;
  const rows = names.map((f) => {
    const [a, b] = ["1", "2"].map((n) => {
      const p = path.join(runs, n, f);
      return fs.existsSync(p) ? sha256(fs.readFileSync(p)) : "(없음)";
    });
    if (a !== b) same = false;
    return `${a === b ? "같음" : "다름"}  ${f}\n  1회차 ${a}\n  2회차 ${b}`;
  });
  const report = `같은 입력 2회 실행 비교 — 결과: ${same ? "모두 같음" : "다른 파일 있음"}\n\n${rows.join("\n")}\n`;
  fs.writeFileSync(path.join(runs, "compare.txt"), report, "utf8");
  console.log("\n" + report);
  if (!same) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name, fallback) => {
    const k = rest.indexOf(name);
    return k >= 0 && rest[k + 1] ? path.resolve(rest[k + 1]) : fallback;
  };
  try {
    if (cmd === "generate") writeOutput(opt("--out", path.join(HERE, "output")));
    else if (cmd === "apply") apply(opt("--site", path.join(HERE, "..", "index.html")));
    else if (cmd === "check") check();
    else {
      console.log("사용법: node regen.mjs generate [--out 폴더] | apply [--site index.html] | check");
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(`오류: ${e.message}`);
    process.exit(1);
  }
}
