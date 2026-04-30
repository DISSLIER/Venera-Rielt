/**
 * Runtime SEO metadata and JSON-LD.
 * Core meta tags stay inline in index.html; this script keeps canonical/social data in sync per domain.
 */
(function () {
  "use strict";

  var DEFAULT_SITE_URL = "https://venera-rielt.vercel.app";
  var SITE_NAME = "Venera Rielt";

  var REAL_PHONE = "+373 XX XXX XXX";
  var REAL_EMAIL = "info@venera-rielt.md";
  var REAL_ADDRESS = "Chisinau, Moldova";

  var SOCIAL_TIKTOK = "https://www.tiktok.com/@venera.rielt?_t=ZN-8z4bdlOBmNy&_r=1";
  var SOCIAL_INSTAGRAM = "https://www.instagram.com/venerarielt?igsh=ajRleTdtcHZkZzU5";
  var SOCIAL_FACEBOOK = "https://www.facebook.com/share/18SPXKDGBC/";

  var PAGE_TITLE = "Venera Rielt - Real Estate in Moldova | Недвижимость в Молдове | Imobiliare in Moldova";
  var PAGE_DESCRIPTION = "Buy, sell, and rent apartments, houses, and commercial property in Chisinau and across Moldova. Продажа и аренда недвижимости в Молдове. Vanzare si chirie imobiliare in Moldova.";
  var PAGE_KEYWORDS = "real estate Moldova, buy apartment Chisinau, rent apartment Moldova, house for sale Moldova, commercial property Chisinau, real estate agency Moldova, агентство недвижимости Молдова, купить квартиру Кишинев, аренда квартиры Кишинев, коммерческая недвижимость Молдова, imobiliare Moldova, apartamente Chisinau, chirie apartamente Moldova, case de vanzare Moldova, agentie imobiliara Moldova";
  var OG_IMAGE = DEFAULT_SITE_URL + "/image/components/appicon-512.png";

  function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function resolveSiteUrl() {
    try {
      var loc = window.location;
      if (loc && !isLocalhost(loc.hostname)) {
        return loc.origin.replace(/\/$/, "");
      }
    } catch (e) {
      // Ignore and fallback.
    }
    return DEFAULT_SITE_URL;
  }

  function upsertMeta(attr, key, content) {
    if (!key || !content) return;
    var selector = 'meta[' + attr + '="' + key + '"]';
    var meta = document.head.querySelector(selector);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attr, key);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
  }

  function upsertLink(rel, href, hreflang) {
    if (!rel || !href) return;
    var selector = 'link[rel="' + rel + '"]';
    if (hreflang) selector += '[hreflang="' + hreflang + '"]';
    var link = document.head.querySelector(selector);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", rel);
      if (hreflang) link.setAttribute("hreflang", hreflang);
      document.head.appendChild(link);
    }
    link.setAttribute("href", href);
  }

  function injectJsonLd(id, payload) {
    var oldNode = document.getElementById(id);
    if (oldNode && oldNode.parentNode) oldNode.parentNode.removeChild(oldNode);
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  function detectPageLanguage(pathname) {
    var path = String(pathname || "").toLowerCase();
    if (path.endsWith("/en.html") || path === "/en") return "en";
    if (path.endsWith("/ro.html") || path === "/ro") return "ro";
    return "ru";
  }

  function getLanguageSeoConfig(lang, baseUrl) {
    var pages = {
      ru: {
        htmlLang: "ru",
        locale: "ru_MD",
        canonical: baseUrl + "/",
        title: "Агентство недвижимости Venera Rielt - Недвижимость в Молдове",
        description: "Агентство недвижимости Venera Rielt в Молдове: продажа и аренда квартир, домов и коммерческих помещений в Кишиневе и по всей стране.",
        keywords: "агентство недвижимости Молдова, купить квартиру Кишинев, аренда квартиры Кишинев, купить дом Молдова, недвижимость Кишинев, риелтор Молдова, продажа квартир Молдова, коммерческая недвижимость Молдова"
      },
      en: {
        htmlLang: "en",
        locale: "en_MD",
        canonical: baseUrl + "/en.html",
        title: "Venera Rielt - Real Estate in Moldova",
        description: "Venera Rielt real estate agency in Moldova: buy, sell, and rent apartments, houses, and commercial properties in Chisinau and across the country.",
        keywords: "real estate Moldova, buy apartment Chisinau, rent apartment Moldova, house for sale Moldova, commercial property Chisinau, real estate agency Moldova"
      },
      ro: {
        htmlLang: "ro",
        locale: "ro_MD",
        canonical: baseUrl + "/ro.html",
        title: "Venera Rielt - Imobiliare in Moldova",
        description: "Agentia imobiliara Venera Rielt in Moldova: vanzare si chirie apartamente, case si spatii comerciale in Chisinau si in toata tara.",
        keywords: "imobiliare Moldova, apartamente Chisinau, chirie apartamente Moldova, case de vanzare Moldova, spatii comerciale Chisinau, agentie imobiliara Moldova"
      }
    };
    return pages[lang] || pages.ru;
  }

  function syncOgAlternateLocales(currentLocale, locales) {
    var existing = document.head.querySelectorAll('meta[property="og:locale:alternate"]');
    for (var i = 0; i < existing.length; i += 1) {
      existing[i].parentNode.removeChild(existing[i]);
    }
    locales.forEach(function(locale) {
      if (locale === currentLocale) return;
      var meta = document.createElement("meta");
      meta.setAttribute("property", "og:locale:alternate");
      meta.setAttribute("content", locale);
      document.head.appendChild(meta);
    });
  }

  function applySeo() {
    var baseUrl = resolveSiteUrl();
    var lang = detectPageLanguage(window.location.pathname);
    var config = getLanguageSeoConfig(lang, baseUrl);
    var canonicalUrl = config.canonical;
    var today = new Date().toISOString().slice(0, 10);

    var sameAs = [SOCIAL_TIKTOK, SOCIAL_FACEBOOK];
    if (SOCIAL_INSTAGRAM) sameAs.push(SOCIAL_INSTAGRAM);

    document.documentElement.setAttribute("lang", config.htmlLang);
    document.title = config.title;
    upsertMeta("name", "description", config.description);
    upsertMeta("name", "keywords", config.keywords || PAGE_KEYWORDS);
    upsertMeta("name", "language", config.htmlLang);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", OG_IMAGE);
    upsertMeta("property", "og:title", config.title);
    upsertMeta("property", "og:description", config.description);
    upsertMeta("property", "og:locale", config.locale);
    syncOgAlternateLocales(config.locale, ["ru_MD", "ro_MD", "en_MD"]);

    upsertLink("canonical", canonicalUrl);
    upsertLink("alternate", baseUrl + "/", "ru-MD");
    upsertLink("alternate", baseUrl + "/ro.html", "ro-MD");
    upsertLink("alternate", baseUrl + "/en.html", "en-MD");
    upsertLink("alternate", baseUrl + "/", "x-default");

    injectJsonLd("ld-website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": canonicalUrl + "#website",
      name: SITE_NAME,
      url: canonicalUrl,
      inLanguage: ["ru", "ro", "en"],
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: canonicalUrl + "#properties?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    });

    injectJsonLd("ld-webpage", {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": canonicalUrl + "#webpage",
      url: canonicalUrl,
      name: config.title,
      description: config.description,
      inLanguage: ["ru", "ro", "en"],
      isPartOf: { "@id": canonicalUrl + "#website" },
      about: { "@id": canonicalUrl + "#business" },
      dateModified: today,
      breadcrumb: { "@id": canonicalUrl + "#breadcrumb" }
    });

    injectJsonLd("ld-breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": canonicalUrl + "#breadcrumb",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: canonicalUrl
        }
      ]
    });

    injectJsonLd("ld-business", {
      "@context": "https://schema.org",
      "@type": ["RealEstateAgent", "LocalBusiness"],
      "@id": canonicalUrl + "#business",
      name: SITE_NAME,
      url: canonicalUrl,
      description: "Real estate agency in Moldova for sales and rentals.",
      logo: {
        "@type": "ImageObject",
        url: baseUrl + "/image/components/appicon-512.png",
        width: 512,
        height: 512
      },
      image: OG_IMAGE,
      telephone: REAL_PHONE,
      email: REAL_EMAIL,
      address: {
        "@type": "PostalAddress",
        streetAddress: REAL_ADDRESS,
        addressLocality: "Chisinau",
        addressCountry: "MD"
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 47.0105,
        longitude: 28.8638
      },
      availableLanguage: ["Russian", "Romanian", "English"],
      sameAs: sameAs
    });

    injectJsonLd("ld-organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": canonicalUrl + "#organization",
      name: SITE_NAME,
      url: canonicalUrl,
      logo: {
        "@type": "ImageObject",
        url: baseUrl + "/image/components/appicon-512.png",
        width: 512,
        height: 512
      },
      contactPoint: {
        "@type": "ContactPoint",
        telephone: REAL_PHONE,
        contactType: "customer service",
        areaServed: "MD",
        availableLanguage: ["Russian", "Romanian", "English"]
      },
      sameAs: sameAs
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySeo);
  } else {
    applySeo();
  }
})();
