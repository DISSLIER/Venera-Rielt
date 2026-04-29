/**
 * seo.js — инамическое SEO для Venera Rielt
 *
 * оль этого файла:
 *  - бновить title/description/OG если сайт открыт на кастомном домене
 *  - нжектировать расширенные JSON-LD схемы (LocalBusiness, FAQPage, BreadcrumbList, WebPage)
 *  - сновные <meta> теги уже прописаны inline в <head> index.html — поисковик видит их без JS
 *
 * Т  Ш:
 *   REAL_PHONE       — реальный номер телефона агентства
 *   REAL_EMAIL       — реальный email
 *   REAL_ADDRESS     — реальный адрес офиса
 *   SOCIAL_TIKTOK    — ссылка TikTok
 *   SOCIAL_INSTAGRAM — ссылка Instagram (если есть)
 */
(function () {
  "use strict";

  var DEFAULT_SITE_URL  = "https://venera-rielt.vercel.app";
  var SITE_NAME         = "Venera Rielt";
  var REAL_PHONE        = "+373 XX XXX XXX";
  var REAL_EMAIL        = "info@venera-rielt.md";
  var REAL_ADDRESS      = "ишинёв, олдова";
  var SOCIAL_TIKTOK     = "https://www.tiktok.com/@venera.rielt?_t=ZN-8z4bdlOBmNy&_r=1";
  var SOCIAL_INSTAGRAM  = "";

  var PAGE_TITLE_RU = "гентство недвижимости Venera Rielt — упить, продать, арендовать в олдове";
  var PAGE_DESC_RU  = "гентство недвижимости Venera Rielt в олдове. родажа и аренда квартир, домов, коммерческих помещений в ишинёве и по всей олдове. рофессиональные риелторы, актуальная база объектов. Imobiliare în Moldova — vânzare și chirie apartamente, case, spații comerciale în Chișinău.";
  var OG_IMAGE      = DEFAULT_SITE_URL + "/image/components/appicon-512.png";

  function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function resolveSiteUrl() {
    try {
      var loc = window.location;
      if (loc && !isLocalhost(loc.hostname)) return loc.origin.replace(/\/$/, "");
    } catch (e) {}
    return DEFAULT_SITE_URL;
  }

  function upsertMeta(attr, key, content) {
    if (!key || !content) return;
    var meta = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attr, key);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
  }

  function upsertLink(rel, href, hreflang) {
    var sel  = 'link[rel="' + rel + '"]' + (hreflang ? '[hreflang="' + hreflang + '"]' : '');
    var link = document.head.querySelector(sel);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", rel);
      if (hreflang) link.setAttribute("hreflang", hreflang);
      document.head.appendChild(link);
    }
    link.setAttribute("href", href);
  }

  function injectJsonLd(id, payload) {
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var script  = document.createElement("script");
    script.type = "application/ld+json";
    script.id   = id;
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  function applySeo() {
    var baseUrl      = resolveSiteUrl();
    var canonicalUrl = baseUrl + "/";
    var sameAs       = [SOCIAL_TIKTOK];
    if (SOCIAL_INSTAGRAM) sameAs.push(SOCIAL_INSTAGRAM);

    document.title = PAGE_TITLE_RU;

    upsertMeta("name",     "description",      PAGE_DESC_RU);
    upsertMeta("property", "og:url",           canonicalUrl);
    upsertMeta("property", "og:image",         OG_IMAGE);
    upsertMeta("property", "og:title",         "гентство недвижимости Venera Rielt — олдова");
    upsertMeta("property", "og:description",   PAGE_DESC_RU.slice(0, 300));
    upsertLink("canonical", canonicalUrl);
    upsertLink("alternate", canonicalUrl, "ru-MD");
    upsertLink("alternate", canonicalUrl, "ro-MD");
    upsertLink("alternate", canonicalUrl, "x-default");

    /* 1. WebSite */
    injectJsonLd("ld-website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": canonicalUrl + "#website",
      "name": SITE_NAME,
      "url": canonicalUrl,
      "inLanguage": ["ru", "ro"],
      "potentialAction": {
        "@type": "SearchAction",
        "target": {"@type": "EntryPoint", "urlTemplate": canonicalUrl + "#properties?q={search_term_string}"},
        "query-input": "required name=search_term_string"
      }
    });

    /* 2. WebPage */
    injectJsonLd("ld-webpage", {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": canonicalUrl + "#webpage",
      "url": canonicalUrl,
      "name": PAGE_TITLE_RU,
      "description": PAGE_DESC_RU,
      "inLanguage": ["ru", "ro"],
      "isPartOf": {"@id": canonicalUrl + "#website"},
      "about": {"@id": canonicalUrl + "#business"},
      "dateModified": "2026-04-29",
      "breadcrumb": {"@id": canonicalUrl + "#breadcrumb"}
    });

    /* 3. BreadcrumbList */
    injectJsonLd("ld-breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": canonicalUrl + "#breadcrumb",
      "itemListElement": [{"@type": "ListItem", "position": 1, "name": "лавная", "item": canonicalUrl}]
    });

    /* 4. LocalBusiness + RealEstateAgent */
    injectJsonLd("ld-business", {
      "@context": "https://schema.org",
      "@type": ["RealEstateAgent", "LocalBusiness"],
      "@id": canonicalUrl + "#business",
      "name": SITE_NAME,
      "alternateName": "енера иелт",
      "description": "гентство недвижимости в олдове — продажа, покупка и аренда квартир, домов и коммерческих объектов в ишинёве и регионах.",
      "url": canonicalUrl,
      "logo": {"@type": "ImageObject", "url": baseUrl + "/image/components/appicon-512.png", "width": 512, "height": 512},
      "image": OG_IMAGE,
      "telephone": REAL_PHONE,
      "email": REAL_EMAIL,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": REAL_ADDRESS,
        "addressLocality": "Chișinău",
        "addressRegion": "Chișinău Municipality",
        "addressCountry": "MD"
      },
      "geo": {"@type": "GeoCoordinates", "latitude": 47.0105, "longitude": 28.8638},
      "areaServed": [
        {"@type": "City", "name": "Chișinău"},
        {"@type": "City", "name": "Bălți"},
        {"@type": "City", "name": "Orhei"},
        {"@type": "City", "name": "Ungheni"},
        {"@type": "Country", "name": "Moldova"}
      ],
      "availableLanguage": [{"@type": "Language", "name": "Russian"}, {"@type": "Language", "name": "Romanian"}],
      "openingHoursSpecification": [
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:00", "closes": "18:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday"], "opens": "10:00", "closes": "15:00"}
      ],
      "priceRange": "$$",
      "currenciesAccepted": "EUR, MDL",
      "sameAs": sameAs
    });

    /* 5. Organization */
    injectJsonLd("ld-organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": canonicalUrl + "#organization",
      "name": SITE_NAME,
      "alternateName": "енера иелт",
      "url": canonicalUrl,
      "logo": {"@type": "ImageObject", "url": baseUrl + "/image/components/appicon-512.png", "width": 512, "height": 512},
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": REAL_PHONE,
        "contactType": "customer service",
        "areaServed": "MD",
        "availableLanguage": ["Russian", "Romanian"]
      },
      "sameAs": sameAs
    });

    /* 6. FAQPage — даёт расширенный сниппет в Google (самый ценный блок) */
    injectJsonLd("ld-faq", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "ак купить квартиру в олдове?",
          "acceptedAnswer": {"@type": "Answer", "text": "тобы купить квартиру в олдове, обратитесь в агентство недвижимости Venera Rielt. ы подберём объект по вашему бюджету, организуем показы, проверим документы и сопроводим сделку до регистрации. ставьте заявку на сайте или позвоните нам."}
        },
        {
          "@type": "Question",
          "name": "Сколько стоит аренда квартиры в ишинёве?",
          "acceptedAnswer": {"@type": "Answer", "text": "Стоимость аренды квартиры в ишинёве: однокомнатные — от 200 до 400 € в месяц, двухкомнатные — от 300 до 600 €. ена зависит от района, площади и состояния. ктуальную базу предложений смотрите в разделе «бъекты» на нашем сайте."}
        },
        {
          "@type": "Question",
          "name": "омогает ли агентство с продажей недвижимости?",
          "acceptedAnswer": {"@type": "Answer", "text": "а, агентство Venera Rielt проводит полное сопровождение при продаже: оценку рыночной стоимости, фотосъёмку, размещение объявлений, показы покупателям и юридическое оформление сделки. омиссия обсуждается индивидуально."}
        },
        {
          "@type": "Question",
          "name": "аботает ли агентство по всей олдове?",
          "acceptedAnswer": {"@type": "Answer", "text": "а, Venera Rielt работает в ишинёве, ельцах, ргееве, нгенах и других городах олдовы. аши риелторы помогут с покупкой, продажей и арендой недвижимости в любом регионе страны."}
        },
        {
          "@type": "Question",
          "name": "Ce documente sunt necesare pentru cumpărarea unui apartament în Moldova?",
          "acceptedAnswer": {"@type": "Answer", "text": "Pentru cumpărarea unui apartament în Moldova aveți nevoie de buletin de identitate, contract de vânzare-cumpărare autentificat notarial și extras din Registrul bunurilor imobile. Agenția Venera Rielt vă ajută cu toate documentele necesare."}
        },
        {
          "@type": "Question",
          "name": "ак быстро продаётся недвижимость через агентство?",
          "acceptedAnswer": {"@type": "Answer", "text": "Среднее время продажи через Venera Rielt — от 2 до 8 недель в зависимости от объекта и рынка. равильная оценка и профессиональное продвижение значительно ускоряют продажу."}
        }
      ]
    });

    /* 7. ItemList — навигационные ссылки по типам объектов */
    injectJsonLd("ld-itemlist", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Типы недвижимости — Venera Rielt",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "вартиры на продажу в олдове",        "url": canonicalUrl + "#properties"},
        {"@type": "ListItem", "position": 2, "name": "ома на продажу в олдове",            "url": canonicalUrl + "#properties"},
        {"@type": "ListItem", "position": 3, "name": "ренда квартир в ишинёве",            "url": canonicalUrl + "#properties"},
        {"@type": "ListItem", "position": 4, "name": "оммерческая недвижимость в олдове",  "url": canonicalUrl + "#properties"}
      ]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySeo);
  } else {
    applySeo();
  }
})();
