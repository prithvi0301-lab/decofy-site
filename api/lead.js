const MAX_FIELD_LENGTH = 2000;

function clean(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
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
  const lead = {
    name: clean(input.name, 120),
    phone: clean(input.phone, 40),
    area: clean(input.area, 160),
    requirement: clean(input.requirement, 160),
    budget: clean(input.budget, 100),
    expected_start_date: clean(input.expected_start_date, 40),
    message: clean(input.message),
    source: allowedSources.has(source) ? source : "Website form",
  };

  if (!lead.name || !lead.phone || !lead.area || !lead.requirement || !lead.expected_start_date) {
    return json(response, 400, { success: false, message: "Please complete all required fields" });
  }

  const endpoint = process.env.GOOGLE_SHEETS_ENDPOINT;
  const token = process.env.GOOGLE_SHEETS_TOKEN;
  if (!endpoint || !token) {
    console.error("Lead service configuration is incomplete");
    return json(response, 503, { success: false, message: "Lead service is temporarily unavailable" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ ...lead, token }),
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
    return json(response, 502, { success: false, message: "Unable to send request" });
  } finally {
    clearTimeout(timeout);
  }
}
