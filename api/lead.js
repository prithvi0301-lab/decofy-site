const MAX_FIELD_LENGTH = 2000;

function clean(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function isSameOrigin(origin, host) {
  try {
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

  const host = clean(request.headers["x-forwarded-host"] || request.headers.host, 255);
  const origin = clean(request.headers.origin, 500);
  if (!isSameOrigin(origin, host)) {
    return json(response, 403, { success: false, message: "Invalid request origin" });
  }

  const input = request.body || {};
  if (clean(input.botcheck, 20)) {
    return json(response, 200, { success: true });
  }

  const lead = {
    name: clean(input.name, 120),
    phone: clean(input.phone, 40),
    area: clean(input.area, 160),
    requirement: clean(input.requirement, 160),
    budget: clean(input.budget, 100),
    expected_start_date: clean(input.expected_start_date, 40),
    message: clean(input.message),
    source: clean(input.source, 80),
  };

  if (!lead.name || !lead.phone || !lead.area || !lead.requirement || !lead.expected_start_date) {
    return json(response, 400, { success: false, message: "Please complete all required fields" });
  }

  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  const sheetsEndpoint = process.env.GOOGLE_SHEETS_ENDPOINT;
  if (!accessKey || !sheetsEndpoint) {
    console.error("Lead endpoint environment variables are not configured");
    return json(response, 503, { success: false, message: "Lead service is temporarily unavailable" });
  }

  try {
    const web3Response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ...lead,
        access_key: accessKey,
        subject: lead.source === "Homepage quote form" ? "New Quote Request — Decofy" : "New Consultation Request — Decofy",
        from_name: "Decofy Website",
      }),
    });
    const web3Result = await web3Response.json();
    if (!web3Response.ok || !web3Result.success) {
      throw new Error("Primary lead delivery failed");
    }

    const sheetBody = new URLSearchParams(lead);
    try {
      await fetch(sheetsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: sheetBody,
      });
    } catch (error) {
      console.error("Google Sheets delivery failed", error);
    }

    return json(response, 200, { success: true });
  } catch (error) {
    console.error("Lead submission failed", error);
    return json(response, 502, { success: false, message: "Unable to send request" });
  }
}
