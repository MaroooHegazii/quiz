/* ========= إعدادات Supabase ========= */
const SUPABASE_URL = "https://rkbehijopqeyejndpvig.supabase.co";
const SUPABASE_KEY = "sb_publishable_Vx-Cq4NpdinB8l2JqhbJdw_Z2pSwDdg"; // مفتاح عام (آمن إنه يظهر في الموقع)

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NET_MSG = "تعذّر الاتصال بالسيرفر. اتأكد من النت وحاول تاني.";

/* استدعاء دالة من قاعدة البيانات */
async function rpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error("rpc " + fn + " failed: " + res.status);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const getToken = () => localStorage.getItem("quiz_token");
function studentLogout() { localStorage.removeItem("quiz_token"); location.href = "index.html"; }

/* تصغير الصورة قبل رفعها */
function shrinkImage(file, max = 500) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const im = new Image();
      im.onerror = reject;
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ========= تسجيل الدخول ========= */
function initLogin() {
  let needName = false;
  const msg = $("#msg");
  const say = (t, ok) => { msg.className = ok ? "msg good" : "msg"; msg.textContent = t; };
  const hideName = () => { needName = false; $("#nameRow").hidden = true; };

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = $("#phone").value.trim();
    const pass = $("#password").value;
    if (!/^\d{8,15}$/.test(phone)) return say("اكتب رقم تليفون صحيح (أرقام فقط).");
    if (pass.length < 4) return say("كلمة المرور لازم تكون 4 أحرف على الأقل.");

    const btn = $("#loginForm button[type=submit]");
    btn.disabled = true;
    try {
      if (needName) {
        const name = $("#name").value.trim();
        if (!name) return say("اكتب اسمك.");
        const r = await rpc("student_register", { p_phone: phone, p_name: name, p_password: pass });
        if (r.status === "ok") { hideName(); return say("تم إرسال طلبك للمسؤول. هتقدر تدخل برقمك وكلمة المرور بعد الموافقة.", true); }
        if (r.status === "exists") { hideName(); return say("الرقم ده مسجل بالفعل. اكتب كلمة المرور بتاعتك للدخول."); }
        return say("البيانات غير صحيحة، راجعها وحاول تاني.");
      }

      const r = await rpc("student_login", { p_phone: phone, p_password: pass });
      if (r.status === "ok") {
        localStorage.setItem("quiz_token", r.token);
        say("أهلاً " + r.name + "، جاري فتح الامتحانات...", true);
        setTimeout(() => (location.href = "exams.html"), 600);
      } else if (r.status === "wrong") say("كلمة المرور غير صحيحة.");
      else if (r.status === "pending") say("حسابك في انتظار موافقة المسؤول. حاول تدخل بعد شوية.");
      else { // رقم جديد
        needName = true;
        $("#nameRow").hidden = false;
        $("#name").focus();
        say("الرقم ده جديد. اكتب اسمك لإرسال طلب إنشاء حساب.", true);
      }
    } catch { say(NET_MSG); }
    finally { btn.disabled = false; }
  });
}

/* ========= صفحة اختيار الامتحان ========= */
async function initExams() {
  const token = getToken();
  if (!token) { location.href = "index.html"; return; }
  $("#logoutBtn").onclick = studentLogout;
  const list = $("#examList");

  let data;
  try { data = await rpc("student_exams", { p_token: token }); }
  catch { list.innerHTML = `<p class="msg">${NET_MSG}</p>`; return; }
  if (!data) { studentLogout(); return; }

  $("#studentName").textContent = "الطالب: " + data.name;
  list.innerHTML = data.exams.map((ex) => {
    const info = ex.attempts > 0
      ? `${ex.attempts} محاولة — أعلى درجة: ${ex.best} من ${ex.total}`
      : "لم تمتحن بعد";
    return `
      <section class="card exam-card" data-id="${esc(ex.id)}">
        <div class="exam-top">
          <div>
            <h2 class="exam-name">${esc(ex.name)}</h2>
            <span class="small">${ex.count} سؤال${ex.minutes > 0 ? " — المدة: " + ex.minutes + " دقيقة" : ""} — ${info}</span>
          </div>
          <button class="btn primary" data-act="open" type="button" style="margin:0">دخول الامتحان</button>
        </div>
        <div class="code-row" hidden>
          <label>اكتب كود الامتحان</label>
          <div class="code-line">
            <input type="text" class="code-input" autocomplete="off" inputmode="text">
            <button class="btn primary" data-act="go" type="button" style="margin:0">فتح</button>
          </div>
          <p class="msg"></p>
        </div>
      </section>`;
  }).join("");

  async function tryOpen(card) {
    const id = card.dataset.id;
    const val = card.querySelector(".code-input").value.trim();
    const m = card.querySelector(".msg");
    if (!val) { m.textContent = "اكتب الكود."; return; }
    m.textContent = "";
    try {
      const ok = await rpc("check_exam_code", { p_token: token, p_exam_id: id, p_code: val });
      if (!ok) { m.textContent = "الكود غير صحيح."; return; }
      sessionStorage.setItem("exam_code_" + id, val);
      sessionStorage.removeItem("exam_attempt_" + id); // محاولة جديدة
      location.href = "quiz.html?exam=" + encodeURIComponent(id);
    } catch { m.textContent = NET_MSG; }
  }

  list.addEventListener("click", (e) => {
    const act = e.target.dataset.act; if (!act) return;
    const card = e.target.closest(".exam-card");
    if (act === "open") {
      const row = card.querySelector(".code-row");
      row.hidden = !row.hidden;
      if (!row.hidden) card.querySelector(".code-input").focus();
    }
    if (act === "go") tryOpen(card);
  });
  list.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("code-input")) tryOpen(e.target.closest(".exam-card"));
  });
}

