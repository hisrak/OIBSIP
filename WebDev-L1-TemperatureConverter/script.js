// ThermoLab - Temperature Converter (vanilla JS)
(function () {
  "use strict";

  var SYMBOLS = { C: "°C", F: "°F", K: "K" };
  var ABSOLUTE_ZERO = { C: -273.15, F: -459.67, K: 0 };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var form = document.getElementById("converter-form");
  var input = document.getElementById("temp-input");
  var errorBox = document.getElementById("input-error");
  var badge = document.getElementById("unit-badge");
  var thermo = document.getElementById("thermo");
  var marker = document.getElementById("marker");
  var statusText = document.getElementById("status-text");
  var statusEmoji = document.querySelector(".status-emoji");
  var particles = document.getElementById("particles");
  var historyList = document.getElementById("history-list");
  var cards = document.querySelectorAll(".result");
  var history = [];
  var current = null; // last successful conversion { value, unit }

  /* ---------- conversion (everything goes through Celsius) ---------- */
  function toCelsius(v, u) { return u === "F" ? (v - 32) * 5 / 9 : u === "K" ? v - 273.15 : v; }
  function fromCelsius(c, u) { return u === "F" ? c * 9 / 5 + 32 : u === "K" ? c + 273.15 : c; }
  function round2(n) { var r = Math.round(n * 100) / 100; return Object.is(r, -0) ? 0 : r; }
  function fmt(n) { return round2(n).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  function selectedUnit() { return form.elements.unit.value; }

  /* ---------- validation ---------- */
  function validate(raw, unit) {
    var text = raw.trim();
    if (text === "") return { error: "Please enter a temperature to convert." };
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return { error: "That is not a valid number. Use digits only, for example 25 or -4.5." };
    var value = Number(text);
    if (!isFinite(value)) return { error: "That number is too large. Please try a smaller value." };
    if (value < ABSOLUTE_ZERO[unit]) return { error: "Below absolute zero! Nothing can be colder than −273.15 °C, −459.67 °F or 0 K." };
    return { value: value };
  }
  function showError(msg) {
    errorBox.textContent = msg; errorBox.hidden = false;
    input.setAttribute("aria-invalid", "true"); input.parentNode.classList.add("invalid");
  }
  function clearError() {
    errorBox.textContent = ""; errorBox.hidden = true;
    input.setAttribute("aria-invalid", "false"); input.parentNode.classList.remove("invalid");
  }

  /* ---------- mood, status and thermometer ---------- */
  function describe(c) {
    if (c <= -273.15) return ["extreme", "🧊", "Absolute zero — the coldest possible temperature"];
    if (c < 0) return ["freezing", "❄️", c === 0 ? "Water freezes here" : "Freezing cold"];
    if (c === 0) return ["freezing", "❄️", "Water freezes at this temperature"];
    if (c < 15) return ["cold", "🧥", "Chilly — take a jacket"];
    if (c < 26) return ["mild", "😊", "Comfortable"];
    if (c < 36) return ["warm", "☀️", "Warm"];
    if (c <= 37.3) return ["warm", "🧍", "Around normal human body temperature"];
    if (c < 100) return ["hot", "🔥", "Hot"];
    if (c < 100.005) return ["boiling", "♨️", "Water boils at this temperature"];
    return ["boiling", "🌋", "Extremely hot"];
  }
  function setMood(mood) {
    document.body.setAttribute("data-mood", mood);
    var type = /^(extreme|freezing|cold)$/.test(mood) ? "snow" : /^(hot|boiling)$/.test(mood) ? "ember" : "";
    particles.innerHTML = "";
    if (!type || reduceMotion) return;
    for (var i = 0; i < 28; i++) {
      var p = document.createElement("span");
      p.className = "p " + type;
      p.style.cssText = "left:" + Math.random() * 100 + "%;--s:" + (4 + Math.random() * 8) + "px;animation-duration:" +
        (6 + Math.random() * 8) + "s;animation-delay:-" + Math.random() * 12 + "s";
      particles.appendChild(p);
    }
  }
  function setGauge(c) {
    var pct = Math.max(0, Math.min(1, (c + 50) / 200)) * 100;
    thermo.style.setProperty("--level", Math.max(pct, 3) + "%");
  }

  /* ---------- animated numbers ---------- */
  function tween(el, to) {
    var from = el._v || 0; el._v = to;
    cancelAnimationFrame(el._raf);
    if (reduceMotion) { el.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function step(t) {
      var p = Math.min((t - t0) / 800, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- main action ---------- */
  function convert(save) {
    var unit = selectedUnit();
    var res = validate(input.value, unit);
    if (res.error) { showError(res.error); resetResults(); return; }
    clearError();

    var c = toCelsius(res.value, unit);
    var out = { C: fromCelsius(c, "C"), F: fromCelsius(c, "F"), K: fromCelsius(c, "K") };
    ["C", "F", "K"].forEach(function (u) { tween(document.getElementById("out-" + u), out[u]); });
    cards.forEach(function (card) {
      card.classList.add("filled");
      card.classList.toggle("is-source", card.dataset.unit === unit);
    });
    var d = describe(round2(c));
    setMood(d[0]); setGauge(c);
    statusEmoji.textContent = d[1]; statusText.textContent = d[2];
    marker.textContent = fmt(c) + " °C";
    current = { value: res.value, unit: unit };
    if (save !== false) addHistory(res.value, unit, out);
  }
  function resetResults() {
    cards.forEach(function (card) { card.classList.remove("filled", "is-source"); });
    ["C", "F", "K"].forEach(function (u) { var o = document.getElementById("out-" + u); o._v = 0; o.textContent = "—"; });
    setMood("idle"); thermo.style.setProperty("--level", "6%");
    marker.textContent = "—"; statusEmoji.textContent = "🌡️"; statusText.textContent = "Enter a temperature to begin";
    current = null;
  }

  /* ---------- history ---------- */
  function addHistory(v, u, out) {
    var key = v + u;
    if (history.length && history[0].key === key) return;
    history.unshift({ key: key, v: v, u: u, text: fmt(v) + " " + SYMBOLS[u] + "  →  " + ["C", "F", "K"].filter(function (x) { return x !== u; })
      .map(function (x) { return fmt(out[x]) + " " + SYMBOLS[x]; }).join("  ·  ") });
    history = history.slice(0, 6);
    renderHistory();
  }
  function renderHistory() {
    historyList.innerHTML = "";
    if (!history.length) { historyList.innerHTML = '<li class="empty">Nothing yet — your last conversions will appear here.</li>'; return; }
    history.forEach(function (h) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = h.text;
      b.addEventListener("click", function () { input.value = h.v; setUnit(h.u); convert(false); });
      li.appendChild(b); historyList.appendChild(li);
    });
  }

  /* ---------- helpers + events ---------- */
  function setUnit(u) { form.elements.unit.value = u; badge.textContent = SYMBOLS[u]; }

  form.addEventListener("submit", function (e) { e.preventDefault(); convert(); });
  // real-time validation while typing
  input.addEventListener("input", function () {
  if (/^[+-]?\.?$/.test(input.value.trim())) { clearError(); return; }
    var r = validate(input.value, selectedUnit());
    if (r.error) showError(r.error); else clearError();
  });
  Array.prototype.forEach.call(form.elements.unit, function (r) {
    r.addEventListener("change", function () {
      badge.textContent = SYMBOLS[selectedUnit()];
      if (input.value.trim() !== "") { var rr = validate(input.value, selectedUnit()); if (rr.error) showError(rr.error); else { clearError(); if (current) convert(false); } }
    });
  });
  document.getElementById("clear-btn").addEventListener("click", function () {
    input.value = ""; clearError(); resetResults(); input.focus();
  });
  document.querySelectorAll(".chip").forEach(function (b) {
    b.addEventListener("click", function () { input.value = b.dataset.value; setUnit(b.dataset.unit); convert(); });
  });
  document.querySelectorAll(".copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var u = b.dataset.copy, el = document.getElementById("out-" + u);
      if (el.textContent === "—") return;
      var text = el.textContent + " " + SYMBOLS[u];
      var done = function () { b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy"; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done();
    });
  });
  document.getElementById("clear-history").addEventListener("click", function () { history = []; renderHistory(); });

  setUnit("C");
})();