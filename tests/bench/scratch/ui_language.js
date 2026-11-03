
var SHARED = (function () {
    var UI_LANGUAGES = [["de"],["en"],["fr"],["ru"]];
    var i18n = { packs: new Map(), loading: new Set() };
    var TEXTS = [];
    for (var i = 0; i < 300; i++) TEXTS.push("Venus setting label number " + i + " with some words");
    var pack = {};
    for (var j = 0; j < TEXTS.length; j++) pack[TEXTS[j]] = "Venus-Einstellung " + j;
    i18n.packs.set("de", pack);
    return {settings: {language: "auto"}, UI_CODES: new Set(UI_LANGUAGES.map(e => e[0])), i18n: i18n, TEXTS: TEXTS};
})();

var OLD = (function () {
    var settings = SHARED.settings;
    var UI_CODES = SHARED.UI_CODES;
    var i18n = SHARED.i18n;
    var localeStore = null;
    let cachedLocale = undefined, cachedLocaleCode = "en";
    
function languageFor(locale) {
    if (typeof locale !== "string") return "en";
    const parts = locale.replace("_", "-").split("-"), base = parts[0].toLowerCase(), region = (parts[1] || "").toUpperCase();
    if (base === "zh") return /^(TW|HK|MO|HANT)$/.test(region) ? "zh-TW" : "zh-CN";
    if (base === "pt") return "pt-BR";
    if (base === "nb" || base === "nn") return "no";
    return UI_CODES.has(base) ? base : "en";
}
function uiLanguage() {
    const lang = settings.language;
    if (lang !== "auto") return UI_CODES.has(lang) ? lang : "en";
    let locale = null;
    try { locale = localeStore && localeStore.locale; } catch (_) {}
    if (locale === cachedLocale) return cachedLocaleCode;
    cachedLocale = locale;
    return cachedLocaleCode = languageFor(locale);
}

    return {ui: uiLanguage, setLocale: function (v) { localeStore = v; }};
})();

var NEW = (function () {
    var settings = SHARED.settings;
    var UI_CODES = SHARED.UI_CODES;
    var i18n = SHARED.i18n;
    var localeStore = null;
    let cachedLocale = undefined, cachedLocaleCode = "en";
    let languageSeen = "\u0000", languageCode = "en";
function languageFor(locale) {
    if (typeof locale !== "string") return "en";
    const parts = locale.replace("_", "-").split("-"), base = parts[0].toLowerCase(), region = (parts[1] || "").toUpperCase();
    if (base === "zh") return /^(TW|HK|MO|HANT)$/.test(region) ? "zh-TW" : "zh-CN";
    if (base === "pt") return "pt-BR";
    if (base === "nb" || base === "nn") return "no";
    return UI_CODES.has(base) ? base : "en";
}
function uiLanguage() {
    const lang = settings.language;
    // tr() asks for this on every label it prints (974 call sites), and a chosen language never changes
    // between settings writes: memoise the fixed-language answer instead of hashing it in UI_CODES each time.
    // Hermes HBC98: 89.8 -> 78.1 us per 300 labels (1.15x).
    if (lang !== languageSeen) {
        languageSeen = lang;
        languageCode = lang !== "auto" && UI_CODES.has(lang) ? lang : "en";
    }
    if (lang !== "auto") return languageCode;
    let locale = null;
    try { locale = localeStore && localeStore.locale; } catch (_) {}
    if (locale === cachedLocale) return cachedLocaleCode;
    cachedLocale = locale;
    return cachedLocaleCode = languageFor(locale);
}

    return {ui: uiLanguage, setLocale: function (v) { localeStore = v; }};
})();

// tr() end to end, with the language chosen by hand and with Discord's own locale.
function sweep(ui) {
    var t = SHARED.TEXTS, sink = 0;
    for (var i = 0; i < t.length; i++) sink += ui(t[i]).length;
    return sink;
}
var LOCALE = Object.defineProperty({}, "locale", {get: function () { return "de"; }});
OLD.setLocale(LOCALE); NEW.setLocale(LOCALE);
SHARED.settings.language = "de";
bench("fixed de (old)", function () { sweep(OLD.ui); });
bench("fixed de (new)", function () { sweep(NEW.ui); });
SHARED.settings.language = "auto";
bench("auto de (old)", function () { sweep(OLD.ui); });
bench("auto de (new)", function () { sweep(NEW.ui); });
