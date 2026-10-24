/* Form-success WhatsApp links keep only a page tag. Enhanced measurement
   copies the full href into link_url, so name, phone, area, requirement, and
   timeline must never be written into it. The capture listener runs before
   the tag's bubble-phase click listener reads href.
   TEMP: handoff is off. Flip WHATSAPP_ENABLED to true to restore it. */
const WHATSAPP_ENABLED = false;
function decofyHandoffText() {
  var path = window.location.pathname || "/";
  path = path.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
  if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
  if (!path) path = "/";
  var labels = {
    "/": "home",
    "/consultation": "consultation",
    "/upvc-interiors-bengaluru": "uPVC interiors",
    "/upvc-wall-panels-bengaluru": "wall panels"
  };
  var label = labels[path];
  if (!label) return "Hi Decofy, I'm enquiring from this page.";
  return "Hi Decofy, I'm enquiring from the " + label + " page.";
}

function decofyHandoffHref() {
  if (!WHATSAPP_ENABLED) return "/consultation#consultation-form";
  return "https://wa.me/919591128007?text=" + encodeURIComponent(decofyHandoffText());
}

document.addEventListener("click", function (event) {
  if (!WHATSAPP_ENABLED) return;
  var target = event.target;
  if (!target || !target.closest) return;
  var anchor = target.closest("a[href]");
  if (!anchor) return;
  if (anchor.id !== "whatsappHandoff" && !anchor.classList.contains("success-link")) return;
  anchor.setAttribute("href", decofyHandoffHref());
}, true);

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.querySelectorAll("a").forEach((link) =>
      link.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  if (WHATSAPP_ENABLED) {
    document.querySelectorAll(".success-link").forEach((link) =>
      link.addEventListener("click", () => {
        try { if (typeof gtag === "function") gtag("event", "whatsapp_continue"); } catch (_) {}
      })
    );
  }
});

window.handleLeadForm = async function(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type=submit]");
  const wa = form.querySelector(".success-link");
  const lead = Object.fromEntries(new FormData(form));
  lead.source = "Consultation form";
  delete lead.access_key;
  try { if (typeof window.decofyApplyAttribution === "function") window.decofyApplyAttribution(lead); } catch (_) {}

  button.disabled = true;
  button.textContent = "Sending…";
  let confirmed = false;

  try {
    const response = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(lead),
    });
    const data = await response.json();
    if (!(response.ok && data && data.success)) {
      if (data && (data.uncertain || response.status >= 500)) {
        button.textContent = WHATSAPP_ENABLED
          ? "Confirmation delayed — use WhatsApp below"
          : "Confirmation delayed — please try again";
        if (wa && WHATSAPP_ENABLED) wa.style.display = "inline-flex";
        return false;
      }
      throw new Error((data && data.message) || "Request rejected");
    }

    confirmed = true;
    try {
      if (wa && WHATSAPP_ENABLED) {
        wa.href = decofyHandoffHref();
        wa.style.display = "inline-flex";
      }
      button.textContent = "✓ Request sent";
      const note = form.querySelector(".form-note");
      if (note) {
        note.hidden = false;
        note.textContent = WHATSAPP_ENABLED
          ? "Request sent. Continue on WhatsApp only if you want to."
          : "Thank you. Our team will contact you shortly.";
      }
      form.reset();
      if (typeof window.decofySyncAttributionFields === "function") window.decofySyncAttributionFields();
    } catch (_) {}
    try { if (typeof fbq === "function") fbq("track", "Lead"); } catch (_) {}
    try { if (typeof gtag === "function") gtag("event", "generate_lead"); } catch (_) {}
  } catch (_) {
    if (!confirmed) {
      button.textContent = WHATSAPP_ENABLED
        ? "Could not confirm — use WhatsApp below"
        : "Could not confirm — please try again";
      if (wa && WHATSAPP_ENABLED) wa.style.display = "inline-flex";
    }
  } finally {
    if (confirmed) button.disabled = false;
  }

  return false;
};
