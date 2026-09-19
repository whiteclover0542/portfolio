# 재생성 장치

리추얼 기록·과제 목록·출석 기록을 넣으면 사이트의 숫자 칸과 능력별(자기조절력·대인관계력·자기동기력) 문단 후보를 만듭니다. 후보마다 날짜와 근거가 붙고, **내가 승인한 문장만** 사이트에 들어갑니다. 같은 입력이면 언제 어디서 실행해도 결과가 같습니다.

필요한 것: Node.js 18 이상. 설치할 패키지·API 키 없음.

## 새 폴더에서 실행하는 3단계

1. **입력 넣고 생성** — `input/`의 세 파일을 내 기록으로 바꾼 뒤 이 폴더에서
   `node regen.mjs generate`
   → `output/candidates.md`에 숫자 표와 문단 후보(id·날짜·근거)가 생깁니다.
2. **승인하고 반영** — 사이트에 올릴 후보의 id를 `approved.json` 배열에 넣고
   `node regen.mjs apply`
   → `../index.html`의 `<!-- regen:start -->`~`<!-- regen:end -->` 구간만 바뀝니다. 다른 파일에 반영하려면 `--site 경로`.
3. **같은 결과인지 확인** — `node regen.mjs check`
   → 두 번 실행해 `runs/1`, `runs/2`에 저장하고 파일별 SHA-256을 `runs/compare.txt`에 남깁니다. 다르면 실패로 끝납니다.

## 입력 형식

| 파일 | 한 줄 형식 |
| --- | --- |
| `input/rituals.json` | `{ "date": "YYYY-MM-DD", "morning": "아침 기록", "closing": "마무리 기록" }` — 날짜당 1개, 빈 문자열은 기록 없음 |
| `input/assignments.json` | `{ "id": "...", "title": "...", "status": "submitted" \| "open", "submittedAt": "YYYY-MM-DD" }` |
| `input/attendance.json` | `{ "date": "YYYY-MM-DD", "present": true \| false }` |

지금 들어 있는 입력은 `[샘플]` 자료입니다. 날짜 수만 확인된 기준값(23일·아침 23회·마무리 21회)에 맞췄고 내용은 실제 기록이 아니므로, 원본으로 바꾸기 전에는 `apply`하지 마세요.

## 알아둘 것

- 후보 id는 문장 내용의 해시입니다. 입력이 바뀌어 문장이 달라지면 예전 승인은 자동으로 무효가 되고, `apply`가 "다시 승인하세요"라고 알려 줍니다. 바뀐 숫자가 확인 없이 게시되지 않게 하기 위함입니다.
- 문단은 AI가 아니라 정해진 문장 틀로 만듭니다. 그래서 결과가 항상 같고 키가 필요 없습니다.
- 계산 검증: `node regen.test.mjs`