/* ========= صفحة الكويز ========= */
async function initQuiz() {
  const token = getToken();
  if (!token) { location.href = "index.html"; return; }
  const examId = new URLSearchParams(location.search).get("exam");
  const code = sessionStorage.getItem("exam_code_" + examId);
  if (!examId || !code) { location.href = "exams.html"; return; }

  $("#logoutBtn").onclick = studentLogout;
  const box = $("#questions");
  const timerEl = $("#timer");
  const attKey = "exam_attempt_" + examId;
  let questions = [], attemptId = null, tick = null, submitting = false;

  function startTimer(minutes, secsLeft) {
    clearInterval(tick);
    if (!minutes) { timerEl.hidden = true; return; }
    const end = Date.now() + (secsLeft || 0) * 1000;
    timerEl.hidden = false;
    const upd = () => {
      const left = Math.max(0, end - Date.now());
      const sec = Math.ceil(left / 1000);
      timerEl.textContent = "الوقت المتبقي: " + String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
      timerEl.classList.toggle("low", left <= 60000);
      if (left <= 0) { clearInterval(tick); grade(true); }
    };
    upd();
    if (end - Date.now() > 0) tick = setInterval(upd, 1000);
  }

  function render() {
    box.classList.remove("graded");
    if (!questions.length) { box.innerHTML = '<p class="muted center">لا توجد أسئلة حالياً.</p>'; return; }
    box.innerHTML = questions.map((q, i) => `
      <section class="q" data-i="${i}">
        <div class="q-flex">
          <div class="q-main">
            <h3>${i + 1}. ${esc(q.text)}</h3>
            ${q.options.map((o, j) => `
              <label class="opt" data-j="${j}">
                <input type="radio" name="q${i}" value="${j}"> <span>${esc(o)}</span><span class="mark"></span>
              </label>`).join("")}
          </div>
          ${q.img ? `<img class="q-img" src="${esc(q.img)}" alt="">` : ""}
        </div>
      </section>`).join("");
  }

  async function begin(fresh) {
    clearInterval(tick); timerEl.hidden = true;
    $("#result").hidden = true; $("#retryBtn").hidden = true; $("#gradeBtn").hidden = true;
    box.innerHTML = '<p class="muted center">جاري التحميل...</p>';
    let r;
    try {
      r = await rpc("start_exam", {
        p_token: token, p_exam_id: examId, p_code: code,
        p_attempt: fresh ? null : (Number(sessionStorage.getItem(attKey)) || null)
      });
    } catch { box.innerHTML = `<p class="msg center">${NET_MSG}</p>`; return; }
    if (r.status === "auth") { studentLogout(); return; }
    if (r.status !== "ok") { location.href = "exams.html"; return; }

    attemptId = r.attempt_id;
    sessionStorage.setItem(attKey, String(attemptId));
    questions = r.questions;
    $("#studentName").textContent = "الطالب: " + r.student;
    $("#examTitle").textContent = r.name;
    render();
    if (questions.length) { $("#gradeBtn").hidden = false; $("#gradeBtn").disabled = false; }
    startTimer(r.minutes, r.seconds_left);
  }

  async function grade(timeUp) {
    if (submitting || !attemptId) return;
    submitting = true;
    $("#gradeBtn").disabled = true;
    const answers = questions.map((q, i) => {
      const p = document.querySelector(`input[name="q${i}"]:checked`);
      return p ? Number(p.value) : -1;
    });
    let r;
    try { r = await rpc("submit_exam", { p_token: token, p_attempt: attemptId, p_answers: answers }); }
    catch {
      submitting = false; $("#gradeBtn").disabled = false;
      const res = $("#result"); res.hidden = false; res.textContent = NET_MSG + " (اضغط تصحيح الامتحان تاني)";
      return;
    }
    if (r.status === "auth") { studentLogout(); return; }
    if (r.status !== "ok") { location.href = "exams.html"; return; }

    clearInterval(tick); timerEl.hidden = true;
    sessionStorage.removeItem(attKey);
    questions.forEach((q, i) => {
      const sel = answers[i], good = r.correct[i];
      box.querySelectorAll(`[data-i="${i}"] .opt`).forEach((el, j) => {
        el.querySelector("input").disabled = true;
        if (j === good) { el.classList.add("correct"); el.querySelector(".mark").textContent = "✓"; }
        else if (j === sel) { el.classList.add("wrong"); el.querySelector(".mark").textContent = "✗"; }
      });
    });
    box.classList.add("graded");
    const res = $("#result");
    res.hidden = false;
    res.textContent = (timeUp || r.late ? "انتهى الوقت! " : "") + `النتيجة: ${r.score} من ${r.total}`;
    res.scrollIntoView({ behavior: "smooth", block: "center" });
    $("#gradeBtn").hidden = true;
    $("#retryBtn").hidden = false;
    submitting = false; attemptId = null;
  }

  $("#gradeBtn").onclick = () => grade(false);
  $("#retryBtn").onclick = async () => { await begin(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  begin(false);
}

/* ========= دخول المسؤول (مشترك بين صفحة اللوحة وصفحة الأسئلة) ========= */
const adminToken = () => sessionStorage.getItem("quiz_admin_token");
function adminExpired() {
  sessionStorage.removeItem("quiz_admin_token");
  $("#adminLogin").hidden = false; $("#adminPanel").hidden = true;
}
function setupAdminLogin(onOk) {
  const enter = async () => {
    const msg = $("#adminMsg"); msg.textContent = "";
    try {
      const r = await rpc("admin_login", { p_password: $("#adminPass").value });
      if (r.status === "ok") { sessionStorage.setItem("quiz_admin_token", r.token); onOk(); }
      else msg.textContent = "كلمة المرور غير صحيحة.";
    } catch { msg.textContent = NET_MSG; }
  };
  $("#adminEnter").onclick = enter;
  $("#adminPass").addEventListener("keydown", (e) => { if (e.key === "Enter") enter(); });
  if (adminToken()) onOk();
}

/* ========= صفحة المسؤول ========= */
function initAdmin() {
  let selId = null, cache = null;
  setupAdminLogin(load);
  $("#refreshBtn").onclick = () => load();

  async function load() {
    let d;
    try { d = await rpc("admin_overview", { p_token: adminToken() }); }
    catch { alert(NET_MSG); return; }
    if (!d) { adminExpired(); return; }
    cache = d;
    $("#adminLogin").hidden = true; $("#adminPanel").hidden = false;
    draw();
  }

  function draw() {
    const exams = cache.exams;
    if (!selId || !exams.some((x) => x.id === selId)) selId = exams.length ? exams[0].id : null;
    const examName = (id) => (exams.find((x) => x.id === id) || {}).name || "امتحان قديم";

    const all = cache.students.map((s) => [s.phone, s]);
    const pending = all.filter(([, u]) => !u.approved);
    const active = all.filter(([, u]) => u.approved);
    const examined = active.filter(([, u]) => u.results.length);
    const attempts = active.reduce((n, [, u]) => n + u.results.length, 0);

    $("#stats").innerHTML = `
      <div class="stat"><b>${active.length}</b>طلاب مسجلين</div>
      <div class="stat"><b>${examined.length}</b>طلاب امتحنوا</div>
      <div class="stat"><b>${attempts}</b>إجمالي المحاولات</div>
      <div class="stat"><b>${pending.length}</b>طلبات معلقة</div>`;

    $("#pending").innerHTML = pending.length
      ? pending.map(([phone, u]) => `
          <div class="row">
            <span><strong>${esc(u.name)}</strong> <span class="small">${esc(phone)}</span></span>
            <span>
              <button class="btn ok" data-act="approve" data-phone="${esc(phone)}" type="button">موافقة</button>
              <button class="btn danger" data-act="reject" data-phone="${esc(phone)}" type="button">رفض</button>
            </span>
          </div>`).join("")
      : '<p class="muted">لا توجد طلبات جديدة.</p>';

    $("#examSettings").innerHTML = exams.map((ex) => `
      <div class="card set-row" data-id="${esc(ex.id)}">
        <div class="set-col"><label>اسم الامتحان</label>
          <input type="text" data-f="name" value="${esc(ex.name)}"></div>
        <div class="set-col"><label>كود الدخول</label>
          <input type="text" data-f="code" value="${esc(ex.code)}"></div>
        <div class="set-col"><label>مدة الامتحان بالدقائق (0 = بدون وقت)</label>
          <input type="number" min="0" step="1" data-f="minutes" value="${Number(ex.minutes) || 0}"></div>
      </div>`).join("") +
      '<button class="btn primary" data-act="saveExams" type="button">حفظ الأسماء والأكواد والمدد</button><p id="examMsg" class="msg"></p>';

    $("#examSelect").innerHTML = exams.map((ex) =>
      `<option value="${esc(ex.id)}" ${ex.id === selId ? "selected" : ""}>${esc(ex.name)}</option>`).join("");
    drawAnalysis(exams, active);

    $("#students").innerHTML = active.length
      ? active.map(([phone, u]) => {
          const r = u.results;
          const groups = {};
          r.forEach((x) => { (groups[x.examId] = groups[x.examId] || []).push(x); });
          const body = Object.entries(groups).map(([id, list]) => `
            <div class="grp">
              <div class="grp-title">${esc(examName(id))} <span class="small">— ${list.length} محاولة</span></div>
              <ol class="att">${list.map((x) => `
                <li>${x.score} من ${x.total}
                  <span class="small">— ${new Date(x.date).toLocaleString("ar-EG")}</span>
                  ${Array.isArray(x.wrong) ? (x.wrong.length
                    ? `<div class="wrong-line">غلط في السؤال رقم: ${x.wrong.map((n) => n + 1).join("، ")}</div>`
                    : '<div class="right-line">كل الإجابات صحيحة ✓</div>') : ""}
                </li>`).join("")}</ol>
            </div>`).join("");
          return `
          <details class="stu">
            <summary>
              <strong>${esc(u.name)}</strong>
              <span class="small">${esc(phone)}</span>
              <span class="badge">${r.length ? r.length + " محاولة" : "لم يمتحن بعد"}</span>
            </summary>
            ${body}
            <div class="grp"><button class="btn danger" data-act="delUser" data-phone="${esc(phone)}" type="button" style="margin:.6rem 0 .9rem">حذف حساب الطالب</button></div>
          </details>`;
        }).join("")
      : '<p class="muted">لا يوجد طلاب مسجلين بعد.</p>';
  }

  function drawAnalysis(exams, active) {
    const ex = exams.find((x) => x.id === selId);
    if (!ex) { $("#examAnalysis").innerHTML = ""; return; }
    const atts = [];
    active.forEach(([phone, u]) => u.results.forEach((r) => { if (r.examId === ex.id) atts.push({ phone, r }); }));

    const wrongCount = ex.questions.map(() => 0);
    const wrongStu = ex.questions.map(() => new Set());
    atts.forEach(({ phone, r }) => (r.wrong || []).forEach((i) => {
      if (i < wrongCount.length) { wrongCount[i]++; wrongStu[i].add(phone); }
    }));
    const avg = atts.length
      ? Math.round(atts.reduce((s, { r }) => s + (r.total ? r.score / r.total : 0), 0) / atts.length * 100) : 0;

    const head = `<p class="small">عدد المحاولات: <b>${atts.length}</b>${atts.length ? ` — متوسط النتيجة: <b>${avg}%</b>` : ""}</p>`;
    if (!ex.questions.length) { $("#examAnalysis").innerHTML = head + '<p class="muted">لا توجد أسئلة في هذا الامتحان.</p>'; return; }

    $("#examAnalysis").innerHTML = head + ex.questions.map((q, i) => {
      const pct = atts.length ? Math.round(wrongCount[i] / atts.length * 100) : 0;
      return `
      <section class="q">
        <div class="q-flex">
          <div class="q-main">
            <h3>${i + 1}. ${esc(q.text)}</h3>
            ${q.options.map((o, j) => j === q.correct
              ? `<div class="opt correct"><span>${esc(o)}</span><span class="mark">✓</span></div>`
              : `<div class="opt"><span>${esc(o)}</span></div>`).join("")}
          </div>
          ${q.img ? `<img class="q-img" src="${esc(q.img)}" alt="">` : ""}
        </div>
        <div class="ana ${pct >= 50 ? "hard" : ""}">
          ${atts.length
            ? `غلط فيه <b>${wrongCount[i]}</b> من ${atts.length} محاولة (${pct}%) — عدد الطلاب: <b>${wrongStu[i].size}</b>`
            : "لا توجد محاولات بعد"}
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
      </section>`;
    }).join("");
  }

  $("#examSelect").addEventListener("change", (e) => { selId = e.target.value; draw(); });

  $("#adminPanel").addEventListener("click", async (e) => {
    const act = e.target.dataset.act, phone = e.target.dataset.phone;
    if (!act) return;
    const tk = adminToken();
    try {
      if (act === "saveExams") {
        const msg = $("#examMsg");
        const rows = [];
        for (const row of document.querySelectorAll("#examSettings .set-row")) {
          const name = row.querySelector('[data-f="name"]').value.trim();
          const code = row.querySelector('[data-f="code"]').value.trim();
          const minutes = Math.max(0, parseInt(row.querySelector('[data-f="minutes"]').value, 10) || 0);
          if (!name || !code) { msg.className = "msg"; msg.textContent = "الاسم والكود لازم يتكتبوا لكل امتحان."; return; }
          rows.push({ id: row.dataset.id, name, code, minutes });
        }
        for (const x of rows) {
          const ok = await rpc("admin_save_exam", { p_token: tk, p_id: x.id, p_name: x.name, p_code: x.code, p_minutes: x.minutes });
          if (!ok) { adminExpired(); return; }
        }
        await load();
        const m2 = $("#examMsg"); m2.className = "msg good"; m2.textContent = "تم الحفظ.";
        return;
      }

      const student = cache.students.find((s) => s.phone === phone);
      if (!student) return;
      let ok = true;
      if (act === "approve") ok = await rpc("admin_approve", { p_token: tk, p_phone: phone });
      if (act === "reject") {
        if (!confirm("رفض الطلب وحذفه؟")) return;
        ok = await rpc("admin_delete_student", { p_token: tk, p_phone: phone });
      }
      if (act === "delUser") {
        if (!confirm("حذف حساب " + student.name + " ونتائجه نهائياً؟")) return;
        ok = await rpc("admin_delete_student", { p_token: tk, p_phone: phone });
      }
      if (!ok) { adminExpired(); return; }
      await load();
    } catch { alert(NET_MSG); }
  });
}

/* ========= صفحة تعديل الأسئلة ========= */
function initQuestions() {
  let exams = [], curId = null, draft = [], dirty = false;
  const ed = $("#editor");
  setupAdminLogin(show);

  async function fetchExams() {
    const d = await rpc("admin_overview", { p_token: adminToken() });
    if (!d) return null;
    exams = d.exams;
    return d;
  }
  const loadDraft = () => { draft = JSON.parse(JSON.stringify(exams.find((x) => x.id === curId).questions)); dirty = false; };

  async function show() {
    let d;
    try { d = await fetchExams(); } catch { $("#adminMsg").textContent = NET_MSG; return; }
    if (!d) { adminExpired(); return; }
    $("#adminLogin").hidden = true; $("#adminPanel").hidden = false;
    if (!curId || !exams.some((x) => x.id === curId)) curId = exams[0].id;
    $("#examPick").innerHTML = exams.map((ex) => `<option value="${esc(ex.id)}" ${ex.id === curId ? "selected" : ""}>${esc(ex.name)}</option>`).join("");
    loadDraft(); renderEditor();
  }

  $("#examPick").addEventListener("change", (e) => {
    if (dirty && !confirm("في تعديلات لم تُحفظ. تتجاهلها وتنتقل؟")) { e.target.value = curId; return; }
    curId = e.target.value;
    $("#saveMsg").textContent = "";
    loadDraft(); renderEditor();
  });

  function renderEditor() {
    if (!draft.length) ed.innerHTML = '<p class="muted center">لا توجد أسئلة. اضغط "إضافة سؤال".</p>';
    else ed.innerHTML = draft.map((q, i) => `
      <section class="card" data-i="${i}">
        <div class="ed-head"><strong>سؤال ${i + 1}</strong>
          <button class="btn danger" data-act="delQ" type="button">حذف السؤال</button></div>
        <label>نص السؤال</label>
        <textarea data-f="text">${esc(q.text)}</textarea>
        <label>صورة بجانب السؤال <span class="small">(اختياري)</span></label>
        <div class="img-ed">
          ${q.img ? `<img class="q-img-prev" src="${esc(q.img)}" alt=""><button class="btn danger" data-act="delImg" type="button">حذف الصورة</button>` : ""}
          <input type="file" accept="image/*" data-f="img">
        </div>
        <label>الاختيارات <span class="small">(حدّد الدائرة بجانب الإجابة الصحيحة)</span></label>
        ${q.options.map((o, j) => `
          <div class="ed-opt" data-j="${j}">
            <input type="radio" name="c${i}" data-f="correct" ${q.correct === j ? "checked" : ""}>
            <input type="text" data-f="opt" value="${esc(o)}" placeholder="اختيار ${j + 1}">
            <button class="btn danger" data-act="delOpt" type="button">×</button>
          </div>`).join("")}
        <button class="btn ghost" data-act="addOpt" type="button">إضافة اختيار</button>
      </section>`).join("");
  }

  ed.addEventListener("input", (e) => {
    const card = e.target.closest("[data-i]"); if (!card) return;
    const q = draft[card.dataset.i], f = e.target.dataset.f;
    if (f === "text") q.text = e.target.value;
    if (f === "opt") q.options[e.target.closest("[data-j]").dataset.j] = e.target.value;
    dirty = true;
  });
  ed.addEventListener("change", async (e) => {
    if (e.target.dataset.f === "img") {
      const file = e.target.files[0]; if (!file) return;
      const card = e.target.closest("[data-i]");
      try { draft[card.dataset.i].img = await shrinkImage(file); dirty = true; renderEditor(); }
      catch { alert("تعذّر قراءة الصورة، جرّب صورة تانية."); }
      return;
    }
    if (e.target.dataset.f === "correct") {
      const card = e.target.closest("[data-i]");
      draft[card.dataset.i].correct = Number(e.target.closest("[data-j]").dataset.j);
      dirty = true;
    }
  });
  ed.addEventListener("click", (e) => {
    const act = e.target.dataset.act; if (!act) return;
    const card = e.target.closest("[data-i]"), q = draft[card.dataset.i];
    if (act === "delQ") { if (confirm("حذف السؤال؟")) { draft.splice(card.dataset.i, 1); dirty = true; } }
    if (act === "addOpt") { q.options.push(""); dirty = true; }
    if (act === "delImg") { delete q.img; dirty = true; }
    if (act === "delOpt") {
      if (q.options.length <= 2) return alert("لازم يكون في اختيارين على الأقل.");
      const j = Number(e.target.closest("[data-j]").dataset.j);
      q.options.splice(j, 1);
      if (q.correct === j) q.correct = 0; else if (q.correct > j) q.correct--;
      dirty = true;
    }
    renderEditor();
  });

  $("#addQ").onclick = () => {
    draft.push({ text: "", options: ["", "", "", ""], correct: 0 });
    dirty = true;
    renderEditor();
    ed.lastElementChild.scrollIntoView({ behavior: "smooth" });
  };
  $("#saveQ").onclick = async () => {
    const m = $("#saveMsg");
    for (let i = 0; i < draft.length; i++) {
      const q = draft[i];
      if (!q.text.trim() || q.options.some((o) => !o.trim())) {
        m.className = "msg center"; m.textContent = `السؤال ${i + 1} فيه خانة فاضية.`; return;
      }
    }
    m.className = "msg center"; m.textContent = "جاري الحفظ...";
    try {
      const ok = await rpc("admin_save_questions", { p_token: adminToken(), p_exam_id: curId, p_questions: draft });
      if (!ok) { adminExpired(); return; }
    } catch { m.className = "msg center"; m.textContent = NET_MSG; return; }
    exams.find((x) => x.id === curId).questions = JSON.parse(JSON.stringify(draft));
    dirty = false;
    m.className = "msg good center"; m.textContent = "تم حفظ أسئلة هذا الامتحان.";
  };
}

/* ========= تشغيل ========= */
const page = document.body.dataset.page;
if (page === "login") initLogin();
if (page === "exams") initExams();
if (page === "quiz") initQuiz();
if (page === "admin") initAdmin();
if (page === "questions") initQuestions();
