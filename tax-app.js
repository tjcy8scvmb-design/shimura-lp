/**
 * 志村運送 — 個人事業主向け 確定申告サポート（本格版）
 * データは localStorage のみ（端末内保存）
 */

(function () {
  "use strict";

  var STORAGE_KEY = "shimura-tax-app-v2";
  var STORAGE_KEY_V1 = "shimura-tax-app-v1";
  var OUTSOURCE_CATEGORY = "外注費";

  var EXPENSE_CATEGORIES = [
    "ガソリン",
    "高速代",
    "駐車場",
    "車両費",
    "通信費",
    "消耗品",
    "外注費",
    "その他",
  ];

  var CATEGORY_TO_ACCOUNT = {
    ガソリン: "旅費交通費",
    高速代: "旅費交通費",
    駐車場: "旅費交通費",
    車両費: "修繕費",
    通信費: "通信費",
    消耗品: "消耗品費",
    外注費: "外注工賃",
    その他: "雑費",
  };

  var AUTO_SORT_RULES = [
    { cat: "ガソリン", keys: ["ガソリン", "給油", "eneos", "出光", "コスモ", "シェル", "キグナス", "石油", "ss", "スタンド", "refuel"] },
    { cat: "高速代", keys: ["高速", "etc", "nexco", "首都高", "阪神", "料金所", "通行料", "有料"] },
    { cat: "駐車場", keys: ["駐車", "パーキング", "parking", "コインパ"] },
    { cat: "車両費", keys: ["車検", "整備", "タイヤ", "オイル", "リース", "ローン", "車両", "修理", "部品", "自動車", "ディーラー", "板金"] },
    { cat: "通信費", keys: ["docomo", "au", "ソフトバンク", "楽天モバイル", "uq", "povo", "ymobile", "格安", "sim", "通信", "電話", "インターネット", "wifi"] },
    { cat: "消耗品", keys: ["消耗", "文具", "コピー", "用紙", "梱包", "テープ", "ダンボール", "インク", "トナー"] },
    { cat: "外注費", keys: ["外注", "委託", "協力", "代行", "業務委託"] },
  ];

  var state = loadState();
  var receiptPreviewUrl = null;
  var receiptOcrToken = 0;

  /* ── 状態 ── */

  function defaultState() {
    return {
      settings: {
        filingType: null,
        businessName: "",
        ownerName: "",
        blueDeduction: 650000,
        openingCash: 0,
        loans: 0,
        capital: 0,
        setupComplete: false,
      },
      months: {},
      fixedAssets: [],
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return normalizeState(parsed);
      }
      raw = localStorage.getItem(STORAGE_KEY_V1);
      if (raw) {
        var old = JSON.parse(raw);
        var migrated = defaultState();
        migrated.months = old.months || {};
        normalizeAllMonths(migrated);
        migrated.settings.setupComplete = false;
        return migrated;
      }
    } catch (e) { /* ignore */ }
    return defaultState();
  }

  function normalizeState(data) {
    data = data || defaultState();
    if (!data.settings) data.settings = defaultState().settings;
    if (!data.months) data.months = {};
    if (!Array.isArray(data.fixedAssets)) data.fixedAssets = [];
    normalizeAllMonths(data);
    data.fixedAssets = data.fixedAssets.map(normalizeAsset);
    return data;
  }

  function normalizeAllMonths(data) {
    Object.keys(data.months).forEach(function (key) {
      data.months[key] = normalizeMonthRecord(data.months[key]);
    });
  }

  function normalizeMonthRecord(rec) {
    rec = rec || {};
    if (!Array.isArray(rec.receipts)) rec.receipts = [];
    rec.sales = parseNum(rec.sales);
    rec.expenses = parseNum(rec.expenses);
    rec.outsourcing = parseNum(rec.outsourcing);
    rec.fixed = parseNum(rec.fixed);
    return rec;
  }

  function normalizeAsset(a) {
    a = a || {};
    a.id = a.id || "a_" + Date.now();
    a.name = a.name || "";
    a.category = a.category || "車両";
    a.purchaseDate = a.purchaseDate || todayIsoDate();
    a.acquisitionCost = parseNum(a.acquisitionCost);
    a.usefulLifeYears = Math.max(1, parseInt(a.usefulLifeYears, 10) || 4);
    a.method = a.method || "straight";
    a.residualValue = 1;
    return a;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isBlue() {
    return state.settings.filingType === "blue";
  }

  function filingLabel() {
    return isBlue() ? "青色申告" : "白色申告";
  }

  /* ── ユーティリティ ── */

  function monthKey(year, month) {
    return year + "-" + String(month).padStart(2, "0");
  }

  function parseNum(val) {
    var n = Number(val);
    return isNaN(n) || n < 0 ? 0 : Math.floor(n);
  }

  function formatYen(n) {
    return "¥" + Math.round(n).toLocaleString("ja-JP");
  }

  function formatYenPlain(n) {
    return Math.round(n).toLocaleString("ja-JP");
  }

  function currentYear() { return new Date().getFullYear(); }
  function currentMonth() { return new Date().getMonth() + 1; }

  function todayIsoDate() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseDateParts(iso) {
    if (!iso) return null;
    var p = iso.split("-");
    if (p.length !== 3) return null;
    return { year: parseInt(p[0], 10), month: parseInt(p[1], 10), day: parseInt(p[2], 10) };
  }

  function getMonthRecord(year, month) {
    var rec = state.months[monthKey(year, month)];
    return rec ? normalizeMonthRecord(rec) : null;
  }

  function ensureMonthRecord(year, month) {
    var key = monthKey(year, month);
    if (!state.months[key]) state.months[key] = normalizeMonthRecord({});
    else state.months[key] = normalizeMonthRecord(state.months[key]);
    return state.months[key];
  }

  function monthReceiptTotal(rec) {
    if (!rec || !rec.receipts.length) return 0;
    return rec.receipts.reduce(function (s, r) { return s + parseNum(r.amount); }, 0);
  }

  function yearDepreciation(year) {
    var total = 0;
    state.fixedAssets.forEach(function (a) {
      total += calcAssetDepreciation(a, year);
    });
    return total;
  }

  function calcAssetDepreciation(asset, year) {
    asset = normalizeAsset(asset);
    var purchase = parseDateParts(asset.purchaseDate);
    if (!purchase || purchase.year > year) return 0;

    var annual = Math.floor((asset.acquisitionCost - asset.residualValue) / asset.usefulLifeYears);
    var endYear = purchase.year + asset.usefulLifeYears;
    if (year >= endYear) return 0;

    if (purchase.year === year) {
      var monthsInService = 12 - purchase.month + 1;
      return Math.floor(annual * monthsInService / 12);
    }
    return annual;
  }

  function accumulatedDepreciation(asset, year) {
    asset = normalizeAsset(asset);
    var total = 0;
    var purchase = parseDateParts(asset.purchaseDate);
    if (!purchase) return 0;
    for (var y = purchase.year; y <= year; y++) {
      total += calcAssetDepreciation(asset, y);
    }
    return Math.min(total, asset.acquisitionCost - asset.residualValue);
  }

  function bookValue(asset, year) {
    asset = normalizeAsset(asset);
    return Math.max(asset.residualValue, asset.acquisitionCost - accumulatedDepreciation(asset, year));
  }

  function monthCostTotal(rec, year, month) {
    if (!rec) return 0;
    var dep = 0;
    if (year && month) {
      dep = Math.floor(yearDepreciation(year) / 12);
    }
    return parseNum(rec.expenses) + parseNum(rec.outsourcing) + parseNum(rec.fixed) + dep;
  }

  function monthProfit(rec, year, month) {
    if (!rec) return 0;
    var dep = year && month ? Math.floor(yearDepreciation(year) / 12) : 0;
    return parseNum(rec.sales) - parseNum(rec.expenses) - parseNum(rec.outsourcing) - parseNum(rec.fixed) - dep;
  }

  function calcYearTotals(year) {
    var sales = 0, costs = 0, profit = 0, receiptTotal = 0, hasAny = false;
    var dep = yearDepreciation(year);
    for (var m = 1; m <= 12; m++) {
      var rec = getMonthRecord(year, m);
      if (!rec) continue;
      if (rec.sales || rec.expenses || rec.outsourcing || rec.fixed || rec.receipts.length) hasAny = true;
      sales += parseNum(rec.sales);
      costs += parseNum(rec.expenses) + parseNum(rec.outsourcing) + parseNum(rec.fixed);
      receiptTotal += monthReceiptTotal(rec);
    }
    costs += dep;
    profit = sales - costs;
    return { sales: sales, costs: costs, profit: profit, receiptTotal: receiptTotal, depreciation: dep, hasAny: hasAny };
  }

  function aggregateCategories(year) {
    var totals = {};
    EXPENSE_CATEGORIES.forEach(function (c) { totals[c] = 0; });
    for (var m = 1; m <= 12; m++) {
      var rec = getMonthRecord(year, m);
      if (!rec) continue;
      rec.receipts.forEach(function (r) {
        var cat = r.category || "その他";
        if (!totals[cat]) totals[cat] = 0;
        totals[cat] += parseNum(r.amount);
      });
    }
    return totals;
  }

  function aggregateAccounts(year) {
    var accounts = {};
    function addAcc(acc, amt) {
      if (amt > 0) accounts[acc] = (accounts[acc] || 0) + amt;
    }
    for (var m = 1; m <= 12; m++) {
      var rec = getMonthRecord(year, m);
      if (!rec) continue;
      var receiptExp = 0;
      var receiptOut = 0;
      rec.receipts.forEach(function (r) {
        var amt = parseNum(r.amount);
        var acc = r.account || CATEGORY_TO_ACCOUNT[r.category] || "雑費";
        addAcc(acc, amt);
        if (r.category === OUTSOURCE_CATEGORY) receiptOut += amt;
        else receiptExp += amt;
      });
      addAcc("雑費", Math.max(0, parseNum(rec.expenses) - receiptExp));
      addAcc("外注工賃", Math.max(0, parseNum(rec.outsourcing) - receiptOut));
      addAcc("地代家賃", parseNum(rec.fixed));
    }
    addAcc("減価償却費", yearDepreciation(year));
    return accounts;
  }

  function estimateTax(annualProfit) {
    var deduction = isBlue() ? parseNum(state.settings.blueDeduction) : 0;
    var base = Math.max(0, annualProfit - deduction);
    var incomeTax = Math.round(base * 0.05);
    var residentTax = Math.round(base * 0.1);
    return { base: base, deduction: deduction, incomeTax: incomeTax, residentTax: residentTax, total: incomeTax + residentTax };
  }

  function detectCategory(payee, note, extraText) {
    var text = ((payee || "") + " " + (note || "") + " " + (extraText || "")).toLowerCase();
    for (var i = 0; i < AUTO_SORT_RULES.length; i++) {
      var rule = AUTO_SORT_RULES[i];
      for (var j = 0; j < rule.keys.length; j++) {
        if (text.indexOf(rule.keys[j].toLowerCase()) !== -1) return rule.cat;
      }
    }
    return "その他";
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function reiwaToYear(r) {
    return 2018 + parseInt(r, 10);
  }

  function heiseiToYear(h) {
    return 1988 + parseInt(h, 10);
  }

  function toIsoDate(y, m, d) {
    y = parseInt(y, 10);
    m = parseInt(m, 10);
    d = parseInt(d, 10);
    if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseNumbersFromLine(line) {
    var found = [];
    var re = /[¥￥]\s*(\d{1,3}(?:,\d{3})*|\d+)|(\d{1,3}(?:,\d{3})*|\d+)\s*円/g;
    var m;
    while ((m = re.exec(line)) !== null) {
      var raw = (m[1] || m[2] || "").replace(/,/g, "");
      var v = parseInt(raw, 10);
      if (!isNaN(v) && v >= 1 && v <= 99999999) found.push(v);
    }
    return found;
  }

  function parseReceiptDate(text) {
    var patterns = [
      { re: /(\d{4})[\/\.\-年](\d{1,2})[\/\.\-月](\d{1,2})/, fn: function (m) { return toIsoDate(m[1], m[2], m[3]); } },
      { re: /令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/, fn: function (m) { return toIsoDate(reiwaToYear(m[1]), m[2], m[3]); } },
      { re: /平成\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/, fn: function (m) { return toIsoDate(heiseiToYear(m[1]), m[2], m[3]); } },
      { re: /R\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})/i, fn: function (m) { return toIsoDate(reiwaToYear(m[1]), m[2], m[3]); } },
      { re: /(\d{2})[\/\.\-年](\d{1,2})[\/\.\-月](\d{1,2})/, fn: function (m) { return toIsoDate(m[1], m[2], m[3]); } },
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i].re);
      if (match) {
        var iso = patterns[i].fn(match);
        if (iso) return iso;
      }
    }
    return null;
  }

  function parseReceiptAmount(text) {
    var lines = text.split(/\n/);
    var totalRe = /合\s*計|総\s*計|合計額|お買上|御買上|お支払|税込|税込合計|現金|領収|お買い上げ|ご請求/;
    var best = 0;
    var bestScore = -1;

    lines.forEach(function (line, idx) {
      var nums = parseNumbersFromLine(line);
      if (!nums.length) return;
      var score = 0;
      if (totalRe.test(line)) score += 20;
      if (/[¥￥]/.test(line)) score += 5;
      if (idx >= lines.length - 8) score += 3;
      nums.forEach(function (n) {
        if (n < 50 || n > 5000000) return;
        var s = score;
        if (n >= 100) s += 1;
        if (s > bestScore || (s === bestScore && n > best)) {
          bestScore = s;
          best = n;
        }
      });
    });

    if (best > 0) return best;

    var all = [];
    lines.forEach(function (line) {
      parseNumbersFromLine(line).forEach(function (n) {
        if (n >= 100 && n <= 5000000) all.push(n);
      });
    });
    if (!all.length) return 0;
    return Math.max.apply(null, all);
  }

  function isNoisePayeeLine(line) {
    if (!line || line.length < 2) return true;
    if (/^\d+$/.test(line.replace(/[\s\-]/g, ""))) return true;
    if (/TEL|電話|〒|http|領収|レシート|ありがとう|登録番号|インボイス/i.test(line)) return true;
    if (/^[¥￥\d,\.\s]+$/.test(line)) return true;
    return false;
  }

  function parseReceiptPayee(text) {
    var lines = text.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 0; i < Math.min(lines.length, 8); i++) {
      var line = lines[i];
      if (isNoisePayeeLine(line)) continue;
      if (line.length > 40) line = line.slice(0, 40);
      return line;
    }
    return "";
  }

  function parseReceiptNote(text) {
    var itemRe = /給油|ガソリン|軽油|ハイオク|レギュラー|通行料|高速|ETC|駐車|パーキング|洗車|オイル|タイヤ|通信|消耗|外注|委託|軽バン|配送|荷物/;
    var lines = text.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      if (itemRe.test(lines[i]) && !/合\s*計|総\s*計/.test(lines[i])) {
        return lines[i].slice(0, 60);
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].length >= 4 && !isNoisePayeeLine(lines[j]) && !/合\s*計|総\s*計/.test(lines[j])) {
        var nums = parseNumbersFromLine(lines[j]);
        if (nums.length && nums[0] > 500) continue;
        return lines[j].slice(0, 60);
      }
    }
    return "";
  }

  function parseReceiptOcrText(text) {
    text = (text || "").replace(/\r/g, "");
    return {
      date: parseReceiptDate(text),
      payee: parseReceiptPayee(text),
      amount: parseReceiptAmount(text),
      note: parseReceiptNote(text),
      rawText: text,
    };
  }

  function preprocessReceiptImage(file, done) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var maxW = 1600;
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      if (!ctx) { done(file); return; }
      ctx.filter = "contrast(1.2) grayscale(1)";
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        function (blob) { done(blob || file); },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      done(file);
    };
    img.src = url;
  }

  function setReceiptOcrStatus(loading, message, isWarn) {
    var loadHint = document.getElementById("receiptLoadHint");
    var autoHint = document.getElementById("autoCatHint");
    if (loadHint) {
      if (loading) {
        loadHint.hidden = false;
        loadHint.textContent = "レシートを読み取り中です…（数十秒かかる場合があります）";
      } else if (message) {
        loadHint.hidden = false;
        loadHint.textContent = message;
      }
    }
    if (autoHint && loading) autoHint.hidden = true;
    if (autoHint && isWarn && message) {
      autoHint.hidden = false;
      autoHint.textContent = message;
    }
  }

  function applyParsedReceipt(parsed, token) {
    if (token !== receiptOcrToken) return;

    var filled = { date: false, payee: false, amount: false, note: false, category: false };
    var dateEl = document.getElementById("receiptDate");
    var payeeEl = document.getElementById("receiptPayee");
    var amountEl = document.getElementById("receiptAmount");
    var noteEl = document.getElementById("receiptNote");
    var catEl = document.getElementById("receiptCategory");

    if (parsed.date && dateEl) {
      dateEl.value = parsed.date;
      filled.date = true;
    } else if (dateEl && !dateEl.value) {
      dateEl.value = todayIsoDate();
    }

    if (parsed.payee && payeeEl) {
      payeeEl.value = parsed.payee;
      filled.payee = true;
    }

    if (parsed.amount > 0 && amountEl) {
      amountEl.value = String(parsed.amount);
      filled.amount = true;
    }

    if (parsed.note && noteEl) {
      noteEl.value = parsed.note;
      filled.note = true;
    }

    var cat = detectCategory(parsed.payee, parsed.note, parsed.rawText);
    if (catEl) {
      catEl.value = cat;
      filled.category = true;
    }

    var missing = [];
    if (!filled.date) missing.push("日付");
    if (!filled.payee) missing.push("支払先");
    if (!filled.amount) missing.push("金額");
    if (!filled.note) missing.push("内容");

    var autoHint = document.getElementById("autoCatHint");
    if (autoHint) {
      autoHint.hidden = false;
      var account = CATEGORY_TO_ACCOUNT[cat] || "雑費";
      if (missing.length) {
        autoHint.textContent =
          "読み取れなかった項目は手入力してください（" +
          missing.join("・") +
          "）。カテゴリ: " + cat + "（勘定科目: " + account + "）";
      } else {
        autoHint.textContent =
          "読み取り完了。カテゴリ: " + cat + "（勘定科目: " + account + "）— 必要なら修正してください";
      }
    }

    setReceiptOcrStatus(
      false,
      missing.length
        ? "画像を読み込みました。読み取れなかった項目は手入力してください。"
        : "画像を読み込みました。内容を確認して登録してください。",
      false
    );
  }

  function runReceiptOcr(file) {
    if (typeof Tesseract === "undefined") {
      setReceiptOcrStatus(false, "画像を読み込みました。OCRを利用できないため手入力してください。", true);
      return;
    }

    var token = ++receiptOcrToken;
    setReceiptOcrStatus(true);

    preprocessReceiptImage(file, function (blob) {
      if (token !== receiptOcrToken) return;

      Tesseract.recognize(blob, "jpn", {
        logger: function (m) {
          if (token !== receiptOcrToken) return;
          if (m.status === "recognizing text" && m.progress) {
            var pct = Math.round(m.progress * 100);
            var loadHint = document.getElementById("receiptLoadHint");
            if (loadHint) {
              loadHint.textContent = "レシートを読み取り中です… " + pct + "%";
            }
          }
        },
      })
        .then(function (result) {
          if (token !== receiptOcrToken) return;
          var parsed = parseReceiptOcrText(result.data.text || "");
          applyParsedReceipt(parsed, token);
        })
        .catch(function () {
          if (token !== receiptOcrToken) return;
          setReceiptOcrStatus(
            false,
            "読み取れなかった項目は手入力してください",
            true
          );
          var loadHint = document.getElementById("receiptLoadHint");
          if (loadHint) {
            loadHint.hidden = false;
            loadHint.textContent = "画像を読み込みました。読み取れなかった項目は手入力してください。";
          }
        });
    });
  }

  /* ── 起動画面 ── */

  function showStartup() {
    document.getElementById("startupScreen").hidden = false;
    document.getElementById("appShell").hidden = true;
    var s = state.settings;
    document.getElementById("startupBusinessName").value = s.businessName || "";
    document.getElementById("startupOwnerName").value = s.ownerName || "";
    document.getElementById("startupBlueDeduction").value = String(s.blueDeduction || 650000);
    var radio = document.querySelector('input[name="filingType"][value="' + (s.filingType || "blue") + '"]');
    if (radio) radio.checked = true;
    updateStartupDeductionVisibility();
  }

  function hideStartup() {
    document.getElementById("startupScreen").hidden = true;
    document.getElementById("appShell").hidden = false;
  }

  function updateStartupDeductionVisibility() {
    var blue = document.querySelector('input[name="filingType"]:checked');
    var field = document.getElementById("blueDeductionField");
    if (field) field.hidden = !blue || blue.value !== "blue";
  }

  function completeStartup(e) {
    if (e) e.preventDefault();
    var type = document.querySelector('input[name="filingType"]:checked');
    if (!type) return;
    state.settings.filingType = type.value;
    state.settings.businessName = document.getElementById("startupBusinessName").value.trim();
    state.settings.ownerName = document.getElementById("startupOwnerName").value.trim();
    state.settings.blueDeduction = parseNum(document.getElementById("startupBlueDeduction").value);
    state.settings.setupComplete = true;
    saveState();
    hideStartup();
    applySettingsUI();
    refreshHome();
    buildDocCards();
    switchView("home");
  }

  function applySettingsUI() {
    var label = filingLabel();
    setText("headerFilingBadge", label);
    setText("homeFilingLabel", label);
    var lead = document.getElementById("docsDesc");
    if (lead) {
      lead.textContent = isBlue()
        ? "青色申告決算書・損益計算書・貸借対照表・確定申告書Bを作成できます。"
        : "収支内訳書・確定申告書Bを作成できます。";
    }
    var note = document.getElementById("yearTaxNote");
    if (note) {
      note.textContent = isBlue()
        ? "※青色申告特別控除（" + formatYenPlain(state.settings.blueDeduction) + "円）を反映した目安です。"
        : "※実際の金額は控除や家族構成などで変わります。";
    }
  }

  /* ── UI 共通 ── */

  function fillYearSelects() {
    var y = currentYear();
    var years = [y - 1, y, y + 1];
    var ids = ["inputYear", "listYear", "summaryYear", "docsYear", "receiptHistoryYear", "sortYear", "assetYear"];
    ids.forEach(function (id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = "";
      years.forEach(function (yr) {
        var opt = document.createElement("option");
        opt.value = String(yr);
        opt.textContent = yr + "年";
        if (yr === y) opt.selected = true;
        sel.appendChild(opt);
      });
    });
  }

  function fillMonthSelect(id, selectedMonth) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var sm = selectedMonth || currentMonth();
    sel.innerHTML = "";
    for (var m = 1; m <= 12; m++) {
      var opt = document.createElement("option");
      opt.value = String(m);
      opt.textContent = m + "月";
      if (m === sm) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function fillCategorySelect(sel) {
    if (!sel) return;
    sel.innerHTML = "";
    EXPENSE_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  function getSelectedYear(id) {
    var el = document.getElementById(id);
    return el ? parseInt(el.value, 10) : currentYear();
  }

  function getInputYearMonth() {
    return {
      year: getSelectedYear("inputYear"),
      month: parseInt(document.getElementById("inputMonth").value, 10),
    };
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showMessage(text, isError, elId) {
    var el = document.getElementById(elId || "saveMessage");
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = "tax-save-msg" + (isError ? " is-error" : "");
    setTimeout(function () { el.hidden = true; }, 2800);
  }

  function switchView(name) {
    document.querySelectorAll(".tax-view").forEach(function (v) {
      var match = v.dataset.view === name;
      v.hidden = !match;
      v.classList.toggle("is-active", match);
    });
    document.querySelectorAll(".tax-nav__btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.view === name);
    });
    if (name === "input") loadFormFromStorage();
    if (name === "receipt") initReceiptView();
    if (name === "sort") refreshSortView();
    if (name === "assets") refreshAssetsView();
    if (name === "docs") buildDocCards();
    if (name === "list") refreshMonthList();
    if (name === "year") refreshYearViews(getSelectedYear("summaryYear"));
    if (name === "home") refreshHome();
  }

  /* ── ホーム・入力 ── */

  function refreshHome() {
    var year = currentYear();
    var totals = calcYearTotals(year);
    var tax = estimateTax(totals.profit);
    setText("homeAnnualProfit", formatYen(totals.profit));
    setText("homeTaxEstimate", formatYen(tax.total));
  }

  function refreshYearViews(year) {
    var totals = calcYearTotals(year);
    var tax = estimateTax(totals.profit);
    setText("yearSales", formatYen(totals.sales));
    setText("yearCosts", formatYen(totals.costs));
    setText("yearReceiptTotal", formatYen(totals.receiptTotal));
    setText("yearDepreciation", formatYen(totals.depreciation));
    setText("yearProfit", formatYen(totals.profit));
    setText("yearIncomeTax", formatYen(tax.incomeTax));
    setText("yearResidentTax", formatYen(tax.residentTax));
    setText("yearTotalTax", formatYen(tax.total));
  }

  function updateInputReceiptSummary() {
    var ym = getInputYearMonth();
    var rec = getMonthRecord(ym.year, ym.month);
    var box = document.getElementById("inputReceiptSummary");
    var val = document.getElementById("inputReceiptTotal");
    if (!box || !val) return;
    if (!rec || !rec.receipts.length) { box.hidden = true; return; }
    box.hidden = false;
    val.textContent = formatYen(monthReceiptTotal(rec)) + "（" + rec.receipts.length + "件）";
  }

  function loadFormFromStorage() {
    var ym = getInputYearMonth();
    var rec = getMonthRecord(ym.year, ym.month);
    document.getElementById("sales").value = rec ? rec.sales || "" : "";
    document.getElementById("expenses").value = rec ? rec.expenses || "" : "";
    document.getElementById("outsourcing").value = rec ? rec.outsourcing || "" : "";
    document.getElementById("fixed").value = rec ? rec.fixed || "" : "";
    updateProfitPreview();
    updateInputReceiptSummary();
  }

  function updateProfitPreview() {
    var ym = getInputYearMonth();
    var rec = getMonthRecord(ym.year, ym.month);
    var dep = Math.floor(yearDepreciation(ym.year) / 12);
    var sales = parseNum(document.getElementById("sales").value);
    var exp = parseNum(document.getElementById("expenses").value);
    var out = parseNum(document.getElementById("outsourcing").value);
    var fix = parseNum(document.getElementById("fixed").value);
    if (!rec) {
      setText("monthProfitPreview", formatYen(sales - exp - out - fix - dep));
      return;
    }
    setText("monthProfitPreview", formatYen(sales - exp - out - fix - dep));
  }

  function saveMonth(e) {
    if (e) e.preventDefault();
    var ym = getInputYearMonth();
    var key = monthKey(ym.year, ym.month);
    var prev = state.months[key] || {};
    state.months[key] = normalizeMonthRecord({
      sales: parseNum(document.getElementById("sales").value),
      expenses: parseNum(document.getElementById("expenses").value),
      outsourcing: parseNum(document.getElementById("outsourcing").value),
      fixed: parseNum(document.getElementById("fixed").value),
      receipts: prev.receipts || [],
      updatedAt: new Date().toISOString(),
    });
    saveState();
    showMessage(ym.year + "年" + ym.month + "月を保存しました");
    refreshHome();
    updateProfitPreview();
    updateInputReceiptSummary();
  }

  function deleteMonth() {
    var ym = getInputYearMonth();
    if (!confirm(ym.year + "年" + ym.month + "月のデータを削除しますか？（レシートも消えます）")) return;
    delete state.months[monthKey(ym.year, ym.month)];
    saveState();
    ["sales", "expenses", "outsourcing", "fixed"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    updateProfitPreview();
    updateInputReceiptSummary();
    showMessage("削除しました");
    refreshHome();
  }

  function refreshMonthList() {
    var year = getSelectedYear("listYear");
    var tbody = document.getElementById("monthListBody");
    var empty = document.getElementById("listEmpty");
    if (!tbody) return;
    tbody.innerHTML = "";
    var any = false;
    var depM = Math.floor(yearDepreciation(year) / 12);
    for (var m = 1; m <= 12; m++) {
      var rec = getMonthRecord(year, m);
      var tr = document.createElement("tr");
      if (rec && (rec.sales || rec.expenses || rec.outsourcing || rec.fixed || rec.receipts.length)) {
        any = true;
        tr.className = "has-data";
        var cost = parseNum(rec.expenses) + parseNum(rec.outsourcing) + parseNum(rec.fixed) + depM;
        var profit = parseNum(rec.sales) - cost;
        var rc = rec.receipts.length;
        var rSum = monthReceiptTotal(rec);
        tr.innerHTML = "<td>" + m + "月</td><td>" + formatYen(parseNum(rec.sales)) + "</td><td>" + formatYen(cost) + "</td><td>" + (rc ? formatYen(rSum) + '<br><span class="tax-table__sub">' + rc + "件</span>" : "—") + '</td><td class="profit-positive">' + formatYen(profit) + "</td>";
      } else {
        tr.innerHTML = '<td>' + m + '月</td><td colspan="4" style="text-align:left;color:rgba(255,255,255,0.35)">未入力</td>';
      }
      tbody.appendChild(tr);
    }
    if (empty) empty.hidden = any;
  }

  /* ── 仕分け ── */

  function refreshSortView() {
    var year = getSelectedYear("sortYear");
    var cats = aggregateCategories(year);
    var tbody = document.getElementById("sortTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    var total = 0;
    EXPENSE_CATEGORIES.forEach(function (cat) {
      var amt = cats[cat] || 0;
      if (amt <= 0) return;
      total += amt;
      var tr = document.createElement("tr");
      tr.className = "has-data";
      tr.innerHTML = "<td>" + cat + "</td><td>" + (CATEGORY_TO_ACCOUNT[cat] || "雑費") + "</td><td>" + formatYen(amt) + "</td>";
      tbody.appendChild(tr);
    });
    setText("sortTotal", formatYen(total));
  }

  /* ── レシート ── */

  function suggestCategory() {
    var payee = document.getElementById("receiptPayee").value;
    var note = document.getElementById("receiptNote").value;
    var cat = detectCategory(payee, note);
    document.getElementById("receiptCategory").value = cat;
    var hint = document.getElementById("autoCatHint");
    if (hint && (payee || note)) {
      hint.hidden = false;
      hint.textContent = "自動仕分け: " + cat + "（" + (CATEGORY_TO_ACCOUNT[cat] || "雑費") + "）— 必要なら変更してください";
    }
  }

  function clearReceiptImage() {
    receiptOcrToken += 1;
    if (receiptPreviewUrl) { URL.revokeObjectURL(receiptPreviewUrl); receiptPreviewUrl = null; }
    var box = document.getElementById("receiptPreviewBox");
    var img = document.getElementById("receiptPreviewImg");
    var hint = document.getElementById("receiptLoadHint");
    var autoHint = document.getElementById("autoCatHint");
    if (img) img.removeAttribute("src");
    if (box) box.hidden = true;
    if (hint) hint.hidden = true;
    if (autoHint) autoHint.hidden = true;
    ["receiptFile", "receiptCamera"].forEach(function (id) {
      var f = document.getElementById(id);
      if (f) f.value = "";
    });
    var form = document.getElementById("receiptForm");
    if (form) form.classList.remove("is-image-loaded");
  }

  function handleReceiptImage(file) {
    if (!file || !file.type.match(/^image\//)) {
      showMessage("画像ファイルを選んでください", true, "receiptSaveMessage");
      return;
    }
    receiptOcrToken += 1;
    if (receiptPreviewUrl) { URL.revokeObjectURL(receiptPreviewUrl); receiptPreviewUrl = null; }
    document.getElementById("receiptPayee").value = "";
    document.getElementById("receiptAmount").value = "";
    document.getElementById("receiptNote").value = "";
    document.getElementById("receiptCategory").value = "ガソリン";
    var autoHint = document.getElementById("autoCatHint");
    if (autoHint) autoHint.hidden = true;

    receiptPreviewUrl = URL.createObjectURL(file);
    document.getElementById("receiptPreviewImg").src = receiptPreviewUrl;
    document.getElementById("receiptPreviewBox").hidden = false;
    document.getElementById("receiptForm").classList.add("is-image-loaded");
    runReceiptOcr(file);
  }

  function resetReceiptForm(keepDate) {
    if (!keepDate) document.getElementById("receiptDate").value = todayIsoDate();
    document.getElementById("receiptPayee").value = "";
    document.getElementById("receiptAmount").value = "";
    document.getElementById("receiptNote").value = "";
    document.getElementById("receiptCategory").value = "ガソリン";
    var hint = document.getElementById("autoCatHint");
    if (hint) hint.hidden = true;
    clearReceiptImage();
  }

  function registerReceipt(e) {
    if (e) e.preventDefault();
    var iso = document.getElementById("receiptDate").value;
    var parts = parseDateParts(iso);
    if (!parts) { showMessage("日付を選んでください", true, "receiptSaveMessage"); return; }
    var amount = parseNum(document.getElementById("receiptAmount").value);
    if (amount <= 0) { showMessage("金額を入力してください", true, "receiptSaveMessage"); return; }
    var category = document.getElementById("receiptCategory").value;
    var payee = document.getElementById("receiptPayee").value.trim();
    var note = document.getElementById("receiptNote").value.trim();
    var rec = ensureMonthRecord(parts.year, parts.month);
    rec.receipts.push({
      id: "r_" + Date.now(),
      date: iso, payee: payee, amount: amount, note: note, category: category,
      account: CATEGORY_TO_ACCOUNT[category] || "雑費",
      createdAt: new Date().toISOString(),
    });
    if (category === OUTSOURCE_CATEGORY) rec.outsourcing += amount;
    else rec.expenses += amount;
    saveState();
    showMessage(parts.year + "年" + parts.month + "月に登録（" + category + "）", false, "receiptSaveMessage");
    resetReceiptForm(true);
    refreshHome();
    refreshReceiptHistory();
    refreshMonthList();
    refreshYearViews(getSelectedYear("summaryYear"));
    var ym = getInputYearMonth();
    if (ym.year === parts.year && ym.month === parts.month) loadFormFromStorage();
  }

  function deleteReceiptEntry(receiptId) {
    var year = getSelectedYear("receiptHistoryYear");
    var month = parseInt(document.getElementById("receiptHistoryMonth").value, 10);
    var rec = getMonthRecord(year, month);
    if (!rec) return;
    var idx = rec.receipts.findIndex(function (r) { return r.id === receiptId; });
    if (idx === -1) return;
    if (!confirm("このレシート登録を削除しますか？")) return;
    var item = rec.receipts[idx];
    if (item.category === OUTSOURCE_CATEGORY) rec.outsourcing = Math.max(0, rec.outsourcing - parseNum(item.amount));
    else rec.expenses = Math.max(0, rec.expenses - parseNum(item.amount));
    rec.receipts.splice(idx, 1);
    saveState();
    showMessage("削除しました", false, "receiptSaveMessage");
    refreshHome();
    refreshReceiptHistory();
    loadFormFromStorage();
    refreshMonthList();
    refreshYearViews(getSelectedYear("summaryYear"));
  }

  function refreshReceiptHistory() {
    var list = document.getElementById("receiptHistoryList");
    var empty = document.getElementById("receiptHistoryEmpty");
    if (!list) return;
    var year = getSelectedYear("receiptHistoryYear");
    var month = parseInt(document.getElementById("receiptHistoryMonth").value, 10);
    var rec = getMonthRecord(year, month);
    list.innerHTML = "";
    if (!rec || !rec.receipts.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    rec.receipts.slice().reverse().forEach(function (item) {
      var li = document.createElement("li");
      li.className = "tax-receipt-item";
      li.innerHTML = '<div class="tax-receipt-item__main"><p class="tax-receipt-item__date">' + item.date + '</p><p class="tax-receipt-item__payee">' + (item.payee || "（支払先なし）") + '</p><p class="tax-receipt-item__meta">' + item.category + " · " + (item.account || "") + (item.note ? " · " + item.note : "") + '</p></div><p class="tax-receipt-item__amount">' + formatYen(item.amount) + '</p><button type="button" class="tax-receipt-item__del" data-id="' + item.id + '">削除</button>';
      li.querySelector(".tax-receipt-item__del").addEventListener("click", function () { deleteReceiptEntry(item.id); });
      list.appendChild(li);
    });
  }

  function initReceiptView() {
    var dateEl = document.getElementById("receiptDate");
    if (dateEl && !dateEl.value) dateEl.value = todayIsoDate();
    refreshReceiptHistory();
  }

  /* ── 固定資産 ── */

  function saveAsset(e) {
    if (e) e.preventDefault();
    var asset = normalizeAsset({
      id: "a_" + Date.now(),
      name: document.getElementById("assetName").value.trim(),
      category: document.getElementById("assetCategory").value,
      purchaseDate: document.getElementById("assetPurchaseDate").value,
      acquisitionCost: parseNum(document.getElementById("assetCost").value),
      usefulLifeYears: parseInt(document.getElementById("assetLife").value, 10),
      method: document.getElementById("assetMethod").value,
    });
    if (!asset.name || asset.acquisitionCost <= 0) {
      showMessage("資産名と取得価額を入力してください", true, "assetSaveMessage");
      return;
    }
    state.fixedAssets.push(asset);
    saveState();
    document.getElementById("assetForm").reset();
    document.getElementById("assetLife").value = "4";
    showMessage("固定資産を登録しました", false, "assetSaveMessage");
    refreshAssetsView();
    refreshHome();
  }

  function deleteAsset(id) {
    if (!confirm("この固定資産を削除しますか？")) return;
    state.fixedAssets = state.fixedAssets.filter(function (a) { return a.id !== id; });
    saveState();
    refreshAssetsView();
    refreshHome();
  }

  function refreshAssetsView() {
    var year = getSelectedYear("assetYear");
    var list = document.getElementById("assetList");
    var empty = document.getElementById("assetEmpty");
    if (!list) return;
    list.innerHTML = "";
    if (!state.fixedAssets.length) { if (empty) empty.hidden = false; setText("assetDepTotal", formatYen(0)); return; }
    if (empty) empty.hidden = true;
    var depTotal = 0;
    state.fixedAssets.forEach(function (a) {
      var dep = calcAssetDepreciation(a, year);
      depTotal += dep;
      var li = document.createElement("li");
      li.className = "tax-asset-item";
      li.innerHTML = '<div class="tax-asset-item__main"><p class="tax-asset-item__name">' + a.name + '</p><p class="tax-asset-item__meta">' + a.category + " · 取得 " + a.purchaseDate + " · " + formatYen(a.acquisitionCost) + '</p><p class="tax-asset-item__meta">耐用' + a.usefulLifeYears + "年 · 帳簿価額 " + formatYen(bookValue(a, year)) + '</p></div><p class="tax-asset-item__dep">' + formatYen(dep) + '<span>今年の償却</span></p><button type="button" class="tax-receipt-item__del">削除</button>';
      li.querySelector(".tax-receipt-item__del").addEventListener("click", function () { deleteAsset(a.id); });
      list.appendChild(li);
    });
    setText("assetDepTotalLabel", year + "年の減価償却費合計");
    setText("assetDepTotal", formatYen(depTotal));
  }

  /* ── 帳票 ── */

  function profileBlock(year) {
    var s = state.settings;
    return '<div class="pdoc-meta"><p><strong>事業者名：</strong>' + (s.businessName || "—") + '</p><p><strong>氏名：</strong>' + (s.ownerName || "—") + '</p><p><strong>対象期間：</strong>' + year + '年1月1日〜12月31日</p><p><strong>申告区分：</strong>' + filingLabel() + '</p></div>';
  }

  function buildShushinUchiwakesho(year) {
    var totals = calcYearTotals(year);
    var accounts = aggregateAccounts(year);
    var rows = Object.keys(accounts).filter(function (k) { return accounts[k] > 0; }).sort();
    var html = '<div class="pdoc"><h1 class="pdoc__title">収支内訳書（たたき台）</h1>' + profileBlock(year);
    html += '<table class="pdoc-table"><tbody>';
    html += '<tr><th>売上（収入）金額</th><td class="num">' + formatYenPlain(totals.sales) + ' 円</td></tr>';
    rows.forEach(function (acc) {
      html += '<tr><th>経費　' + acc + '</th><td class="num">' + formatYenPlain(accounts[acc]) + ' 円</td></tr>';
    });
    html += '<tr class="total"><th>経費計</th><td class="num">' + formatYenPlain(totals.costs) + ' 円</td></tr>';
    html += '<tr class="accent"><th>差引金額（所得）</th><td class="num">' + formatYenPlain(totals.profit) + ' 円</td></tr>';
    html += '</tbody></table><p class="pdoc-note">※ e-Tax提出用の正式様式ではありません。経理データの整理用です。</p></div>';
    return html;
  }

  function buildPL(year) {
    var totals = calcYearTotals(year);
    var accounts = aggregateAccounts(year);
    var html = '<div class="pdoc"><h1 class="pdoc__title">損益計算書</h1>' + profileBlock(year);
    html += '<table class="pdoc-table"><thead><tr><th>科目</th><th>金額（円）</th></tr></thead><tbody>';
    html += '<tr><td>売上高</td><td class="num">' + formatYenPlain(totals.sales) + '</td></tr>';
    Object.keys(accounts).filter(function (k) { return accounts[k] > 0 && k !== "減価償却費"; }).sort().forEach(function (acc) {
      html += '<tr><td>' + acc + '</td><td class="num">' + formatYenPlain(accounts[acc]) + '</td></tr>';
    });
    if (accounts["減価償却費"]) html += '<tr><td>減価償却費</td><td class="num">' + formatYenPlain(accounts["減価償却費"]) + '</td></tr>';
    html += '<tr class="total"><td>費用合計</td><td class="num">' + formatYenPlain(totals.costs) + '</td></tr>';
    html += '<tr class="accent"><td>当期純利益</td><td class="num">' + formatYenPlain(totals.profit) + '</td></tr>';
    html += '</tbody></table></div>';
    return html;
  }

  function buildBS(year) {
    var totals = calcYearTotals(year);
    var fixedNet = state.fixedAssets.reduce(function (s, a) { return s + bookValue(a, year); }, 0);
    var cash = parseNum(state.settings.openingCash) + totals.profit;
    var loans = parseNum(state.settings.loans);
    var capital = parseNum(state.settings.capital);
    var equity = capital + totals.profit;
    var html = '<div class="pdoc"><h1 class="pdoc__title">貸借対照表</h1>' + profileBlock(year);
    html += '<div class="pdoc-cols"><section><h2>資産の部</h2><table class="pdoc-table"><tbody>';
    html += '<tr><td>現金預金</td><td class="num">' + formatYenPlain(cash) + '</td></tr>';
    html += '<tr><td>固定資産（帳簿価額）</td><td class="num">' + formatYenPlain(fixedNet) + '</td></tr>';
    html += '<tr class="total"><td>資産合計</td><td class="num">' + formatYenPlain(cash + fixedNet) + '</td></tr>';
    html += '</tbody></table></section><section><h2>負債・資本の部</h2><table class="pdoc-table"><tbody>';
    html += '<tr><td>借入金</td><td class="num">' + formatYenPlain(loans) + '</td></tr>';
    html += '<tr><td>元入金</td><td class="num">' + formatYenPlain(capital) + '</td></tr>';
    html += '<tr><td>当期純利益</td><td class="num">' + formatYenPlain(totals.profit) + '</td></tr>';
    html += '<tr class="total"><td>負債・資本合計</td><td class="num">' + formatYenPlain(loans + equity) + '</td></tr>';
    html += '</tbody></table></section></div>';
    html += '<p class="pdoc-note">※簡易版です。実際の申告では税理士と残高を確認してください。</p></div>';
    return html;
  }

  function buildBlueKessanshoFull(year) {
    var html = '<div class="pdoc"><h1 class="pdoc__title">青色申告決算書</h1>' + profileBlock(year);
    html += '<p class="pdoc-lead">損益計算書および貸借対照表の要約</p>';
    var totals = calcYearTotals(year);
    html += '<table class="pdoc-table"><tbody>';
    html += '<tr><th>売上（収入）金額</th><td class="num">' + formatYenPlain(totals.sales) + '</td></tr>';
    html += '<tr><th>経費合計</th><td class="num">' + formatYenPlain(totals.costs) + '</td></tr>';
    html += '<tr><th>うち減価償却費</th><td class="num">' + formatYenPlain(totals.depreciation) + '</td></tr>';
    html += '<tr class="accent"><th>青色申告特別控除前の所得</th><td class="num">' + formatYenPlain(totals.profit) + '</td></tr>';
    if (isBlue()) html += '<tr><th>青色申告特別控除</th><td class="num">' + formatYenPlain(state.settings.blueDeduction) + '</td></tr>';
    html += '<tr class="accent"><th>所得金額（目安）</th><td class="num">' + formatYenPlain(Math.max(0, totals.profit - (isBlue() ? state.settings.blueDeduction : 0))) + '</td></tr>';
    html += '</tbody></table></div>';
    return html;
  }

  function buildKakuteiShinkokuB(year) {
    var totals = calcYearTotals(year);
    var tax = estimateTax(totals.profit);
    var html = '<div class="pdoc"><h1 class="pdoc__title">確定申告書B（転記用メモ）</h1>' + profileBlock(year);
    html += '<table class="pdoc-table"><tbody>';
    html += '<tr><th>事業（営業等）の収入金額</th><td class="num">' + formatYenPlain(totals.sales) + ' 円</td></tr>';
    html += '<tr><th>必要経費</th><td class="num">' + formatYenPlain(totals.costs) + ' 円</td></tr>';
    html += '<tr><th>差引金額（所得）</th><td class="num">' + formatYenPlain(totals.profit) + ' 円</td></tr>';
    if (isBlue()) {
      html += '<tr><th>青色申告特別控除額</th><td class="num">' + formatYenPlain(tax.deduction) + ' 円</td></tr>';
      html += '<tr class="accent"><th>控除後の所得（目安）</th><td class="num">' + formatYenPlain(tax.base) + ' 円</td></tr>';
    }
    html += '<tr><th>所得税の目安</th><td class="num">' + formatYenPlain(tax.incomeTax) + ' 円</td></tr>';
    html += '<tr><th>住民税の目安</th><td class="num">' + formatYenPlain(tax.residentTax) + ' 円</td></tr>';
    html += '</tbody></table><p class="pdoc-note">※国税庁の確定申告書Bへ転記するためのメモです。正式な申告はe-Taxまたは税務署で行ってください。</p></div>';
    return html;
  }

  var DOC_BUILDERS = {
    shushin: { title: "収支内訳書", build: buildShushinUchiwakesho, white: true, blue: false },
    kakutei: { title: "確定申告書B", build: buildKakuteiShinkokuB, white: true, blue: true },
    blue_kessan: { title: "青色申告決算書", build: buildBlueKessanshoFull, white: false, blue: true },
    pl: { title: "損益計算書", build: buildPL, white: false, blue: true },
    bs: { title: "貸借対照表", build: buildBS, white: false, blue: true },
  };

  function buildDocCards() {
    var container = document.getElementById("docCardList");
    if (!container) return;
    container.innerHTML = "";
    Object.keys(DOC_BUILDERS).forEach(function (key) {
      var doc = DOC_BUILDERS[key];
      if (isBlue() && !doc.blue) return;
      if (!isBlue() && !doc.white) return;
      var card = document.createElement("article");
      card.className = "tax-doc-card";
      card.innerHTML = '<h3 class="tax-doc-card__title">' + doc.title + '</h3><p class="tax-doc-card__desc">' + getSelectedYear("docsYear") + '年分のプレビュー・印刷</p><button type="button" class="tax-btn tax-btn--ghost tax-doc-card__btn" data-doc="' + key + '">プレビュー</button>';
      card.querySelector("button").addEventListener("click", function () { openDocPreview(key); });
      container.appendChild(card);
    });
  }

  function openDocPreview(key) {
    var year = getSelectedYear("docsYear");
    var doc = DOC_BUILDERS[key];
    if (!doc) return;
    document.getElementById("docModalBody").innerHTML = doc.build(year);
    document.getElementById("docModal").hidden = false;
    document.body.classList.add("doc-modal-open");
  }

  function closeDocModal() {
    document.getElementById("docModal").hidden = true;
    document.body.classList.remove("doc-modal-open");
  }

  function printDoc() {
    var content = document.getElementById("docModalBody").innerHTML;
    var w = window.open("", "_blank");
    w.document.write('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>帳票印刷</title><style>body{font-family:"Noto Sans JP",sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #333;padding:8px;text-align:left}.num{text-align:right}.total{font-weight:bold;background:#f0f0f0}.accent{font-weight:bold;background:#e8f4ff}.pdoc__title{text-align:center;font-size:1.25rem;margin-bottom:16px}.pdoc-meta{margin-bottom:20px;font-size:0.9rem}.pdoc-note{font-size:0.8rem;color:#555;margin-top:16px}.pdoc-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}h2{font-size:1rem;margin:8px 0}</style></head><body>' + content + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 400);
  }

  /* ── CSV ── */

  function escapeCsvCell(val) {
    var s = String(val);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCsv(filename, rows) {
    var bom = "\uFEFF";
    var body = rows.map(function (row) { return row.map(escapeCsvCell).join(","); }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bom + body], { type: "text/csv;charset=utf-8" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function buildCsvForYear(year) {
    var totals = calcYearTotals(year);
    var tax = estimateTax(totals.profit);
    var rows = [["年", "月", "売上", "経費", "外注費", "固定費", "レシート件数", "レシート合計", "減価償却", "経費合計", "利益"]];
    for (var m = 1; m <= 12; m++) {
      var rec = getMonthRecord(year, m);
      if (!rec) continue;
      var base = parseNum(rec.expenses) + parseNum(rec.outsourcing) + parseNum(rec.fixed);
      if (!rec.sales && !base && !rec.receipts.length) continue;
      rows.push([year, m, rec.sales, rec.expenses, rec.outsourcing, rec.fixed, rec.receipts.length, monthReceiptTotal(rec), Math.floor(totals.depreciation / 12), base + Math.floor(totals.depreciation / 12), rec.sales - base - Math.floor(totals.depreciation / 12)]);
    }
    rows.push([]);
    rows.push(["年間まとめ", year, totals.sales, "", "", "", "", totals.receiptTotal, totals.depreciation, totals.costs, totals.profit]);
    rows.push(["申告区分", filingLabel()]);
    rows.push(["所得税目安", tax.incomeTax]);
    rows.push(["住民税目安", tax.residentTax]);
    return rows;
  }

  function exportCsvYear() {
    downloadCsv("志村運送_経理_" + getSelectedYear("docsYear") + "年.csv", buildCsvForYear(getSelectedYear("docsYear")));
  }

  function exportCsvAll() {
    var years = {};
    Object.keys(state.months).forEach(function (key) { years[key.slice(0, 4)] = true; });
    var yearList = Object.keys(years).sort();
    if (!yearList.length) { alert("まだデータがありません。"); return; }
    var rows = [["年", "月", "売上", "経費", "外注費", "固定費", "レシート件数", "レシート合計", "利益"]];
    yearList.forEach(function (y) {
      var yr = parseInt(y, 10);
      for (var m = 1; m <= 12; m++) {
        var rec = getMonthRecord(yr, m);
        if (!rec) continue;
        var cost = parseNum(rec.expenses) + parseNum(rec.outsourcing) + parseNum(rec.fixed);
        if (!rec.sales && !cost && !rec.receipts.length) continue;
        rows.push([yr, m, rec.sales, rec.expenses, rec.outsourcing, rec.fixed, rec.receipts.length, monthReceiptTotal(rec), rec.sales - cost]);
      }
    });
    downloadCsv("志村運送_経理_全期間.csv", rows);
  }

  /* ── 初期化 ── */

  function initNavigation() {
    document.querySelectorAll(".tax-nav__btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });
    document.querySelectorAll("[data-go]").forEach(function (el) {
      el.addEventListener("click", function () { switchView(el.getAttribute("data-go")); });
    });
  }

  function initForm() {
    document.getElementById("monthForm").addEventListener("submit", saveMonth);
    ["sales", "expenses", "outsourcing", "fixed"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", updateProfitPreview);
    });
    ["inputYear", "inputMonth"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", loadFormFromStorage);
    });
    document.getElementById("deleteMonthBtn").addEventListener("click", deleteMonth);
    document.getElementById("listYear").addEventListener("change", refreshMonthList);
    document.getElementById("summaryYear").addEventListener("change", function () { refreshYearViews(getSelectedYear("summaryYear")); });
    document.getElementById("sortYear").addEventListener("change", refreshSortView);
    document.getElementById("assetYear").addEventListener("change", refreshAssetsView);
    document.getElementById("docsYear").addEventListener("change", buildDocCards);
    document.getElementById("exportCsvBtn").addEventListener("click", exportCsvYear);
    document.getElementById("exportCsvAllBtn").addEventListener("click", exportCsvAll);
  }

  function initReceipt() {
    fillCategorySelect(document.getElementById("receiptCategory"));
    document.getElementById("receiptDate").value = todayIsoDate();
    function onFileChange(e) { var f = e.target.files && e.target.files[0]; if (f) handleReceiptImage(f); }
    document.getElementById("receiptFile").addEventListener("change", onFileChange);
    document.getElementById("receiptCamera").addEventListener("change", onFileChange);
    document.getElementById("clearReceiptImage").addEventListener("click", clearReceiptImage);
    document.getElementById("receiptForm").addEventListener("submit", registerReceipt);
    document.getElementById("receiptHistoryYear").addEventListener("change", refreshReceiptHistory);
    document.getElementById("receiptHistoryMonth").addEventListener("change", refreshReceiptHistory);
    ["receiptPayee", "receiptNote"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", suggestCategory);
    });
  }

  function initAssets() {
    document.getElementById("assetForm").addEventListener("submit", saveAsset);
    document.getElementById("assetPurchaseDate").value = todayIsoDate();
  }

  function initStartup() {
    document.getElementById("startupProfileForm").addEventListener("submit", completeStartup);
    document.querySelectorAll('input[name="filingType"]').forEach(function (r) {
      r.addEventListener("change", updateStartupDeductionVisibility);
    });
    document.getElementById("openSettingsBtn").addEventListener("click", showStartup);
    document.getElementById("closeDocModal").addEventListener("click", closeDocModal);
    document.getElementById("printDocBtn").addEventListener("click", printDoc);
    document.getElementById("docModal").addEventListener("click", function (e) {
      if (e.target === document.getElementById("docModal")) closeDocModal();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    fillYearSelects();
    fillMonthSelect("inputMonth");
    fillMonthSelect("receiptHistoryMonth");
    initNavigation();
    initForm();
    initReceipt();
    initAssets();
    initStartup();

    if (!state.settings.setupComplete || !state.settings.filingType) {
      showStartup();
    } else {
      hideStartup();
      applySettingsUI();
      loadFormFromStorage();
      refreshHome();
      buildDocCards();
      switchView("home");
    }
  });
})();
