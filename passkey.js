(function () {
  const $ = (id) => document.getElementById(id);
  const usernameInput = $("pk-username");
  const registerBtn = $("pk-register-btn");
  const loginBtn = $("pk-login-btn");
  const addBtn = $("pk-add-btn");
  const logoutBtn = $("pk-logout-btn");
  const statusEl = $("pk-status");
  const contentBox = $("private-content");
  const currentUserEl = $("pk-current-user");
  const notesEl = $("pk-notes");
  const listEl = $("pk-list");
  const logEl = $("pk-log");

  function log(method, url, status, body) {
    const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    const line = `[${time}] ${method} ${url} -> ${status}\n  ${JSON.stringify(body)}\n\n`;
    logEl.textContent = line + logEl.textContent;
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* 본문 없음 */
    }
    log(method, url, res.status, data);
    return { status: res.status, ok: res.ok, data };
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("pk-status-error", !!isError);
  }

  function getUsername() {
    const v = usernameInput.value.trim();
    if (!v) throw new Error("아이디를 입력하세요.");
    return v;
  }

  function supportsWebAuthn() {
    return window.SimpleWebAuthnBrowser && SimpleWebAuthnBrowser.browserSupportsWebAuthn();
  }

  async function doRegister() {
    if (!supportsWebAuthn()) {
      setStatus("이 브라우저·기기는 패스키(WebAuthn)를 지원하지 않습니다.", true);
      return;
    }
    try {
      const username = getUsername();
      const passkeyName = window.prompt("이 패스키에 붙일 이름 (예: 노트북-Chrome)", "my-device") || undefined;

      setStatus("패스키 등록 창을 여는 중...");
      const optRes = await api("POST", "/api/register-options", { username });
      if (!optRes.ok) return setStatus(`등록 옵션 요청 실패: ${optRes.data?.error}`, true);

      let attestationResponse;
      try {
        attestationResponse = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: optRes.data });
      } catch (e) {
        setStatus("등록을 취소했거나 실패했습니다. 서버에는 아무것도 저장되지 않았습니다.", true);
        return;
      }

      const verifyRes = await api("POST", "/api/register-verify", { username, passkeyName, attestationResponse });
      if (!verifyRes.ok) return setStatus(`등록 검증 실패: ${verifyRes.data?.error}`, true);

      await loadPrivateArea();
      setStatus(
        `패스키 등록 완료 (총 ${verifyRes.data.passkeyCount}개). 서버에 저장된 값(공개키): ${verifyRes.data.storedPublicKeyPreview}`
      );
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  async function doLogin() {
    if (!supportsWebAuthn()) {
      setStatus("이 브라우저·기기는 패스키(WebAuthn)를 지원하지 않습니다.", true);
      return;
    }
    try {
      const username = getUsername();
      setStatus("패스키로 로그인하는 중...");
      const optRes = await api("POST", "/api/login-options", { username });
      if (!optRes.ok) return setStatus(`로그인 옵션 요청 실패: ${optRes.data?.error}`, true);

      let assertionResponse;
      try {
        assertionResponse = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: optRes.data });
      } catch (e) {
        setStatus("로그인을 취소했습니다.", true);
        return;
      }

      const verifyRes = await api("POST", "/api/login-verify", { username, assertionResponse });
      if (!verifyRes.ok) return setStatus(`로그인 실패: ${verifyRes.data?.error}`, true);

      setStatus(`${verifyRes.data.username}(으)로 로그인했습니다.`);
      await loadPrivateArea();
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  async function doLogout() {
    await api("POST", "/api/logout");
    setStatus("로그아웃했습니다.");
    contentBox.hidden = true;
  }

  async function deletePasskey(id, name) {
    if (!window.confirm(`"${name}" 패스키를 삭제할까요? 마지막 패스키라면 이 계정으로 다시는 로그인할 수 없게 됩니다.`)) {
      return;
    }
    const res = await api("DELETE", "/api/passkeys", { id });
    if (!res.ok) return setStatus(`삭제 실패: ${res.data?.error}`, true);
    await loadPrivateArea();
    setStatus(
      res.data.remaining === 0
        ? "패스키가 모두 삭제되었습니다. 이 계정은 더 이상 로그인할 수 없습니다(복구 수단 없음)."
        : `패스키 삭제됨 (남은 패스키 ${res.data.remaining}개)`
    );
  }

  function renderNotes(notes) {
    notesEl.innerHTML = "";
    (notes || []).forEach((n) => {
      const li = document.createElement("li");
      li.textContent = n.text;
      notesEl.appendChild(li);
    });
  }

  function renderPasskeys(passkeys) {
    listEl.innerHTML = "";
    (passkeys || []).forEach((pk) => {
      const li = document.createElement("li");
      const date = new Date(pk.createdAt).toLocaleString("ko-KR");

      const info = document.createElement("span");
      info.className = "pk-item-info";
      info.textContent = `${pk.name} · ${date} · ${pk.publicKeyPreview}`;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "pk-btn pk-btn-danger";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => deletePasskey(pk.id, pk.name));

      li.appendChild(info);
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  async function loadPrivateArea() {
    const sessionRes = await api("GET", "/api/session");
    if (!sessionRes.data || !sessionRes.data.loggedIn) {
      contentBox.hidden = true;
      return;
    }
    currentUserEl.textContent = sessionRes.data.username;
    contentBox.hidden = false;

    const privRes = await api("GET", "/api/private");
    if (privRes.ok) renderNotes(privRes.data.notes);

    const pkRes = await api("GET", "/api/passkeys");
    if (pkRes.ok) renderPasskeys(pkRes.data.passkeys);
  }

  registerBtn.addEventListener("click", doRegister);
  loginBtn.addEventListener("click", doLogin);
  addBtn.addEventListener("click", doRegister);
  logoutBtn.addEventListener("click", doLogout);

  loadPrivateArea();
})();
