import assert from "node:assert/strict";
import { computeStats } from "./regen.mjs";

const day = (date, closing = "c") => ({ date, morning: "m", closing });

const s = computeStats({
  rituals: [day("2026-08-30"), day("2026-08-31"), day("2026-09-01", ""), day("2026-09-04"), day("2026-09-05"), day("2026-09-06"), day("2026-09-10")],
  assignments: [
    { id: "a", status: "submitted", submittedAt: "2026-09-02" },
    { id: "b", status: "open" },
  ],
  attendance: [],
});
const att = computeStats({
  rituals: [day("2026-09-01")],
  assignments: [],
  attendance: [
    { date: "2026-09-01", present: true, status: "공가" },
    { date: "2026-09-08", present: false },
  ],
});

assert.deepEqual(s.period, { start: "2026-08-30", end: "2026-09-10" });
assert.equal(s.recordDays, 7);
assert.equal(s.closing, 6);
assert.deepEqual(s.noClosingDates, ["2026-09-01"]);
assert.deepEqual(s.longestStreak, { days: 3, start: "2026-08-30", end: "2026-09-01" }, "month boundary counts as consecutive; tie keeps earliest");
assert.equal(s.comebacks, 2);
assert.equal(s.longestGapDays, 3);
assert.deepEqual(s.assignments, { total: 2, submitted: 1, lastSubmittedAt: "2026-09-02" });
assert.deepEqual(att.attendance, { total: 2, present: 1, late: 0, leave: 1, lastDate: "2026-09-08" });
const w = computeStats({ rituals: [day("2026-08-14"), day("2026-08-17"), day("2026-08-19")], assignments: [], attendance: [] });
assert.deepEqual(w.longestStreak, { days: 2, start: "2026-08-14", end: "2026-08-17" }, "Fri -> Mon is consecutive");
assert.equal(w.comebacks, 1);
assert.equal(w.longestGapDays, 1, "only the missed weekday counts");
const h = computeStats({
  rituals: [day("2026-08-14"), day("2026-08-18")],
  assignments: [],
  attendance: [{ date: "2026-08-14", present: true }, { date: "2026-08-18", present: true }],
});
assert.equal(h.comebacks, 0, "a weekday missing from attendance (holiday) is not a gap");
const g = computeStats({
  rituals: [day("2026-08-24"), day("2026-08-26"), day("2026-08-28")],
  assignments: [],
  attendance: ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((date) => ({
    date, present: true, status: date === "2026-08-25" ? "공가" : "출석",
  })),
});
assert.deepEqual(g.gapDates, ["2026-08-25", "2026-08-27"]);
assert.deepEqual(g.gapLeaveDates, ["2026-08-25"], "only 공가 gap days are listed");
assert.throws(() => computeStats({ rituals: [], assignments: [], attendance: [] }), /비어 있습니다/);

console.log("regen.test.mjs: ok");
