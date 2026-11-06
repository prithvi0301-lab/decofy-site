/* Call and WhatsApp click tracking for GA4.
   Sends click_call for every tel: link click and click_whatsapp for every
   wa.me link click, one event per click. The event carries only the page path,
   where the link sits on the page, and the link type. It never reads form
   fields and never changes any link, so nothing a visitor typed can reach GA4
   through an event parameter or through the link URL that enhanced
   measurement collects. */
(function () {
  if (window.__decofyEnquiryBound) return;
  window.__decofyEnquiryBound = true;

  function pagePath() {
    var path = window.location.pathname || "/";
    path = path.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    return path || "/";
  }

  function toUrl(href) {
    try { return new URL(href, window.location.href); } catch (e) { return null; }
  }

  function isWhatsApp(href) {
    var url = toUrl(href);
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

  function track(name, anchor, linkType) {
    try {
      if (typeof window.gtag !== "function") return;
      window.gtag("event", name, {
        // gtag.js drops an event parameter named page_path, so the path is sent as enquiry_page.
        enquiry_page: pagePath(),
        link_location: linkLocation(anchor),
        link_type: linkType
      });
    } catch (e) {}
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var anchor = target.closest("a[href]");
    if (!anchor) return;
    var href = anchor.getAttribute("href") || "";
    if (isWhatsApp(href)) track("click_whatsapp", anchor, "whatsapp");
    else if (isTel(href)) track("click_call", anchor, "tel");
  }, true);
})();
