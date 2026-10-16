import assert from "node:assert/strict";
import handler, {
  _internal,
} from "../api/lead.js";

const { normaliseLead, buildEmailText, safeSubject, buildDeliveryPayload } = _internal;

const ENDPOINT = "https://script.google.com/macros/s/test/exec";
const TOKEN = "test-token";
let calls;

async function test(name, fn) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (error) {
    console.log("FAIL", name, error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

function mockResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    end(payload) {
      this.body = JSON.parse(payload);
    },
  };
}

function mockRequest({ method = "POST", origin, host = "www.decofy.in", body = {}, withOrigin = true } = {}) {
  const headers = { host };
  if (withOrigin) headers.origin = origin === undefined ? "https://www.decofy.in" : origin;
  return { method, headers, body };
}

function installFetch(impl) {
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return impl(url, options);
  };
}

function jsonOk(body) {
  return {
    ok: true,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function withDeliveryEnv() {
  process.env.GOOGLE_SHEETS_ENDPOINT = ENDPOINT;
  process.env.GOOGLE_SHEETS_TOKEN = TOKEN;
}

function clearDeliveryEnv() {
  delete process.env.GOOGLE_SHEETS_ENDPOINT;
  delete process.env.GOOGLE_SHEETS_TOKEN;
}

function deliveredBody() {
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.deepEqual(calls[0].options.headers, { "Content-Type": "text/plain;charset=UTF-8" });
  assert.equal(calls[0].options.method, "POST");
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.token, TOKEN);
  assert.equal(payload.to, undefined);
  assert.equal(payload.recipient, undefined);
  assert.equal(payload.from, undefined);
  assert.equal(payload.bcc, undefined);
  assert.equal(payload.cc, undefined);
  assert.equal(payload.text.includes(TOKEN), false);
  return payload;
}

const tests = [
  ["old payload keeps legacy date, budget, and Area label", () => {
    const text = buildEmailText(normaliseLead({
      source: "Homepage quote form",
      name: "A",
      phone: "1",
      area: "HSR",
      requirement: "Full Home",
      budget: "₹3–5 lakh",
      expected_start_date: "2026-12-01",
      subject: "x",
      from_name: "Decofy Website",
      botcheck: "",
    }));
    assert.match(text, /^New Decofy lead \(Homepage quote form\)\n\nLEAD DETAILS\n/);
    assert.match(text, /^Area: HSR$/m);
    assert.match(text, /^Requirement: Full Home$/m);
    assert.match(text, /^Expected start date \[legacy\]: 2026-12-01$/m);
    assert.match(text, /^Approx\. budget: ₹3–5 lakh$/m);
    assert.equal(text.includes("Expected start timeline"), false);
    assert.equal(text.includes("ATTRIBUTION"), false);
    assert.equal(text.includes("from_name"), false);
    assert.equal(text.includes("botcheck"), false);
  }],

  ["new payload prints timeline, new requirement, and attribution only", () => {
    const text = buildEmailText(normaliseLead({
      source: "Consultation form",
      name: "TEST - GAS Bot compatibility check - ignore",
      phone: "0000000000",
      area: "TEST",
      requirement: "uPVC Interiors / Multiple Rooms",
      expected_start_timeline: "Just exploring",
      utm_source: "test",
      utm_medium: "test",
      utm_campaign: "gasbot_compat",
      utm_content: "ad",
      utm_term: "upvc",
      landing_page: "/?utm_source=test",
      referrer: "",
      form_page: "/consultation",
    }));
    assert.match(text, /^Requirement: uPVC Interiors \/ Multiple Rooms$/m);
    assert.match(text, /^Expected start timeline: Just exploring$/m);
    assert.match(text, /^Area: TEST$/m);
    assert.equal(text.includes("Approx. budget"), false);
    assert.equal(text.includes("legacy"), false);
    assert.match(text, /ATTRIBUTION\nutm_source: test\nutm_medium: test\nutm_campaign: gasbot_compat/);
    assert.match(text, /^form_page: \/consultation$/m);
    assert.equal(text.includes("referrer:"), false);
  }],

  ["accepted timeline values pass through, including the en dash", () => {
    for (const timeline of ["Within 30 days", "1\u20133 months", "3+ months", "Just exploring"]) {
      assert.equal(normaliseLead({ expected_start_timeline: timeline }).expected_start_timeline, timeline);
    }
  }],

  ["legacy requirement values pass through unchanged", () => {
    for (const requirement of ["Modular Kitchen", "Wardrobes", "Full Home", "Kitchen and Wardrobes", "Other uPVC Interior", "uPVC Wall Panels"]) {
      assert.equal(normaliseLead({ requirement }).requirement, requirement);
    }
  }],

  ["missing both start fields fabricates neither line", () => {
    const text = buildEmailText(normaliseLead({ name: "A", phone: "1", area: "B", requirement: "Wardrobes" }));
    assert.equal(/Expected start/.test(text), false);
    assert.equal(text.includes("2026-"), false);
    assert.equal(normaliseLead({}).expected_start_date, "");
    assert.equal(normaliseLead({}).expected_start_timeline, "");
  }],

  ["empty budget is omitted", () => {
    assert.equal(buildEmailText(normaliseLead({ name: "A", budget: "  " })).includes("budget"), false);
    assert.equal(buildEmailText(normaliseLead({ name: "A" })).includes("budget"), false);
  }],

  ["CRLF injection in attribution and subject stays on one line", () => {
    const lead = normaliseLead({ utm_source: "x\r\nBcc: evil@example.com\r\n\r\nInjected" });
    assert.equal(/[\r\n]/.test(lead.attribution.utm_source), false);
    const lines = buildEmailText(lead).split("\n");
    assert.equal(lines.filter((line) => line.startsWith("Bcc:")).length, 0);
    assert.equal(/[\r\n]/.test(safeSubject("Hi\r\nBcc: e@x.com")), false);
    assert.equal(safeSubject("Hi\r\nBcc: e@x.com"), "Hi Bcc: e@x.com");
  }],

  ["attribution is capped at 300 and HTML is stripped", () => {
    const lead = normaliseLead({
      referrer: "a".repeat(5000),
      utm_campaign: "pre<script>alert(1)</script>post<img src=x>",
      landing_page: "ok<b>bold</b>",
    });
    assert.equal(lead.attribution.referrer.length, 300);
    assert.equal(lead.attribution.utm_campaign.includes("<"), false);
    assert.equal(lead.attribution.utm_campaign.includes("alert(1)"), false);
    assert.match(lead.attribution.utm_campaign, /^pre\s*post/);
    assert.equal(lead.attribution.landing_page, "ok bold");
  }],

  ["other lead fields cap at 1000 and message at 2000", () => {
    const lead = normaliseLead({
      name: "n".repeat(5000),
      area: "a".repeat(5000),
      message: "m".repeat(5000),
    });
    assert.equal(lead.name.length, 1000);
    assert.equal(lead.area.length, 1000);
    assert.equal(lead.message.length, 2000);
  }],

  ["control characters are stripped from single-line fields", () => {
    assert.equal(normaliseLead({ name: "A\u0000B\u2028C\u0007" }).name, "A B C");
  }],

  ["malformed legacy dates are dropped and valid dates are kept", () => {
    assert.equal(normaliseLead({ expected_start_date: "tomorrow" }).expected_start_date, "");
    assert.equal(normaliseLead({ expected_start_date: "2026/12/01" }).expected_start_date, "");
    assert.equal(normaliseLead({ expected_start_date: "2026-13-40" }).expected_start_date, "");
    assert.equal(normaliseLead({ expected_start_date: "2025-02-29" }).expected_start_date, "");
    assert.equal(normaliseLead({ expected_start_date: "2026-12-01" }).expected_start_date, "2026-12-01");
    assert.equal(normaliseLead({ expected_start_date: "2024-02-29" }).expected_start_date, "2024-02-29");
  }],

  ["unknown timeline is flagged and not rewritten to a known value", () => {
    const timeline = normaliseLead({ expected_start_timeline: "ASAP" }).expected_start_timeline;
    assert.equal(timeline.startsWith("[unrecognised] "), true);
    assert.match(timeline, /ASAP/);
    assert.equal(timeline.includes("Within 30 days"), false);
  }],

  ["locality is accepted when area is empty", () => {
    assert.equal(normaliseLead({ locality: "Indiranagar" }).area, "Indiranagar");
    assert.equal(normaliseLead({ area: "HSR", locality: "Indiranagar" }).area, "HSR");
  }],

  ["message keeps newlines and drops other controls", () => {
    const message = normaliseLead({ message: "Line 1\r\nLine\u00002\n\n\nLine 3" }).message;
    assert.equal(message, "Line 1\nLine 2\n\nLine 3");
  }],

  ["missing or foreign origin is rejected before field validation", async () => {
    clearDeliveryEnv();
    installFetch(async () => {
      throw new Error("fetch should not run");
    });
    for (const request of [
      mockRequest({ withOrigin: false, body: {} }),
      mockRequest({ origin: "https://evil.example", body: {} }),
    ]) {
      const response = mockResponse();
      await handler(request, response);
      assert.equal(response.statusCode, 403);
      assert.deepEqual(response.body, { success: false, message: "Invalid request origin" });
      assert.equal(response.headers["Cache-Control"], "no-store");
    }
    assert.equal(calls.length, 0);
  }],

  ["honeypot returns the existing success body and does not deliver", async () => {
    clearDeliveryEnv();
    installFetch(async () => {
      throw new Error("fetch should not run");
    });
    const response = mockResponse();
    await handler(mockRequest({
      body: { botcheck: "on", name: "", utm_source: "should-not-send" },
    }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, message: "Request received" });
    assert.equal(calls.length, 0);
  }],

  ["non-POST is still 405", async () => {
    const response = mockResponse();
    await handler(mockRequest({ method: "GET" }), response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, "POST");
    assert.deepEqual(response.body, { success: false, message: "Method not allowed" });
  }],

  ["missing name keeps the existing validation error", async () => {
    withDeliveryEnv();
    installFetch(async () => jsonOk({ success: true }));
    const response = mockResponse();
    await handler(mockRequest({
      body: { phone: "1", area: "HSR", requirement: "Wardrobes", expected_start_date: "2026-12-01" },
    }), response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { success: false, message: "Please complete all required fields" });
    assert.equal(calls.length, 0);
  }],

  ["legacy handler payload delivers the new body without changing destination", async () => {
    withDeliveryEnv();
    installFetch(async () => jsonOk({ success: true, message: "Request received" }));
    const response = mockResponse();
    await handler(mockRequest({
      body: {
        source: "Homepage quote form",
        subject: "New Quote Request — Decofy",
        from_name: "Decofy Website",
        name: "A",
        phone: "9999999999",
        area: "HSR",
        requirement: "Full Home",
        budget: "₹3–5 lakh",
        expected_start_date: "2026-12-01",
        message: "10x12 kitchen",
        botcheck: "",
      },
    }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, message: "Request received" });
    const payload = deliveredBody();
    assert.equal(payload.source, "Homepage quote form");
    assert.equal(payload.subject, undefined);
    assert.equal(payload.budget, "₹3–5 lakh");
    assert.equal(payload.expected_start_date, "2026-12-01");
    assert.equal(payload.expected_start_timeline, "");
    assert.match(payload.text, /^Area: HSR$/m);
    assert.match(payload.text, /^Expected start date \[legacy\]: 2026-12-01$/m);
    assert.match(payload.text, /^Approx\. budget: ₹3–5 lakh$/m);
    assert.equal(payload.text.includes("ATTRIBUTION"), false);
    assert.equal(payload.from_name, undefined);
  }],

  ["new handler payload is accepted without a date, budget, or fabricated default", async () => {
    withDeliveryEnv();
    installFetch(async () => jsonOk({ success: true, message: "Saved" }));
    const response = mockResponse();
    await handler(mockRequest({
      body: {
        source: "Consultation form",
        subject: "New Consultation Request — Decofy\r\nBcc: evil@example.com",
        name: "TEST - GAS Bot compatibility check - ignore",
        phone: "0000000000",
        area: "TEST",
        requirement: "uPVC Interiors / Multiple Rooms",
        expected_start_timeline: "1\u20133 months",
        budget: "   ",
        utm_source: "x\r\nBcc: evil@example.com\r\n\r\nInjected",
        utm_medium: "test",
        utm_campaign: "c".repeat(5000),
        landing_page: "/consultation?utm_source=test",
        form_page: "/consultation",
      },
    }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, message: "Saved" });
    const payload = deliveredBody();
    assert.equal(payload.expected_start_date, "");
    assert.equal(payload.expected_start_timeline, "1\u20133 months");
    assert.equal(payload.budget, "");
    assert.equal(payload.requirement, "uPVC Interiors / Multiple Rooms");
    assert.equal(payload.subject, undefined);
    assert.equal(Object.hasOwn(payload, "subject"), false);
    assert.equal(/[\r\n]/.test(payload.utm_source), false);
    assert.equal(payload.utm_campaign.length, 300);
    assert.match(payload.text, /^Expected start timeline: 1\u20133 months$/m);
    assert.match(payload.text, /^ATTRIBUTION$/m);
    assert.match(payload.text, /^utm_source: x Bcc: evil@example.com Injected$/m);
    assert.equal(payload.text.split("\n").some((line) => line.startsWith("Bcc:")), false);
    assert.equal(payload.text.includes("Approx. budget"), false);
    assert.equal(payload.text.includes("Expected start date"), false);
  }],

  ["missing optional fields still succeed and print no start or budget lines", async () => {
    withDeliveryEnv();
    installFetch(async () => jsonOk({ success: true }));
    const response = mockResponse();
    await handler(mockRequest({
      body: { name: "A", phone: "1", area: "HSR", requirement: "Wardrobes", source: "not a real source" },
    }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, message: "Request received" });
    const payload = deliveredBody();
    assert.equal(payload.source, "Website form");
    assert.equal(Object.hasOwn(payload, "subject"), false);
    assert.equal(/Expected start/.test(payload.text), false);
    assert.equal(payload.text.includes("Approx. budget"), false);
    assert.equal(payload.text.includes("ATTRIBUTION"), false);
  }],

  ["attribution cannot change the delivery URL or request headers", async () => {
    withDeliveryEnv();
    installFetch(async () => jsonOk({ success: true }));
    const response = mockResponse();
    await handler(mockRequest({
      body: {
        name: "A",
        phone: "1",
        area: "HSR",
        requirement: "Wardrobes",
        utm_source: "https://evil.example/steal",
        referrer: "admin@decofy.in",
      },
    }), response);
    const payload = deliveredBody();
    assert.equal(calls[0].url, ENDPOINT);
    assert.equal(Object.keys(calls[0].options.headers).join(","), "Content-Type");
    assert.equal(payload.utm_source, "https://evil.example/steal");
    assert.match(payload.text, /^utm_source: https:\/\/evil\.example\/steal$/m);
  }],

  ["upstream rejection and timeout keep the existing failure responses", async () => {
    withDeliveryEnv();
    installFetch(async () => ({ ok: false, async text() { return "nope"; } }));
    let response = mockResponse();
    await handler(mockRequest({
      body: { name: "A", phone: "1", area: "HSR", requirement: "Wardrobes" },
    }), response);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.body, { success: false, message: "Unable to send request" });

    installFetch(async () => jsonOk({ success: false }));
    response = mockResponse();
    await handler(mockRequest({
      body: { name: "A", phone: "1", area: "HSR", requirement: "Wardrobes" },
    }), response);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.body, { success: false, message: "Unable to send request" });

    installFetch(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    response = mockResponse();
    await handler(mockRequest({
      body: { name: "A", phone: "1", area: "HSR", requirement: "Wardrobes" },
    }), response);
    assert.equal(response.statusCode, 504);
    assert.deepEqual(response.body, {
      success: false,
      uncertain: true,
      message: "Delivery confirmation was delayed. Please continue on WhatsApp and do not resubmit.",
    });
  }],

  ["missing delivery configuration is still 503", async () => {
    clearDeliveryEnv();
    installFetch(async () => {
      throw new Error("fetch should not run");
    });
    const response = mockResponse();
    await handler(mockRequest({
      body: { name: "A", phone: "1", area: "HSR", requirement: "Wardrobes" },
    }), response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { success: false, message: "Lead service is temporarily unavailable" });
    assert.equal(calls.length, 0);
  }],

  ["rejected upstream logs one sanitized diagnostic without changing the 502", async () => {
    withDeliveryEnv();
    const phone = "9986762942";
    const leadName = "Nakhul Kashyap";
    const leadMessage = "Please call about the 10x12 kitchen";
    const utm = "gasbot_compat_secret";
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args);
    const leadBody = {
      name: leadName,
      phone,
      area: "HSR",
      requirement: "Wardrobes",
      message: leadMessage,
      utm_source: utm,
      utm_medium: "cpc",
    };
    try {
      installFetch(async () => ({
        ok: false,
        status: 500,
        redirected: true,
        url: `https://user:pass@script.googleusercontent.com/macros/echo/${TOKEN}?token=${TOKEN}&x=1`,
        headers: {
          get(name) {
            const key = String(name).toLowerCase();
            if (key === "content-type") return "text/html; charset=utf-8";
            if (key === "cookie") return "session=supersecret";
            if (key === "authorization") return "Bearer abcdefghijklmnop";
            return null;
          },
        },
        async text() {
          return `nope ${TOKEN}\r\n${leadName}\n${phone} ${leadMessage} ${utm}\u0007 Bearer abcdefghijklmnop token=${TOKEN} https://evil.example/a?secret=abc ${"ab".repeat(16)}`;
        },
      }));
      let response = mockResponse();
      await handler(mockRequest({ body: leadBody }), response);
      assert.equal(response.statusCode, 502);
      assert.deepEqual(response.body, { success: false, message: "Unable to send request" });
      assert.equal(logs.length, 1);
      assert.equal(logs[0][0], "Lead delivery failed");
      const diagnostic = logs[0][1];
      assert.equal(diagnostic.stage, "status");
      assert.equal(diagnostic.name, "Error");
      assert.equal(diagnostic.message, "Lead delivery rejected");
      assert.equal(diagnostic.upstreamStatus, 500);
      assert.equal(diagnostic.upstreamOk, false);
      assert.equal(diagnostic.contentType, "text/html; charset=utf-8");
      assert.equal(diagnostic.jsonParsed, false);
      assert.equal(Object.hasOwn(diagnostic, "resultSuccess"), false);
      assert.equal(diagnostic.redirected, true);
      assert.equal(diagnostic.finalUrlHost, "script.googleusercontent.com");
      assert.equal(diagnostic.finalUrlPath, "/macros/echo/[redacted]");
      assert.equal(diagnostic.finalUrlPath.includes(TOKEN), false);
      assert.equal(diagnostic.bodyPreview.length <= 200, true);
      assert.equal(/[\r\n\u0000-\u001F]/.test(diagnostic.bodyPreview), false);
      assert.doesNotMatch(diagnostic.bodyPreview, /\s{2,}/);
      const dumped = JSON.stringify(logs[0]);
      for (const secret of [TOKEN, ENDPOINT, phone, leadName, leadMessage, utm, "cpc", "supersecret", "abcdefghijklmnop", "secret=abc", "ab".repeat(16), "user:pass", "token="]) {
        assert.equal(dumped.includes(secret), false, secret);
      }
      assert.equal(dumped.includes("?"), false);

      logs.length = 0;
      installFetch(async () => ({
        ok: true,
        status: 200,
        redirected: false,
        url: "https://script.google.com/macros/s/test/exec?unused=1",
        headers: { get: () => "text/plain" },
        async text() {
          return "not-json\u0000tail";
        },
      }));
      response = mockResponse();
      await handler(mockRequest({ body: leadBody }), response);
      assert.equal(response.statusCode, 502);
      assert.equal(logs.length, 1);
      assert.equal(logs[0][1].stage, "parse");
      assert.equal(logs[0][1].jsonParsed, false);
      assert.equal(logs[0][1].upstreamOk, true);
      assert.equal(logs[0][1].bodyPreview, "not-json tail");
      assert.equal(logs[0][1].finalUrlHost, "script.google.com");
      assert.equal(logs[0][1].finalUrlPath, "/macros/s/test/exec");
      assert.equal(JSON.stringify(logs[0]).includes("unused=1"), false);

      logs.length = 0;
      installFetch(async () => ({
        ok: true,
        status: 200,
        redirected: false,
        url: "https://script.google.com/macros/s/test/exec",
        headers: { get: () => "application/json" },
        async text() {
          return JSON.stringify({ success: false, detail: phone });
        },
      }));
      response = mockResponse();
      await handler(mockRequest({ body: leadBody }), response);
      assert.equal(response.statusCode, 502);
      assert.equal(logs.length, 1);
      assert.equal(logs[0][1].stage, "result");
      assert.equal(logs[0][1].jsonParsed, true);
      assert.equal(logs[0][1].resultSuccess, false);
      assert.equal(logs[0][1].upstreamStatus, 200);
      assert.equal(JSON.stringify(logs[0]).includes(phone), false);

      logs.length = 0;
      installFetch(async () => {
        const error = new Error(`connect ${ENDPOINT}?token=${TOKEN} ${phone}`);
        error.name = "TypeError";
        throw error;
      });
      response = mockResponse();
      await handler(mockRequest({ body: leadBody }), response);
      assert.equal(response.statusCode, 502);
      assert.equal(logs.length, 1);
      assert.equal(logs[0][1].stage, "fetch");
      assert.equal(logs[0][1].name, "TypeError");
      assert.equal(logs[0][1].upstreamStatus, undefined);
      const fetchDump = JSON.stringify(logs[0]);
      assert.equal(fetchDump.includes(TOKEN), false);
      assert.equal(fetchDump.includes(ENDPOINT), false);
      assert.equal(fetchDump.includes(phone), false);
      assert.equal(fetchDump.includes("?"), false);

      logs.length = 0;
      installFetch(async () => {
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        throw error;
      });
      response = mockResponse();
      await handler(mockRequest({ body: leadBody }), response);
      assert.equal(response.statusCode, 504);
      assert.deepEqual(response.body, {
        success: false,
        uncertain: true,
        message: "Delivery confirmation was delayed. Please continue on WhatsApp and do not resubmit.",
      });
      assert.equal(logs.length, 1);
      assert.equal(logs[0][1].stage, "fetch");
      assert.equal(logs[0][1].name, "AbortError");
      assert.equal(logs[0][1].message, "The operation was aborted.");

      logs.length = 0;
      installFetch(async () => jsonOk({ success: true, message: "Request received" }));
      response = mockResponse();
      await handler(mockRequest({ body: leadBody }), response);
      assert.equal(response.statusCode, 200);
      assert.equal(logs.length, 0);
    } finally {
      console.error = originalError;
    }
  }],

  ["delivery payload helper does not let attribution overwrite lead fields", () => {
    const lead = normaliseLead({
      name: "A",
      phone: "1",
      area: "HSR",
      requirement: "Wardrobes",
      utm_source: "newsletter",
    });
    lead.source = "Website form";
    const payload = buildDeliveryPayload(lead, TOKEN);
    assert.equal(payload.name, "A");
    assert.equal(Object.hasOwn(payload, "subject"), false);
    assert.equal(payload.utm_source, "newsletter");
    assert.equal(payload.token, TOKEN);
  }],
];

const originalFetch = globalThis.fetch;
for (const [name, fn] of tests) {
  await test(name, fn);
}
globalThis.fetch = originalFetch;
clearDeliveryEnv();
