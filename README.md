# WHITECLOVER Portfolio

Security-minded Full-Stack Developer 개인 포트폴리오 페이지. 기본은 빌드 도구 없는 정적 HTML/CSS/JS 원페이지이고, 과제8에서 비밀번호 없이 패스키(WebAuthn)로 잠기는 비공개 구역을 추가하면서 Vercel 서버리스 함수 + Redis가 더해졌습니다.

**🔗 https://makeportfolio-red.vercel.app**

## 소개

함께 협업할 팀원들에게 "제가 누구인지"를 보여주기 위해 만든 페이지입니다. AI/LLM 기반 딥보이스(음성 딥페이크) 탐지, RAG, 안전성 검증 등 프로젝트 경험을 중심으로 구성했습니다.

- **WHO AM I / WHAT I DO / PROOF** — 첫 화면에서 3초 안에 포지셔닝과 핵심 지표(EER 0.98%, 위기 감지 40/40, G-Eval 4.6–4.8)를 보여줍니다.
- **WORK & SKILLS** — GitHub, 기술 스택, 보안 관점 소개.
- **HOW I WORK** — 상황·행동·결과(STAR) 형식으로 정리한 강점 3가지, 각 항목에 근거 자료를 토글로 연결.
- **PROJECTS** — Solo(Today CVE Info, SecretHound) · Research(Security Telemetry Loss) · Team(Deepfake Detection AI, PetLoss Care AI, SafeMaintAI)을 Problem·Role·Result·Tech·GitHub 링크로 소개.
- **PRIVATE**(과제8) — 패스키로만 열리는 비공개 메모 구역. [과제8/](과제8/) 문서 참고.

## 기술 스택

**프론트(정적)**
- HTML5 / CSS3 / Vanilla JavaScript (프레임워크·빌드 과정 없음)
- Google Fonts (Black Han Sans, Gowun Dodum, Noto Sans KR)

**과제8 — 패스키 백엔드**
- Vercel 서버리스 함수(`api/*.js`) + `@simplewebauthn/server`
- `@simplewebauthn/browser`(CDN) — 프런트 WebAuthn 호출
- Upstash for Redis(Vercel Marketplace) — 공개키·세션·challenge 저장

## 로컬에서 보기

정적 페이지만 볼 때는 별도 빌드 없이 바로 확인합니다.

```bash
npx serve .
# 또는
python -m http.server 8000
```

패스키 API까지 포함해서 보려면(Vercel 로그인 없이 로컬 전용):

```bash
npm install
npm run dev:local   # http://localhost:3000
```

## 파일 구조

```
index.html      페이지 본문/구조 (공개 + PRIVATE 구역)
style.css       스타일
script.js       "자세히 보기" 토글 인터랙션
passkey.js      패스키 등록/로그인 프런트 로직
api/            Vercel 서버리스 함수 (등록·로그인·로그아웃·비공개 자료 조회)
scripts/        로컬 테스트 서버, 자동 검증·스크린샷·PDF 렌더링 스크립트
과제1/, 과제8/   과제별 제출 문서
```

## 문서

과제별 문서는 `과제N/` 폴더에 모아둡니다.

### 과제1 — 포트폴리오 페이지

- **결과물**: https://makeportfolio-red.vercel.app
- [검증안내서.md](과제1/검증안내서.md) — 페이지 확인 방법과 통과 기준
- [공개비공개점검표.md](과제1/공개비공개점검표.md) — 공개 대상 문장 및 공개/비공개 정보 기준
- [AI3줄.md](과제1/AI3줄.md) — 이 프로젝트에서 AI 활용 내역 요약
- [progress.md](과제1/progress.md) — 제작 진행 관리 기록

### 과제8 — 패스키(WebAuthn) 인증

- **결과물**: https://makeportfolio-red.vercel.app
- **소스**: https://github.com/whiteclover0542/portfolio
- [제출.md](과제8/제출.md) / [제출.pdf](과제8/제출.pdf) — 제출용으로 필요한 내용을 한 파일에 모은 최종본
- [ASSIGNMENT.md](과제8/ASSIGNMENT.md) — 과제 지침·요구사항 원문
- [인증구현설명서.md](과제8/인증구현설명서.md) — 무엇으로·왜·어디를·확인 기록·아직 못 막은 것
- [검증안내서.md](과제8/검증안내서.md) — 페이지 확인 방법과 통과 기준
- [AI3줄.md](과제8/AI3줄.md) — AI 활용 내역 요약
- [progress.md](과제8/progress.md) — 카드별 체크리스트·작업 순서·진행 기록
- [evidence/](과제8/evidence/), [evidence-prod/](과제8/evidence-prod/) — 로컬/배포 주소 자동 검증 스크린샷·요청응답 로그

## 배포

Vercel(`https://makeportfolio-red.vercel.app`)로 배포합니다. 정적 페이지(과제1)와 `api/` 서버리스 함수 + Upstash Redis(과제8)를 함께 서빙합니다. GitHub 저장소와는 자동 연동이 안 돼 있어 배포 갱신은 `vercel --prod`로 수동 트리거합니다.
