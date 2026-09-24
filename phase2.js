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

  document.querySelectorAll(".success-link").forEach((link) =>
    link.addEventListener("click", () => {
      try { if (typeof gtag === "function") gtag("event", "whatsapp_continue"); } catch (_) {}
    })
  );
});

window.handleLeadForm = async function(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type=submit]");
  const wa = form.querySelector(".success-link");
  const lead = Object.fromEntries(new FormData(form));
  lead.source = "Consultation form";
  delete lead.access_key;

  const lines = [
    "Hi Decofy, I submitted an enquiry:",
    "Name: " + lead.name,
    "Phone: " + lead.phone,
    "Area: " + lead.area,
    "Requirement: " + lead.requirement,
    "Expected start: " + lead.expected_start_date,
  ];
  wa.href = "https://wa.me/919900113557?text=" + encodeURIComponent(lines.join("\n"));

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
    if (!data.success) {
      if (data.uncertain || response.status >= 500) {
        button.textContent = "Confirmation delayed — use WhatsApp below";
        wa.style.display = "inline-flex";
        return false;
      }
      throw new Error(data.message || "Request rejected");
    }

    confirmed = true;
    wa.style.display = "inline-flex";
    button.textContent = "✓ Request sent";
    form.reset();
    try { if (typeof fbq === "function") fbq("track", "Lead"); } catch (_) {}
    try { if (typeof gtag === "function") gtag("event", "generate_lead"); } catch (_) {}
  } catch (_) {
    button.textContent = "Could not confirm — use WhatsApp below";
    wa.style.display = "inline-flex";
  } finally {
    if (confirmed) button.disabled = false;
  }

  return false;
};
