/**
 * Fonte do snippet de landing (Google gclid / wbraid / gbraid + UTMs, first-touch cookies).
 * Tenant: query `partner_id` (ou `pid`) na URL do .js — ver snippet em app/configuracoes/google-lp/page.tsx
 * Build: pnpm run build:tracking  →  public/tracking/wt-google-lp.js (minificado)
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || !script.getAttribute) return;

  var preset = typeof window.__WT_GOOGLE_LP === "object" && window.__WT_GOOGLE_LP ? window.__WT_GOOGLE_LP : {};

  var DEFAULT_WHATSAPP_HOSTS = ["wa.me", "api.whatsapp.com", "web.whatsapp.com"];

  function parseHostLine(raw) {
    var s0 = String(raw).trim().toLowerCase();
    if (!s0) return null;
    try {
      if (s0.indexOf("://") >= 0) {
        var h = new URL(s0).hostname.toLowerCase().replace(/^www\./, "");
        return h || null;
      }
    } catch (e) {
      return null;
    }
    var host = (s0.split("/")[0] || "").split(":")[0].replace(/^www\./, "");
    if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
    return host;
  }

  function normalizeHostList(arr) {
    if (!arr || !Array.isArray(arr)) return DEFAULT_WHATSAPP_HOSTS.slice();
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var h = parseHostLine(arr[i]);
      if (h && out.indexOf(h) < 0) out.push(h);
    }
    return out.length ? out.slice(0, 20) : DEFAULT_WHATSAPP_HOSTS.slice();
  }

  var whatsappLinkHosts = normalizeHostList(preset.whatsappLinkHosts);
  var protocolMessageTemplate =
    preset.protocolMessageTemplate != null
      ? String(preset.protocolMessageTemplate).trim().slice(0, 1000)
      : "";

  /** TTL fixo dos cookies first-touch (dias). Não exposto no HTML — mude na fonte se precisar outro valor. */
  var COOKIE_DAYS = 90;

  function readPartnerIdFromScriptSrc(scriptEl) {
    try {
      var u = new URL(scriptEl.src, document.baseURI || location.href);
      var raw = u.searchParams.get("partner_id") || u.searchParams.get("pid");
      if (raw != null && String(raw).trim() !== "") return String(raw).trim();
    } catch (e) {}
    return "";
  }

  function readScriptOrigin(scriptEl) {
    try {
      return new URL(scriptEl.src, document.baseURI || location.href).origin;
    } catch (e) {
      return "";
    }
  }

  function attr(name, fallback) {
    var v = script.getAttribute(name);
    if (v != null && String(v).trim() !== "") return String(v).trim();
    var camel = name.replace(/^data-/, "").replace(/-([a-z])/g, function (_, c) {
      return c.toUpperCase();
    });
    var p = preset[camel];
    if (p != null && String(p).trim() !== "") return String(p).trim();
    return fallback;
  }

  function sanitizeNamespace(ns) {
    var s = String(ns || "wt_lp").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    return s.slice(0, 48) || "wt_lp";
  }

  var namespace = sanitizeNamespace(attr("data-namespace", preset.namespace));
  var partnerId =
    readPartnerIdFromScriptSrc(script) || attr("data-partner-id", preset.partnerId || "");

  /** Com partner_id na URL do script, ativo por padrão (landing só com tag externa, ex. GTM). */
  function resolveEnhanceWhatsapp() {
    var attrVal = script.getAttribute("data-enhance-whatsapp");
    if (attrVal != null && String(attrVal).trim() !== "") {
      return String(attrVal).toLowerCase() === "true";
    }
    if (preset.enhanceWhatsapp === false) return false;
    if (preset.enhanceWhatsapp === true) return true;
    return Boolean(partnerId);
  }

  var enhanceWhatsapp = resolveEnhanceWhatsapp();
  var defaultEmrCampaignId = "";
  var presetEmr = preset.defaultEmrCampaignId || preset.emrCampaignId;
  if (presetEmr != null && String(presetEmr).trim()) defaultEmrCampaignId = String(presetEmr).trim().toUpperCase();
  var fromScriptEmr = attr("data-emr-campaign-id", "");
  if (fromScriptEmr) defaultEmrCampaignId = fromScriptEmr.trim().toUpperCase();
  var apiOrigin = attr("data-api-origin", preset.apiOrigin || readScriptOrigin(script)).replace(/\/$/, "");
  var maxAgeSec = COOKIE_DAYS * 24 * 60 * 60;

  function key(suffix) {
    return namespace + "_" + suffix;
  }

  function getCookie(name) {
    var parts = ("; " + document.cookie).split("; " + name + "=");
    if (parts.length === 2) {
      try {
        return decodeURIComponent(parts.pop().split(";").shift() || "");
      } catch (e) {
        return "";
      }
    }
    return "";
  }

  function setCookieFirstTouch(name, value) {
    if (!value) return;
    if (getCookie(name)) return;
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      ";path=/;max-age=" +
      maxAgeSec +
      ";SameSite=Lax" +
      (location.protocol === "https:" ? ";Secure" : "");
  }

  function sanitizeEmrId(raw) {
    if (raw == null) return "";
    var n = String(raw).trim().toUpperCase().replace(/\s+/g, "");
    return /^ID#?[A-Z0-9]{1,24}$/.test(n) ? n : "";
  }

  function readEmrIdFromUrl() {
    try {
      var sp = new URLSearchParams(window.location.search);
      return (
        sanitizeEmrId(sp.get("emr_id")) ||
        sanitizeEmrId(sp.get("emr_campaign_id")) ||
        sanitizeEmrId(sp.get("campaign_id")) ||
        ""
      );
    } catch (e) {
      return "";
    }
  }

  function readParamsFromUrl() {
    var out = {};
    try {
      var sp = new URLSearchParams(window.location.search);
      ["gclid", "wbraid", "gbraid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(
        function (p) {
          var v = sp.get(p);
          if (v && String(v).trim()) out[p] = String(v).trim();
        }
      );
    } catch (e) {}
    return out;
  }

  /** Cookie _gcl_aw / _gcl_gb do Google Ads (Conversion Linker) — sobrevive a URL limpa na landing. */
  function parseGoogleLinkerCookie(raw) {
    if (!raw || typeof raw !== "string") return null;
    var parts = raw.trim().split(".");
    if (parts.length < 3) return null;
    var value = parts.slice(2).join(".").trim();
    return value || null;
  }

  function readGoogleAdsLinkerCookies() {
    var out = {};
    var gclid = parseGoogleLinkerCookie(getCookie("_gcl_aw"));
    if (gclid) out.gclid = gclid;
    var gbraid = parseGoogleLinkerCookie(getCookie("_gcl_gb"));
    if (gbraid) out.gbraid = gbraid;
    return out;
  }

  function persistFromUrl() {
    var q = readParamsFromUrl();
    var google = readGoogleAdsLinkerCookies();
    var emrFromUrl = readEmrIdFromUrl();
    if (emrFromUrl) setCookieFirstTouch(key("emr_id"), emrFromUrl);
    if (q.gclid) setCookieFirstTouch(key("gclid"), q.gclid);
    else if (google.gclid) setCookieFirstTouch(key("gclid"), google.gclid);
    if (q.wbraid) setCookieFirstTouch(key("wbraid"), q.wbraid);
    if (q.gbraid) setCookieFirstTouch(key("gbraid"), q.gbraid);
    else if (google.gbraid) setCookieFirstTouch(key("gbraid"), google.gbraid);
    if (q.utm_source) setCookieFirstTouch(key("utm_source"), q.utm_source);
    if (q.utm_medium) setCookieFirstTouch(key("utm_medium"), q.utm_medium);
    if (q.utm_campaign) setCookieFirstTouch(key("utm_campaign"), q.utm_campaign);
    if (q.utm_content) setCookieFirstTouch(key("utm_content"), q.utm_content);
    if (q.utm_term) setCookieFirstTouch(key("utm_term"), q.utm_term);
  }

  function getAttribution() {
    var google = readGoogleAdsLinkerCookies();
    return {
      namespace: namespace,
      partnerId: partnerId || null,
      gclid: getCookie(key("gclid")) || google.gclid || null,
      wbraid: getCookie(key("wbraid")) || null,
      gbraid: getCookie(key("gbraid")) || google.gbraid || null,
      utm_source: getCookie(key("utm_source")) || null,
      utm_medium: getCookie(key("utm_medium")) || null,
      utm_campaign: getCookie(key("utm_campaign")) || null,
      utm_content: getCookie(key("utm_content")) || null,
      utm_term: getCookie(key("utm_term")) || null,
      protocolMessageTemplate: protocolMessageTemplate || null,
      whatsappLinkHosts: whatsappLinkHosts.slice(),
    };
  }

  function isWhatsAppHref(href) {
    if (!href || typeof href !== "string") return false;
    try {
      var u = new URL(href, document.baseURI || location.href);
      var h = u.hostname.toLowerCase();
      for (var i = 0; i < whatsappLinkHosts.length; i++) {
        if (h === whatsappLinkHosts[i]) return true;
      }
    } catch (e) {}
    return false;
  }

  function isGoHref(href) {
    if (!href || typeof href !== "string" || !apiOrigin) return false;
    try {
      var u = new URL(href, document.baseURI || location.href);
      var base = new URL(apiOrigin);
      if (u.origin !== base.origin) return false;
      var path = (u.pathname || "").replace(/\/+$/, "") || "/";
      return path === "/go" || path === "/wci";
    } catch (e) {}
    return false;
  }

  /** Repassa gclid/UTMs (cookies ou URL da landing) em links /go já fixos no HTML. */
  function enhanceExistingGoHref(href, anchor) {
    try {
      var go = new URL(href, document.baseURI || location.href);
      var attribution = getAttribution();
      if (partnerId && !go.searchParams.get("partner_id")) {
        go.searchParams.set("partner_id", partnerId);
      }
      var existingEmr = sanitizeEmrId(go.searchParams.get("emr_id"));
      var emrId = existingEmr || resolveEmrIdForLink(anchor);
      if (emrId) go.searchParams.set("emr_id", emrId);
      [
        "gclid",
        "wbraid",
        "gbraid",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
      ].forEach(function (p) {
        var v = attribution[p];
        if (v && !go.searchParams.get(p)) go.searchParams.set(p, v);
      });
      return go.toString();
    } catch (e) {}
    return href;
  }

  /** Sempre que houver partner_id: repassa gclid/UTMs em links /go já fixos no HTML (caso EMR). */
  function enhanceGoLinksOnPage() {
    if (!partnerId || !apiOrigin) return;
    var links = document.querySelectorAll ? document.querySelectorAll("a[href]") : [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute("href") || "";
      if (!isGoHref(href)) continue;
      var nextHref = enhanceExistingGoHref(href, a);
      if (nextHref && nextHref !== href) a.setAttribute("href", nextHref);
    }
  }

  /** Na hora do clique, garante gclid/UTMs mesmo se o href foi montado antes do cookie existir. */
  function onDocumentClickCapture(ev) {
    if (!partnerId || !apiOrigin) return;
    var target = ev.target;
    if (!target || !target.closest) return;
    var anchor = target.closest("a[href]");
    if (!anchor) return;
    var href = anchor.getAttribute("href") || "";
    if (!isGoHref(href) && !isWhatsAppHref(href)) return;
    persistFromUrl();
    var nextHref = isGoHref(href) ? enhanceExistingGoHref(href, anchor) : buildGoHref(href, anchor);
    if (nextHref && nextHref !== href) anchor.setAttribute("href", nextHref);
  }

  function observeDynamicLinks() {
    if (!partnerId || !apiOrigin || typeof MutationObserver === "undefined") return;
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        enhanceGoLinksOnPage();
      }, 50);
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        function () {
          if (document.body) observer.observe(document.body, { childList: true, subtree: true });
        },
        { once: true }
      );
    }
  }

  function rewriteWhatsAppLinksToGo() {
    if (!partnerId || !apiOrigin) return;
    enhanceGoLinksOnPage();
    if (!enhanceWhatsapp) return;
    var fn = preset.onProtocol;
    if (typeof fn === "function") {
      try {
        fn(getAttribution(), function () {});
      } catch (e) {}
    }
    var links = document.querySelectorAll ? document.querySelectorAll("a[href]") : [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute("href") || "";
      if (!isWhatsAppHref(href)) continue;
      var nextHref = buildGoHref(href, a);
      if (nextHref && nextHref !== href) a.setAttribute("href", nextHref);
    }
  }

  /** Google Tag pode gravar _gcl_aw depois do DOM; reforça links /go quando o cookie aparecer. */
  function pollForLateGoogleAdsAttribution() {
    if (!partnerId || !apiOrigin) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      var before = getCookie(key("gclid"));
      persistFromUrl();
      if (!before && getCookie(key("gclid"))) enhanceGoLinksOnPage();
      if (attempts >= 24) clearInterval(timer);
    }, 500);
  }

  function runLandingEnhancements() {
    persistFromUrl();
    rewriteWhatsAppLinksToGo();
  }

  function getStoredEmrId() {
    return sanitizeEmrId(getCookie(key("emr_id"))) || defaultEmrCampaignId || readEmrIdFromUrl() || "";
  }

  function resolveEmrIdForLink(anchor) {
    if (anchor && anchor.getAttribute) {
      var perLink = anchor.getAttribute("data-wt-emr-id") || anchor.getAttribute("data-emr-campaign-id");
      var sanitized = sanitizeEmrId(perLink);
      if (sanitized) return sanitized;
    }
    return getStoredEmrId();
  }

  function buildGoHref(whatsappHref, anchor) {
    try {
      var original = new URL(whatsappHref, document.baseURI || location.href);
      var go = new URL("/go", apiOrigin);
      var attribution = getAttribution();
      go.searchParams.set("partner_id", partnerId);
      go.searchParams.set("next", original.toString());
      var emrId = resolveEmrIdForLink(anchor);
      if (emrId) go.searchParams.set("emr_id", emrId);
      ["gclid", "wbraid", "gbraid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(
        function (p) {
          var v = attribution[p];
          if (v) go.searchParams.set(p, v);
        }
      );
      return go.toString();
    } catch (e) {}
    return whatsappHref;
  }

  runLandingEnhancements();
  pollForLateGoogleAdsAttribution();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runLandingEnhancements, { once: true });
  } else {
    setTimeout(runLandingEnhancements, 0);
  }

  document.addEventListener("click", onDocumentClickCapture, true);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") runLandingEnhancements();
  });
  observeDynamicLinks();

  window.wtGoogleLp = {
    version: "1.1",
    namespace: namespace,
    partnerId: partnerId || null,
    getAttribution: getAttribution,
    getProtocolMessageTemplate: function () {
      return protocolMessageTemplate;
    },
    getWhatsappLinkHosts: function () {
      return whatsappLinkHosts.slice();
    },
    buildGoHref: buildGoHref,
    enhanceExistingGoHref: enhanceExistingGoHref,
    isWhatsAppHref: isWhatsAppHref,
    isGoHref: isGoHref,
    refreshFromUrl: function () {
      runLandingEnhancements();
    },
    enhanceGoLinksOnPage: enhanceGoLinksOnPage,
    enhanceWhatsAppLinks: rewriteWhatsAppLinksToGo,
  };
})();
