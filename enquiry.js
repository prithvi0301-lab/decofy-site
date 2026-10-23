(function () {
  if (window.__decofyEnquiryBound) return;
  window.__decofyEnquiryBound = true;

  var PAGE_LABELS = {
    "/": "home page",
    "/about": "about page",
    "/consultation": "consultation page",
    "/faq": "FAQ page",
    "/projects": "projects page",
    "/modular-kitchen-bengaluru": "modular kitchens page",
    "/modular-kitchen-cost-bengaluru": "kitchen cost page",
    "/wardrobes-bengaluru": "wardrobes page",
    "/upvc-interiors-bengaluru": "uPVC interiors page",
    "/upvc-wall-panels-bengaluru": "wall panels page",
    "/upvc-vs-plywood": "uPVC vs plywood page",
    "/kitchen-wardrobe-material-selection-mistakes": "material selection page",
    "/termite-proof-wardrobe-materials": "wardrobe materials page",
    "/waterproof-kitchen-cabinet-materials": "kitchen materials page"
  };

  function pagePath() {
    var path = window.location.pathname || "/";
    path = path.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    return path || "/";
  }

  function pageSentence() {
    var label = PAGE_LABELS[pagePath()];
    if (!label) return "I'm enquiring from this page.";
    return "I'm enquiring from the " + label + ".";
  }

  function withPageReference(existing) {
    var sentence = pageSentence();
    var message = "Hi Decofy, " + sentence;
    if (!existing) return message;
    if (existing.indexOf(sentence) !== -1) return existing;
    return existing.replace(/\s+$/, "") + "\n" + sentence;
  }

  function toUrl(href) {
    try { return new URL(href, window.location.href); } catch (e) { return null; }
  }

  function isWhatsApp(url) {
    return !!(url && /(^|\.)wa\.me$/i.test(url.hostname));
  }

  function isTel(href) {
    return /^tel:/i.test(href || "");
  }

  function linkLocation(anchor) {
    if (anchor.id === "whatsappHandoff" || anchor.classList.contains("success-link")) return "form_success";
    if (anchor.closest("form")) return "form_success";
    if (anchor.closest("nav, header")) return "header";
    if (anchor.closest("section.cta")) return "bottom_cta";
    if (anchor.closest("#contact, .contact")) return "contact_section";
    if (anchor.closest(".hero, .hero-ctas")) return "hero";
    return "page";
  }

  function applyWhatsAppText(anchor) {
    var url = toUrl(anchor.getAttribute("href") || "");
    if (!isWhatsApp(url)) return;
    var existing = url.searchParams.get("text") || "";
    var next = withPageReference(existing);
    if (next === existing) return;
    url.searchParams.set("text", next);
    anchor.setAttribute("href", url.toString());
  }

  function decorateAll() {
    var links = document.querySelectorAll('a[href*="wa.me/"]');
    for (var i = 0; i < links.length; i++) applyWhatsAppText(links[i]);
  }

  function track(name, anchor, href) {
    try {
      if (typeof window.gtag !== "function") return;
      window.gtag("event", name, {
        // gtag.js drops an event param named page_path, so the path is sent as enquiry_page.
        enquiry_page: pagePath(),
        link_location: linkLocation(anchor),
        link_type: isTel(href) ? "tel" : "whatsapp"
      });
    } catch (e) {}
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var anchor = target.closest("a[href]");
    if (!anchor) return;
    var href = anchor.getAttribute("href") || "";
    if (isWhatsApp(toUrl(href))) {
      applyWhatsAppText(anchor);
      track("click_whatsapp", anchor, href);
      return;
    }
    if (isTel(href)) track("click_call", anchor, href);
  }, true);

  function start() {
    decorateAll();
    if (typeof MutationObserver !== "function" || !document.documentElement) return;
    var observer = new MutationObserver(function () { decorateAll(); });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href"]
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
