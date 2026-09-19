import assert from "node:assert/strict";
import { computeStats } from "./regen.mjs";

const day = (date, closing = "c") => ({ date, morning: "m", closing });

const s = computeStats({
  rituals: [day("2026-08-30"), day("2026-08-31"), day("2026-09-01", ""), day("2026-09-04"), day("2026-09-05"), day("2026-09-06"), day("2026-09-10")],
  assignments: [
    { id: "a", status: "submitted", submittedAt: "2026-09-02" },
    { id: "b", status: "open" },
  ],
  attendance: [
    { date: "2026-09-01", present: true },
    { date: "2026-09-08", present: false },
  ],
});

assert.deepEqual(s.period, { start: "2026-08-30", end: "2026-09-10" });
assert.equal(s.recordDays, 7);
assert.equal(s.closing, 6);
assert.deepEqual(s.longestStreak, { days: 3, start: "2026-08-30", end: "2026-09-01" }, "month boundary counts as consecutive; tie keeps earliest");
assert.equal(s.comebacks, 2);
assert.equal(s.longestGapDays, 3);
assert.deepEqual(s.assignments, { total: 2, submitted: 1, lastSubmittedAt: "2026-09-02" });
assert.deepEqual(s.attendance, { total: 2, present: 1, lastDate: "2026-09-08" });
assert.throws(() => computeStats({ rituals: [], assignments: [], attendance: [] }), /비어 있습니다/);

console.log("regen.test.mjs: ok");
