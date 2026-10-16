const MAX_FIELD_LENGTH = 2000;
const MAX_LINE = 1000;
const MAX_ATTR = 300;
const MAX_MESSAGE = 2000;
const MAX_SUBJECT = 150;

const ATTRIBUTION_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "landing_page",
  "referrer",
  "form_page",
];

// "1–3 months" uses an en dash (U+2013), matching the upcoming form.
const TIMELINE_ALLOWED = ["Within 30 days", "1–3 months", "3+ months", "Just exploring"];

const AREA_LABEL = "Area";

export const config = {
  maxDuration: 60,
};

function clean(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function stripHtml(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

/** Single-line fields: drop controls and HTML, collapse whitespace, trim, cap. */
function cleanLine(value, max) {
  if (value === undefined || value === null) return "";
  let text = String(value);
  text = text.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ");
  text = stripHtml(text);
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > max) text = text.slice(0, max);
  return text;
}

/** Message keeps newlines. Other controls and HTML are removed. Never used as a header. */
function cleanMessage(value, max = MAX_MESSAGE) {
  if (value === undefined || value === null) return "";
  let text = String(value).replace(/\r\n?/g, "\n");
  text = text.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029]/g, " ");
  text = stripHtml(text);
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > max ? text.slice(0, max) : text;
}

function isLegacyStartDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normaliseLead(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const area = cleanLine(input.area, MAX_LINE) ? input.area : input.locality;
  const lead = {
    name: cleanLine(input.name, MAX_LINE),
    phone: cleanLine(input.phone, 50),
    area: cleanLine(area, MAX_LINE),
    requirement: cleanLine(input.requirement, 200),
    expected_start_timeline: cleanLine(input.expected_start_timeline, 50),
    expected_start_date: cleanLine(input.expected_start_date, 20),
    budget: cleanLine(input.budget, 100),
    message: cleanMessage(input.message),
    source: cleanLine(input.source, 100),
    attribution: {},
  };

  if (lead.expected_start_timeline && !TIMELINE_ALLOWED.includes(lead.expected_start_timeline)) {
    lead.expected_start_timeline = "[unrecognised] " + lead.expected_start_timeline;
  }
  if (lead.expected_start_date && !isLegacyStartDate(lead.expected_start_date)) {
    lead.expected_start_date = "";
  }
  for (const key of ATTRIBUTION_FIELDS) {
    const value = cleanLine(input[key], MAX_ATTR);
    if (value) lead.attribution[key] = value;
  }
  return lead;
}

function buildEmailText(lead) {
  const lines = [`New Decofy lead (${lead.source || "Website form"})`, "", "LEAD DETAILS"];
  const add = (label, value) => {
    if (value) lines.push(`${label}: ${value}`);
  };
  add("Name", lead.name);
  add("Phone", lead.phone);
  add(AREA_LABEL, lead.area);
  add("Requirement", lead.requirement);
  add("Expected start timeline", lead.expected_start_timeline);
  add("Expected start date [legacy]", lead.expected_start_date);
  add("Approx. budget", lead.budget);
  if (lead.message) {
    lines.push("Message:");
    lines.push(lead.message);
  }
  const present = ATTRIBUTION_FIELDS.filter((key) => lead.attribution && lead.attribution[key]);
  if (present.length) {
    lines.push("", "ATTRIBUTION");
    for (const key of present) lines.push(`${key}: ${lead.attribution[key]}`);
  }
  return lines.join("\n");
}

function safeSubject(value) {
  return cleanLine(value, MAX_SUBJECT);
}

/**
 * Structured fields stay named so the existing Apps Script sheet columns keep working.
 * `text` is the plain-text notification. Attribution is copied only onto its own keys
 * and into `text`. Subject is intentionally omitted: Apps Script still chooses it from
 * the allowlisted source, and attribution must not be able to set it.
 */
function buildDeliveryPayload(lead, token) {
  const payload = {
    name: lead.name,
    phone: lead.phone,
    area: lead.area,
    requirement: lead.requirement,
    budget: lead.budget,
    expected_start_date: lead.expected_start_date,
    expected_start_timeline: lead.expected_start_timeline,
    message: lead.message,
    source: lead.source,
    text: buildEmailText(lead),
    token,
  };
  for (const key of ATTRIBUTION_FIELDS) {
    if (lead.attribution[key]) payload[key] = lead.attribution[key];
  }
  return payload;
}

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function isSameOrigin(origin, forwardedHost) {
  try {
    const host = clean(forwardedHost, 255).split(",")[0].trim();
    return Boolean(host && origin && new URL(origin).host === host);
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { success: false, message: "Method not allowed" });
  }

  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const origin = clean(request.headers.origin, 500);
  if (!isSameOrigin(origin, host)) {
    return json(response, 403, { success: false, message: "Invalid request origin" });
  }

  const input = request.body || {};
  if (clean(input.botcheck, 20)) {
    return json(response, 200, { success: true, message: "Request received" });
  }

  const allowedSources = new Set(["Homepage quote form", "Consultation form"]);
  const source = clean(input.source, 80);
  const lead = normaliseLead(input);
  lead.source = allowedSources.has(source) ? source : "Website form";

  if (!lead.name || !lead.phone || !lead.area || !lead.requirement) {
    return json(response, 400, { success: false, message: "Please complete all required fields" });
  }

  const endpoint = process.env.GOOGLE_SHEETS_ENDPOINT;
  const token = process.env.GOOGLE_SHEETS_TOKEN;
  if (!endpoint || !token) {
    console.error("Lead service configuration is incomplete");
    return json(response, 503, { success: false, message: "Lead service is temporarily unavailable" });
  }

  const controller = new AbortController();
  // Leave a small buffer inside Vercel's 60-second function limit while
  // allowing Apps Script enough time to finish during brief lock contention.
  const timeout = setTimeout(() => controller.abort(), 55000);
  const delivery = buildDeliveryPayload(lead, token);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(delivery),
      redirect: "follow",
      signal: controller.signal,
    });

    const text = await upstream.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = null;
    }

    if (!upstream.ok || !result || result.success !== true) {
      throw new Error("Lead delivery rejected");
    }

    return json(response, 200, {
      success: true,
      message: clean(result.message, 200) || "Request received",
    });
  } catch (error) {
    console.error("Lead delivery failed", error instanceof Error ? error.name : "UnknownError");
    if (error instanceof Error && error.name === "AbortError") {
      return json(response, 504, {
        success: false,
        uncertain: true,
        message: "Delivery confirmation was delayed. Please continue on WhatsApp and do not resubmit.",
      });
    }
    return json(response, 502, { success: false, message: "Unable to send request" });
  } finally {
    clearTimeout(timeout);
  }
}

export const _internal = {
  cleanLine,
  cleanMessage,
  normaliseLead,
  buildEmailText,
  safeSubject,
  buildDeliveryPayload,
  ATTRIBUTION_FIELDS,
  TIMELINE_ALLOWED,
};
