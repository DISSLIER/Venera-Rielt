(function () {
  // Central SEO configuration for Moldova-focused bilingual visibility (RU/RO).
  var DEFAULT_SITE_URL = "https://venera-rielt.vercel.app";
  var SITE_NAME = "Venera Rielt";
  var PAGE_TITLE = "Venera Rielt - Недвижимость в Молдове | Imobiliare in Moldova";
  var PAGE_DESCRIPTION = "Премиальная недвижимость по всей Молдове: квартиры, дома, коммерческие объекты, аренда и продажа. Imobiliare premium in toata Moldova: apartamente, case, spatii comerciale, chirie si vanzare.";
  var OG_IMAGE = "https://venera-rielt.vercel.app/image/components/appicon-512.png";

  function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function resolveSiteUrl() {
    try {
      var loc = window.location;
      if (loc && !isLocalhost(loc.hostname)) {
        return loc.origin;
      }
    } catch (e) {
      // Ignore and fallback.
    }
    return DEFAULT_SITE_URL;
  }

  function normalizeUrl(url) {
    return String(url || "").replace(/\/$/, "");
  }

  function upsertMetaByName(name, content) {
    if (!name) return;
    var selector = 'meta[name="' + name + '"]';
    var meta = document.head.querySelector(selector);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", name);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
  }

  function upsertMetaByProperty(property, content) {
    if (!property) return;
    var selector = 'meta[property="' + property + '"]';
    var meta = document.head.querySelector(selector);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("property", property);
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

  function removeDuplicateStructuredData(id) {
    var oldNode = document.getElementById(id);
    if (oldNode && oldNode.parentNode) {
      oldNode.parentNode.removeChild(oldNode);
    }
  }

  function injectStructuredData(id, payload) {
    removeDuplicateStructuredData(id);
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  function applySeo() {
    var baseUrl = normalizeUrl(resolveSiteUrl());
    var canonicalUrl = baseUrl + "/";

    document.documentElement.setAttribute("lang", "ru");
    document.title = PAGE_TITLE;

    upsertMetaByName("description", PAGE_DESCRIPTION);
    upsertMetaByName(
      "keywords",
      "недвижимость Молдова, купить квартиру Молдова, аренда квартир Молдова, агентство недвижимости Кишинев, imobiliare Moldova, apartamente Chisinau, chirie Moldova, agentie imobiliara Moldova"
    );
    upsertMetaByName("robots", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
    upsertMetaByName("googlebot", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
    upsertMetaByName("geo.region", "MD");
    upsertMetaByName("geo.placename", "Moldova");
    upsertMetaByName("geo.position", "47.0105;28.8638");
    upsertMetaByName("ICBM", "47.0105, 28.8638");

    upsertMetaByProperty("og:type", "website");
    upsertMetaByProperty("og:site_name", SITE_NAME);
    upsertMetaByProperty("og:title", PAGE_TITLE);
    upsertMetaByProperty("og:description", PAGE_DESCRIPTION);
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:image", OG_IMAGE);
    upsertMetaByProperty("og:locale", "ru_RU");
    upsertMetaByProperty("og:locale:alternate", "ro_RO");

    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", PAGE_TITLE);
    upsertMetaByName("twitter:description", PAGE_DESCRIPTION);
    upsertMetaByName("twitter:image", OG_IMAGE);

    upsertLink("canonical", canonicalUrl);
    upsertLink("alternate", canonicalUrl, "ru-MD");
    upsertLink("alternate", canonicalUrl, "ro-MD");
    upsertLink("alternate", canonicalUrl, "x-default");

    injectStructuredData("seo-website-jsonld", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: canonicalUrl,
      inLanguage: ["ru", "ro"],
      potentialAction: {
        "@type": "SearchAction",
        target: canonicalUrl + "#properties",
        "query-input": "required name=search_term_string"
      }
    });

    injectStructuredData("seo-organization-jsonld", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: canonicalUrl,
      logo: baseUrl + "/image/components/AppIcon.png",
      sameAs: ["https://www.tiktok.com/@venera.rielt?_t=ZN-8z4bdlOBmNy&_r=1"]
    });

    injectStructuredData("seo-realestate-jsonld", {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: SITE_NAME,
      url: canonicalUrl,
      areaServed: {
        "@type": "Country",
        name: "Moldova"
      },
      availableLanguage: ["ru", "ro"],
      address: {
        "@type": "PostalAddress",
        addressCountry: "MD",
        addressLocality: "Chisinau",
        streetAddress: "ул. Пушкина 42, офис 15"
      },
      telephone: "+37322123456",
      email: "info@venera-rielt.md"
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySeo);
  } else {
    applySeo();
  }
})();
