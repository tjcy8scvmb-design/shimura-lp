(function () {
  "use strict";

  var LINE_URL = "https://line.me/ti/p/sgtRPLsqUB";
  var LINE_APP_URL = "line://ti/p/sgtRPLsqUB";
  var DEFAULT_AREA = "miyamae";
  var lastCopiedMessage = "";

  var AREAS = {
    miyamae: {
      id: "miyamae",
      name: "川崎市宮前区",
      short: "宮前区",
      pill: "川崎・宮前区",
      coord: "35.59°N — MIYAMAE ROUTE",
      routeId: "MIYAMAE-07",
      sub: "宮前平エリア｜企業配送で再配達が少なめ。<br class=\"hide-sm\" />直帰OK・配送個数は希望収入に合わせて調整可。",
      incomeBadge: "月40万円以上",
      incomePanel: "月40万円以上可能／手取り42万円の事例あり",
      incomeCount: 40,
      slots: 3,
      work: "神奈川県川崎市宮前区（宮前平・鷺沼・宮崎台駅周辺）",
      features: ["企業・法人向け配送が中心", "宮前区内でエリア固定", "週払い可・再配達が少なめ"],
      points: ["面接は宮前区で実施可", "宅配経験を活かしやすい", "早ければ15時台終了"],
    },
    takatsu: {
      id: "takatsu",
      name: "川崎市高津区",
      short: "高津区",
      pill: "川崎・高津区",
      coord: "35.60°N — TAKATSU ROUTE",
      routeId: "TAKATSU-05",
      sub: "高津駅周辺｜企業配送で効率よく回れる。<br class=\"hide-sm\" />直帰OK・完全出来高。",
      incomeBadge: "月40万円以上",
      incomePanel: "月40万円以上可能／手取り42万円の事例あり",
      incomeCount: 40,
      slots: 3,
      work: "神奈川県川崎市高津区（高津駅周辺）",
      features: ["企業配送中心", "エリア固定で効率化", "週払い可・車両貸出あり"],
      points: ["本社センターから出発", "未経験・経験者ともに歓迎", "研修期間報酬保証あり"],
    },
    nakahara: {
      id: "nakahara",
      name: "川崎市中原区",
      short: "中原区",
      pill: "川崎・中原区",
      coord: "35.58°N — NAKAHARA ROUTE",
      routeId: "NAKAHARA-03",
      sub: "武蔵小杉・新丸子周辺｜企業配送。<br class=\"hide-sm\" />まとめて配達でき効率よく回れる。",
      incomeBadge: "月40万円以上",
      incomePanel: "月40万円以上可能（150個/日×22日・目安）",
      incomeCount: 40,
      slots: 3,
      work: "神奈川県川崎市中原区（武蔵小杉・新丸子周辺）",
      features: ["オフィス・店舗向けが多い", "区内ルートがまとまりやすい", "完全出来高・週払い可"],
      points: ["配送密度が高く効率化しやすい", "副業・Wワーク相談可", "昇給・給与UP制度あり"],
    },
  };

  var nav = document.getElementById("nav");
  var hero = document.getElementById("hero");
  var pageLoadTime = Date.now();

  var GA_SECTIONS = [
    { id: "hero", event: "section_view_hero" },
    { id: "income", event: "section_view_income" },
    { id: "reasons", event: "section_view_benefits" },
    { id: "flow", event: "section_view_job" },
    { id: "tax-app", event: "section_view_app" },
    { id: "faq", event: "section_view_faq" },
    { id: "booking", event: "section_view_form" },
  ];

  var gaScrollMarks = { 25: false, 50: false, 75: false, 90: false };
  var gaSectionFired = {};

  var META_HOOKS = {
    family: {
      for: "家族との時間を取り戻したい人へ",
      lead: "17時退社の企業配送へ。",
      pill: "川崎エリア・家族時間",
    },
    income: {
      for: "しっかり稼ぎたいドライバーへ",
      lead: "月40万円以上の事例も。",
      pill: "完全出来高・週払い可",
    },
    time: {
      for: "定時で帰りたい方へ",
      lead: "17時退社の企業配送へ。",
      pill: "直帰OK・残業少なめ",
    },
  };

  var CONV_STEPS = [
    { id: "reasons", step: 0 },
    { id: "income", step: 1 },
    { id: "booking", step: 2 },
  ];

  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function isLineMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  function openLine() {
    if (isLineMobileDevice()) {
      var fallbackTimer = window.setTimeout(function () {
        window.location.href = LINE_URL;
      }, 900);
      var cancelFallback = function () {
        window.clearTimeout(fallbackTimer);
      };
      window.addEventListener("pagehide", cancelFallback, { once: true });
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) cancelFallback();
      }, { once: true });
      window.location.href = LINE_APP_URL;
      return;
    }
    window.open(LINE_URL, "_blank", "noopener,noreferrer");
  }

  function ga4Event(name, params) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, params || {});
  }

  function getScrollPercent() {
    var doc = document.documentElement;
    var scrollTop = window.scrollY || doc.scrollTop || 0;
    var scrollHeight = doc.scrollHeight - doc.clientHeight;
    if (scrollHeight <= 0) return 0;
    return Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
  }

  function getTimeOnPageSeconds() {
    return Math.round((Date.now() - pageLoadTime) / 1000);
  }

  function getVisibleSectionName() {
    var mid = window.scrollY + window.innerHeight * 0.4;
    var bestId = "hero";
    var bestDist = Infinity;
    GA_SECTIONS.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (!el) return;
      var top = el.offsetTop;
      var bottom = top + el.offsetHeight;
      if (mid >= top && mid <= bottom) {
        bestId = s.id;
        bestDist = -1;
        return;
      }
      if (bestDist >= 0) {
        var center = top + el.offsetHeight / 2;
        var dist = Math.abs(mid - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = s.id;
        }
      }
    });
    return bestId;
  }

  function trackScrollDepth() {
    var pct = getScrollPercent();
    [25, 50, 75, 90].forEach(function (mark) {
      if (!gaScrollMarks[mark] && pct >= mark) {
        gaScrollMarks[mark] = true;
        ga4Event("scroll_" + mark, {
          scroll_percent: mark,
          time_on_page_seconds: getTimeOnPageSeconds(),
        });
      }
    });
  }

  function initGaSectionViews() {
    if (!("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          var section = GA_SECTIONS.find(function (s) { return s.id === id; });
          if (!section || gaSectionFired[section.event]) return;
          gaSectionFired[section.event] = true;
          ga4Event(section.event, {
            section_id: id,
            scroll_percent: getScrollPercent(),
            time_on_page_seconds: getTimeOnPageSeconds(),
          });
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -5% 0px" }
    );

    GA_SECTIONS.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
  }

  function trackInterviewClick(source) {
    ga4Event("interview_click", {
      click_source: source,
      scroll_percent: getScrollPercent(),
      visible_section: getVisibleSectionName(),
      time_on_page_seconds: getTimeOnPageSeconds(),
    });
  }

  function trackFloatingLineClick() {
    ga4Event("floating_line_click", {
      scroll_percent: getScrollPercent(),
      visible_section: getVisibleSectionName(),
      time_on_page_seconds: getTimeOnPageSeconds(),
    });
  }

  function trackLineClick(source) {
    ga4Event("line_click", {
      click_source: source,
      scroll_percent: getScrollPercent(),
      visible_section: getVisibleSectionName(),
      time_on_page_seconds: getTimeOnPageSeconds(),
    });
  }

  function trackTaxAppClick() {
    ga4Event("tax_app_click", {
      scroll_percent: getScrollPercent(),
      visible_section: getVisibleSectionName(),
      time_on_page_seconds: getTimeOnPageSeconds(),
    });
  }

  function scrollToBooking() {
    var el = document.getElementById("booking");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function getAreaId() {
    var select = document.getElementById("formArea");
    if (select && select.value && AREAS[select.value]) return select.value;
    return DEFAULT_AREA;
  }

  function renderList(el, items) {
    if (!el) return;
    el.innerHTML = items.map(function (t) {
      return "<li>" + t + "</li>";
    }).join("");
  }

  function setArea(areaId) {
    var data = AREAS[areaId];
    if (!data) return;

    var select = document.getElementById("formArea");
    if (select) select.value = areaId;

    document.querySelectorAll(".area-chip").forEach(function (chip) {
      chip.classList.toggle("is-active", chip.getAttribute("data-area") === areaId);
    });

    var panelName = document.getElementById("areaPanelName");
    var panelWork = document.getElementById("areaPanelWork");
    var panelIncome = document.getElementById("areaPanelIncome");
    renderList(document.getElementById("areaPanelFeatures"), data.features);
    renderList(document.getElementById("areaPanelPoints"), data.points);
    if (panelName) panelName.textContent = data.name;
    if (panelWork) panelWork.textContent = data.work;
    if (panelIncome) panelIncome.textContent = data.incomePanel;

    var heroCoord = document.getElementById("heroCoord");
    var heroSub = document.getElementById("heroSub");
    var heroIncome = document.getElementById("heroIncomeBadge");
    var heroRoute = document.getElementById("heroRouteId");
    var heroShort = document.getElementById("heroAreaShort");
    var footerArea = document.getElementById("footerArea");
    if (heroCoord) heroCoord.textContent = data.coord;
    if (heroSub) heroSub.innerHTML = data.sub;
    if (heroIncome) heroIncome.innerHTML = "<strong>" + data.incomeBadge + "</strong>可能";
    if (heroRoute) heroRoute.textContent = data.routeId;
    if (heroShort) heroShort.innerHTML = data.short + "<small>固定</small>";
    if (footerArea) footerArea.textContent = data.name;

    var slotEl = document.querySelector(".route-ui__zero span");
    if (slotEl) slotEl.textContent = String(data.slots);

    var slotLabel = "残り" + data.slots + "枠";
    var ctaBadge = document.getElementById("heroCtaBadge");
    var scarcityPill = document.getElementById("heroScarcityPill");
    if (ctaBadge) ctaBadge.textContent = slotLabel;
    if (scarcityPill) scarcityPill.textContent = slotLabel;

    document.querySelectorAll(".route-ui__metrics .count[data-count]").forEach(function (c) {
      var n = parseInt(c.getAttribute("data-count"), 10);
      if (n >= 30 && n <= 50) {
        c.setAttribute("data-count", String(data.incomeCount));
        c.textContent = String(data.incomeCount);
        c.classList.add("is-done");
      }
    });

    try {
      localStorage.setItem("shimura_area", areaId);
    } catch (e) { /* ignore */ }
  }

  function initRegional() {
    var chipsRoot = document.getElementById("areaChips");
    var select = document.getElementById("formArea");
    if (!chipsRoot || !select) return;

    Object.keys(AREAS).forEach(function (key) {
      var data = AREAS[key];
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = data.name;
      select.appendChild(opt);

      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "area-chip";
      chip.setAttribute("data-area", key);
      chip.textContent = data.short;
      chip.addEventListener("click", function () {
        setArea(key);
      });
      chipsRoot.appendChild(chip);
    });

    select.addEventListener("change", function () {
      setArea(select.value);
    });

    var initial = DEFAULT_AREA;
    try {
      var saved = localStorage.getItem("shimura_area");
      if (saved && AREAS[saved]) initial = saved;
    } catch (e) { /* ignore */ }
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get("area");
    if (fromUrl && AREAS[fromUrl]) initial = fromUrl;

    setArea(initial);
  }

  var INCOME_FINE =
    "※試算・月収例は目安です。完全歩合の単価・件数、日給保証の適用はエリア・契約・稼働日により異なります。詳細は面談時にご説明します。";

  function initIncomeSection() {
    var fine = document.getElementById("incomeFine");
    if (fine) fine.textContent = INCOME_FINE;
  }

  function updateConvPath() {
    var y = window.scrollY + window.innerHeight * 0.35;
    var active = 0;
    CONV_STEPS.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (el && el.offsetTop <= y) active = s.step;
    });
    document.querySelectorAll(".conv-path__step").forEach(function (el, i) {
      el.classList.toggle("is-active", i === active);
      el.classList.toggle("is-done", i < active);
    });
  }

  function updateCtaRail() {
    var rail = document.getElementById("ctaRail");
    if (!rail) return;
    var y = window.scrollY || 0;
    var show = hero && y > hero.offsetHeight * 0.5;
    var booking = document.getElementById("booking");
    if (booking) {
      var rect = booking.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.85) show = false;
    }
    rail.hidden = !show;
    rail.classList.toggle("is-visible", show);
  }

  function initMetaHook() {
    var params = new URLSearchParams(window.location.search);
    var hook = params.get("hook") || params.get("utm_content") || "";
    var data = META_HOOKS[hook];
    if (!data) return;

    var elFor = document.getElementById("heroFor");
    var elLead = document.getElementById("heroLead");
    var elPill = document.getElementById("heroMetaPill");
    if (elFor && data.for) elFor.textContent = data.for;
    if (elLead && data.lead) elLead.textContent = data.lead;
    if (elPill && data.pill) elPill.textContent = data.pill;
  }

  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );

    els.forEach(function (el) { io.observe(el); });
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var suffix = el.getAttribute("data-suffix") || "";
    var prefix = el.getAttribute("data-prefix") || "";
    var duration = 1800;
    var start = null;

    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var val = Math.round(easeOutQuart(p) * target);
      el.textContent = prefix + val.toLocaleString("ja-JP") + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.classList.add("is-done");
    }

    requestAnimationFrame(step);
  }

  function initCountUp() {
    var counters = document.querySelectorAll(".count");
    if (!counters.length) return;

    if (!("IntersectionObserver" in window)) {
      counters.forEach(animateCount);
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            animateCount(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 }
    );

    counters.forEach(function (el) { io.observe(el); });
  }

  function formatManYen(yen) {
    var man = yen / 10000;
    return man >= 10 ? man.toFixed(0) : man.toFixed(1);
  }

  function formatYenLabel(yen) {
    return "約 " + yen.toLocaleString("ja-JP") + "円";
  }

  function syncLuxRange(input) {
    var min = parseFloat(input.min, 10);
    var max = parseFloat(input.max, 10);
    var val = parseFloat(input.value, 10);
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--lux-fill", pct.toFixed(1) + "%");
  }

  function pulsePaySimResult(el) {
    if (!el) return;
    el.classList.remove("is-pulse");
    void el.offsetWidth;
    el.classList.add("is-pulse");
  }

  function bindLuxRanges(inputs, resultEl, onUpdate) {
    inputs.forEach(function (input) {
      var handler = function () {
        syncLuxRange(input);
        onUpdate();
        pulsePaySimResult(resultEl);
      };
      input.addEventListener("input", handler);
      syncLuxRange(input);
    });
  }

  function initSimulator() {
    var root = document.getElementById("incomeSimulator");
    if (!root) return;

    var pkg = document.getElementById("simPackages");
    var days = document.getElementById("simDays");
    var rate = document.getElementById("simRate");
    if (!pkg || !days || !rate) return;

    var pkgOut = document.getElementById("simPackagesOut");
    var daysOut = document.getElementById("simDaysOut");
    var rateOut = document.getElementById("simRateOut");
    var monthlyEl = document.getElementById("pieceSimMonthly");
    var suffixEl = document.getElementById("pieceSimSuffix");
    var yenEl = document.getElementById("pieceSimYen");
    var dailyEl = document.getElementById("pieceSimDaily");
    var formulaEl = document.getElementById("pieceSimFormula");

    function update() {
      var p = parseInt(pkg.value, 10);
      var d = parseInt(days.value, 10);
      var r = parseInt(rate.value, 10);
      if (pkgOut) pkgOut.textContent = p;
      if (daysOut) daysOut.textContent = d;
      if (rateOut) rateOut.textContent = r;
      var dailyYen = p * r;
      var monthlyYen = dailyYen * d;
      var monthlyMan = formatManYen(monthlyYen);
      var dailyMan = (dailyYen / 10000).toFixed(2);

      if (monthlyEl) monthlyEl.textContent = monthlyMan;
      if (suffixEl) {
        suffixEl.textContent = monthlyYen >= 400000 ? "以上" : "の目安";
      }
      if (yenEl) yenEl.textContent = formatYenLabel(monthlyYen);
      if (dailyEl) dailyEl.textContent = "約 " + dailyMan + "万円";
      if (formulaEl) {
        formulaEl.textContent = p + "個 × " + r + "円 × " + d + "日";
      }
    }

    bindLuxRanges([pkg, days, rate], document.getElementById("pieceSimValue"), update);
    update();
  }

  var DAILY_GUARANTEE_YEN = 15000;

  function initDailySimulator() {
    var root = document.getElementById("dailyIncomeSimulator");
    var daysInput = document.getElementById("simDailyDays");
    if (!root || !daysInput) return;

    var daysOut = document.getElementById("simDailyDaysOut");
    var monthlyEl = document.getElementById("dailySimMonthly");
    var suffixEl = document.getElementById("dailySimSuffix");
    var yenEl = document.getElementById("dailySimYen");
    var formulaEl = document.getElementById("dailySimFormula");

    function update() {
      var d = parseInt(daysInput.value, 10);
      var monthlyYen = DAILY_GUARANTEE_YEN * d;
      var monthlyMan = formatManYen(monthlyYen);

      if (daysOut) daysOut.textContent = d;
      if (monthlyEl) monthlyEl.textContent = monthlyMan;
      if (suffixEl) suffixEl.textContent = "の目安";
      if (yenEl) yenEl.textContent = formatYenLabel(monthlyYen);
      if (formulaEl) {
        formulaEl.textContent = DAILY_GUARANTEE_YEN.toLocaleString("ja-JP") + "円 × " + d + "日";
      }
    }

    bindLuxRanges([daysInput], document.getElementById("dailySimValue"), update);
    update();
  }

  function val(id) {
    var el = document.getElementById(id);
    return el && el.value ? el.value.trim() : "";
  }

  function collectFormData() {
    var form = document.getElementById("interviewForm");
    if (!form) return null;

    var areaId = getAreaId();
    var data = AREAS[areaId];
    var vehicle = form.querySelector('input[name="vehicle"]:checked');
    var empty = "未入力";

    return {
      name: val("formName"),
      phone: val("formPhone"),
      areaName: data ? data.name : areaId,
      interviewDate: val("formDate") || empty,
      timeSlot: val("formTime") || empty,
      startTiming: val("formStart") || empty,
      vehicle: vehicle ? vehicle.value : empty,
    };
  }

  function buildLineMessage(d) {
    return [
      "【面接予約】志村運送",
      "━━━━━━━━━━━━",
      "■ お名前：" + d.name,
      "■ 電話番号：" + d.phone,
      "■ 希望エリア：" + d.areaName,
      "■ 希望面接日：" + d.interviewDate,
      "■ 希望時間帯：" + d.timeSlot,
      "■ 稼働開始希望：" + d.startTiming,
      "■ 車両：" + d.vehicle,
      "━━━━━━━━━━━━",
      "LPから送信しました。",
    ].join("\n");
  }

  function validateForm() {
    var form = document.getElementById("interviewForm");
    var err = document.getElementById("formError");
    if (!form || !err) return false;

    if (!form.checkValidity()) {
      form.reportValidity();
      err.hidden = true;
      return false;
    }

    var phone = form.phone.value.replace(/[^\d]/g, "");
    if (phone.length < 10) {
      err.textContent = "電話番号を正しく入力してください（10桁以上）。";
      err.hidden = false;
      form.phone.focus();
      return false;
    }

    err.hidden = true;
    return true;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(ta);
    });
  }

  function showBookingSuccess() {
    var box = document.getElementById("bookingSuccess");
    if (box) {
      box.hidden = false;
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function initBookingForm() {
    var form = document.getElementById("interviewForm");
    var lineBtn = document.getElementById("formLineBtn");
    var againBtn = document.getElementById("bookingSuccessAgain");
    var dateInput = document.getElementById("formDate");
    if (!form) return;

    if (dateInput) {
      var today = new Date();
      var y = today.getFullYear();
      var m = String(today.getMonth() + 1).padStart(2, "0");
      var d = String(today.getDate()).padStart(2, "0");
      dateInput.min = y + "-" + m + "-" + d;
    }

    function sendToLine(partial) {
      if (!partial && !validateForm()) return;
      var payload = collectFormData();
      if (!payload) return;
      if (partial) {
        if (!payload.name && !payload.phone) {
          openLine();
          return;
        }
        if (!payload.name || !payload.phone) {
          var err = document.getElementById("formError");
          if (err) {
            err.textContent = "LINEで相談する場合も、お名前と電話番号の入力をお願いします。";
            err.hidden = false;
          }
          return;
        }
      }
      var msg = buildLineMessage(payload);
      lastCopiedMessage = msg;
      copyText(msg)
        .then(function () {
          showBookingSuccess();
          openLine();
        })
        .catch(function () {
          showBookingSuccess();
          openLine();
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      trackInterviewClick("form_submit");
      sendToLine(false);
    });

    if (lineBtn) lineBtn.addEventListener("click", function () { sendToLine(true); });
    if (againBtn) {
      againBtn.addEventListener("click", function () {
        if (lastCopiedMessage) copyText(lastCopiedMessage).then(showBookingSuccess);
      });
    }
  }

  function initLinks() {
    document.querySelectorAll("[data-line]").forEach(function (a) {
      a.href = isLineMobileDevice() ? LINE_APP_URL : LINE_URL;
      if (isLineMobileDevice()) {
        a.removeAttribute("target");
        a.removeAttribute("rel");
      } else {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.addEventListener("click", function (e) {
        if (a.id === "ctaRailLineBtn") {
          trackFloatingLineClick();
        } else {
          var source = a.id || a.className || "line_body";
          if (a.classList.contains("btn--line-hero")) source = "hero_line";
          if (a.classList.contains("btn--line-prominent")) source = "finale_line";
          trackLineClick(source);
        }
        e.preventDefault();
        openLine();
      });
    });

    function goApply(e, source) {
      e.preventDefault();
      trackInterviewClick(source);
      scrollToBooking();
    }

    ["applyBtn", "applyBtnMid", "applyBtnFooter"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.setAttribute("href", "#booking");
        btn.addEventListener("click", function (e) {
          goApply(e, id);
        });
      }
    });

    document.querySelectorAll(".mobile-apply").forEach(function (a) {
      a.setAttribute("href", "#booking");
      a.addEventListener("click", function (e) {
        goApply(e, "mobile_apply");
      });
    });

    document.querySelectorAll(".nav__cta").forEach(function (a) {
      if (["applyBtn", "applyBtnMid", "applyBtnFooter"].indexOf(a.id) !== -1) return;
      if (a.closest && a.closest("#ctaRail")) return;
      a.addEventListener("click", function (e) {
        var href = a.getAttribute("href");
        if (href === "#booking" || href === "#finale") {
          e.preventDefault();
          var source = a.id || (a.classList.contains("header__cta") ? "header_cta" : "nav_cta");
          trackInterviewClick(source);
          scrollToBooking();
        }
      });
    });

    var railBooking = document.querySelector("#ctaRail .btn--primary");
    if (railBooking) {
      railBooking.addEventListener("click", function (e) {
        var href = railBooking.getAttribute("href");
        if (href === "#booking") {
          e.preventDefault();
          trackInterviewClick("floating_booking");
          scrollToBooking();
        }
      });
    }

    var taxCta = document.querySelector(".tax-app__cta");
    if (taxCta) {
      taxCta.addEventListener("click", function () {
        trackTaxAppClick();
      });
    }
  }

  function initGaTracking() {
    initGaSectionViews();
  }

  function onScroll() {
    var y = window.scrollY || 0;
    if (nav) nav.classList.toggle("is-scrolled", y > 24);
    updateConvPath();
    updateCtaRail();
    trackScrollDepth();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  function initExtraIncomeSection() {
    var section = document.getElementById("extra-income");
    if (!section) return;
    section.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMetaHook();
    initReveal();
    initExtraIncomeSection();
    initIncomeSection();
    initCountUp();
    initSimulator();
    initDailySimulator();
    initRegional();
    initBookingForm();
    initLinks();
    initGaTracking();
    onScroll();
    if (hero) {
      requestAnimationFrame(function () {
        hero.classList.add("is-ready");
      });
    }
  });
})();
