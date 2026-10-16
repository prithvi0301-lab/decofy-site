(function () {
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var ATTR_KEYS = UTM_KEYS.concat(["landing_page", "referrer", "form_page"]);
  var STORE_KEY = "decofy_attribution_v1";

  function cleanAttr(value) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  function safeReferrer(value) {
    if (!value) return "";
    try {
      var url = new URL(value);
      return cleanAttr(url.origin + url.pathname);
    } catch (e) {
      return cleanAttr(String(value).split("#")[0].split("?")[0]);
    }
  }

  function readStore(storage) {
    try {
      var raw = storage.getItem(STORE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeStore(storage, data) {
    try { storage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function captureAttribution() {
    var params = new URLSearchParams(window.location.search || "");
    var stored = null;
    try { stored = readStore(window.localStorage) || readStore(window.sessionStorage); } catch (e) { stored = null; }
    var first = stored && stored.firstTouch && typeof stored.firstTouch === "object" ? stored.firstTouch : null;
    if (!first) {
      first = {
        landing_page: window.location.pathname || "/",
        referrer: safeReferrer(document.referrer)
      };
    }
    UTM_KEYS.forEach(function (key) {
      if (first[key]) return;
      var value = params.get(key);
      if (value) first[key] = cleanAttr(value);
    });
    if (!first.landing_page) first.landing_page = window.location.pathname || "/";
    var payload = { firstTouch: first };
    try { writeStore(window.localStorage, payload); } catch (e) {}
    try { writeStore(window.sessionStorage, payload); } catch (e) {}
    return first;
  }

  function attributionValues() {
    var data = {};
    try { data = captureAttribution() || {}; } catch (e) { data = {}; }
    var values = {};
    ATTR_KEYS.forEach(function (key) {
      values[key] = cleanAttr(key === "form_page" ? (window.location.pathname || "/") : (data[key] || ""));
    });
    if (!values.landing_page) values.landing_page = cleanAttr(window.location.pathname || "/");
    values.form_page = cleanAttr(window.location.pathname || "/");
    return values;
  }

  function applyLeadAttribution(lead) {
    var values = attributionValues();
    ATTR_KEYS.forEach(function (key) {
      lead[key] = values[key] || "";
    });
    return lead;
  }

  function syncHiddenFields() {
    var values;
    try { values = attributionValues(); } catch (e) { return; }
    document.querySelectorAll("form").forEach(function (form) {
      ATTR_KEYS.forEach(function (key) {
        var input = form.querySelector('input[name="' + key + '"]');
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.setAttribute("autocomplete", "off");
          form.appendChild(input);
        }
        input.value = values[key] || "";
      });
    });
  }

  window.decofyApplyAttribution = applyLeadAttribution;
  window.decofySyncAttributionFields = syncHiddenFields;

  try { captureAttribution(); } catch (e) {}
  document.addEventListener("DOMContentLoaded", function () {
    try { syncHiddenFields(); } catch (e) {}
  });
})();
