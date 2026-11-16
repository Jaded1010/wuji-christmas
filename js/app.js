/* 乌鸡的圣诞 · 前端逻辑(无依赖) */
(() => {
  "use strict";
  const C = window.WUJI_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const OWNER = params.has("owner");   // 乌鸡本人用 ?owner=1 打开: 礼物要点击拆开
  const SET_MODE = params.has("set") || location.hash === "#set"; // 录入答案模式
  const DEMO = params.has("demo");     // ?demo=1 预览树上挂满礼物的效果(不会保存)
  const TOTAL = C.questions.length;

  const TITLES = { home: "乌鸡的圣诞", quiz: "关于乌鸡的 10 道题", result: "答题结果", tree: "乌鸡的圣诞树" };
  const BOXES = [
    { id: "pudding", src: "assets/box-pudding.png", label: "布丁狗礼盒" },
    { id: "pig", src: "assets/box-pig.png", label: "小猪礼盒" },
    { id: "xmas", src: "assets/box-xmas.png", label: "圣诞礼盒" },
  ];
  const boxSrc = (id) => (BOXES.find((b) => b.id === id) || BOXES[2]).src;

  /* 树上的挂点: [左 %, 上 %] (相对整张树图) */
  const SLOTS = [
    [50, 22],
    [36, 34], [64, 34],
    [25, 46], [50, 45], [75, 46],
    [15, 58], [38, 58], [62, 58], [85, 58],
    [25, 70], [50, 69], [75, 70],
  ];

  const state = {
    name: localStorage.getItem("wuji_name") || "",
    qi: 0,
    score: 0,
    answered: false,
    stack: ["home"],
    gifts: [],
    box: "pudding",
    isSetting: false,
    newAnswers: [],
  };

  /* ================= 小工具 ================= */
  function el(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "style") n.setAttribute("style", v);
      else n.setAttribute(k, v);
    }
    [].concat(kids).forEach((c) => c != null && n.append(c));
    return n;
  }
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }
  function burst(x, y, chars = ["✨", "❄️", "🎁", "⭐", "💖"], n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      const s = el("span", { class: "burst", text: chars[i % chars.length] });
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(a) * d + "px");
      s.style.setProperty("--dy", Math.sin(a) * d - 30 + "px");
      s.style.setProperty("--r", (Math.random() * 360 - 180) + "deg");
      document.body.append(s);
      setTimeout(() => s.remove(), 1500);
    }
  }
  const center = (node) => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  /* ================= 音效(WebAudio, 无需音频文件) ================= */
  let actx;
  let muted = localStorage.getItem("wuji_muted") === "1";
  document.body.classList.toggle("muted", muted);
  function tone(f, t0, dur, type = "sine", vol = 0.12) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      const t = actx.currentTime + t0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* 浏览器不支持就静音 */ }
  }
  const sfx = {
    click: () => tone(660, 0, 0.12, "triangle", 0.08),
    ok: () => [784, 988, 1319].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle")),
    no: () => { tone(300, 0, 0.25, "sawtooth", 0.06); tone(220, 0.12, 0.3, "sawtooth", 0.06); },
    bell: () => [1568, 2093, 1760, 2349].forEach((f, i) => tone(f, i * 0.1, 0.6, "sine", 0.09)),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.5, "triangle")),
  };
  $("#sound").addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem("wuji_muted", muted ? "1" : "0");
    document.body.classList.toggle("muted", muted);
    if (!muted) sfx.bell();
  });

  /* ================= 雪花 ================= */
  (function snow() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = $("#snow"), cx = cv.getContext("2d");
    let W, H, flakes = [];
    const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
    addEventListener("resize", resize); resize();
    const N = innerWidth < 600 ? 38 : 70;
    for (let i = 0; i < N; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.6, v: 0.3 + Math.random() * 0.9, p: Math.random() * 6 });
    (function tick() {
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = "rgba(255,255,255,.85)";
      for (const f of flakes) {
        f.y += f.v; f.p += 0.02; f.x += Math.sin(f.p) * 0.4;
        if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
        cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 6.3); cx.fill();
      }
      requestAnimationFrame(tick);
    })();
  })();

  /* ================= 页面切换 ================= */
  function go(id, stack) {
    if (stack) state.stack = stack;
    else if (state.stack[state.stack.length - 1] !== id) state.stack.push(id);
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === "s-" + id));
    $("#back").style.visibility = state.stack.length > 1 ? "visible" : "hidden";
    $("#title").textContent = TITLES[id];
    scrollTo(0, 0);
    if (id === "tree") loadGifts();
  }
  $("#back").addEventListener("click", () => {
    sfx.click();
    if (state.stack.length > 1) { state.stack.pop(); go(state.stack[state.stack.length - 1], state.stack); }
  });

  /* ================= 首页 ================= */
  $("#name-input").value = state.name;
  $("#name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.name = $("#name-input").value.trim();
    if (!state.name) return;
    localStorage.setItem("wuji_name", state.name);
    sfx.bell();
    startQuiz();
  });
  $("#skip-to-tree").addEventListener("click", () => { sfx.click(); go("tree", ["home", "tree"]); });
  $("#btn-set-answers")?.addEventListener("click", () => {
    sfx.bell();
    startSetAnswers();
  });

  /* ================= 答题 / 乌鸡录入答案 ================= */
  function startSetAnswers() {
    state.isSetting = true;
    state.qi = 0;
    state.newAnswers = C.questions.map((q) => q.answer);
    $("#q-mode-tip").hidden = false;
    go("quiz", ["home", "quiz"]);
    renderQ();
  }

  function startQuiz() {
    state.isSetting = false;
    state.qi = 0; state.score = 0;
    $("#q-mode-tip").hidden = true;
    go("quiz", ["home", "quiz"]);
    renderQ();
  }
  function setSprite(name) {
    const img = $("#q-wuji");
    img.src = `assets/wuji-${name}.png`;
    img.classList.remove("pop"); void img.offsetWidth; img.classList.add("pop");
  }
  function renderQ() {
    const q = C.questions[state.qi];
    state.answered = false;
    $("#q-bar").style.width = (state.qi / TOTAL) * 100 + "%";
    $("#q-num").textContent = `第 ${state.qi + 1} / ${TOTAL} 题`;
    $("#q-text").textContent = q.q;
    setSprite(state.isSetting ? "wave" : "think");
    const box = $("#q-options");
    box.replaceChildren(...q.options.map((o, i) =>
      el("button", { class: "opt", type: "button", onclick: () => pick(i) }, [el("b", { text: "ABCD"[i] }), el("span", { text: o })])
    ));
    $("#q-fun").hidden = true;
    $("#q-next").hidden = true;
  }
  async function pick(i) {
    if (state.answered) return;
    state.answered = true;
    const q = C.questions[state.qi];

    if (state.isSetting) {
      // 乌鸡录入模式：记录乌鸡选择的选项为本题正确答案
      state.newAnswers[state.qi] = i;
      $$("#q-options .opt").forEach((b, k) => {
        b.disabled = true;
        if (k === i) b.classList.add("right");
        else b.classList.add("dim");
      });
      setSprite("happy");
      sfx.ok();
      const fun = $("#q-fun");
      fun.textContent = `已选定：「${q.options[i]}」`;
      fun.hidden = false;
      const next = $("#q-next");
      next.textContent = state.qi === TOTAL - 1 ? "💾 保存我的真实答案" : "下一题";
      next.hidden = false;
      $("#q-bar").style.width = ((state.qi + 1) / TOTAL) * 100 + "%";
      next.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // 普通朋友答题判定模式
    const ok = i === q.answer;
    if (ok) state.score++;
    $$("#q-options .opt").forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add("right");
      else if (k === i) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    setSprite(ok ? "happy" : "cry");
    ok ? sfx.ok() : sfx.no();
    const fun = $("#q-fun");
    fun.textContent = (ok ? "答对啦!" : `哎呀,乌鸡选的是「${q.options[q.answer]}」。`) + (q.fun ? " " + q.fun : "");
    fun.hidden = false;
    const next = $("#q-next");
    next.textContent = state.qi === TOTAL - 1 ? "看结果" : "下一题";
    next.hidden = false;
    $("#q-bar").style.width = ((state.qi + 1) / TOTAL) * 100 + "%";
    next.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#q-next").addEventListener("click", async () => {
    sfx.click();
    if (state.qi < TOTAL - 1) {
      state.qi++;
      renderQ();
      scrollTo(0, 0);
    } else {
      if (state.isSetting) {
        // 保存乌鸡的真实答案
        $("#q-next").disabled = true;
        await Store.saveAnswers(state.newAnswers);
        state.newAnswers.forEach((ans, idx) => {
          if (C.questions[idx]) C.questions[idx].answer = ans;
        });
        sfx.win();
        burst(innerWidth / 2, innerHeight / 3, undefined, 20);
        toast("乌鸡的真实答案已保存！朋友们答题将以此为准 🎉");
        setTimeout(() => {
          state.isSetting = false;
          $("#q-mode-tip").hidden = true;
          go("tree", ["home", "tree"]);
        }, 1200);
      } else {
        showResult();
      }
    }
  });

  /* ================= 结果 ================= */
  function showResult() {
    const tier = C.tiers.find((t) => state.score >= t.min) || C.tiers[C.tiers.length - 1];
    $("#r-score").textContent = state.score;
    $("#r-title").textContent = tier.title;
    $("#r-text").textContent = tier.text;
    $("#r-wuji").src = `assets/wuji-${tier.sprite}.png`;
    go("result", ["home", "result"]);
    if (state.score >= 8) { sfx.win(); setTimeout(() => burst(innerWidth / 2, innerHeight / 3, undefined, 22), 300); }
    else sfx.bell();
  }
  $("#r-tree").addEventListener("click", () => { sfx.click(); go("tree"); });
  $("#r-again").addEventListener("click", () => { sfx.click(); startQuiz(); });

  /* ================= 礼物与答案数据: 服务器优先, 失败时回落到本机 localStorage ================= */
  const Store = {
    remote: false,
    async getAnswers() {
      try {
        const r = await fetch("api/answers", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.answers) && d.answers.length === TOTAL) return d.answers;
        }
      } catch { /* 本地 */ }
      try {
        const local = JSON.parse(localStorage.getItem("wuji_custom_answers") || "null");
        if (Array.isArray(local) && local.length === TOTAL) return local;
      } catch {}
      return null;
    },
    async saveAnswers(answers) {
      localStorage.setItem("wuji_custom_answers", JSON.stringify(answers));
      try {
        await fetch("api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
      } catch {}
    },
    async list() {
      if (DEMO) return demoGifts();
      try {
        const r = await fetch("api/gifts", { cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        this.remote = true;
        return (await r.json()).gifts || [];
      } catch {
        this.remote = false;
        return JSON.parse(localStorage.getItem("wuji_gifts") || "[]");
      }
    },
    async add(g) {
      if (this.remote) {
        try {
          const r = await fetch("api/gifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(g) });
          if (r.ok) return (await r.json()).gift;
        } catch { /* 落到本地 */ }
      }
      const all = JSON.parse(localStorage.getItem("wuji_gifts") || "[]");
      g = { ...g, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now() };
      all.push(g);
      localStorage.setItem("wuji_gifts", JSON.stringify(all));
      return g;
    },
  };
  function demoGifts() {
    const names = ["小白", "猪猪", "嘻嘻嘻", "大", "阿青", "团子", "小满", "朋友"];
    const things = ["一起去看演唱会", "一顿火锅", "最新款数码产品", "暖暖的毛线袜", "大大的拥抱", "一场旅行 🧳", "巧克力礼盒 🍫", "睡到自然醒券"];
    return names.map((n, i) => ({ id: "d" + i, from: n, gift: things[i], msg: "圣诞快乐！希望新的一年也一起开开心心！", box: BOXES[i % 3].id }));
  }

  /* ================= 圣诞树 ================= */
  const opened = new Set(JSON.parse(localStorage.getItem("wuji_opened") || "[]"));
  function slotFor(g, i) {
    const base = SLOTS[i % SLOTS.length];
    if (i < SLOTS.length) return { x: base[0], y: base[1], s: 1 };
    const h = hash(g.id);                       // 超出 13 个后: 在原挂点附近错开并略缩小
    return { x: base[0] + ((h % 9) - 4), y: base[1] + (((h >> 4) % 7) - 3) + 3, s: 0.82 };
  }
  function renderTree(freshId) {
    const wrap = $("#gifts");
    wrap.replaceChildren(...state.gifts.map((g, i) => {
      const p = slotFor(g, i);
      const b = el("button", {
        class: "gift" + (g.id === freshId ? " fresh" : "") + (opened.has(g.id) ? " opened" : ""),
        type: "button", "aria-label": `${g.from} 送的礼物`,
        style: `left:${p.x}%;top:${p.y}%;width:${15.5 * p.s}%`,
        onclick: () => openView(g),
      }, [el("span", { class: "gift-inner", style: `--d:${-(hash(g.id) % 40) / 10}s` }, [
        el("img", { src: boxSrc(g.box), alt: "", draggable: "false" }),
        el("span", { class: "tag", text: g.from }),
      ])]);
      return b;
    }));
    const n = state.gifts.length;
    const c = $("#count");
    if (n) c.replaceChildren("已有 ", el("b", { text: n }), OWNER ? " 份心意,快来拆开" : " 份心意,等乌鸡来拆开");
    else c.textContent = "树上还空空的,来做第一个吧";
  }
  async function loadGifts(freshId) {
    state.gifts = await Store.list();
    renderTree(freshId);
  }
  setInterval(() => {
    if ($("#s-tree").classList.contains("active") && $("#modal-form").hidden && $("#modal-view").hidden && !DEMO) loadGifts();
  }, 20000);

  /* ----- 查看礼物 ----- */
  function openView(g) {
    sfx.bell();
    const body = $("#view-body");
    const reveal = () => {
      opened.add(g.id); localStorage.setItem("wuji_opened", JSON.stringify([...opened]));
      body.replaceChildren(
        ...(OWNER ? [el("img", { class: "v-wuji reveal", src: "assets/wuji-unbox.png", alt: "" })] : [el("img", { class: "v-box", src: boxSrc(g.box), alt: "" })]),
        el("p", { class: "v-from", text: `来自 ${g.from}` }),
        el("p", { class: "v-gift reveal", text: g.gift }),
        g.msg ? el("p", { class: "v-msg", text: g.msg }) : el("p", { class: "v-hint", text: "(没有留言,但心意已经收到啦)" })
      );
      renderTree();
    };
    if (OWNER && !opened.has(g.id)) {
      const bx = el("img", { class: "v-box shake", src: boxSrc(g.box), alt: "" });
      body.replaceChildren(bx, el("p", { class: "v-from", text: `来自 ${g.from}` }), el("button", {
        class: "btn", type: "button", text: "拆开礼物",
        onclick: (e) => { sfx.win(); burst(...center(e.currentTarget)); reveal(); },
      }));
    } else reveal();
    showModal("#modal-view");
  }

  /* ----- 挂礼物表单 ----- */
  $("#f-ideas").replaceChildren(...C.giftIdeas.map((t) => el("button", { class: "chip", type: "button", text: t, onclick: () => { $("#f-gift").value = t; sfx.click(); } })));
  function renderBoxes() {
    $("#f-boxes").replaceChildren(...BOXES.map((b) => el("button", {
      class: "box-opt" + (b.id === state.box ? " on" : ""), type: "button", role: "radio",
      "aria-checked": String(b.id === state.box), "aria-label": b.label,
      onclick: () => { state.box = b.id; sfx.click(); renderBoxes(); },
    }, [el("img", { src: b.src, alt: b.label })])));
  }
  $("#open-form").addEventListener("click", () => {
    sfx.click();
    $("#f-from").value = state.name;
    renderBoxes();
    showModal("#modal-form");
  });
  $("#gift-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#f-submit");
    btn.disabled = true;
    const g = {
      from: $("#f-from").value.trim().slice(0, 15),
      gift: $("#f-gift").value.trim().slice(0, 30),
      msg: $("#f-msg").value.trim().slice(0, 120),
      box: state.box,
    };
    if (!g.from || !g.gift) { btn.disabled = false; return; }
    state.name = g.from; localStorage.setItem("wuji_name", g.from);
    let saved;
    if (DEMO) saved = { ...g, id: "n" + Date.now() };
    else saved = await Store.add(g);
    hideModals();
    if (DEMO) { state.gifts.push(saved); renderTree(saved.id); }
    else await loadGifts(saved.id);
    $("#gift-form").reset(); $("#f-from").value = state.name;
    btn.disabled = false;
    sfx.bell(); setTimeout(sfx.ok, 500);
    const [x, y] = center($("#stage"));
    setTimeout(() => burst(x, y, undefined, 18), 600);
    toast("乌鸡:这份心意,我收好啦!🎁");
    $("#stage").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  /* ----- 弹窗开关 ----- */
  function showModal(sel) { hideModals(); $(sel).hidden = false; document.body.style.overflow = "hidden"; }
  function hideModals() { $$(".modal").forEach((m) => (m.hidden = true)); document.body.style.overflow = ""; }
  $$("[data-close]").forEach((n) => n.addEventListener("click", () => { sfx.click(); hideModals(); }));
  addEventListener("keydown", (e) => e.key === "Escape" && hideModals());

  /* ================= 启动 ================= */
  (async function init() {
    const customAns = await Store.getAnswers();
    if (customAns) {
      customAns.forEach((ans, i) => {
        if (C.questions[i]) C.questions[i].answer = ans;
      });
    }

    const start = location.hash.slice(1);
    if (SET_MODE) startSetAnswers();
    else if (start === "tree") go("tree", ["home", "tree"]);
    else if (start === "quiz") { state.name = state.name || "朋友"; startQuiz(); }
    else if (start === "result") { state.score = 9; showResult(); }
    else if (start === "form") { go("tree", ["home", "tree"]); $("#open-form").click(); }
  })();
})();
