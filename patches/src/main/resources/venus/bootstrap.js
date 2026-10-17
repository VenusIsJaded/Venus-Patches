/* Venus Patches: bundled, offline runtime. No remote code or full client mod required. */
(function (global) {
    "use strict";
    if (global.__venusPatches) return;
    const features = /*__FEATURES__*/;
    // Inspected Metro IDs for the SHA-256-pinned 348.10 bundle; never scan or eagerly require modules.
    const targetModules = new Set([17, 19, 1163, 10874, 14130, 14236]);
    function selectModules(ids) { ids.forEach(id => targetModules.add(id)); }
    if (features.picker) selectModules([414]);
    if (features.voice) selectModules([1283, 5440, 5442]);
    if (features.copyBios) selectModules([10742]);
    if (features.dashless) selectModules([2051, 4990, 5314, 7099]);
    if (features.favouriteAnything) selectModules([12524, 9861, 9864]);
    if (features.freeNitro) selectModules([1378, 2051, 5772, 5815, 4491, 13528, 6756, 6880]);
    if (features.noTyping) selectModules([11348]);
    if (features.quickDelete) selectModules([5205, 1127]);
    if (features.noDelete) selectModules([585, 5057, 5059, 1378, 2051, 6880, 7378]);
    if (features.jumpToTop) selectModules([11642, 11643, 11644, 8838, 6880, 5057]);
    if (features.hiddenChannels) selectModules([1086, 1097, 1113, 2051, 2102, 4470, 6952, 4472, 4990, 6880, 585, 1378, 15859, 5410]);
    if (features.pastelize) selectModules([7378, 1252, 2111]);
    if (features.platformIndicators) selectModules([4877, 4855, 1378, 2051, 10603, 10371, 12845, 15667, 9108, 13649, 12602]);
    if (features.reviewDB) selectModules([12627, 13521, 13987, 8510, 5997, 6621, 1378, 585]);
    if (features.readAll) selectModules([15929]);
    if (features.quests) selectModules([585, 7120, 7179, 13174, 13212]);
    if (features.hideGift) selectModules([11609, 11817]);
    if (features.hideQuestDock) selectModules([14608, 14700]);
    if (features.systemEmoji) selectModules([6552]);
    if (features.gestures) selectModules([7414, 9652, 11105, 11666, 1378, 10905]);
    if (features.hideCall) selectModules([12696]);
    if (features.validUser) selectModules([585, 1378]);
    if (features.youBarSettings) selectModules([16032]);
    if (features.splitMessages) selectModules([1086, 1378, 2051, 6880, 8602]);
    if (features.translate) selectModules([585, 1378, 7378, 11023]);
    if (features.userNotif) selectModules([585, 1378, 2051, 2073, 4482, 4877, 7179, 13174, 13212]);
    if (features.accountSwitcher) selectModules([1378, 11800, 11801, 11802, 16032]);
    if (features.appIcons) selectModules([1378, 4491, 8621, 13528, 15065, 15066, 16750, 17096]);
    if (features.customThemes) selectModules([590, 592, 1194, 4551, 9542]);
    if (features.messageHighlight) selectModules([585, 1378, 5057, 7378]);
    // LocaleStore: Venus settings follow Discord's language unless you pick another one.
    selectModules([2115]);
    const revision = "1.15.0";
    // Module 120 owns setUpDefaltReactNativeEnvironment in this exact asset.
    // Defer every feature hook until that initializer returns successfully.
    let environmentReady = false;
    const deferred = new Map();
    // Every feature starts off: nothing changes in Discord until you turn it on. Options inside a feature keep
    // their own defaults, so turning a feature on does what it says straight away.
    const settings = { picker: false, voice: false, copyBios: false, dashless: false, favouriteAnything: false, freeNitro: false, emojis: true, stickers: true, hyperlinks: true,
        noTyping: false, quickDelete: false, noDelete: false, noDeleteSave: false, noDeleteLimit: 512, noDeleteEdits: true,
        jumpToTop: false, hiddenChannels: false, hiddenChannelsMenu: true, pastelize:false, pastelAll:false, pastelContent:false, platformIndicators:false, piDmHeader:true, piUserList:true, piProfile:true, piHideMobile:true, reviewDB:false, reviewWarning:true, readAll:false, readAllMode:"guilds",
        quests:false, questsVideo:true, questsPlay:true, questsActivity:true, questsEnroll:true, systemFont:false,
        hideGift:false, hideQuestDock:false, systemEmoji:false, gestures:false, gestureOwn:"edit", gestureTripleDelete:true, hideCall:false,
        validUser:false, youBarSettings:false, splitMessages:false,
        translate:false, translateTarget:"discord", translateMode:"auto", translateNote:true, translateOriginal:false,
        userNotif:false, userNotifFriends:true, userNotifStatus:true, userNotifMessages:true, userNotifTyping:true, userNotifPush:false,
        accountSwitcher:false, accountSwitcherYouBar:true, appIcons:false, customThemes:false, customThemesBackground:true,
        messageHighlight:false, messageHighlightThickness:2, messageHighlightPingColor:"default", messageHighlightDeletedColor:"default", language:"auto" };
    const status = { picker: false, attachment: false, request: false, menu: false, conversion: false, audioError: "", storage: "waiting" };
    const listeners = new Set();
    const dirty = new Set();
    const sizeCache = new Map();
    const sizeQueue = [];
    const pendingVoice = new Map();
    const markedPayloads = new WeakMap();
    const wrapped = new WeakMap();
    // React Native installs Promise during its polyfill phase; no Promise use in this prelude.
    let React, RN, files, activeReads = 0, writePending = false, nextSave;
    const conversions = new WeakMap();
    const readyUploads = new WeakMap();
    const activeJobs = new Map();
    let jobCounter = 0;
    const PREFS = "venus-patches.json";
    const MAX_DELETED = 5000, ARCHIVE_BYTES = 32 * 1024 * 1024;
    // What the Read all button clears: servers, DMs, or both.
    const READ_ALL_MODES = ["guilds", "dms", "both"];
    // What double-tapping your own message does: edit it, or reply like anyone else's.
    const GESTURE_OWN_MODES = ["edit", "reply"];
    // Which language Translate messages translates into: Discord's own language, or the phone's.
    const TRANSLATE_TARGETS = ["discord", "phone"];
    // When Translate messages translates: everything on screen, or only messages you pick from the hold menu.
    const TRANSLATE_MODES = ["auto", "manual"];
    // Left bar thickness multiplier (1x = 2dp default, 2x = 4dp, 3x = 6dp, 4x = 8dp) and highlight color presets (#60).
    const HIGHLIGHT_THICKNESSES = [1, 2, 3, 4];
    const HIGHLIGHT_COLOR_MAP = {default:"", yellow:"#f0b232", blurple:"#5865f2", green:"#23a55a", cyan:"#00a8fc", pink:"#eb459e", purple:"#9b59b6", orange:"#e67e22", red:"#f23f43"};
    function isHighlightColor(value) {
        return typeof value === "string" && (owns(HIGHLIGHT_COLOR_MAP, value) || /^#[0-9a-fA-F]{6}$/.test(value.trim()));
    }
    function normalizeHighlightColor(value) {
        if (typeof value !== "string") return "default";
        const trimmed = value.trim().toLowerCase();
        return owns(HIGHLIGHT_COLOR_MAP, trimmed) || /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : "default";
    }
    // The language of Venus settings. English is built in; every other one is a file in the patched APK
    // (assets/venus/i18n), read once when it's first needed, so none of them slows down Discord's start.
    const UI_LANGUAGES = [["en","English","English"],["bg","\u0411\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438","Bulgarian"],["ca","Catal\u00e0","Catalan"],["cs","\u010ce\u0161tina","Czech"],
        ["da","Dansk","Danish"],["de","Deutsch","German"],["el","\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac","Greek"],["es","Espa\u00f1ol","Spanish"],
        ["fi","Suomi","Finnish"],["fr","Fran\u00e7ais","French"],["hi","\u0939\u093f\u0928\u094d\u0926\u0940","Hindi"],["hr","Hrvatski","Croatian"],
        ["hu","Magyar","Hungarian"],["id","Bahasa Indonesia","Indonesian"],["it","Italiano","Italian"],["ja","\u65e5\u672c\u8a9e","Japanese"],
        ["ko","\ud55c\uad6d\uc5b4","Korean"],["lt","Lietuvi\u0173","Lithuanian"],["nl","Nederlands","Dutch"],["no","Norsk","Norwegian"],
        ["pl","Polski","Polish"],["pt-BR","Portugu\u00eas do Brasil","Portuguese (Brazil)"],["ro","Rom\u00e2n\u0103","Romanian"],
        ["ru","\u0420\u0443\u0441\u0441\u043a\u0438\u0439","Russian"],["sv","Svenska","Swedish"],["th","\u0e44\u0e17\u0e22","Thai"],
        ["tr","T\u00fcrk\u00e7e","Turkish"],["uk","\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430","Ukrainian"],
        ["vi","Ti\u1ebfng Vi\u1ec7t","Vietnamese"],["zh-CN","\u7b80\u4f53\u4e2d\u6587","Chinese (Simplified)"],["zh-TW","\u7e41\u9ad4\u4e2d\u6587","Chinese (Traditional)"]];
    const UI_CODES = new Set(UI_LANGUAGES.map(entry => entry[0]));
    const isLanguage = value => value === "auto" || UI_CODES.has(value);
    const I18N_PREFIX = "venus-i18n-v1:";
    const i18n = {packs:new Map(), loading:new Set(), version:0, shownIn:null};
    // A language file that couldn't be read: English is shown instead.
    const EMPTY_PACK = Object.freeze({});
    let localeStore = null, cachedLocale = undefined, cachedLocaleCode = "en";
    // Discord's language as one of Venus's: "pt-BR" and "pt-PT" both read Portuguese, "es-419" Spanish.
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
    // Every Venus text goes through here: the chosen language's wording, or the English one until it has loaded
    // (or when it has no wording for it). {name} parts are filled in afterwards, so numbers are never translated.
    function tr(text, vars) {
        let out = text;
        const code = uiLanguage();
        if (code !== "en") {
            const pack = i18n.packs.get(code);
            if (pack) { const found = pack[text]; if (typeof found === "string" && found) out = found; }
            else loadLanguage(code);
        }
        return vars ? out.replace(/\{(\w+)\}/g, (match, name) => vars[name] != null ? String(vars[name]) : match) : out;
    }
    // Which plural form a whole number takes in each Venus language (CLDR's rules). Discord's Hermes has no
    // Intl.PluralRules, so these are built in: Russian needs "21 перевод" and "22 перевода", French "0 traduction".
    function pluralKind(code, n) {
        n = Math.abs(Math.floor(n));
        const d = n % 10, h = n % 100, teen = h >= 11 && h <= 19, few = d >= 2 && d <= 4 && !(h >= 12 && h <= 14);
        switch (code) {
            case "ja": case "ko": case "zh-CN": case "zh-TW": case "th": case "vi": case "id": return "other";
            case "fr": case "pt-BR": case "hi": return n <= 1 ? "one" : "other";
            case "ru": case "uk": return d === 1 && h !== 11 ? "one" : few ? "few" : "many";
            case "hr": return d === 1 && h !== 11 ? "one" : few ? "few" : "other";
            case "pl": return n === 1 ? "one" : few ? "few" : "many";
            case "cs": return n === 1 ? "one" : n >= 2 && n <= 4 ? "few" : "other";
            case "lt": return d === 1 && !teen ? "one" : d >= 2 && !teen ? "few" : "other";
            case "ro": return n === 1 ? "one" : n === 0 || h >= 1 && h <= 19 ? "few" : "other";
            default: return n === 1 ? "one" : "other";
        }
    }
    // "1 translation" / "3 translations". A language file can give every plural form its language has,
    // as {"one":..., "few":..., "many":..., "other":...}.
    function pl(n, one, other, vars) {
        const code = uiLanguage(), pack = code !== "en" && i18n.packs.get(code), forms = pack && pack[other];
        const kind = pack ? pluralKind(code, n) : n === 1 ? "one" : "other";
        let text;
        if (forms && typeof forms === "object") text = typeof forms[kind] === "string" ? forms[kind] : typeof forms.other === "string" ? forms.other : tr(kind === "one" ? one : other);
        else text = tr(kind === "one" ? one : other);
        const out = text.replace(/\{n\}/g, String(n));
        return vars ? out.replace(/\{(\w+)\}/g, (match, name) => vars[name] != null ? String(vars[name]) : match) : out;
    }
    function loadLanguage(code) {
        if (code === "en" || i18n.packs.has(code) || i18n.loading.has(code) || !files || typeof files.readAsset !== "function") return;
        i18n.loading.add(code);
        Promise.resolve().then(() => files.readAsset(I18N_PREFIX + code, "utf8")).then(text => {
            const pack = JSON.parse(text), strings = pack && pack.strings;
            if (!strings || typeof strings !== "object" || Array.isArray(strings)) throw new Error("Invalid language file");
            i18n.packs.set(code, strings);
        }).catch(() => { i18n.packs.set(code, EMPTY_PACK); }).then(() => { i18n.loading.delete(code); languageChanged(); });
    }
    function languageChanged() {
        i18n.version++; i18n.shownIn = uiLanguage();
        notify("*");
        // Only the "Translated from ..." line under a translation is in Venus's language: redraw just those rows,
        // not every message on screen, and nothing while the feature is off or that line isn't shown.
        if (features.translate && enabled("translate") && (settings.translateNote || settings.translateOriginal)) translateRelabel();
    }
    // A sub-option (piProfile, reviewWarning, pastelAll...) must also wake components that
    // subscribed to its plugin: those pages and badges read several of its settings at once.
    const notify = key => {
        const owner = key && key !== "*" ? featureFor(key) : null;
        listeners.forEach(entry => {
            if (!entry.key || key === "*" || entry.key === key || owner && entry.key === owner) entry.fn();
        });
    };
    const data = (obj, key) => {
        const descriptor = obj && Object.getOwnPropertyDescriptor(obj, key);
        return descriptor && "value" in descriptor ? descriptor.value : undefined;
    };
    const owns = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
    // enabled() runs inside nearly every hook: resolve setting -> feature once, not per call.
    const featureTable = new Map();
    const enabled = key => {
        let feature = featureTable.get(key);
        if (feature === undefined) featureTable.set(key, feature = featureFor(key));
        // An option only counts while its main switch is on too. Only FreeNitro checked that, so
        // "Removing link previews" kept skipping the question after QuickDelete itself was turned off.
        return !!(features[feature] && settings[key] && (feature === key || settings[feature]));
    };

    // The font Discord started with; the native side reads the same saved setting at launch.
    let fontInUse = false;
    // Emojis are the same: the native side reads the saved setting once at launch, and so does this.
    let emojiInUse = false;
    function settingsSnapshot() {
        const extra = {};
        if (features.reviewDB && reviewToken && reviewAccount) extra.reviewAuth = {account:reviewAccount, token:reviewToken};
        if (features.userNotif && userNotif.ids.size) extra.userNotifIds = Array.from(userNotif.ids);
        return JSON.stringify(Object.keys(extra).length ? Object.assign({}, settings, extra) : settings);
    }
    function save() {
        if (!files || status.storage === "loading") return;
        // Keep only the newest waiting snapshot, not one Promise/string per toggle.
        nextSave = settingsSnapshot();
        if (writePending) return;
        writePending = true;
        function persist() {
            const snapshot = nextSave;
            nextSave = undefined;
            return Promise.resolve().then(() => files.writeFile("documents", PREFS, snapshot, "utf8")).then(() => {
                status.storage = "saved";
            }, () => { status.storage = "save failed (session only)"; }).then(() => {
                notify();
                if (nextSave !== undefined && nextSave !== snapshot) return persist();
                nextSave = undefined;
                writePending = false;
            });
        }
        Promise.resolve().then(persist);
    }
    // Typing 0 in the maximum box used to jump it to 512; anything below 1 now means the lowest, 1.
    function deleteLimit(value) { const n = Math.floor(Number(value)); return Number.isFinite(n) ? Math.max(1, Math.min(MAX_DELETED, n)) : 512; }
    function setSetting(key, value) {
        // The settings language isn't a feature: it's always there.
        if (key === "language") {
            if (!isLanguage(value)) return false;
            if (settings.language === value && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings.language = value; dirty.add(key); save(); loadLanguage(uiLanguage()); languageChanged(); return true;
        }
        if (!owns(settings, key) || !features[featureFor(key)]) return false;
        if (key === "readAllMode") {
            if (!READ_ALL_MODES.includes(value)) return false;
            if (settings.readAllMode === value && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings.readAllMode = value; dirty.add(key); save(); notify(key); return true;
        }
        if (key === "gestureOwn") {
            if (!GESTURE_OWN_MODES.includes(value)) return false;
            if (settings.gestureOwn === value && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings.gestureOwn = value; dirty.add(key); save(); notify(key); return true;
        }
        if (key === "translateTarget" || key === "translateMode") {
            if (!(key === "translateMode" ? TRANSLATE_MODES : TRANSLATE_TARGETS).includes(value)) return false;
            if (settings[key] === value && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings[key] = value; dirty.add(key); save(); notify(key); translateChanged(); return true;
        }
        if (key === "noDeleteLimit") {
            const limit = deleteLimit(value);
            // Leaving the box without changing it no longer rewrites your settings.
            if (limit === settings.noDeleteLimit && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings.noDeleteLimit = limit; dirty.add(key); trimDeleted(); save(); notify(key); return true;
        }
        if (key === "messageHighlightThickness") {
            const mult = Number(value);
            if (!HIGHLIGHT_THICKNESSES.includes(mult)) return false;
            if (settings.messageHighlightThickness === mult && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings.messageHighlightThickness = mult; dirty.add(key); save(); notify(key); later(messageHighlightRedraw, 0); return true;
        }
        if (key === "messageHighlightPingColor" || key === "messageHighlightDeletedColor") {
            if (!isHighlightColor(value)) return false;
            const clean = normalizeHighlightColor(value);
            if (settings[key] === clean && status.storage !== "loading" && status.storage !== "waiting") return true;
            settings[key] = clean; dirty.add(key); save(); notify(key); later(messageHighlightRedraw, 0); return true;
        }
        if (settings[key] === !!value && status.storage !== "loading" && status.storage !== "waiting") return true;
        value = !!value;
        if (key === "reviewDB" && !value) { reviewAuthAttempt++; reviewCache.clear(); }
        if (key === "voice" && !value) activeJobs.forEach(job => {
            job.cancelled = true;
            nativeVoice("cancel", job.id).catch(() => {});
        });
        // Switching NoDelete off hides kept messages but must not erase the saved archive:
        // it used to write an empty file, so turning it back on lost every saved message.
        if (key === "noDelete" && !value) { clearDeleted(true, settings.noDeleteSave); archiveRestored = false; }
        if (key === "hiddenChannels") {hiddenViews.clear();}
        if ((key === "dashless" || key === "hiddenChannels") && channelStore && typeof channelStore.emitChange === "function")
            try { channelStore.emitChange(); } catch (_) {}
        if (key === "gestures" && !value && features.gestures) gestureCancel();
        if (key === "splitMessages" && !value && features.splitMessages) split.generation++;
        if ((key === "noDeleteEdits" || key === "noDelete") && !value && edits.size) { edits.clear(); persistDeleted(); }
        settings[key] = value;
        if (key === "noDeleteSave") { if (value) restoreDeleted(); else archiveRestored = false; persistDeleted(); }
        if (key === "noDelete" && value) restoreDeleted();
        dirty.add(key);
        if (key === "picker" && !value) {
            clearSizes();
        }
        if (features.quests && featureFor(key) === "quests") questsSettingChanged(key, value);
        if (key === "systemFont" && features.systemFont && status.storage !== "loading" && status.storage !== "waiting" && value !== fontInUse) later(() => askRestart("font"), 0);
        if (key === "systemEmoji" && features.systemEmoji && status.storage !== "loading" && status.storage !== "waiting" && value !== emojiInUse) later(() => askRestart("emoji"), 0);
        save();
        notify(key);
        if (features.translate && key === "translate" && value) translateRestore();
        if (features.translate && featureFor(key) === "translate") later(translateChanged, 0);
        if (features.userNotif && key === "userNotifPush" && value && status.storage !== "loading" && status.storage !== "waiting") later(() => userNotifRequestPermissions(false), 0);
        if (features.userNotif && featureFor(key) === "userNotif") userNotifSync();
        if (features.accountSwitcher && featureFor(key) === "accountSwitcher") accountSwitcherSync();
        if (features.customThemes && key === "customThemes") { if (value) customThemesRestore(); customThemesApply(); }
        if (features.customThemes && key === "customThemesBackground") customThemesApply();
        if (features.messageHighlight && key === "messageHighlight") later(messageHighlightRedraw, 0);
        if (features.quests || features.userNotif) backgroundSync();
        return true;
    }
    function initFiles(module) {
        if (files) return;
        files = module;
        status.storage = "loading";
        // Size metadata does not depend on the preferences directory being available.
        drainSizes();
        let constants;
        try { constants = typeof files.getConstants === "function" ? files.getConstants() : files; }
        catch (_) { constants = {}; }
        const directory = constants && constants.DocumentsDirPath;
        if (typeof directory !== "string") { status.storage = "unavailable (session only)"; notify(); return; }
        const path = directory.replace(/\/$/, "") + "/" + PREFS;
        Promise.resolve().then(() => files.fileExists(path)).then(exists =>
            exists ? files.readFile(path, "utf8") : null
        ).then(text => {
            if (text) {
                const loaded = JSON.parse(text);
                if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) throw new Error("Invalid preferences");
                for (const key of Object.keys(settings))
                    if (!dirty.has(key) && typeof loaded[key] === typeof settings[key] && (key !== "readAllMode" || READ_ALL_MODES.includes(loaded[key])) &&
                        (key !== "gestureOwn" || GESTURE_OWN_MODES.includes(loaded[key])) &&
                        (key !== "translateTarget" || TRANSLATE_TARGETS.includes(loaded[key])) &&
                        (key !== "translateMode" || TRANSLATE_MODES.includes(loaded[key])) &&
                        (key !== "messageHighlightThickness" || HIGHLIGHT_THICKNESSES.includes(loaded[key])) &&
                        (key !== "messageHighlightPingColor" && key !== "messageHighlightDeletedColor" || isHighlightColor(loaded[key])) &&
                        (key !== "language" || isLanguage(loaded[key])))
                        settings[key] = key === "noDeleteLimit" ? deleteLimit(loaded[key]) :
                            key === "messageHighlightPingColor" || key === "messageHighlightDeletedColor" ? normalizeHighlightColor(loaded[key]) : loaded[key];
                const auth = loaded.reviewAuth;
                // Restore a saved ReviewDB sign-in (a ReviewDB token, never the Discord token).
                if (features.reviewDB && !reviewToken && auth && typeof auth.token === "string" && auth.token.length <= 8192 &&
                    typeof auth.account === "string" && /^\d{17,20}$/.test(auth.account)) { reviewToken = auth.token; reviewAccount = auth.account; }
                if (features.userNotif && !userNotif.dirty && Array.isArray(loaded.userNotifIds)) {
                    userNotif.ids.clear();
                    loaded.userNotifIds.slice(0, USER_NOTIF_MAX_IDS).forEach(id => { if (typeof id === "string" && /^\d{17,20}$/.test(id)) userNotif.ids.add(id); });
                }
            }
            status.storage = "ready";
            fontInUse = settings.systemFont;
            emojiInUse = settings.systemEmoji;
            if (!enabled("picker")) clearSizes();
            // Persist edits made while the asynchronous restore was in flight.
            if (dirty.size || features.userNotif && userNotif.dirty) save();
            restoreDeleted();
            if (features.quests) { if (!enabled("quests")) questsStop(); else questsLoaded(); }
            if (features.userNotif) {
                userNotifSync();
                if (enabled("userNotif") && settings.userNotifPush) userNotifCheckPermissions();
            }
            if (features.accountSwitcher) accountSwitcherSync();
            if (features.customThemes && enabled("customThemes")) customThemesRestore();
            if (features.quests || features.userNotif) backgroundSync();
            // Saved translations are read as soon as Discord starts, so the first chat you open already has them.
            if (enabled("translate")) translateRestore();
            i18n.shownIn = uiLanguage(); loadLanguage(i18n.shownIn);
            notify("*");
        }).catch(() => {
            // The native side reads the same file at launch and falls back to Discord's font and emojis when it
            // can't. Assuming the phone's emojis here drew React Native emojis one way and chat the other.
            status.storage = "read failed (defaults)"; fontInUse = false; emojiInUse = false;
            if (dirty.size) save(); notify("*");
        });
    }

    function formatSize(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return "";
        if (bytes === 0) return "0 B";
        // Binary units, labelled the way Android and Discord show them. Promote a value that
        // would round to "1024 KB" (log rounding just below a boundary) to "1 MB".
        const units = ["B", "KB", "MB", "GB", "TB"];
        let unit = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
        let value = Number((bytes / Math.pow(1024, unit)).toFixed(unit ? 2 : 0));
        if (value >= 1024 && unit < units.length - 1) { unit++; value = Number((bytes / Math.pow(1024, unit)).toFixed(2)); }
        return value + " " + units[unit];
    }
    // Hermes's native eval configuration can lower loop-local const/let to var.
    // Give asynchronous callbacks an invocation scope, not a loop capture.
    function readSize(entry) {
        activeReads++;
        Promise.resolve().then(() => files.getSize(entry.uri)).then(value => {
            const bytes = typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
            entry.value = Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
        }, () => { entry.value = null; }).then(() => {
            entry.expires = Date.now() + (entry.value === null ? 30000 : 300000);
            entry.done = true;
            entry.resolve(entry.value);
            activeReads--;
            drainSizes();
        });
    }
    function clearSizes() {
        sizeCache.clear();
        sizeQueue.splice(0).forEach(entry => entry.resolve(null));
    }
    function drainSizes() {
        if (!files || !enabled("picker")) return;
        while (activeReads < 4 && sizeQueue.length) readSize(sizeQueue.shift());
    }
    function getSize(uri) {
        if (!enabled("picker") || typeof uri !== "string" || !/^(content|file):\/\//.test(uri))
            return Promise.resolve(null);
        const existing = sizeCache.get(uri);
        if (existing && (!existing.done || existing.expires > Date.now())) {
            if (existing.done) { sizeCache.delete(uri); sizeCache.set(uri, existing); }
            return existing.promise;
        }
        if (existing) sizeCache.delete(uri);
        if (sizeCache.size >= 256) {
            let removable;
            for (const [key, cached] of sizeCache) if (cached.done) { removable = key; break; }
            if (removable === undefined) return Promise.resolve(null);
            sizeCache.delete(removable);
        }
        const entry = { uri, done: false };
        entry.promise = new Promise(resolve => { entry.resolve = resolve; });
        sizeCache.set(uri, entry);
        sizeQueue.push(entry);
        drainSizes();
        return entry.promise;
    }
    function el() { return React.createElement.apply(React,arguments); }
    function useSettings(key) {
        const [, update] = React.useState(0);
        React.useEffect(() => {
            const entry = {key, fn: () => update(n => n + 1)};
            listeners.add(entry);
            return () => listeners.delete(entry);
        }, [key]);
    }
    // A size already read and still fresh, without starting a read.
    function knownSize(uri) {
        const entry = typeof uri === "string" && sizeCache.get(uri);
        return entry && entry.done && entry.expires > Date.now() ? entry.value : null;
    }
    // One style object for every badge, not two per photo tile per render.
    const BADGE_STYLE = { position: "absolute", top: 3, left: 3, borderRadius: 4, backgroundColor: "#17181ccc", paddingHorizontal: 4, paddingVertical: 2 };
    const BADGE_TEXT = { color: "white", fontSize: 10, fontWeight: "700", includeFontPadding: false };
    const PICKER_WRAP = { position: "relative" };
    function SizeBadge(props) {
        useSettings("picker");
        // The picker recycles tiles while scrolling: a size it already knows shows straight away, with no blank first frame.
        const [state, update] = React.useState(() => ({uri:props.uri, bytes:knownSize(props.uri)}));
        const bytes = state && state.uri === props.uri ? state.bytes : knownSize(props.uri);
        React.useEffect(() => {
            let live = true;
            const uri = props.uri;
            if (enabled("picker")) getSize(uri).then(value => { if (live) update(old => old && old.uri === uri && old.bytes === value ? old : {uri, bytes:value}); });
            return () => { live = false; };
        }, [props.uri, settings.picker]);
        if (!enabled("picker") || bytes === null || !RN) return null;
        return el(RN.View, { pointerEvents: "none", style: BADGE_STYLE }, el(RN.Text, { style: BADGE_TEXT }, formatSize(bytes)));
    }
    function pickerProps(props) {
        if (!enabled("picker") || !React || !RN || !props) return props;
        const first = Array.isArray(props.children) ? props.children[0] : props.children;
        const uri = first && first.props && first.props.localImageSource && first.props.localImageSource.uri;
        if (typeof uri !== "string") return props;
        return Object.assign({}, props, { children: el(RN.View, {
            style: PICKER_WRAP, pointerEvents: "box-none"
        }, props.children, el(SizeBadge, { uri })) });
    }
    function pickerComponent(component) {
        if (!component || wrapped.has(component)) return wrapped.get(component) || component;
        if (typeof component === "function" && (component.displayName || component.name) === "Pressable") {
            const orig = component;
            const result = function () {
                const args = Array.from(arguments);
                args[0] = pickerProps(args[0]);
                return orig.apply(this, args);
            };
            result.displayName = "Pressable";
            wrapped.set(component, result);
            status.picker = true;
            return result;
        }
        if (typeof component === "object") {
            for (const key of ["type", "render"]) {
                const orig = data(component, key);
                if (!orig) continue;
                const patched = pickerComponent(orig);
                if (patched !== orig) {
                    const result = cloneWith(component, key, patched);
                    wrapped.set(component, result);
                    return result;
                }
            }
        }
        return component;
    }

    function nativeVoice(action, id, uri) {
        if (!files) return Promise.reject(new Error("Discord file bridge has not loaded"));
        return files.getSize("venus-voice-v1:" + JSON.stringify({ action, id, uri }));
    }
    // Decoded byte count of a validated base64 string; Discord accepts at most 256 waveform levels.
    function waveformLength(text) { return text.length / 4 * 3 - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0); }
    const audioName = /\.(mp3|mp2|mpga|m4a|m4b|aac|wav|wave|flac|ogg|oga|opus|amr|awb|3ga|3gp|3gpp|aif|aiff|aifc|wma|ac3|eac3|caf|weba|alac)$/i;
    // Audio-only extensions: some providers label these voice notes video/mp4, video/3gpp or video/webm.
    const audioOnlyName = /\.(mp3|m4a|m4b|aac|wav|flac|oga|opus|amr|awb|3ga|weba|aif|aiff|aifc|caf)$/i;
    const AUDIO_APPLICATION_TYPES = new Set(["application/ogg","application/x-ogg","application/x-flac","application/x-wav","application/x-opus"]);
    function isAudio(upload) {
        if (!upload || upload.spoiler) return false;
        const item = upload.item || {};
        const mime = String(upload.mimeType || item.mimeType || "").toLowerCase().split(";")[0].trim();
        const name = String(upload.filename || item.filename || "");
        if (mime.startsWith("audio/") || AUDIO_APPLICATION_TYPES.has(mime)) return true;
        if (mime.startsWith("video/")) return audioOnlyName.test(name);
        if (mime && mime !== "application/octet-stream" && mime !== "binary/octet-stream") return false;
        return audioName.test(name);
    }
    function prepareUpload(orig, upload, args) {
        if (!enabled("voice") || !isAudio(upload)) return orig.apply(upload, args);
        const old = conversions.get(upload);
        if (old) return old.promise;
        const item = upload.item || {};
        const uri = item.uri || upload.uri;
        if (typeof uri !== "string" || !/^(content|file):\/\//.test(uri)) return orig.apply(upload, args);
        const job = { id: Date.now().toString(36) + "-" + (++jobCounter), cancelled: false };
        activeJobs.set(upload, job);
        const promise = Promise.resolve().then(() => {
            if (job.cancelled || !enabled("voice") || typeof upload.isCancelled === "function" && upload.isCancelled())
                throw new Error("Audio upload cancelled before conversion");
            return nativeVoice("prepare", job.id, uri);
        }).then(text => {
            const result = JSON.parse(text);
            if (!result || typeof result.uri !== "string" || !result.uri.startsWith("file://") ||
                result.mimeType !== "audio/ogg" || !Number.isFinite(result.durationSecs) || !(result.durationSecs > 0) || result.durationSecs > 1200 ||
                !Number.isSafeInteger(result.size) || !(result.size > 0) || typeof result.waveform !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.waveform) || !result.waveform || waveformLength(result.waveform) > 256)
                throw new Error("Native audio conversion returned invalid metadata");
            if (job.cancelled || !enabled("voice") || (typeof upload.isCancelled === "function" && upload.isCancelled())) {
                nativeVoice("release", job.id).catch(() => {});
                if (typeof upload.isCancelled === "function" && upload.isCancelled()) throw new Error("Audio upload cancelled");
                return orig.apply(upload, args);
            }
            // This async pre-upload boundary is awaited by CloudUpload.upload in the inspected build.
            // Both native upload paths consume item.uri; no Blob/base64 full-file buffering in JS.
            upload.item = Object.assign({}, item, result);
            upload.uri = result.uri;
            upload.mimeType = result.mimeType;
            upload.filename = result.filename;
            upload.currentSize = result.size;
            upload.postCompressionSize = result.size;
            if (upload.uploadAnalytics && typeof upload.uploadAnalytics === "object")
                upload.uploadAnalytics.convertedMimeType = result.mimeType;
            upload.durationSecs = result.durationSecs;
            upload.waveform = result.waveform;
            upload.reactNativeFilePrepped = true;
            readyUploads.set(upload, result);
            status.audioError = "";
            notify();
            return upload;
        }).catch(error => {
            if (typeof upload.isCancelled === "function" && upload.isCancelled()) throw error;
            // Unsupported codecs/devices remain ordinary orig attachments, never spoofed voice files.
            status.audioError = String(error && error.message || error);
            notify();
            if (!job.cancelled && RN && RN.Alert) RN.Alert.alert(tr("Couldn't make a voice message"),
                status.audioError + "\n\n" + tr("It will be sent as a normal file instead."));
            return orig.apply(upload, args);
        }).finally(() => { activeJobs.delete(upload); });
        job.promise = promise;
        conversions.set(upload, job);
        return promise;
    }
    function releaseJob(upload, cancelInflight) {
        const job = conversions.get(upload);
        if (!job) return;
        if (cancelInflight && !job.cancelled) {
            job.cancelled = true;
            nativeVoice("cancel", job.id).catch(() => {});
        }
        if (readyUploads.has(upload) && !job.released) {
            job.released = true;
            nativeVoice("release", job.id).catch(() => {});
        }
    }
    function instrumentCloudUpload(CloudUpload) {
        if (!features.voice || typeof CloudUpload !== "function" || !CloudUpload.prototype) return;
        const prototype = CloudUpload.prototype;
        const orig = prototype.reactNativeCompressAndExtractData;
        if (typeof orig !== "function" || wrapped.has(orig)) return;
        const patched = function () { return prepareUpload(orig, this, arguments); };
        prototype.reactNativeCompressAndExtractData = patched;
        wrapped.set(orig, patched);
        wrapped.set(patched, patched);
        // One function scope per method: Hermes's native eval can lower loop-local const to var (see readSize),
        // and then both wrappers called the last method, so cancelling an upload deleted it instead.
        function stopFirst(key, cancelInflight) {
            const method = prototype[key];
            if (typeof method !== "function") return;
            prototype[key] = function () {
                releaseJob(this, cancelInflight);
                return method.apply(this, arguments);
            };
        }
        stopFirst("_cancel", true); stopFirst("cancel", true); stopFirst("removeFromMsgDraft", true);
        stopFirst("delete", true); stopFirst("handleComplete", false); stopFirst("handleError", false);
        status.conversion = true;
    }
    function attachmentPayload(orig, self, args) {
        const result = orig.apply(self, args);
        const metadata = readyUploads.get(args[0]);
        if (!metadata || !result || typeof result !== "object") return result;
        if (!enabled("voice")) {
            if (!("duration_secs" in result) && !("waveform" in result)) return result;
            const clean = Object.assign({}, result);
            delete clean.duration_secs;
            delete clean.waveform;
            return clean;
        }
        const payload = Object.assign({}, result, { duration_secs: metadata.durationSecs, waveform: metadata.waveform });
        // These fields are real, but still belong only to custom voice conversion when the flag is off.
        const marker = { duration: true, waveform: true };
        markedPayloads.set(payload, marker);
        if (typeof payload.uploaded_filename === "string") {
            if (pendingVoice.size >= 128) pendingVoice.delete(pendingVoice.keys().next().value);
            pendingVoice.set(payload.uploaded_filename, marker);
        }
        return payload;
    }
    function postRequest(orig, self, args) {
        const request = args[0];
        // Fast path for all other API traffic; no fetch/XMLHttpRequest interception.
        if (!request || typeof request.url !== "string" ||
            !/^(?:\/channels\/\d+\/messages(?:\/announcement)?|\/users\/@me\/scheduled-messages)$/.test(request.url))
            return orig.apply(self, args);
        const body = request.body;
        if (!body || !Array.isArray(body.attachments) || ((Number(body.flags) || 0) & 8192))
            return orig.apply(self, args);
        const markers = body.attachments.map(attachment => attachment &&
            (markedPayloads.get(attachment) || pendingVoice.get(attachment.uploaded_filename)));
        if (!markers.some(Boolean)) return orig.apply(self, args);
        const eligible = enabled("voice") && body.attachments.length === 1 && markers[0] &&
            !body.content && !(body.sticker_ids && body.sticker_ids.length) &&
            !(body.embeds && body.embeds.length) && !(body.components && body.components.length) &&
            !body.poll && !body.activity && !body.shared_client_theme && !body.content_inventory_entry &&
            !(body.message_reference && body.message_reference.type === 1);
        const nextBody = Object.assign({}, body);
        if (eligible) nextBody.flags = ((Number(body.flags) || 0) | 8192) >>> 0;
        else nextBody.attachments = body.attachments.map((attachment, index) => {
            if (!markers[index]) return attachment;
            const clean = Object.assign({}, attachment);
            if (markers[index].duration) delete clean.duration_secs;
            if (markers[index].waveform) delete clean.waveform;
            return clean;
        });
        const nextArgs = Array.from(args);
        nextArgs[0] = Object.assign({}, request, { body: nextBody });
        return orig.apply(self, nextArgs);
    }

    // Native setting nodes use Discord's own themed rows, navigation and back stack.
    let SettingsList;
    const featureFor = key => key === "reviewWarning" ? "reviewDB" : key === "emojis" || key === "stickers" || key === "hyperlinks" ? "freeNitro" : key === "noDeleteSave" || key === "noDeleteLimit" || key === "noDeleteEdits" ? "noDelete" : /^pi[A-Z]/.test(key) ? "platformIndicators" : key === "pastelAll" || key === "pastelContent" ? "pastelize" : key === "readAllMode" ? "readAll" : /^quests[A-Z]/.test(key) ? "quests" : /^gesture[A-Z]/.test(key) ? "gestures" : /^translate[A-Z]/.test(key) ? "translate" : /^userNotif[A-Z]/.test(key) ? "userNotif" : /^accountSwitcher[A-Z]/.test(key) ? "accountSwitcher" : /^hiddenChannels[A-Z]/.test(key) ? "hiddenChannels" : /^customThemes[A-Z]/.test(key) ? "customThemes" : /^messageHighlight[A-Z]/.test(key) ? "messageHighlight" : key;
    // Section titles are read whenever Discord draws the list, so they follow the language too. "Venus" is a name.
    function section(label, keys) {
        const entry = { settings: keys };
        Object.defineProperty(entry, "label", { enumerable: true, configurable: true, get: () => label === "Venus" ? label : tr(label) });
        return entry;
    }
    // Rows Discord draws from a hook (useTitle, useDescription) redraw when the language changes. Called outside
    // a render (search, tests) the hook throws before registering anything, so it's simply skipped there.
    function useLanguage() { try { if (React) useSettings("language"); } catch (_) {} }
    // Plain-language status for General -> About; the raw values stay in status for diagnostics.
    function aboutText() {
        const storage = status.storage;
        const lines = [tr(storage === "ready" || storage === "saved" ? "Your settings are saved on this phone." :
            storage === "waiting" || storage === "loading" ? "Loading your settings..." :
            /^read failed/.test(storage) ? "Your saved settings couldn't be read, so the defaults are in use." :
            "Your settings can't be saved right now. Changes last until Discord restarts.")];
        const archive = {"saved locally":"Kept deleted messages are saved on this phone.", "save failed":"Kept deleted messages couldn't be saved.",
            "restore failed":"Saved deleted messages couldn't be loaded."}[status.archive];
        if (archive) lines.push(tr(archive));
        if (status.audioError) lines.push(tr("Last problem: {problem}", {problem:status.audioError}));
        return lines.join("\n");
    }
    // Discord's own icon for each feature row, from its design system. Resolved when a row first draws, never
    // while Discord builds its settings, and the Account icon stands in if one ever goes missing.
    const FEATURE_ICONS = {noDelete:[4791, "TrashIcon"], translate:[14958, "LanguageIcon"], gestures:[8216, "ReactionIcon"],
        quickDelete:[6026, "CircleXIcon"], jumpToTop:[10827, "ArrowLargeUpIcon"], favouriteAnything:[9716, "StarIcon"],
        freeNitro:[8119, "NitroWheelIcon"], voice:[12236, "WaveformIcon"], splitMessages:[7340, "PaperIcon"], noTyping:[10813, "KeyboardIcon"],
        picker:[10140, "AttachmentIcon"], pastelize:[14795, "PaintPaletteIcon"], platformIndicators:[14470, "LaptopPhoneIcon"],
        validUser:[5405, "AtIcon"], copyBios:[4780, "CopyIcon"], reviewDB:[7358, "ThumbsUpIcon"], readAll:[15161, "DoubleCheckmarkIcon"],
        hiddenChannels:[5410, "LockIcon"], dashless:[15125, "HashmarkIcon"], systemFont:[15207, "LettersIcon"], systemEmoji:[8719, "ChatSmileIcon"],
        hideGift:[10528, "GiftIcon"], hideCall:[7309, "PhoneCallIcon"], youBarSettings:[6799, "SettingsIcon"], quests:[14519, "QuestsIcon"],
        hideQuestDock:[6384, "EyeSlashIcon"], userNotif:[9044, "BellIcon"], accountSwitcher:[5404, "GroupIcon"], appIcons:[5375, "AppsIcon"],
        customThemes:[14887, "EyeDropperIcon"], messageHighlight:[16122, "PaintbrushThinIcon"]};
    const venusIcons = new Map();
    function venusIcon(id, name, fallback) {
        const slot = id + ":" + name;
        if (venusIcons.has(slot)) return venusIcons.get(slot);
        let found;
        function VenusIcon(props) {
            const Icon = found || (found = inspectedExport(id, name)) || fallback;
            return Icon ? el(Icon, props) : null;
        }
        venusIcons.set(slot, VenusIcon);
        return VenusIcon;
    }
    const REPO = "https://github.com/VenusIsJaded/Venus-Patches";
    function openLink(url) {
        try { if (RN && RN.Linking && typeof RN.Linking.openURL === "function") RN.Linking.openURL(url).catch(() => {}); } catch (_) {}
    }
    // "5 of 26 features on": main switches only, and only the features that were patched in.
    function featureSummary() {
        const keys = Object.keys(FEATURE_ICONS).filter(key => features[key]);
        const on = keys.filter(key => settings[key]).length;
        return keys.length ? tr("{on} of {total} features on. Turn them on or off in Features.", {on, total:keys.length}) : tr("No features were patched in.");
    }
    function settingsPage(sections) {
        const node = { type: "list", sections };
        return function VenusSettingsPage() {
            const List = SettingsList || (SettingsList = inspectedExport(14236, "SettingsList"));
            return React && List ? el(List, { node }) : null;
        };
    }
    function settingNode(key, title, description, parent) {
        const node = { type: "toggle", parent, useTitle: () => { useLanguage(); return tr(title); },
            useValue: function () { useSettings(key); return settings[key]; },
            onValueChange: value => setSetting(key, value) };
        // No description, no empty second line under the title.
        if (description) node.useDescription = () => tr(description);
        return node;
    }
    // Force system font applies from the next start: React Native measures text once but re-reads the
    // font on every draw, so switching mid-session would draw the new font in space sized for the old one.
    // Force system emojis is the same: Discord's native chat draws each emoji once and keeps it.
    // Each one reopens Discord through its own native method, so no method carries two Venus guards.
    function askRestart(kind) {
        const font = kind === "font";
        if (!features[font ? "systemFont" : "systemEmoji"] || !RN || !RN.Alert) return;
        const on = settings[font ? "systemFont" : "systemEmoji"];
        RN.Alert.alert(tr(font ? (on ? "Use your phone's font" : "Use Discord's font") : (on ? "Use your phone's emojis" : "Use Discord's emojis")),
            tr(font ? "Discord needs to reopen to change the font everywhere." : "Discord needs to reopen to change the emojis everywhere."), [
            {text:tr("Later"), style:"cancel"},
            {text:tr("Reopen now"), onPress:() => {
                // Write the setting first, so the reopened Discord starts with it. If it can't be saved, Discord used to
                // reopen anyway with the old setting; now it stays open and says so.
                if (!files) return;
                Promise.resolve().then(() => files.writeFile("documents", PREFS, settingsSnapshot(), "utf8")).then(
                    () => Promise.resolve(font ? files.fileExists("venus-font-v1:restart") : files.getVideoDimensions("venus-emoji-v1:restart")).catch(() => {}),
                    () => { status.storage = "save failed (session only)"; notify();
                        try { RN.Alert.alert(tr("Couldn't save the setting"), tr("Discord didn't reopen, so nothing changed. Try again in a moment.")); } catch (_) {} });
            }}]);
    }
    // A main-list row with its own switch and a separate button that opens more options.
    // Discord's pressable rows render an element from useTrailing; tapping the row also opens the page.
    let rowStyles = null;
    function subpageStyles() {
        if (rowStyles) return rowStyles;
        const ui = reviewUI(), c = ui.colors;
        let hook = null;
        if (typeof ui.createStyles === "function" && c) try {
            hook = ui.createStyles({divider:{width:1, height:24, marginHorizontal:12, backgroundColor:c.BORDER_SUBTLE},
                button:{width:36, height:36, borderRadius:18, alignItems:"center", justifyContent:"center", backgroundColor:c.BACKGROUND_MOD_SUBTLE}});
        } catch (_) { hook = null; }
        rowStyles = hook || (() => ({divider:{width:1, height:24, marginHorizontal:12, backgroundColor:"#ffffff1f"},
            button:{width:36, height:36, borderRadius:18, alignItems:"center", justifyContent:"center", backgroundColor:"#ffffff14"}}));
        return rowStyles;
    }
    let stackNavigation, trailingSwitch, trailingChevron;
    function SubpageTrailing(props) {
        useSettings(props.setting);
        // Discord's own themed colors; the icon takes its themed default color itself.
        let styles; try { styles = subpageStyles()(); } catch (_) { styles = null; }
        styles = styles || {divider:{}, button:{}};
        // Kept once found; a missing one is looked up again next render, in case its module loads later.
        const FormSwitch = trailingSwitch || (trailingSwitch = inspectedExport(6622, "FormSwitch"));
        const Chevron = trailingChevron || (trailingChevron = inspectedExport(6631, "ChevronSmallRightIcon"));
        const Press = RN.Pressable || RN.TouchableOpacity || RN.View;
        const on = !!settings[props.setting];
        return el(RN.View, {style:{flexDirection:"row", alignItems:"center"}},
            FormSwitch ? el(FormSwitch, {value:on, accessibilityLabel:props.label, onValueChange:value => setSetting(props.setting, value)}) : null,
            el(RN.View, {style:styles.divider}),
            el(Press, {style:styles.button, onPress:props.open, accessibilityRole:"button", accessibilityLabel:tr("More options"),
                hitSlop:{top:6, bottom:6, left:6, right:6}},
                Chevron ? el(Chevron, {size:"sm"}) : el(RN.Text, {style:{fontSize:18, color:"#b5bac1"}}, "\u203A")));
    }
    function nativeRegistry(registry) {
        if (!registry || !registry.ACCOUNT || registry.VENUS_GENERAL) return registry;
        const next = Object.assign({}, registry);
        const icon = registry.ACCOUNT.IconComponent;
        function route(key, title, sections, parent, IconComponent) {
            const page = settingsPage(sections);
            next[key] = { type: "route", parent, useTitle: () => { useLanguage(); return tr(title); }, IconComponent: IconComponent || icon,
                screen: { route: key, getComponent: () => page } };
        }
        // About: the version and how many features are on, whether settings are saved, and where to get help.
        next.VENUS_VERSION = { type: "static", parent: "VENUS_GENERAL", IconComponent: venusIcon(8324, "TagIcon", icon),
            useTitle: () => "Venus Patches " + revision, useDescription: function () { useSettings(); return featureSummary(); } };
        next.VENUS_STATUS = { type: "static", parent: "VENUS_GENERAL", IconComponent: venusIcon(4788, "CircleInformationIcon", icon),
            useTitle: () => { useLanguage(); return tr("Status"); }, useDescription: function () { useSettings(); return aboutText(); } };
        const links = [];
        function link(id, title, hint, url, iconId, iconName) {
            links.push(id);
            next[id] = { type: "pressable", parent: "VENUS_GENERAL", unsearchable: true, withArrow: true, useTitle: () => { useLanguage(); return tr(title); },
                useDescription: () => tr(hint), onPress: () => openLink(url), IconComponent: venusIcon(iconId, iconName, icon) };
        }
        link("VENUS_LINK_CHANGES", "What's new", "Changes in each release.", REPO + "/blob/main/CHANGELOG.md", 16292, "SparklesIcon");
        link("VENUS_LINK_ISSUES", "Report a problem", "Opens a new issue on GitHub.", REPO + "/issues/new/choose", 15329, "BugIcon");
        link("VENUS_LINK_SOURCE", "Source code", "Venus Patches on GitHub. Free and open source (GPL-3.0).", REPO, 8041, "LinkExternalSmallIcon");
        route("VENUS_GENERAL", "About", [section("Venus Patches", ["VENUS_VERSION", "VENUS_STATUS"]), section("Links", links)], undefined,
            venusIcon(4788, "CircleInformationIcon", icon));
        // The nodes above stay for Discord's settings search; the page itself is the designed About page.
        next.VENUS_GENERAL.screen.getComponent = () => AboutSettings;
        // The features list: each row says what it does, grouped by where you'll notice it.
        const P = "VENUS_PLUGINS";
        const groups = {messages:[], sending:[], people:[], servers:[], appearance:[], quests:[]};
        const iconFor = key => { const found = FEATURE_ICONS[key]; return found ? venusIcon(found[0], found[1], icon) : icon; };
        featureGroups = groups.keys = {messages:[], sending:[], people:[], servers:[], appearance:[], quests:[]};
        function toggle(group, key, title, hint) {
            if (!features[key]) return;
            groups.keys[group].push(key);
            const id = "VENUS_" + key.toUpperCase(); groups[group].push(id);
            next[id] = settingNode(key, title, hint, P);
            next[id].IconComponent = iconFor(key);
        }
        // A switch plus a button to its own page. Tapping the row opens the page too; the page keeps
        // a short title in Discord's header, read from its route node like any Discord settings page.
        const navigators = new Map();
        function withOptions(group, key, id, title, hint, pageTitle, page) {
            if (!features[key]) return;
            groups.keys[group].push(key);
            // Option pages are built only for patched settings, so unpatched ones leave no nodes behind.
            if (typeof page === "function" && !page.prototype) page = page();
            if (page && page.sections && page.page) { route(id, pageTitle, page.sections, P, iconFor(key)); const Page = page.page; next[id].screen.getComponent = () => Page; }
            else if (Array.isArray(page)) route(id, pageTitle, page, P, iconFor(key));
            else { route(id, pageTitle, [], P, iconFor(key)); next[id].screen.getComponent = () => page; }
            const screen = next[id].screen, rowId = id + "_ROW";
            const open = () => {
                const navigation = navigators.get(rowId);
                if (!navigation) return;
                try { global.__r(14239).onRouteSettingOnPress({navigation, screen}); }
                catch (_) { try { navigation.navigate(screen.route); } catch (__) {} }
            };
            groups[group].push(rowId);
            next[rowId] = { type: "pressable", parent: P, unsearchable: true, useTitle: () => { useLanguage(); return tr(title); }, onPress: open, IconComponent: iconFor(key),
                useTrailing: function () {
                    // Called as a hook by Discord's row, so it can read the settings stack it's in.
                    // Resolved once, so the row always calls the same number of hooks.
                    if (stackNavigation === undefined) stackNavigation = inspectedExport(1491, "useStackNavigation") || null;
                    navigators.set(rowId, stackNavigation ? stackNavigation() : null);
                    return el(SubpageTrailing, {setting:key, label:tr(title), open});
                } };
            if (hint) next[rowId].useDescription = () => tr(hint);
        }
        // Option IDs are the ones earlier releases used, so nothing that points at them moves.
        const OPTION_IDS = {emojis:"VENUS_EMOJIS", stickers:"VENUS_STICKERS", hyperlinks:"VENUS_HYPERLINKS", pastelAll:"VENUS_PASTELALL", pastelContent:"VENUS_PASTELCONTENT", piDmHeader:"VENUS_PI_DM", piUserList:"VENUS_PI_LIST", piProfile:"VENUS_PI_PROFILE", piHideMobile:"VENUS_PI_MOBILE"};
        const option = (key, title, hint, parent) => {
            const id = OPTION_IDS[key], owner = featureFor(key), node = settingNode(key, title, hint, parent);
            // Greyed out while the main switch on the features list is off.
            node.useIsDisabled = function () { useSettings(owner); return !settings[owner]; };
            next[id] = node; return id;
        };
        // Messages
        withOptions("messages", "noDelete", "VENUS_NODELETE", "Keep deleted messages", "Deleted messages stay in chat, outlined in red. Also shows what edited messages said before.", "Deleted messages", NoDeleteSettings);
        withOptions("messages", "messageHighlight", "VENUS_MESSAGEHIGHLIGHT", "Message highlights", "Change the left bar thickness and highlight colors for replies, mentions and deleted messages.", "Message highlights", MessageHighlightSettings);
        withOptions("messages", "translate", "VENUS_TRANSLATE", "Translate messages", "Messages in other languages show in yours. Their text is sent to Google Translate.", "Translate messages", TranslateSettings);
        withOptions("messages", "gestures", "VENUS_GESTURES", "Double-tap to reply", "Double-tap a message to reply, or your own to edit it, instead of reacting.", "Tap gestures", GestureSettings);
        toggle("messages", "quickDelete", "Skip delete confirmation", "Messages and link previews are removed right away, with no \"Are you sure?\". It can't be undone.");
        toggle("messages", "jumpToTop", "Jump to first message", "A button to go straight to the start of a chat, channel or thread.");
        toggle("messages", "favouriteAnything", "Favourite any image or video", "Star any image or video in the media viewer to keep it in your GIF favourites.");
        // Sending
        withOptions("sending", "freeNitro", "VENUS_FREENITRO", "Send Nitro stickers and emojis as links", "Stickers and emojis you'd need Nitro for are sent as a link, which shows up in chat as the sticker or emoji image.", "Nitro stickers and emojis",
            () => ({page:FreeNitroSettings, sections:[section("Send as links", [option("emojis", "Emojis", "Emojis from other servers, and animated emojis.", "VENUS_FREENITRO"),
                option("stickers", "Stickers", "Stickers from other servers. Animated ones may not move.", "VENUS_FREENITRO")]),
             section("Link style", [option("hyperlinks", "Short links", "In chat it looks the same either way. Short links only change what's copied or quoted.", "VENUS_FREENITRO")])]}));
        toggle("sending", "voice", "Send audio as voice messages", "An audio file sent on its own becomes a real voice message, with a waveform. Needs Android 10 or newer.");
        toggle("sending", "splitMessages", "Send long messages", "Type past the character limit. Long messages are sent in parts, split between lines or words.");
        toggle("sending", "noTyping", "Hide typing indicator", "Others won't see when you're typing. You still see when they are.");
        toggle("sending", "picker", "Show file sizes when attaching", "Each photo and video in the attachment picker shows its size.");
        // People
        withOptions("people", "pastelize", "VENUS_PASTELIZE", "Pastel name colors", "Names without a role color get a soft pastel color, always the same for each person.", "Pastel names",
            () => ({page:PastelSettings, sections:[section("Colors", [option("pastelAll", "Replace role colors", "Every name uses its pastel color, even with a role color.", "VENUS_PASTELIZE"),
                option("pastelContent", "Color message text", "What people write is colored too, in a lighter shade of their name.", "VENUS_PASTELIZE")])]}));
        withOptions("people", "platformIndicators", "VENUS_PLATFORMINDICATORS", "Show device indicators", "Desktop, mobile, web, console or VR icons next to names, colored by status.", "Device indicators",
            () => ({page:PlatformSettings, sections:[section("Show icons", [option("piDmHeader", "In DMs", "Next to the name at the top of a DM.", "VENUS_PLATFORMINDICATORS"),
                option("piUserList", "In lists", "Member list, friends, DM list and voice channels.", "VENUS_PLATFORMINDICATORS"),
                option("piProfile", "On profiles", "Next to the name on a profile.", "VENUS_PLATFORMINDICATORS")]),
             section("Avatars", [option("piHideMobile", "Hide the phone badge", "Avatars show a plain status dot, since the icons already show mobile.", "VENUS_PLATFORMINDICATORS")])]}));
        toggle("people", "validUser", "Fix unknown mentions", "@unknown-user mentions are looked up and show the person's name.");
        toggle("people", "copyBios", "Copy profile bios", "Hold a bio to select and copy its text. Links still work.");
        withOptions("people", "reviewDB", "VENUS_REVIEWDB", "User and server reviews", "Read and write reviews on profiles and servers, from the community ReviewDB service.", "Reviews", ReviewSettings);
        withOptions("people", "userNotif", "VENUS_USERNOTIF", "User activity notifications", "Shows a notice when chosen friends or users change status, start typing or send a message.", "Activity notifications", UserNotifSettings);
        withOptions("people", "accountSwitcher", "VENUS_ACCOUNTSWITCHER", "Account switcher", "Switch between multiple Discord accounts from the You tab, your profile bar or Settings.", "Account switcher", AccountSwitcherSettings);
        // Servers
        withOptions("servers", "readAll", "VENUS_READALL", "Read all button", "A button under Direct Messages that marks everything as read. Hold it to choose what.", "Read all", ReadAllSettings);
        withOptions("servers", "hiddenChannels", "VENUS_HIDDENCHANNELS", "Show hidden channels", "Channels you can't open appear with a lock. Only their name and dates show, not messages.", "Hidden channels", HiddenChannelsSettings);
        toggle("servers", "dashless", "Spaces in channel names", "Shows \"general chat\" instead of \"general-chat\". Only changes how names look.");
        // Appearance
        toggle("appearance", "systemFont", "Use your phone's font", "Replaces Discord's font everywhere. Discord reopens to apply it. Needs Android 9 or newer.");
        toggle("appearance", "systemEmoji", "Use your phone's emojis", "In chat, reactions and the emoji picker. Discord reopens to apply it.");
        toggle("appearance", "hideGift", "Hide the gift button", "Removes the Nitro gift button from the message bar.");
        toggle("appearance", "hideCall", "Hide the call button", "Removes Call from people's profiles. Message fills the space.");
        toggle("appearance", "youBarSettings", "Venus button on profile bar", "A shortcut to Venus, next to the notifications bell.");
        toggle("appearance", "appIcons", "Unlock app icons", "Use any Discord app icon in Settings without Nitro.");
        withOptions("appearance", "customThemes", "VENUS_CUSTOMTHEMES", "Custom themes", "Install color themes from a link and switch between them. Works with Revenge and Vendetta themes.", "Custom themes", CustomThemesSettings);
        // Quests
        withOptions("quests", "quests", "VENUS_QUESTS", "Complete Quests automatically", "Finishes video, Play and Activity Quests in the background. You still claim the rewards.", "Quests", QuestSettings);
        toggle("quests", "hideQuestDock", "Hide the Quests banner", "Removes the Quest promotion above your profile bar. Quests still work.");
        const sections = [section("Messages", groups.messages), section("Sending", groups.sending), section("People", groups.people),
            section("Servers", groups.servers), section("Appearance", groups.appearance), section("Quests", groups.quests)].filter(entry => entry.settings.length);
        route(P, "Features", sections, undefined, venusIcon(14478, "PuzzlePieceIcon", icon));
        // "5 of 26 on", right on the entry, so you see at a glance what Venus is doing before opening it.
        next[P].useDescription = function () {
            useSettings();
            const keys = Object.keys(FEATURE_ICONS).filter(key => features[key]);
            return tr("{on} of {total} turned on", {on:keys.filter(key => settings[key]).length, total:keys.length});
        };
        // Language: the language Venus settings are shown in, Discord's own by default.
        route("VENUS_LANGUAGE", "Language", [], undefined, venusIcon(14958, "LanguageIcon", icon));
        next.VENUS_LANGUAGE.screen.getComponent = () => LanguageSettings;
        next.VENUS_LANGUAGE.useDescription = function () { useLanguage(); return languageLabel(settings.language); };
        status.menu = true;
        return next;
    }
    // Which patched features sit in which group of the Features list, for the About page.
    let featureGroups = null;
    const FEATURE_GROUPS = [["messages", "Messages", 5386, "ChatIcon"], ["sending", "Sending", 4778, "SendMessageIcon"], ["people", "People", 4532, "FriendsIcon"],
        ["servers", "Servers", 8584, "ServerIcon"], ["appearance", "Appearance", 14795, "PaintPaletteIcon"], ["quests", "Quests", 14519, "QuestsIcon"]];
    // Is Venus working? One word and a colored dot, the way Discord shows a status.
    function aboutHealth() {
        const storage = status.storage;
        if (storage === "ready" || storage === "saved") return status.archive === "save failed" || status.archive === "restore failed" || status.audioError ? "idle" : "online";
        if (storage === "waiting" || storage === "loading") return "idle";
        return "dnd";
    }
    const ABOUT_DARK = {hero:{backgroundColor:"#2b2d31", borderRadius:16, padding:20, alignItems:"center", gap:6},
        logo:{width:64, height:64, borderRadius:32, alignItems:"center", justifyContent:"center", backgroundColor:"#5865f2", marginBottom:6},
        chip:{flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:6, borderRadius:14, backgroundColor:"#4e50584d"},
        card:{backgroundColor:"#2b2d31", borderRadius:16, paddingHorizontal:16, paddingVertical:14, gap:10}};
    // About: who you're running, how much of it is on, whether it's healthy, and where to go next.
    function AboutSettings() {
        useSettings();
        const ui = reviewUI();
        if (!React || !RN) return null;
        const s = useThemed("about", c => ({hero:Object.assign({}, ABOUT_DARK.hero, {backgroundColor:c.CARD_BACKGROUND_DEFAULT}),
            logo:Object.assign({}, ABOUT_DARK.logo, {backgroundColor:c.BACKGROUND_BRAND || "#5865f2"}),
            chip:Object.assign({}, ABOUT_DARK.chip, {backgroundColor:c.BACKGROUND_MOD_SUBTLE}),
            card:Object.assign({}, ABOUT_DARK.card, {backgroundColor:c.CARD_BACKGROUND_DEFAULT})}), ABOUT_DARK);
        const Text = inspectedExport(4833, "Text"), Group = ui.TableRowGroup || RN.View, Row = ui.TableRow;
        const text = (value, variant, color, fallback) => Text ? el(Text, {variant, color}, value) : el(RN.Text, {style:fallback}, value);
        const keys = Object.keys(FEATURE_ICONS).filter(key => features[key]), on = keys.filter(key => settings[key]).length;
        const health = aboutHealth(), Sparkles = venusIcon(16292, "SparklesIcon");
        const chips = FEATURE_GROUPS.map(([group, label, id, name]) => {
            const list = featureGroups && featureGroups[group] || [];
            if (!list.length) return null;
            const count = list.filter(key => settings[key]).length;
            return el(RN.View, {key:group, style:[s.chip, {opacity:count ? 1 : 0.6}], accessible:true, accessibilityLabel:tr(label) + ": " + count + "/" + list.length},
                el(venusIcon(id, name), {size:"xs"}), text(tr(label) + " " + count + "/" + list.length, "text-xs/semibold", count ? "text-strong" : "text-muted", {color:"#dbdee1", fontSize:12}));
        });
        const linkRow = (key, label, sub, url, id, name) => Row ? el(Row, {key, label:tr(label), subLabel:tr(sub), icon:rowIcon(id, name), arrow:true, onPress:() => openLink(url)}) : null;
        const groups = [
            el(RN.View, {key:"hero", style:s.hero, accessible:true},
                popIn("logo", el(RN.View, {style:s.logo}, el(Sparkles, {size:"lg", color:"#ffffff"}))),
                text("Venus Patches " + revision, "heading-lg/bold", "text-strong", {color:"#f2f3f5", fontSize:20, fontWeight:"700"}),
                text(tr("For Discord {version}", {version:"348.10"}), "text-sm/medium", "text-muted", {color:"#949ba4", fontSize:14})),
            el(RN.View, {key:"features", style:s.card},
                text(keys.length ? tr("{on} of {total} turned on", {on, total:keys.length}) : tr("No features were patched in."), "text-md/semibold", "text-strong", {color:"#f2f3f5", fontSize:16, fontWeight:"600"}),
                keys.length ? el(VenusProgress, {key:"bar", value:on / keys.length}) : null,
                el(RN.View, {style:{flexDirection:"row", flexWrap:"wrap", gap:8, marginTop:4}}, chips)),
            el(RN.View, {key:"status", style:[s.card, {flexDirection:"row", alignItems:"center", gap:14}]},
                el(RN.View, {style:{width:12, height:12, borderRadius:6, backgroundColor:STATUS_HEX[health]}}),
                el(RN.View, {style:{flex:1, gap:2}},
                    text(tr(health === "online" ? "Everything's working" : health === "idle" ? (status.storage === "waiting" || status.storage === "loading" ? "Loading your settings" : "Working, see below") : "Something went wrong"),
                        "text-md/semibold", "text-strong", {color:"#f2f3f5", fontSize:16, fontWeight:"600"}),
                    text(aboutText(), "text-sm/medium", "text-muted", {color:"#949ba4", fontSize:14}))),
            el(Group, {key:"links", title:tr("Links")},
                linkRow("changes", "What's new", "Changes in each release.", REPO + "/blob/main/CHANGELOG.md", 16292, "SparklesIcon"),
                linkRow("issues", "Report a problem", "Opens a new issue on GitHub.", REPO + "/issues/new/choose", 15329, "BugIcon"),
                linkRow("source", "Source code", "Venus Patches on GitHub. Free and open source (GPL-3.0).", REPO, 8041, "LinkExternalSmallIcon")),
            footnote("note", "Nothing is tracked, and everything works offline except the features that say they use a service.")];
        return settingsBody(ui, groups);
    }
    function languageLabel(code) {
        if (code === "auto") { const shown = UI_LANGUAGES.find(entry => entry[0] === uiLanguage()); return tr("Same as Discord ({language})", {language:shown ? shown[1] : "English"}); }
        const found = UI_LANGUAGES.find(entry => entry[0] === code);
        return found ? found[1] : code;
    }
    // Each language is listed in its own words, with its English name under it, so you can find yours in any language.
    function LanguageSettings() {
        useSettings("language");
        const ui = reviewUI();
        if (!React || !RN) return null;
        const choices = [["auto", tr("Same as Discord"), tr("Follows Discord's Language setting.")]].concat(UI_LANGUAGES.map(([code, name, english]) => [code, name, english]));
        const groups = [
            radioGroup(ui, "language", "Show Venus settings in", "language", true, choices, true),
            footnote("note", i18n.loading.has(uiLanguage()) ? "Loading the language..." : "Only Venus's own settings and messages change. Discord's language is set in Discord's Language settings.")];
        return settingsBody(ui, groups);
    }
    function settingsSections(orig, self, args) {
        const config = args[0];
        if (!status.menu || !config || !Array.isArray(config.sections)) return orig.apply(self, args);
        const index = config.sections.findIndex(s => s && Array.isArray(s.settings) && s.settings.includes("ACCOUNT"));
        if (index < 0 || config.sections.some(s => s && s.label === "Venus")) return orig.apply(self, args);
        const sections = config.sections.slice();
        sections.splice(index + 1, 0, section("Venus", ["VENUS_PLUGINS", "VENUS_LANGUAGE", "VENUS_GENERAL"]));
        const next = Array.from(args); next[0] = Object.assign({}, config, { sections });
        return orig.apply(self, next);
    }

    function cloneTree(node, change, depth) {
        if (!node || typeof node !== "object" || depth > 24) return node;
        if (Array.isArray(node)) {
            let children = node;
            for (let i = 0; i < node.length; i++) {
                const child = cloneTree(node[i], change, depth + 1);
                if (child !== node[i]) {
                    if (children === node) children = node.slice();
                    children[i] = child;
                }
            }
            return children;
        }
        if (!node.props) return node;
        const children = cloneTree(node.props.children, change, depth + 1);
        let props = children !== node.props.children ? Object.assign({}, node.props, { children }) : node.props;
        props = change(node, props);
        return props === node.props ? node : React.cloneElement(node, props);
    }
    function copyBio(orig, self, args) {
        const result = orig.apply(self, args);
        if (!enabled("copyBios") || !React || !RN) return result;
        return cloneTree(result, function (node, props) {
            // Preserve clickable links and handlers, never mutate React's frozen elements.
            if (node !== result && node.type !== RN.Text && typeof props.children !== "string") return props;
            return props.selectable === true ? props : Object.assign({}, props, { selectable: true });
        }, 0);
    }
    // All guild channel types formatted as lowercase hyphenated slugs in computeChannelName (4990 fn 33438):
    // GUILD_TEXT (0), GUILD_ANNOUNCEMENT (5), GUILD_STORE (6), GUILD_DIRECTORY (14), GUILD_FORUM (15), GUILD_MEDIA (16), GUILD_APP (21).
    const DASHLESS_TYPES = new Set([0, 5, 6, 14, 15, 16, 21]);
    const FALSE_FN = () => false;
    function dashlessFormat(channel, name) {
        return enabled("dashless") && channel && DASHLESS_TYPES.has(channel.type) && typeof name === "string" && name.includes("-") ? name.replace(/-/g, " ") : name;
    }
    function channelLabel(orig, self, args) {
        const channel=args[0];
        let next=args;
        if (hiddenMetadata(channel)) {
            // Formatter-only facade avoids Discord's OBFUSCATED label branch while
            // preserving its escaping, category casing and the real model/flags.
            next=Array.from(args);
            next[0]=Object.create(channel, {
                name:{value:hiddenName(channel), writable:true, configurable:true, enumerable:true},
                isObfuscated:{value:FALSE_FN, writable:true, configurable:true, enumerable:false}
            });
        }
        return dashlessFormat(channel, orig.apply(self, next));
    }
    function useChannelLabel(orig, self, args) {
        if (React) {
            if (features.dashless) useSettings("dashless");
            if (features.hiddenChannels) useSettings("hiddenChannels");
        }
        return channelLabel(orig, self, args);
    }
    function mentionChannelInfo(orig, self, args) {
        const result = orig.apply(self, args);
        if (!result || typeof result.name !== "string") return result;
        const formatted = dashlessFormat(result, result.name);
        return formatted === result.name ? result : Object.assign({}, result, {name:formatted});
    }
    function parserStateChannels(orig, self, args) {
        const state = orig.apply(self, args);
        if (!enabled("dashless") || !state || !Array.isArray(state.channels) || !channelStore || typeof channelStore.getChannel !== "function") return state;
        let extras = null;
        for (let i = 0; i < state.channels.length; i++) {
            const entry = state.channels[i];
            if (!entry || typeof entry.text !== "string" || !entry.text.includes(" ")) continue;
            const ch = channelStore.getChannel(entry.id);
            if (ch && DASHLESS_TYPES.has(ch.type) && typeof ch.name === "string" && ch.name !== entry.text) {
                if (!extras) extras = state.channels.slice();
                extras.push({id:entry.id, text:ch.name});
            }
        }
        return extras ? Object.assign({}, state, {channels:extras}) : state;
    }
    const videoPattern = /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v|gifv)(?:[?#]|$)/i;
    const video = uri => typeof uri === "string" && videoPattern.test(uri);
    function thumbnail(uri) {
        if (typeof uri !== "string" || !/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net)\//i.test(uri)) return uri;
        let result = uri.replace(/^https:\/\/cdn\.discordapp\.com\//i, "https://media.discordapp.net/");
        const hash = result.indexOf("#"), suffix = hash < 0 ? "" : result.slice(hash);
        if (hash >= 0) result = result.slice(0, hash);
        result = /[?&]format=/.test(result) ? result.replace(/([?&])format=[^&]*/g, "$1format=jpeg") : result + (result.includes("?") ? "&" : "?") + "format=jpeg";
        return result + suffix;
    }
    function favouriteButton(orig, self, args) {
        const props = args[0], source = props && props.source;
        if (!enabled("favouriteAnything") || !source || source.isGIFV || typeof source.uri !== "string" || !/^https?:\/\//i.test(source.uri)) return orig.apply(self, args);
        const next = Array.from(args);
        next[0] = Object.assign({}, props, { source: Object.assign({}, source, { isGIFV: true,
            embedURI: source.embedURI || source.sourceURI || source.uri, videoURI: source.videoURI || source.uri,
            embedProviderName: source.embedProviderName || "" }) });
        return orig.apply(self, next);
    }
    function favouriteAdd(orig, self, args) {
        const item = args[0];
        if (!enabled("favouriteAnything") || !item || typeof item !== "object") return orig.apply(self, args);
        const isVideo = video(item.url) || video(item.gifSrc);
        const isImage = typeof item.url === "string" && /\.(png|jpe?g|gif|webp|avif|heic|heif)(?:[?#]|$)/i.test(item.url);
        // Preserve native formats for opaque provider URLs instead of misclassifying videos as images.
        if (!isVideo && !isImage) return orig.apply(self, args);
        const format = isVideo ? 2 : 1;
        if (item.format === format) return orig.apply(self, args);
        const next = Array.from(args); next[0] = Object.assign({}, item, { format });
        return orig.apply(self, next);
    }
    const favouriteViews = new WeakMap();
    function favouriteList(orig, self, args) {
        const result = orig.apply(self, args);
        if (!enabled("favouriteAnything") || !result || !Array.isArray(result.favorites)) return result;
        let favorites = favouriteViews.get(result.favorites);
        if (!favorites) {
            let changed = false;
            favorites = result.favorites.map(item => {
                if (!item || !video(item.url) && !video(item.gifSrc)) return item;
                const src = thumbnail(item.src || item.url);
                if (src === item.src) return item;
                changed = true; return Object.assign({}, item, { src });
            });
            if (!changed) favorites = result.favorites;
            favouriteViews.set(result.favorites, favorites);
        }
        if (favorites === result.favorites) return result;
        const category = result.favoritesCategory && favorites[0] ? Object.assign({}, result.favoritesCategory, { src: favorites[0].src }) : result.favoritesCategory;
        return Object.assign({}, result, { favorites, favoritesCategory: category });
    }

    let userStore, channelStore, emojiStore, stickerStore, stickerRules, emojiCatalog;
    const premiumOriginal = {};
    function currentUser() { return userStore && userStore.getCurrentUser(); }
    let nativeCapabilities = 0;
    function capability(key, user) {
        // The orig capability delegates to canUserUse. Conversion must see real
        // eligibility, not the picker override, or a non-Nitro send stays an invalid token.
        nativeCapabilities++;
        try { return typeof premiumOriginal[key] === "function" && premiumOriginal[key](user); }
        finally { nativeCapabilities--; }
    }
    function catalogEligibility(orig, self, args) {
        const user = currentUser(), feature = args[0];
        if (!nativeCapabilities && user && args[1] && args[1].id === user.id && emojiCatalog) {
            if (enabled("emojis") && (feature === emojiCatalog.EMOJIS_EVERYWHERE || feature === emojiCatalog.ANIMATED_EMOJIS)) return true;
            if (enabled("appIcons") && feature === emojiCatalog.APP_ICONS) return true;
        }
        return orig.apply(self, args);
    }
    function premiumOverride(key, setting) {
        return function (orig, self, args) {
            const user = currentUser();
            return enabled(setting) && user && args[0] && args[0].id === user.id ? true : orig.apply(self, args);
        };
    }
    function shareLink(name, uri) {
        // Escape Markdown without permitting forged mentions or link syntax in sticker names.
        // ~ | # too: a sticker called ||surprise|| or ~~old~~ turned the link text into a spoiler or strikethrough.
        return settings.hyperlinks && name ? "[" + String(name).replace(/([\\\[\]()*_`<>@~|#])/g, "\\$1").replace(/[\r\n]/g, " ") + "](" + uri + ")" : uri;
    }
    function emojiMessage(message, channelId) {
        if (!enabled("emojis") || !message || typeof message.content !== "string" || !message.content.includes("<") || !emojiStore || !channelStore) return message;
        const user = currentUser(), channel = channelStore.getChannel(channelId);
        if (!user || !channel) return message;
        const everywhere = capability("canUseEmojisEverywhere", user), animated = capability("canUseAnimatedEmojis", user);
        const converted = new Set();
        // Do not rewrite code blocks, inline code, escaped tokens or Markdown link targets.
        const content = message.content.replace(/```[\s\S]*?(?:```|$)|``[^\n]*?(?:``|$)|`[^`\n]*(?:`|$)|\\[\s\S]|\]\([^\n)]*\)|<(a?):([\w]+):(\d+)>/g, function (match, animation, name, id) {
            if (!id) return match;
            const emoji = emojiStore.getCustomEmojiById(id);
            if (!emoji || emoji.available === false || !emoji.guildId) return match;
            if ((everywhere || emoji.guildId === channel.guild_id) && (!(animation || emoji.animated) || animated)) return match;
            converted.add(id);
            const uri = "https://cdn.discordapp.com/emojis/" + id + (animation || emoji.animated ? ".gif" : ".webp") + "?size=48&quality=lossless";
            return shareLink(name, uri);
        });
        if (!converted.size || content.length > (user.premiumType === 2 ? 4000 : 2000)) return message;
        const next = Object.assign({}, message, { content });
        // Keep unrelated invalid emoji diagnostics intact.
        for (const key of ["invalidEmojis", "validNonShortcutEmojis"]) if (Array.isArray(message[key]))
            next[key] = message[key].filter(item => !converted.has(typeof item === "string" ? item : item && item.id));
        return next;
    }
    function sendMessage(orig, self, args) {
        const message = emojiMessage(args[1], args[0]);
        if (message === args[1]) return orig.apply(self, args);
        const next = Array.from(args); next[1] = message;
        return orig.apply(self, next);
    }
    function stickerLink(sticker) {
        if (!sticker || sticker.available === false || !/^\d+$/.test(sticker.id)) return null;
        if (![1, 2, 4].includes(sticker.format_type)) return null; // No broken Lottie URLs or third-party conversion service.
        return shareLink(sticker.name, "https://media.discordapp.net/stickers/" + sticker.id + (sticker.format_type === 4 ? ".gif" : ".png") + "?size=160");
    }
    function nativeSticker(sticker, channel, user) {
        return sticker && sticker.available !== false &&
            (!sticker.guild_id || sticker.guild_id === channel.guild_id || capability("canUseCustomStickersEverywhere", user));
    }
    function sendStickers(orig, self, args) {
        if (!enabled("stickers") || !Array.isArray(args[1]) || !args[1].length || !stickerStore || !channelStore) return orig.apply(self, args);
        const user = currentUser(), channel = channelStore.getChannel(args[0]);
        if (!user || !channel) return orig.apply(self, args);
        const keep = [], links = [];
        for (const id of args[1]) {
            const sticker = stickerStore.getStickerById(id);
            if (!sticker) return orig.apply(self, args);
            if (nativeSticker(sticker, channel, user)) { keep.push(id); continue; }
            const link = stickerLink(sticker);
            // Fail closed as a whole: never drop an unknown/unsupported sticker from a mixed send.
            if (!link) return orig.apply(self, args);
            links.push(link);
        }
        if (!links.length) return orig.apply(self, args);
        const message = args[2], content = typeof message === "string" ? message : message && message.content || "";
        const combined = (content ? content + "\n" : "") + links.join("\n");
        if (combined.length > (user.premiumType === 2 ? 4000 : 2000)) return orig.apply(self, args);
        const next = Array.from(args); next[1] = keep;
        next[2] = emojiMessage(Object.assign({}, typeof message === "object" ? message : null, { content: combined }), args[0]);
        // Original sendStickers preserves replies, TTS, nonce, permissions and native stickers in one message.
        return orig.apply(self, next);
    }
    function sendability(orig, self, args) {
        const result = orig.apply(self, args), sticker = args[0];
        return enabled("stickers") && stickerRules && result === stickerRules.StickerSendability.SENDABLE_WITH_PREMIUM && stickerLink(sticker) ? stickerRules.StickerSendability.SENDABLE : result;
    }
    function sendableSticker(orig, self, args) {
        const result = orig.apply(self, args);
        if (result || !enabled("stickers") || !stickerRules) return result;
        const code = stickerRules.getStickerSendability.apply(stickerRules, args);
        return code === stickerRules.StickerSendability.SENDABLE;
    }
    let msgStore, msgActions, permissions, viewPermission, locale, dispatcher, messageRecords, chatHeight, jumpPill, jumpIcon;
    let permissionsCanOrig = null;
    let deletedRevision = 0, archiveRestored = false, archiveLoading = false, archiveWriting = false, archivePending;
    const deletedViews = new Map();
    const ARCHIVE = "venus-deleted-messages.json";
    const deleted = new Map(), deletedByChannel = new Map();
    // Edit history: "channel:id" -> {channelId, id, versions:[{content, at}]}, oldest version first.
    const edits = new Map();
    const MAX_EDITED = 2000, MAX_VERSIONS = 10, MAX_VERSION_TEXT = 4000;
    let archiveTimer;
    const hiddenViews = new Map(), hiddenNames = new Map(), hiddenScans = new Map();
    let hiddenAccount;
    const HIDDEN_CHANNEL = "Hidden channel (name unavailable)", HIDDEN_CATEGORY = "Hidden category (name unavailable)";
    function receivedName(channel) {
        if (!channel || typeof channel.name !== "string") return null;
        const trimmed = channel.name.trim();
        if (!trimmed) return null;
        // Server redactions: "hidden", "__hidden__", "_hidden" and underscore variants (HBC string 34016).
        // Strip surrounding underscores and compare case-insensitively so redacted stubs never pollute the cache.
        if (trimmed.replace(/^_+|_+$/g, "").toLowerCase() === "hidden") return null;
        // Never cache our own unavailable facades as if they were real names.
        if (trimmed === HIDDEN_CHANNEL || trimmed === HIDDEN_CATEGORY || trimmed === tr(HIDDEN_CHANNEL) || trimmed === tr(HIDDEN_CATEGORY)) return null;
        return channel.name;
    }
    // guildId: for gateway channel lists, whose entries don't carry their server. It used to copy every channel
    // of every server on READY just to add guild_id.
    function rememberChannelName(channel, accountId, knownName, guildId) {
        // Directory scans pass the account once; don't ask UserStore again for every channel.
        let owner = accountId;
        if (typeof owner !== "string") { const current = userStore && userStore.getCurrentUser(); owner = current && current.id; }
        if (hiddenAccount !== owner) {hiddenNames.clear();hiddenAccount = owner;}
        if (!channel) return;
        const guild = guildId || channel.guild_id;
        const name = knownName || receivedName(channel);
        if (!guild || !channel.id || !name) return;
        const known = hiddenNames.get(channel.id);
        // READY replays thousands of unchanged names: don't churn the cache for them.
        if (known && known.guild === guild && known.name === name) return;
        if (hiddenNames.size >= 4096 && !known) hiddenNames.delete(hiddenNames.keys().next().value);
        hiddenNames.set(channel.id,{guild,name});
    }
    function hiddenName(channel) {
        // Basic records can retain names absent from full/obfuscated records. Never
        // fetch an inaccessible channel, guess a name, or change its permissions/flags.
        const current = userStore && userStore.getCurrentUser();
        if (hiddenAccount !== (current && current.id)) {hiddenNames.clear();hiddenAccount = current && current.id;}
        const basic = channelStore && typeof channelStore.getBasicChannel === "function" && channelStore.getBasicChannel(channel.id);
        const full = channelStore && typeof channelStore.getChannel === "function" && channelStore.getChannel(channel.id);
        const name = receivedName(channel) || (basic && basic.guild_id === channel.guild_id && receivedName(basic)) ||
            (full && full.guild_id === channel.guild_id && receivedName(full));
        if (name) {rememberChannelName(channel,hiddenAccount,name);return name;}
        const cached = hiddenNames.get(channel.id);
        return cached && cached.guild === channel.guild_id ? cached.name : tr(channel.type === 4 ? HIDDEN_CATEGORY : HIDDEN_CHANNEL);
    }
    const CHANNEL_EVENTS = new Set(["CHANNEL_CREATE","CHANNEL_UPDATE"]), GUILD_EVENTS = new Set(["GUILD_CREATE","GUILD_UPDATE"]);
    const READY_EVENTS = new Set(["CONNECTION_OPEN","CONNECTION_OPEN_SUPPLEMENTAL"]), BATCH_EVENTS = new Set(["CHANNEL_UPDATES","THREAD_LIST_SYNC"]);
    const MESSAGE_EVENTS = new Set(["MESSAGE_CREATE","MESSAGE_UPDATE"]), RESTORE_EVENTS = new Set(["CONNECTION_OPEN","CACHE_LOADED"]);
    // Every Flux event passes through here: leave typing, presence, voice and the rest alone.
    const HIDDEN_EVENTS = new Set(["LOGOUT","CHANNEL_DELETE","GUILD_DELETE",...CHANNEL_EVENTS,...GUILD_EVENTS,...READY_EVENTS,...BATCH_EVENTS,...MESSAGE_EVENTS]);
    function channelMetadataEvent(event) {
        if (!HIDDEN_EVENTS.has(event.type)) return;
        // Most messages mention no channels; skip the account lookup for them.
        if (MESSAGE_EVENTS.has(event.type)) {
            const msg = event.message || event;
            if (!msg || !Array.isArray(msg.mention_channels) || !msg.mention_channels.length) return;
        }
        const current = userStore && userStore.getCurrentUser();
        // This hook runs BEFORE UserStore handles READY. Scope its metadata to
        // the incoming user, otherwise the first post-READY lookup erases it.
        const owner = event.type === "CONNECTION_OPEN" && event.user && event.user.id || current && current.id;
        if (event.type === "LOGOUT" || hiddenAccount !== owner) {
            hiddenNames.clear();hiddenViews.clear();hiddenScans.clear();hiddenAccount = owner;
            try { hiddenConfirmed.clear(); hiddenPrompts.clear(); } catch (_) {}
        }
        if (event.type === "CHANNEL_DELETE") hiddenNames.delete(event.channel && event.channel.id || event.channelId || event.id);
        if (event.type === "GUILD_DELETE") {
            const guild = event.guild && event.guild.id || event.guildId;
            for (const [id,entry] of hiddenNames) if (entry.guild === guild) hiddenNames.delete(id);
        }
        if (!features.hiddenChannels) return;
        // Cache even while the toggle is off so enabling later still has READY names.
        if (CHANNEL_EVENTS.has(event.type)) rememberChannelName(event.channel,owner);
        function rememberGuild(guild) {
            if (!guild || !guild.id) return;
            for (const key of ["channels","threads"]) if (Array.isArray(guild[key]))
                guild[key].forEach(channel => rememberChannelName(channel,owner,undefined,channel && channel.guild_id || guild.id));
        }
        if (GUILD_EVENTS.has(event.type)) rememberGuild(event.guild);
        if (READY_EVENTS.has(event.type) && Array.isArray(event.guilds)) event.guilds.forEach(rememberGuild);
        if (BATCH_EVENTS.has(event.type)) {
            for (const key of ["channels","threads"]) if (Array.isArray(event[key]))
                event[key].forEach(channel => rememberChannelName(channel,owner,undefined,channel && channel.guild_id || event.guildId));
        }
        // Real unobfuscated names arrive inside message mention_channels (fn34524/fn35281):
        // harvest them so mentioned hidden channels resolve even when stores are redacted.
        if (MESSAGE_EVENTS.has(event.type)) {
            const msg = event.message || event;
            const mentions = msg && Array.isArray(msg.mention_channels) && msg.mention_channels;
            if (mentions) mentions.forEach(channel => rememberChannelName(channel, owner));
        }
    }
    function typing(orig, self, args) {
        return enabled("noTyping") ? undefined : orig.apply(self, args);
    }
    function quickConfirm(orig, self, args) {
        const popup = args[0];
        if (!popup || typeof popup.onConfirm !== "function" || !locale || !locale.intl || !locale.t)
            return orig.apply(self, args);
        const title = popup.children && popup.children.props && popup.children.props.title;
        const texts = [title, popup.body].filter(text => typeof text === "string");
        // Localized, exact confirmation strings. No generic 'delete' matching, and
        // no interception of leave-server, ban, channel or account confirmations.
        function matches(key) {
            const token = locale.t[key];
            const label = token && locale.intl.string(token);
            return typeof label === "string" && label.length > 3 && texts.some(text => text === label);
        }
        if (enabled("quickDelete") && (matches("AMvpS4") || matches("vXZ+Fo")))
            return popup.onConfirm();
        return orig.apply(self, args);
    }
    function deletedKey(channelId, id) { return channelId + ":" + id; }
    function invalidateDeleted() { deletedRevision++; deletedViews.clear(); }
    function keepDeleted(key, entry) {
        deleted.set(key, entry);
        let bucket = deletedByChannel.get(entry.channelId);
        if (!bucket) deletedByChannel.set(entry.channelId, bucket = new Map());
        bucket.set(key, entry);
    }
    function dropDeleted(key) {
        const entry = deleted.get(key);
        if (!entry) return null;
        deleted.delete(key);
        const bucket = deletedByChannel.get(entry.channelId);
        if (bucket) { bucket.delete(key); if (!bucket.size) deletedByChannel.delete(entry.channelId); }
        return entry;
    }
    function retainable(message, event) {
        // Only messages someone else removed from the server. Your own deletions, unsent or
        // failed local messages and dismissed ephemeral ("Only you can see this") messages
        // must disappear exactly like stock Discord.
        // Your own sent messages are kept too (red outline), as intended: every deletion is kept.
        if (!message) return false;
        if (message.state != null && message.state !== "SENT") return false;
        return !((Number(message.flags) || 0) & 64);
    }
    function persistDeleted() {
        // Coalesce bursts (raids, purges) into one archive write instead of one full
        // serialization per deleted message.
        // Once the archive is erased there is nothing on disk to update: don't rewrite the
        // same empty file for every later deletion while saving is off.
        if (!files || status.storage === "loading" ||
            !(settings.noDeleteSave || archiveRestored || status.archive && status.archive !== "erased")) return;
        if (archiveTimer !== undefined) return;
        archiveTimer = later(() => { archiveTimer = undefined; writeArchive(); }, 750);
    }
    function writeArchive() {
        if (!files || status.storage === "loading") return;
        const user = userStore && userStore.getCurrentUser && userStore.getCurrentUser();
        if (settings.noDeleteSave && (!user || !archiveRestored)) return;
        try {
            // Each kept message is turned into text once and reused, so a new deletion no longer re-serializes
            // up to 5000 others. The same text as JSON.stringify of the whole archive.
            const parts = [];
            if (settings.noDeleteSave) deleted.forEach(entry => { const text = archiveText(entry); if (text) parts.push(text); });
            // Edit history rides in the same file. Older releases ignore the extra key, so nothing breaks either way.
            const history = [];
            if (settings.noDeleteSave && settings.noDeleteEdits) edits.forEach(entry => { const text = editText(entry); if (text) history.push(text); });
            const text = "{\"version\":1,\"accountId\":" + JSON.stringify(settings.noDeleteSave && user ? user.id : null) +
                ",\"messages\":[" + parts.join(",") + "]" + (history.length ? ",\"edits\":[" + history.join(",") + "]" : "") + "}";
            // A file this big can never be read back. It used to stay queued, so a write already in progress
            // saved it anyway right after, and kept up to 32 MB of text in memory until the next deletion.
            if (text.length > ARCHIVE_BYTES) throw new Error("Deleted message archive exceeds 32 MB");
            archivePending = text;
        } catch (_) { status.archive = "save failed"; notify(); return; }
        if (archiveWriting) return;
        archiveWriting = true;
        function write() {
            const snapshot = archivePending; archivePending = undefined;
            return Promise.resolve().then(() => files.writeFile("documents", ARCHIVE, snapshot, "utf8"))
                .then(() => {status.archive = settings.noDeleteSave ? "saved locally" : "erased";}, () => {status.archive = "save failed";})
                .then(() => {notify(); if (archivePending !== undefined) return write(); archiveWriting = false;});
        }
        Promise.resolve().then(write);
    }
    function restoreDeleted() {
        if (!enabled("noDelete") || !enabled("noDeleteSave") || !files || !messageRecords || archiveRestored || archiveLoading || status.storage === "loading") return;
        const user = userStore && userStore.getCurrentUser && userStore.getCurrentUser();
        const constants = files.getConstants && files.getConstants();
        if (!user || !constants || typeof constants.DocumentsDirPath !== "string") return;
        const accountId = user.id, path = constants.DocumentsDirPath.replace(/\/$/, "") + "/" + ARCHIVE;
        archiveLoading = true;
        let readable = false;
        Promise.resolve().then(() => files.fileExists(path)).then(exists => exists ? files.readFile(path,"utf8") : null).then(text => {
            readable = true;
            const current = userStore.getCurrentUser();
            if (!enabled("noDelete") || !enabled("noDeleteSave") || !current || current.id !== accountId) return;
            // Messages kept before the archive loaded, or saved ones that didn't all fit, mean the file needs updating.
            // Otherwise it already says exactly this, and opening Discord no longer rewrites it every time.
            // Edits made before the archive loaded are newer than what's saved, so the file needs updating too.
            let restored = 0, changed = deleted.size > 0 || edits.size > 0 || !text, saved = null;
            if (text) {
                if (text.length > ARCHIVE_BYTES) throw new Error("Archive too large");
                saved = JSON.parse(text);
                if (saved.version !== 1 || !Array.isArray(saved.messages) || saved.messages.length > MAX_DELETED) throw new Error("Invalid archive");
                if (saved.accountId !== accountId) changed = true;
                else saved.messages.forEach(entry => {
                    if (!entry || typeof entry.id !== "string" || typeof entry.channelId !== "string" || !entry.message || entry.message.id !== entry.id || entry.message.channel_id !== entry.channelId || !entry.message.author) { changed = true; return; }
                    const key = deletedKey(entry.channelId,entry.id);
                    if (deleted.size < settings.noDeleteLimit && !deleted.has(key)) {
                        try { entry.message = Object.assign({},entry.message); keepDeleted(key,{type:"MESSAGE_DELETE",channelId:entry.channelId,id:entry.id,raw:entry.message,message:markDeleted(messageRecords.createMessageRecord(entry.message))}); restored++; }
                        catch (_) { changed = true; /* Invalid individual records do not poison the archive. */ }
                    } else changed = true;
                });
            }
            // Another account's file was already marked changed above and is never read from.
            if (saved && saved.accountId === accountId && settings.noDeleteEdits && Array.isArray(saved.edits)) saved.edits.slice(-MAX_EDITED).forEach(entry => {
                if (!entry || typeof entry.id !== "string" || typeof entry.channelId !== "string" || !Array.isArray(entry.versions)) { changed = true; return; }
                const versions = entry.versions.filter(v => v && typeof v.content === "string").slice(-MAX_VERSIONS)
                    .map(v => ({content:v.content.slice(0, MAX_VERSION_TEXT + 1), at:typeof v.at === "string" ? v.at : null}));
                const key = deletedKey(entry.channelId, entry.id);
                if (!versions.length || edits.has(key)) { changed = true; return; }
                edits.set(key, {channelId:entry.channelId, id:entry.id, versions}); restored++;
            });
            archiveRestored = true; invalidateDeleted();
            if (changed) persistDeleted(); else status.archive = "saved locally";
            if (!restored && !changed) return;
            if (msgStore && typeof msgStore.emitChange === "function") msgStore.emitChange();
        }).catch(() => {
            status.archive = "restore failed";
            // A file that was read but is damaged can never load. It used to stop saving until Discord restarted,
            // and was read again on every reconnect. Messages kept from now on replace it. A file that couldn't be
            // read at all is left alone and tried again later, so a passing error never erases it.
            const current = userStore.getCurrentUser();
            if (readable && enabled("noDelete") && enabled("noDeleteSave") && current && current.id === accountId) {
                archiveRestored = true;
                if (deleted.size) persistDeleted();
            }
            notify();
        }).finally(() => {archiveLoading = false;});
    }
    function markDeleted(message) {
        // Identity refresh only. Deletion styling belongs to row presentation, never
        // content: copying, replies, mentions, links and archives retain the original.
        const copy = Object.create(Object.getPrototypeOf(message),Object.getOwnPropertyDescriptors(message));
        // ChatManager.determineChangeType (HBC fn54452) deep-compares old and new records with
        // objEquiv (enumerable keys) and returns NOOP for equal ones, so an identical copy never
        // re-rendered the row until the chat was reopened. One enumerable marker key makes the
        // retained record differ and the red outline appear immediately; content is untouched.
        try { Object.defineProperty(copy,"venusDeleted",{value:true,enumerable:true,configurable:true}); } catch (_) {}
        return copy;
    }
    // Built on first save, not on every deletion: most people never turn saving on.
    function archiveEntry(entry) {
        if (entry.raw === undefined) { try { entry.raw = rawDeleted(entry.message, entry); } catch (_) { entry.raw = null; } }
        return entry.raw ? {channelId:entry.channelId,id:entry.id,message:entry.raw} : null;
    }
    function editText(entry) {
        if (entry.text === undefined) { try { entry.text = JSON.stringify({channelId:entry.channelId, id:entry.id, versions:entry.versions}); } catch (_) { entry.text = null; } }
        return entry.text;
    }
    // A kept message never changes, so its saved form is worked out once.
    function archiveText(entry) {
        if (entry.text === undefined) { const saved = archiveEntry(entry); try { entry.text = saved ? JSON.stringify(saved) : null; } catch (_) { entry.text = null; } }
        return entry.text;
    }
    function rawDeleted(message, event) {
        // Retain content/metadata only; no tokens, downloaded attachments or remote fetches.
        const raw = {id:event.id,channel_id:event.channelId,content:message.content || "",author:message.author,
            timestamp:message.timestamp && typeof message.timestamp.toISOString === "function" ? message.timestamp.toISOString() : message.timestamp,
            type:message.type || 0,flags:message.flags || 0,attachments:message.attachments || [],embeds:message.embeds || [],
            mentions:message.mentions || [],mention_roles:message.mentionRoles || [],referenced_message:null};
        return JSON.parse(JSON.stringify(raw));
    }
    // One Flux removal per channel instead of one dispatch (and store emit) per message.
    function dispatchRemovals(entries) {
        if (!dispatcher || !entries.length) return;
        const byChannel = new Map();
        entries.forEach(entry => { const ids = byChannel.get(entry.channelId); if (ids) ids.push(entry.id); else byChannel.set(entry.channelId, [entry.id]); });
        byChannel.forEach((ids, channelId) => dispatcher(ids.length === 1 ? {type:"MESSAGE_DELETE",channelId,id:ids[0]} : {type:"MESSAGE_DELETE_BULK",channelId,ids}));
    }
    function trimDeleted() {
        // Lowering the maximum from 5000 to 1 used to send up to 4999 separate deletes.
        const removed = [];
        while (deleted.size > settings.noDeleteLimit) {
            const pending = dropDeleted(deleted.keys().next().value);
            if (!pending) break;
            removed.push(pending);
        }
        if (!removed.length) return;
        invalidateDeleted(); persistDeleted(); dispatchRemovals(removed);
    }
    function clearDeleted(remove, keepArchive) {
        const events = Array.from(deleted.values());
        deleted.clear(); deletedByChannel.clear(); invalidateDeleted();
        if (remove) dispatchRemovals(events);
        if (remove && !keepArchive) persistDeleted();
    }
    function retainedMessage(orig, self, args) {
        // Hot path (every row render): skip the key build while nothing is kept in this channel.
        const bucket = deleted.size && enabled("noDelete") && deletedByChannel.get(args[0]);
        const entry = bucket && bucket.get(deletedKey(args[0],args[1]));
        return entry ? entry.message : orig.apply(self,args);
    }
    function retainedMessages(orig, self, args) {
        const result = orig.apply(self,args), channelId = args[0];
        if (!enabled("noDelete") || !result) return result;
        const bucket = deletedByChannel.get(channelId);
        if (!bucket || typeof result.merge !== "function") return result;
        const cached = deletedViews.get(channelId);
        if (cached && cached.orig === result && cached.revision === deletedRevision) return cached.value;
        const array = Array.isArray(result._array) ? result._array : null;
        const first = array && array.length ? String(array[0].id) : null, last = array && array.length ? String(array[array.length - 1].id) : null;
        const older = (a, b) => a.length - b.length || (a === b ? 0 : a < b ? -1 : 1);
        // Whether this window has numeric bounds is the same for every kept message: check it once.
        const bounded = first !== null && /^\d+$/.test(first);
        // Never paste a retained message into a window that doesn't contain its position;
        // that produced out-of-place rows above unloaded history or below an older jump.
        const records = [];
        bucket.forEach(entry => {
            const id = String(entry.id);
            if (bounded && /^\d+$/.test(id)) {
                if (older(id, first) < 0 && result.hasMoreBefore === true) return;
                if (older(id, last) > 0 && result.hasMoreAfter === true) return;
            }
            records.push(entry.message);
        });
        if (!records.length) { deletedViews.set(channelId,{orig:result,revision:deletedRevision,value:result}); return result; }
        // Discord's ChannelMessages has immutable merge()/mutate(), NOT clone().
        // clone() exists only on its internal before/after caches. Never mutate the store.
        let value = typeof result.clone === "function" ? result.clone().merge(records) : result.merge(records);
        // Native merge appends cache-missing records without sorting. Re-sort only
        // our private view's array, via native immutable mutate, never the live store.
        if (typeof value.mutate === "function" && Array.isArray(value._array)) value = value.mutate(copy => {
            // Check each id once instead of running two regexes per comparison.
            const ids = new Map();
            const idOf = message => {
                let id = ids.get(message);
                if (id === undefined) { const text = String(message.id); id = /^\d+$/.test(text) ? text : null; ids.set(message, id); }
                return id;
            };
            copy._array.sort((a,b) => {
                const left = idOf(a), right = idOf(b);
                if (left === null || right === null) return 0;
                return left.length - right.length || (left === right ? 0 : left < right ? -1 : 1);
            });
        },true);
        if (deletedViews.size >= 16) deletedViews.delete(deletedViews.keys().next().value);
        deletedViews.set(channelId,{orig:result,revision:deletedRevision,value});
        return value;
    }
    function rememberDeleted(event, orig, self) {
        const key = deletedKey(event.channelId, event.id);
        if (deleted.has(key)) return true;
        const message = msgStore && msgStore.getMessage(event.channelId,event.id);
        if (!retainable(message, event)) return false;
        while (deleted.size >= settings.noDeleteLimit) {
            const pending = dropDeleted(deleted.keys().next().value);
            if (!pending) break;
            orig.call(self,{type:"MESSAGE_DELETE",channelId:pending.channelId,id:pending.id});
        }
        keepDeleted(key,{type:"MESSAGE_DELETE",channelId:event.channelId,id:event.id,message:markDeleted(message),raw:undefined});
        invalidateDeleted(); persistDeleted();
        // Update the underlying collection too: native row diffing compares record identity.
        // The retained view supplies a new record; do not corrupt content to force a diff.
        // The store's own MESSAGE_UPDATE change re-renders; never emitChange mid-dispatch.
        return orig.call(self,{type:"MESSAGE_UPDATE",message:{id:event.id,channel_id:event.channelId,content:message.content || ""}}) || true;
    }
    // Kept messages and edit history of channels that are gone for good.
    function forgetChannels(ids) {
        let dropped = false;
        ids.forEach(id => {
            const bucket = deletedByChannel.get(id);
            if (bucket) { Array.from(bucket.keys()).forEach(dropDeleted); dropped = true; }
        });
        if (dropped) invalidateDeleted();
        for (const [key, entry] of edits) if (ids.has(entry.channelId)) { edits.delete(key); dropped = true; }
        if (dropped) persistDeleted();
    }
    function dispatchEvent(orig, self, args) {
        const event = args[0];
        if (!event) return orig.apply(self, args);
        if (features.hiddenChannels) channelMetadataEvent(event);
        if (event.type === "LOGOUT") { clearDeleted(false); edits.clear(); archiveRestored = false; clearReviewAuth(); }
        if (!features.noDelete) return orig.apply(self, args);
        if (RESTORE_EVENTS.has(event.type)) Promise.resolve().then(restoreDeleted);
        // Views are keyed by the store's own ChannelMessages identity, so unrelated events
        // (typing, presence, reactions) no longer force a re-merge and re-sort of every chat.
        if (event.type === "CHANNEL_DELETE" && (deleted.size || edits.size)) forgetChannels(new Set([event.channel && event.channel.id || event.channelId || event.id]));
        // Leaving a server (not an outage, which says unavailable) used to keep its kept messages and edit history
        // in memory and in the saved file for good, where nothing could ever show or remove them.
        if (event.type === "GUILD_DELETE" && event.guild && event.guild.id && !event.guild.unavailable && (deleted.size || edits.size)) {
            const ids = new Set(), guild = event.guild.id;
            const inGuild = channelId => { const channel = receivedChannel(channelId); return !!(channel && channel.guild_id === guild); };
            deletedByChannel.forEach((bucket, channelId) => { if (inGuild(channelId)) ids.add(channelId); });
            edits.forEach(entry => { if (!ids.has(entry.channelId) && inGuild(entry.channelId)) ids.add(entry.channelId); });
            if (ids.size) forgetChannels(ids);
        }
        if (!enabled("noDelete")) return orig.apply(self, args);
        if (event.type === "MESSAGE_UPDATE" && settings.noDeleteEdits) rememberEdit(event.message);
        if (event.type === "MESSAGE_DELETE" && event.channelId && event.id) {
            // Your own deletion of a message we were already showing: remove it for real.
            const kept = rememberDeleted(event, orig, self);
            // Discord's deleteMessage chains .then() on dispatch(); always hand back a thenable.
            if (kept) return kept === true ? Promise.resolve() : kept;
        }
        if (event.type === "MESSAGE_DELETE_BULK" && event.channelId && Array.isArray(event.ids)) {
            const remaining = event.ids.filter(id => !rememberDeleted({channelId:event.channelId,id}, orig, self));
            if (!remaining.length) return Promise.resolve();
            const next = Array.from(args); next[0] = Object.assign({}, event, {ids:remaining});
            return orig.apply(self, next);
        }
        return orig.apply(self, args);
    }
    // Only a real edit counts: Discord's own update carries edited_timestamp and new text. Link previews,
    // reactions, pins and the update NoDelete sends for a kept message have no edit time or keep the text.
    function rememberEdit(update) {
        if (!update || typeof update.content !== "string" || !update.edited_timestamp || !update.id || !update.channel_id || !msgStore) return;
        let current;
        try { current = msgStore.getMessage(update.channel_id, update.id); } catch (_) { return; }
        const before = current && current.content;
        if (typeof before !== "string" || before === update.content) return;
        const key = deletedKey(update.channel_id, update.id);
        let entry = edits.get(key);
        if (entry) edits.delete(key);
        else {
            if (edits.size >= MAX_EDITED) edits.delete(edits.keys().next().value);
            entry = {channelId:update.channel_id, id:update.id, versions:[]};
        }
        const at = current.editedTimestamp || current.timestamp;
        entry.versions.push({content:before.length > MAX_VERSION_TEXT ? before.slice(0, MAX_VERSION_TEXT) + "\u2026" : before,
            at:at && typeof at.toISOString === "function" ? at.toISOString() : typeof at === "string" ? at : null});
        if (entry.versions.length > MAX_VERSIONS) entry.versions.splice(0, entry.versions.length - MAX_VERSIONS);
        entry.text = undefined; entry.view = undefined; entry.joined = undefined;
        edits.set(key, entry);
        persistDeleted();
    }
    // Earlier versions sit above the message in one quote bar, each as small grey struck-through text: Discord's
    // own native block quote, subtext and strikethrough nodes, so it follows the theme and font like any message.
    // Plain text only, so an old version can never ping anyone or open a link.
    function editHistoryNodes(entry) {
        if (entry.view) return entry.view;
        const lines = [];
        entry.versions.forEach((version, index) => {
            if (index) lines.push({type:"br"});
            lines.push({type:"subtext", content:[{type:"s", content:[{type:"text", content:version.content || "(empty)"}]}]});
        });
        entry.view = {type:"blockQuote", content:lines};
        return entry.view;
    }
    function withEditHistory(message, channelId, id) {
        if (!edits.size || !settings.noDeleteEdits || !message || !Array.isArray(message.content)) return message;
        const entry = edits.get(deletedKey(channelId, id));
        if (!entry || !entry.versions.length) return message;
        // Rows are generated again for every change in the chat; reuse the joined content while neither side changed.
        const view = editHistoryNodes(entry), joined = entry.joined;
        const content = joined && joined.view === view && joined.source === message.content ? joined.value :
            (entry.joined = {view, source:message.content, value:[view].concat(message.content)}).value;
        return Object.assign({}, message, {content});
    }
    function deleteMessage(orig, self, args) {
        const key = deletedKey(args[0], args[1]), event = deleted.get(key);
        if (event && dispatcher) {
            dropDeleted(key); invalidateDeleted(); persistDeleted(); dispatcher({type:"MESSAGE_DELETE",channelId:event.channelId,id:event.id});
            return Promise.resolve(); // Dismiss locally; never DELETE an already-deleted message on the server.
        }
        // Your own deletions are kept like anyone else's, so there is nothing to track here.
        return orig.apply(self, args);
    }
    const JUMP_GROUP_STYLE = {gap:8}, JUMP_FLIP_STYLE = {transform:[{scaleY:-1}]};
    function jumpButton(orig, self, args) {
        if (React) useSettings("jumpToTop");
        const props = args[0], screenIndex = props && props.screenIndex;
        // Same native hooks as JumpToPresent; respects composer resizing and suggestion bars.
        const inputHeight = chatHeight && chatHeight.useChatInputContainerHeight(screenIndex);
        const suggestionHeight = chatHeight && chatHeight.useSmallSuggestionBarHeight(screenIndex);
        const result = orig.apply(self, args);
        if (!enabled("jumpToTop") || !React || !RN || !props || !props.channelId || !msgActions) return result;
        const channelId = props.channelId;
        if (hiddenChannel(channelId)) return result;
        let returnMessageId;
        if (msgStore && typeof msgStore.getMessages === "function") {
            const msgs = msgStore.getMessages(channelId);
            if (msgs) {
                if (msgs.ready && !msgs.hasMoreBefore && msgs.length <= 1) return result;
                const last = typeof msgs.last === "function" ? msgs.last() : null;
                if (last && last.id) returnMessageId = last.id;
            }
        }
        const onPress = () => msgActions.jumpToMessage({channelId, messageId:channelId, flash:true, jumpType:"ANIMATED", returnMessageId});
        const child = result && result.props && result.props.children;
        if (child && child.props && typeof child.props.onPress === "function") {
            const top = React.cloneElement(child, {key:"venus-jump-top", onPress, accessibilityLabel:tr("Jump to top")});
            return React.cloneElement(result, {children:el(RN.View, {style:JUMP_GROUP_STYLE},
                el(RN.View, {style:JUMP_FLIP_STYLE}, top), child)});
        }
        if (result || !jumpPill || !jumpIcon) return result;
        // Never render bare black text over chat/media. Use Discord's themed native pill.
        const bottom = Math.max(0,Number.isFinite(inputHeight) ? inputHeight : 64) + Math.max(0,Number(suggestionHeight) || 0) + 12;
        return el(RN.View, {pointerEvents:"box-none", style:{position:"absolute",bottom,right:16}},
            el(RN.View,{style:JUMP_FLIP_STYLE},
                el(jumpPill,{icon:jumpIcon,onPress,accessibilityLabel:tr("Jump to top")})));
    }
    function hiddenCan(orig, self, args) {
        // One real permission check per call. The old path ran it twice for every visible
        // channel, and re-checked canBasicChannel with the full can(), which reads a
        // different record shape (348.10 PermissionStore: basicPermissions).
        const real = orig.apply(self, args);
        if (real || !enabled("hiddenChannels")) return real;
        const bit = args[0], channel = args[1];
        // Escape hatch: a channel with realCheck asks for the true permission result.
        // Loose equality: VIEW_CHANNEL can be BigInt/object across module copies.
        return !!(channel && !channel.realCheck && viewPermission != null && bit == viewPermission &&
            channel.guild_id && channel.type !== 1 && channel.type !== 3) || real;
    }
    // The mobile list has a second VIEW_CHANNEL filter. Give ONLY that factory a
    // metadata-list facade; the real permission store and all other callers stay stock.
    function listImport(importer) {
        if (typeof importer !== "function") return importer;
        return function () {
            const result = importer.apply(this,arguments);
            if (!result || arguments[0] !== 2051 && arguments[0] !== 4472) return result;
            const real = result.default || result;
            if (arguments[0] === 2051) {
                const methods=new Map();
                const facade=new Proxy(real,{get(target,key) {
                    const value=Reflect.get(target,key,target);
                    if (typeof value!=="function") return value;
                    const old=methods.get(key);
                    if (old && old.original===value) return old.bound;
                    const lookup=["getChannel","getBasicChannel"].includes(key);
                    const bound=function () {
                        const channel=value.apply(real,arguments);
                        return lookup && channel && enabled("hiddenChannels") ? displayChannel(channel) : channel;
                    };
                    methods.set(key,{original:value,bound});return bound;
                }});
                return result.default ? cloneWith(result,"default",facade) : facade;
            }
            if (typeof real.can !== "function") return result;
            const facade = Object.create(real);
            facade.can = function (bit, channel) {
                // Loose equality like hiddenCan: VIEW_CHANNEL can be a BigInt or number across module copies.
                if (viewPermission != null && bit == viewPermission && hiddenMetadata(channel)) return true;
                return real.can.apply(real,arguments);
            };
            return result.default ? cloneWith(result,"default",facade) : facade;
        };
    }
    function receivedChannel(id) {
        if (!channelStore || !id) return null;
        return channelStore.getChannel(id) || typeof channelStore.getBasicChannel === "function" && channelStore.getBasicChannel(id);
    }
    function realCan(bit, channel) {
        // Real permission result, bypassing our own global facade.
        // Honours the realCheck escape hatch.
        if (channel && channel.realCheck) { channel = Object.assign({}, channel); delete channel.realCheck; }
        // permissionsCanOrig is always set before permissions, so no second path is needed.
        try { return !!permissionsCanOrig && permissionsCanOrig(bit, channel); } catch (_) { return false; }
    }
    function hiddenMetadata(value) {
        if (!enabled("hiddenChannels")) return false;
        const channel = typeof value === "string" ? receivedChannel(value) : value;
        return !!(channel && channel.guild_id && channel.type !== 1 && channel.type !== 3 &&
            permissions && viewPermission != null && !realCan(viewPermission, channel));
    }
    function hiddenChannel(value) {
        const channel = typeof value === "string" ? receivedChannel(value) : value;
        return !!(channel && channel.type !== 4 && hiddenMetadata(channel));
    }
    // Channel records are immutable and replaced on change, so one renamed copy per record and name is reused.
    // A new copy on every lookup gave the channel list a different object each render, and copied every property.
    const renamedChannels = new WeakMap();
    function renamedChannel(channel, name) {
        if (name === channel.name) return channel;
        const known = renamedChannels.get(channel);
        if (known && known.name === name) return known.value;
        const value = cloneWith(channel,"name",name);
        renamedChannels.set(channel, {name, value});
        return value;
    }
    function displayChannel(channel) {
        if (!hiddenMetadata(channel)) return channel;
        return renamedChannel(channel, hiddenName(channel));
    }
    function hiddenDirectory(orig, self, args) {
        const result = orig.apply(self, args), guild = args[0];
        // Always cache names from the current store even while the toggle is off,
        // so enabling later still resolves. This read-only scan never changes permissions.
        // One read of both caches per lookup; the remembered names are reused below.
        let full, basic, source;
        // Resolve the account once per lookup, not once per channel, and walk basic then full
        // records: the same final cache as walking the merged map, without visiting basic twice.
        function remember() {
            const current = userStore && userStore.getCurrentUser(), owner = current && current.id;
            // While the switch is off this only backs up the names gateway events already record, and it ran over
            // every channel on every channel-list render. Skip it while the server's records are the same objects.
            const last = hiddenScans.get(guild);
            if (!enabled("hiddenChannels") && last && last.full === full && last.basic === basic && last.owner === owner) return;
            if (hiddenScans.size >= 64 && !last) hiddenScans.delete(hiddenScans.keys().next().value);
            hiddenScans.set(guild, {full, basic, owner});
            const keep = channel => rememberChannelName(channel, owner);
            if (basic) Object.values(basic).forEach(keep);
            Object.values(full).forEach(keep);
        }
        function read() {
            full = channelStore.getMutableGuildChannelsForGuild(guild);
            if (!full) return;
            basic = typeof channelStore.getMutableBasicGuildChannelsForGuild === "function" && channelStore.getMutableBasicGuildChannelsForGuild(guild);
            // Native lazy caching keeps basic metadata for channels with no full record.
            // Merge by ID, with full records retaining their richer native prototype.
            source = basic ? Object.assign({},basic,full) : full;
            remember();
        }
        const readable = guild && channelStore && typeof channelStore.getMutableGuildChannelsForGuild === "function";
        try { if (readable) read(); } catch (_) { source = undefined; }
        if (!enabled("hiddenChannels") || !result || !readable || !permissions) return result;
        // The read above threw part-way: retry once, letting a real error surface as before.
        if (!source) { read(); if (!source) return result; }
        const extra = Object.values(source).filter(channel => hiddenMetadata(channel));
        // Recheck permissions and metadata on each directory lookup; retain stable
        // array identity for unchanged inputs and bound the cache to 16 guilds.
        const names = new Map(extra.map(c => [c, hiddenName(c)]));
        const signature = extra.map(c => [c.id,c.position,c.type,c.parent_id,names.get(c)].join(":")).join("|");
        const references = extra.concat(extra.map(c => source[c.parent_id]).filter(Boolean));
        const cached = hiddenViews.get(guild);
        if (cached && cached.orig === result && cached.source === full && cached.basic === basic && cached.signature === signature &&
            references.length === cached.references.length && references.every((c,i) => c === cached.references[i])) return cached.value;
        let next = result;
        function append(key, channels) {
            if (!Array.isArray(next[key])) return;
            const original = next[key];
            const existing = original.map(entry => {
                if (!entry.channel) return entry;
                const channel = displayChannel(entry.channel);
                return channel === entry.channel ? entry : Object.assign({},entry,{channel});
            });
            const renamed = existing.some((entry,index) => entry !== original[index]);
            const ids = new Set(existing.map(entry => entry.channel && entry.channel.id));
            const added = [];
            channels.forEach(channel => {
                if (ids.has(channel.id)) return;
                ids.add(channel.id);
                const name = names.get(channel);
                // Hidden names were resolved for the signature above; reuse them instead of asking again.
                const shown = name === undefined ? displayChannel(channel) : renamedChannel(channel, name);
                added.push({channel:shown,comparator:channel.position || 0});
            });
            if (!added.length && !renamed) return;
            if (next === result) next = Object.assign({}, result);
            next[key] = existing.concat(added).sort((a,b) => a.comparator - b.comparator);
        }
        for (const type of [0,2,4,5,10,11,12,13,15,16]) append(type, extra.filter(c => c.type === type));
        append("SELECTABLE", extra.filter(c => ![2,4,13].includes(c.type)));
        append("VOCAL", extra.filter(c => [2,13].includes(c.type)));
        append(4, extra.map(c => source[c.parent_id]).filter(c => c && c.type === 4));
        if (hiddenViews.size >= 16 && !hiddenViews.has(guild)) hiddenViews.delete(hiddenViews.keys().next().value);
        hiddenViews.set(guild, {orig:result,source:full,basic,signature,references,value:next});
        return next;
    }
    const hiddenConfirmed = new Set();
    // Message fetches are never a tap. A channel row preloads its messages on press-in (ChannelActionCreators.preload
    // 4850 -> CHANNEL_PRELOAD -> MessageManager 9394 -> fetchMessages isPreload), which fires as soon as a finger
    // touches the row, even when it then scrolls. Discord also fetches the restored channel on its own at startup.
    // Asking here showed the locked-channel details while scrolling or opening the app (#62). Taps go through
    // navigation (hiddenNavigation), which asks; this guard only keeps locked channels from loading, silently.
    function hiddenFetch(orig, self, args) {
        const channelId = typeof args[0] === "string" ? args[0] : args[0] && args[0].channelId;
        if (!hiddenChannel(channelId) || hiddenConfirmed.has(channelId)) return orig.apply(self, args);
        return Promise.resolve();
    }
    // Locked channels are listed among the selectable ones, and the facade says they can be viewed, so Discord's
    // "first channel you can see" (GuildChannelStore 4470 getDefaultChannel/getSFWDefaultChannel -> getFirstChannel)
    // picked a locked channel placed above the real ones. A locked channel never wins over a real one.
    function hiddenFirstChannel(orig, self, args) {
        if (!enabled("hiddenChannels") || typeof args[1] !== "function") return orig.apply(self, args);
        const predicate = args[1], next = Array.from(args);
        next[1] = function (entry) { return !(entry && hiddenChannel(entry.channel)) && predicate.apply(this, arguments); };
        return orig.apply(self, next);
    }
    // The channel a server opens on (SelectedChannelStore 2102 getChannelId(guildId), used when you tap a server, by
    // getChannelIdForGuildTransition 6639 and when Discord restores the last server at startup) is the last one
    // picked there; with no server given it is the current channel, which Discord restores when the app opens.
    // Opening a server or the app never lands on a locked channel: a remembered locked channel gives way to the
    // server's first real channel. Only a locked channel you opened yourself with View Anyway is kept.
    function hiddenSelectedChannel(orig, self, args) {
        const id = orig.apply(self, args);
        if (!enabled("hiddenChannels") || typeof id !== "string" || hiddenConfirmed.has(id) || !hiddenChannel(id)) return id;
        const channel = receivedChannel(id), guild = args[0] != null ? args[0] : channel && channel.guild_id;
        let real = null;
        try { real = guildChannels && guild ? guildChannels.getDefaultChannel(guild) : null; } catch (_) { real = null; }
        return real && real.id && !hiddenChannel(real) ? real.id : null;
    }
    // "A, B and C" in Venus's language. Japanese and Chinese join with "、" and no spaces (「8 日、7 時間と7 分」),
    // Thai with plain spaces, as it has no commas.
    function joinAnd(parts) {
        if (parts.length < 2) return parts[0] || "";
        const code = uiLanguage(), tight = code === "ja" || code === "zh-CN" || code === "zh-TW";
        const head = parts.slice(0, -1).join(tight ? "、" : code === "th" ? " " : ", "), last = parts[parts.length - 1];
        return tight ? head + tr("and") + last : head + " " + tr("and") + " " + last;
    }
    function preciseAgo(ms) {
        // Precise relative durations:
        // "8 days, 7 hours and 7 minutes ago". Three largest nonzero units.
        if (!Number.isFinite(ms)) return null;
        let diff = Date.now() - ms;
        if (diff < 0) diff = 0;
        const minute = 60000, hour = 60 * minute, day = 24 * hour, month = 30 * day, year = 365 * day;
        const parts = [];
        function take(unit, singular, plural) {
            const value = Math.floor(diff / unit);
            if (value > 0) { parts.push(pl(value, singular, plural)); diff -= value * unit; }
        }
        if (diff < 45 * 1000) {
            const secs = Math.floor(diff / 1000);
            return secs <= 5 ? tr("just now") : pl(secs, "{n} second ago", "{n} seconds ago");
        }
        take(year, "{n} year", "{n} years"); take(month, "{n} month", "{n} months"); take(day, "{n} day", "{n} days");
        take(hour, "{n} hour", "{n} hours"); take(minute, "{n} minute", "{n} minutes");
        const shown = parts.slice(0, 3);
        if (!shown.length) return tr("just now");
        return tr("{time} ago", {time: joinAnd(shown)});
    }
    function snowflakeMs(id) {
        if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return NaN;
        try { return Number(BigInt(id) >> BigInt(22)) + 1420070400000; }
        catch (_) { return NaN; }
    }
    function hiddenStamp(value, fallback) {
        // {relative, absolute} for a snowflake, Date or ISO timestamp.
        let ms = NaN;
        if (typeof value === "string" && /^\d{17,20}$/.test(value)) ms = snowflakeMs(value);
        else if (value instanceof Date) ms = value.getTime();
        else if (value != null && value !== "") {
            const parsed = new Date(value);
            if (Number.isFinite(parsed.getTime())) ms = parsed.getTime();
        }
        const relative = preciseAgo(ms);
        if (relative === null) return {relative:fallback, absolute:null};
        let absolute = null;
        try { absolute = new Date(ms).toLocaleString(); } catch (_) {}
        return {relative, absolute};
    }
    function hiddenDetails(channel) {
        const pin = channel.lastPinTimestamp || channel.last_pin_timestamp;
        const last = channel.lastMessageId || channel.last_message_id;
        return [
            [tr("Created"), hiddenStamp(channel.id, tr("Unavailable"))],
            [tr("Last message"), last ? hiddenStamp(last, tr("No messages yet")) : {relative:tr("No messages yet"), absolute:null}],
            [tr("Last pin"), pin ? hiddenStamp(pin, tr("No pins yet")) : {relative:tr("No pins yet"), absolute:null}]
        ];
    }
    function HiddenDetails(props) {
        // Rendered inside Discord's own AlertModal (HBC98 module 5210) as extraContent:
        // native Text tokens follow the active theme; no hardcoded colors or backdrop.
        const Text = props.Text;
        return el(RN.View, {style:{gap:14}}, props.rows.map(([label, stamp]) =>
            el(RN.View, {key:label, style:{gap:2}},
                el(Text, {variant:"text-xs/semibold", color:"text-muted"}, label.toUpperCase()),
                el(Text, {variant:"text-md/medium", color:"text-default", selectable:true}, stamp.relative),
                stamp.absolute ? el(Text, {variant:"text-sm/medium", color:"text-muted", selectable:true}, stamp.absolute) : null)));
    }
    // One prompt per channel at a time: a navigation guard and a fetch guard can
    // fire for the same tap, which used to stack duplicate dialogs. Native
    // backdrop dismissal calls onCancel (HBC98 closure #80886), so every close
    // path releases the guard; 30 s is only a safety net.
    const hiddenPrompts = new Map();
    function showHidden(channel, onViewAnyway) {
        if (!channel || !RN) return;
        const now = Date.now(), open = hiddenPrompts.get(channel.id);
        if (open && now - open.at < 30000) return;
        const prompt = {at:now};
        hiddenPrompts.set(channel.id, prompt);
        const settle = () => { if (hiddenPrompts.get(channel.id) === prompt) hiddenPrompts.delete(channel.id); };
        const confirm = () => { settle(); if (typeof onViewAnyway === "function") onViewAnyway(); };
        const rows = hiddenDetails(channel);
        const title = tr(channel.type === 2 || channel.type === 13 ? "Locked voice channel" : "Locked channel");
        const body = tr("You don't have permission to view this channel. These details come from what Discord already sent your client.");
        // Discord's native alert (the "Delete Message" dialog): blurred backdrop,
        // themed card, Discord buttons. String title/body/confirmText + children
        // selects the modern AlertModal path in AlertActionCreators.show (module 5205).
        // Demand-loaded at tap time: no extra Metro factories are wrapped at startup.
        const alerts = inspectedExport(5205, "default");
        const Text = inspectedExport(4833, "Text");
        if (React && alerts && typeof alerts.show === "function" && Text) {
            try {
                alerts.show({title, body, children:el(HiddenDetails, {rows, Text}),
                    confirmText:tr("View Anyway"), cancelText:tr("Cancel"), onConfirm:confirm, onCancel:settle});
                return;
            } catch (_) { /* fall through to the platform alert */ }
        }
        if (!RN.Alert) {settle();return;}
        const message = rows.map(([label, stamp]) => label + ": " + stamp.relative + (stamp.absolute ? " (" + stamp.absolute + ")" : "")).join("\n");
        try {
            RN.Alert.alert(title, message, [
                {text:tr("Cancel"), style:"cancel", onPress:settle},
                {text:tr("View Anyway"), onPress:confirm}
            ], {cancelable:true, onDismiss:settle});
        } catch (_) { settle(); }
    }
    function hiddenNavigation(orig, self, args) {
        const route = args[0];
        const match = typeof route === "string" && /^\/channels\/(?:@me|[^/]+)\/([^/?#]+)(?:[/?#]|$)/.exec(route);
        if (!match || !hiddenChannel(match[1]) || hiddenConfirmed.has(match[1])) return orig.apply(self, args);
        const id = match[1];
        // With the details menu turned off, tapping a locked channel simply does nothing.
        if (enabled("hiddenChannelsMenu")) showHidden(receivedChannel(id), () => { hiddenConfirmed.add(id); return orig.apply(self, args); });
        return; // Wait for user choice; View Anyway then navigates.
    }
    function hiddenGuildNavigation(orig, self, args) {
        // Opening a server by itself (with a locked channel Discord remembered) goes to the server's first real
        // channel without asking: the locked channel may have been the last one tapped, but you opened the server.
        if (!hiddenChannel(args[1]) || hiddenConfirmed.has(args[1])) return orig.apply(self, args);
        const next = Array.from(args);
        let real = null;
        try { real = guildChannels && args[0] ? guildChannels.getDefaultChannel(args[0]) : null; } catch (_) { real = null; }
        next[1] = real && real.id && !hiddenChannel(real) ? real.id : undefined;
        return orig.apply(self, next);
    }
    let guildChannels = null;
    let pastelHash, guildMembers, presenceStore, sessionsStore, displayNameType, nativeRowGroup, nativeSwitchRow, oauthModal;
    // The original PlatformIndicators plugin's themable PNG glyphs, tinted by status.
    const platformPngs = {"desktop": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAAVFBMVEUAAACvv7+3u7+5u7+2ub+4u726vL65u765vL65vMG5u723ub23v7+3t7+6vL+4ur+6u765u764vL+4ur23t7+7vb+3ur25ur64ur+7u766ur6vr7/+1nXbAAAAHHRSTlMAEEB/UHDv/99fgIAgQJ+f7++fnyB/YN9vTz8QSaZf3QAAAI1JREFUeAHt1tUBwkAURNEXHZzg1n+d2Fc8u4OTOQXcyKqJ3ARh5C22qiQFYTC0khFIYyuYgDYthGagzQuhDLRFIYS7yBPuakLmSaF2CimkkEIKKfT8I5un0MdCT7v6LUFbFUIhaGsr2IAUWcl2B0K2t6pDVKttGR5P3BJvpxCnfdTMHVo9NaRQ1MpKRC5jHSw3VFQzIwAAAABJRU5ErkJggg==", "web": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAQAAAD/5HvMAAADgklEQVR42u3a32vVdRzH8VdOv2NzGzM7bkp0E9F9RQSbOmK6groQpeugOzXJfnCW3YwgC4IyHCldrBmFELtQRxfK2MHp1sjVZRfBMSJFYu6cMUnOOZPz9Gb45uyc79fv5/tDvDiPv+DJh/fn8+HL56umpqbHFZsZ4hjjzJOnQJkyBfLMM87H7GWzHh16OcoVKgQpM8N79Cht7GaSVcJa5QK7lBZe5SpRzDCgpLGdH6gS3SRPKzm8xTJxFTmgJNDKtyRllFbFQxfTRLVCvSk6FR3b+J3onuRTlllvgUzk1YmVsyJJdPMN1bqkzmizM00cc1rDIP9SawpPrjhFPAf1AN1cotZJ940ezwKb1q33BLX2Kzx2sBwzZ7vWoYXvAVOkV2FxlqjuMMtBNqkBNpIDzI/h7ywnTsfIP5gquxUGV3EiB7zMPcxlPRwDOJITTgNmpx6GyZSDnqKAOa9g9LKKIzniA0yFbQrC+5B6UDf/Y44oCFdwdUPOGMfkgr8kyrg6Lmf0YUq0yw9DuLnBcTw5YwNFzB754RhmkYaUCH7BDMsPZzDDZFMM+gQzJj/8inlTYiS1oNcws/LD35jnJUtKPOgFzHX5YQmzdmCRTSXoGcyi/FDGtEqWlHhQG6YULsjTA4zg5iZf4CkAXrig25gtUowk+FwB2IpZDDfUz8pEWiUF4DnM9XDbfkiKl6QAvB5u248H38KMJBZ0FDMW7uo4qwbIJhQ0gcnKD3sxN3lCirNKgZfrf5hB+aGdEuYVNUQ2dtAuTIk2+WMG87V8MBIzaBQzrdDDVqBDPuIE0cUy5rCC0MMq5lAqQR9hKmRcPoNu0ZF0EN0sYs7JBAyc+UwNsUJYd7nGO2zUGr4CTL9MqMGu8KIaYB43C2yVJPq4h8kpDAaoYv6kS3U4jKvfaGELeUyVfoXDT4C5wAatg8cfuHqbS4A54/K8UgTMd/WnNjuckyqAKdCj8DhArdO0NFilQ8xxhyiq7JMbRqk1GXAEuDshV3hMUesvXkoo6CKe3NHJArUqfEln7KBrdCgaMnVJcIsPa6OcczKKjk6mqFfkFH20RAi6SIfiweMkjS0xwTBvEFaVE3hKAvspEleBfUoOvTGfOH+mJ40X6ctEkaNfaWEn56kQVoVz9CltZDhCjhJBSuR4l4weHdrZwzBjzJFniTJlbpNnljGyDNLW/BmlqelxdR++AoGbDB4jjAAAAABJRU5ErkJggg==", "mobile": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAAXVBMVEUAAAAwMDgwMDUwMDUuMDYwMDYvMTcvMTYvMTYwMDYwMDUvMTYwMjUvMTUvMjYvMTUuMDUuMDQvMDUtMTUwMDgvMDUwMDAtMDYuMDYwMDAtMDUvMDYuMDUtMDcpMTo5aAq8AAAAH3RSTlMAIGBvf1C//89fMN9g75+/j3+fP0C/IFBfMGDPb08fcZ9WCgAAAMNJREFUeAHt2YWNxQAMg2EX/fiVud1/zBuhSaRjfwv8UsQx5J9L0iw/VySIyUoaXa7wu93pcE/g9KDTFS4F+amF5Em3ZwK7FwPeMEsYcoNVxZAaViX5uTd6MuQJKwY5A01u9goFWph1fyKggAIKKKCAAgoooIACCiiggAIKKKCAAgoooIACn/l9d/t3gU/fcEqG9LDKGVLB6saQAZ97owZ2w5NuzwEOKd1G4FMLE5wG36Y/w29ZadRviBn2/Nw2HfjTPgD3/UVA1TCAGgAAAABJRU5ErkJggg==", "embedded": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAAk1BMVEUAAAC3u7+4ur+5vL+5u765u7+6vL+2ub+3v7+6u7+5vL66v7+6vL65u761ur+4u765vL+3t7+6u765u7+9vb23t7+7vb+6u766ur+5ur6/v7+vv7+9vcW1tb+5u727u763ur25vL+6vL+3ub24ur+5u7+4vL+5ur66ur64ur25vL+6u764ur24u722uby5u76vr7/eehxsAAAAMXRSTlMAQJ/f/8+fUCC/3zDv7zC/UEDvfx8gf88w3xAQHzCAT2Bfb4Bvj5/PP6+vv59wUM8QEONx+AAAAWZJREFUeAHt1dWa6zAMBOA5PSqzs2Vmhvd/uWWcVFHqr5f+r+3JRqtJ8UhBEAT/Mv8lpWwuD02hKHcpFXBTuSJ3qtZwQ0HPUVULiCuJhzpiGuKlCZaTL3gnxEVPaLWdkAxYJznIdfGmy0k9MEkOivChLQSkbwS18KElZEBBLSMIX4QMuRxaEJ0vCBndCkJMbEZjIRO6MTWCqjWlRjO6MTeCpLoooDWuCFvSjcgK0pYzohsrM0hZzhXdWJtBynJyR4rGv19dzrp3EC3nhoJKZpCynNxalzqIlrPKU7WDlOXUym8H0XIOufy+htxZX9tHBU24/L5mXH5fSy6/r4jL/8sOidYJv2x7fu0k84SgIn/Qmb50dT2oB6YXk+tf4hElWuuPdeaIlCFx/fkLeM+Q1Ferw3RQZ9SmP8jQlR9H/NZ3tKmG08+sW/SMnrxzZ6Qy/TrfBWkdL+Lq0RUptaYHJyU+HwRB4O0FjTMnvIkvoBQAAAAASUVORK5CYII=", "vr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAANlBMVEVMaXHv7/Hv7/Hv7/Hv7/Hv7/Hv7/Hv7/Hv7/Hs7PTu7vHv7/Hv7/Hv7/Hv7/Hv7/Hv7/Hv7/EEUZf/AAAAEXRSTlMAzGV4UNr78OcJFDufKb6ri3Gd0SEAAAHQSURBVFjD7VbHdsQgDDRNiOby/z+bjY0N2LRk95C8xxwNHo0KkqZpYGBg4PMwbBa4ZYFiZqaPRVGxNSCoavPwJs0ujLbk2K0TtipKz1s3Zl3RE/PILGKmsqbLL8JcwZ5y9LJmi3E+k8Ib1UH8xcI95Utnaeb2TAnmbzLP01NsnilfBEcBCW9FVXWpwzvxrGYiE785ASC1p2DO3M5xlWty5ZREyrEmKlQK0Tedweu1npUdNPxDVBrlHe5bIHQQue1m/YVIEKjIGKmGG7ZbPKYpqnsMnsGqqxUQNSzpP8WdJoSaNUop7nwFInZF600ijT0F3kE06dXS6RNEXfh7ROI/EMG7RPAM2++I8D48wqefZe0cJy74Bo+HaixBJPbRLXX0k5ueDenWgtzVYojLz670edNL55y2wSgPQPOtFhPbirPlKYlDPOyBPwUtjD8auzr6GwYXDKRrA4RAucMFmR0PvuXjeZ3K+wIiT++MD8Wa32n8KSxc67ArSOYcOzln6rTmi5eKhWbMIbMGyV2gkZkjKE4ZVr6cM1Lp6qxslN6ZoDodeLoVi6igTbqlYmOJ0muIBrIku4oFK7Ix9I7atAQ2SWym1F5HEjB3NDAwMPAuvgCPRUw2yKsaYwAAAABJRU5ErkJggg=="};
    function PlatformPng(props) {
        const uri = platformPngs[props.platform];
        if (!uri) return el(RN.View,{style:{width:16,height:16,borderRadius:8,backgroundColor:props.color}});
        return el(RN.Image,{source:{uri,width:16,height:16},style:{width:16,height:16,tintColor:props.color}});
    }
    let reviewToken = "", reviewAccount = null, reviewAuthAttempt = 0, reviewAuthState = "idle", reviewAuthError = "";
    const reviewCache = new Map(), platformWrappers = new WeakMap();
    const REVIEW_API = "https://manti.vendicated.dev/api/reviewdb";
    const pastelCache = new Map();
    let pastelCacheColor, pastelCacheHash;
    function pastelColor(seed, saturation, lightness) {
        if (!pastelHash || !RN || typeof RN.processColor !== "function") return null;
        // Rows re-render constantly; the color only depends on these inputs and the active helpers.
        if (pastelCacheColor !== RN.processColor || pastelCacheHash !== pastelHash) {
            pastelCache.clear(); pastelCacheColor = RN.processColor; pastelCacheHash = pastelHash;
        }
        const cacheKey = saturation + ":" + lightness + ":" + seed;
        const known = pastelCache.get(cacheKey);
        if (known) return known;
        const color = computePastel(seed, saturation, lightness);
        if (pastelCache.size >= 1024) pastelCache.delete(pastelCache.keys().next().value);
        pastelCache.set(cacheKey, color);
        return color;
    }
    function computePastel(seed, saturation, lightness) {
        const hue = ((pastelHash(String(seed)) >>> 0) % 360) / 360;
        function component(offset) {
            const k = (offset + hue * 12) % 12;
            return Math.round(255 * (lightness - saturation * Math.min(lightness,1-lightness) * Math.max(-1,Math.min(k-3,9-k,1))));
        }
        const hex = "#" + [component(0),component(8),component(4)].map(value => value.toString(16).padStart(2,"0")).join("");
        return {hex, value:RN.processColor(hex)};
    }
    // Every chat row runs this: the content array is only copied once a node actually changes.
    function pastelMentions(content, guildId) {
        if (!Array.isArray(content)) return content;
        let next = null;
        for (let i = 0; i < content.length; i++) {
            const node = content[i];
            if (!node || typeof node !== "object") continue;
            let result = node;
            if (node.type === "mention" && node.userId && (!node.colorString || settings.pastelAll) &&
                (!guildId || guildMembers && guildMembers.getMember(guildId,node.userId))) {
                const color = pastelColor(node.userId,0.85,0.75);
                if (color) result = Object.assign({},node,{roleColor:color.value,color:color.value,colorString:color.hex});
            }
            if (Array.isArray(node.content)) {
                const children = pastelMentions(node.content,guildId);
                if (children !== node.content) result = Object.assign({},result,{content:children});
            }
            if (result !== node) { if (!next) next = content.slice(); next[i] = result; }
        }
        return next || content;
    }
    function pastelMessage(message, source) {
        if (!message || !message.authorId) return message;
        if (message.guildId && (!guildMembers || !guildMembers.getMember(message.guildId,message.authorId)) && !(source && source.webhookId)) return message;
        let seed;
        if (source && source.webhookId) seed = message.username || source.webhookId;
        else if (!(source && source.colorString != null ? source.colorString : message.roleColor) || settings.pastelAll) seed = message.authorId;
        const color = seed && pastelColor(seed,0.75,0.6);
        const content = pastelMentions(message.content,message.guildId);
        // If neither the author's name color nor any mention changed and shouldShowRoleOnName is already true,
        // return the original message without cloning it on every scroll frame.
        if (!color && content === message.content && message.shouldShowRoleOnName === true) return message;
        // One copy of the row's message, with every change in it.
        const changes = color ? {roleColor:color.value,usernameColor:color.value,colorString:color.value,shouldShowRoleOnName:true} : {shouldShowRoleOnName:true};
        if (content !== message.content) changes.content = content;
        // Native MessageView applies Message.textColor via TextView.setTextColor (348.10 bridge field).
        // Never wrap content in a link node: that made the text blue, tappable and show "usernameOnClick".
        if (color && settings.pastelContent) {
            const text = pastelColor(seed,0.85,0.75);
            if (text) changes.textColor = text.value;
        }
        return Object.assign({},message,changes);
    }
    // The replied-to message above a reply. Discord's reply preview never read textColor, so "Color message text"
    // didn't reach replies (#45); the Pastelize patch now has it paint the reply text with it. Discord gives every
    // message a textColor, so the reply's own is dropped unless Pastelize colored it: otherwise the preview keeps
    // Discord's usual reply color, exactly as before, also while Pastelize is switched off.
    function pastelReply(reply) {
        const shown = enabled("pastelize") ? pastelMessage(reply,null) : reply;
        if (enabled("pastelContent") && shown !== reply && shown.textColor != null && shown.textColor !== reply.textColor) return shown;
        if (shown.textColor == null) return shown;
        const plain = Object.assign({},shown);
        delete plain.textColor;
        return plain;
    }
    // Read All: a ReadAllNotificationsButton port for the mobile server bar (GuildsBar 15920,
    // useGuildsBarProps 15929). The button lives in the SEPARATOR row, below the DM button and
    // unread DMs and above the line, so the native FastList's sections, anchors and recycler
    // keys stay stock. Only that row's height grows, through the list's own itemSize.
    const READ_ALL_HEIGHT = 36;
    const readAllViews = new WeakMap(), readAllData = new WeakMap();
    const readAllCache = {api:null};
    // ReadStateActionCreators (6532) exports ack/bulkAck by name, with no default object.
    function readActionsExport() {
        if (typeof global.__r !== "function") return null;
        try { const m=global.__r(6532); return m && typeof m.bulkAck==="function" ? m : m && m.default; } catch (_) { return null; }
    }
    function readAllExports() {
        const c=readAllCache.api;
        if (c && c.sorted && c.guildStore && c.lurking && c.guildReads && c.markGuilds && c.privateReads && c.privateSort && c.requestUtils && c.reads && c.readActions && c.renderSections) return c;
        const x=(id,key) => inspectedExport(id,key);
        const api={sorted:x(5751,"default"), guildStore:x(2073,"default"), lurking:x(4473,"default"),
            guildReads:x(7054,"default"), markGuilds:x(13507,"default"), sections:x(1086,"AnalyticsSections"),
            privateReads:x(13299,"default"), privateSort:x(6640,"default"), requestUtils:x(13384,"filterOutMessageRequestsAndSpamById"),
            reads:x(4852,"default"), readActions:readActionsExport(), readTypes:x(5019,"ReadStateTypes"),
            renderSections:x(15919,"FastListRenderSections")};
        if (api.sorted && api.guildStore && api.lurking && api.guildReads && api.markGuilds && api.privateReads && api.privateSort && api.requestUtils && api.reads && api.readActions && api.renderSections) readAllCache.api=api;
        return api;
    }
    function unreadGuildIds(api) {
        if (!api.guildReads) return [];
        const candidates=[], seen=new Set();
        const add=list => {
            if (!list) return;
            for (const id of list) if (typeof id==="string" && !seen.has(id)) { seen.add(id); candidates.push(id); }
        };
        if (api.sorted && typeof api.sorted.getFlattenedGuildIds==="function") try { add(api.sorted.getFlattenedGuildIds()); } catch (_) {}
        if (api.lurking && typeof api.lurking.lurkingGuildIds==="function") try { add(api.lurking.lurkingGuildIds()); } catch (_) {}
        if (api.guildStore && typeof api.guildStore.getGuildIds==="function") try { add(api.guildStore.getGuildIds()); } catch (_) {}
        if (!candidates.length && typeof api.guildReads.getMutableUnreadGuilds==="function") try { add(api.guildReads.getMutableUnreadGuilds()); } catch (_) {}
        const eventType=api.readTypes && api.readTypes.GUILD_EVENT != null ? api.readTypes.GUILD_EVENT : 1;
        const checkEvent=api.reads && typeof api.reads.hasUnread==="function";
        return candidates.filter(id => api.guildReads.hasUnread(id) || api.guildReads.getMentionCount(id) > 0 ||
            (checkEvent && api.reads.hasUnread(id, eventType)));
    }
    function unreadDmIds(api) {
        const candidates=[], seen=new Set();
        const add=list => {
            if (!list) return;
            for (const id of list) if (typeof id==="string" && !seen.has(id)) { seen.add(id); candidates.push(id); }
        };
        if (api.privateReads && typeof api.privateReads.getUnreadPrivateChannelIds==="function") try { add(api.privateReads.getUnreadPrivateChannelIds()); } catch (_) {}
        // PrivateChannelReadStateStore (13299) truncates getUnreadPrivateChannelIds() to 20 items (`r7.length = 20`);
        // PrivateChannelSortStore (6640) holds the full list of non-request DMs when >20 DMs have unreads or mentions.
        if (api.privateSort && typeof api.privateSort.getPrivateChannelIds==="function") try { add(api.privateSort.getPrivateChannelIds()); } catch (_) {}
        const checkUnread=api.reads && (typeof api.reads.hasUnreadOrMentions==="function" || typeof api.reads.getMentionCount==="function");
        const unread=checkUnread ? candidates.filter(id => typeof api.reads.hasUnreadOrMentions==="function"
            ? api.reads.hasUnreadOrMentions(id) : api.reads.getMentionCount(id) > 0) : candidates;
        if (typeof api.requestUtils==="function") try { return api.requestUtils(unread); } catch (_) {}
        return unread;
    }
    // Same native paths as Discord: the server menu's markGuildsAsRead (13507) with the
    // GUILD_LIST source, and a single BULK_ACK for DMs at each channel's last message.
    function readAll(mode) {
        if (!enabled("readAll") || !READ_ALL_MODES.includes(mode)) return;
        const api=readAllExports(), ui=reviewUI();
        let guilds=0, dms=0;
        // Unread servers or DMs with no way to clear them used to say "Nothing unread".
        const unavailable=() => { throw new Error(tr("Discord's read states haven't loaded yet. Try again in a moment.")); };
        try {
            if (mode!=="dms") {
                if (!api.guildReads || !(api.sorted || api.guildStore)) unavailable();
                const ids=unreadGuildIds(api);
                if (ids.length && typeof api.markGuilds!=="function") unavailable();
                if (ids.length) { api.markGuilds(ids, api.sections && api.sections.GUILD_LIST); guilds=ids.length; }
            }
            if (mode!=="guilds") {
                if (!api.privateReads && !api.privateSort) unavailable();
                const ids=unreadDmIds(api);
                if (ids.length && !(api.readActions && typeof api.readActions.bulkAck==="function" && api.reads)) unavailable();
                if (ids.length) {
                    const type=api.readTypes && api.readTypes.CHANNEL != null ? api.readTypes.CHANNEL : 0;
                    // A DM without a known last message can't be acknowledged; sending it anyway
                    // made the whole request fail. Discord's own /read-states/ack-bulk takes 100 at a time.
                    const acks=[];
                    for (let i=0;i<ids.length;i++) {
                        const channelId=ids[i], messageId=api.reads.lastMessageId(channelId);
                        if (messageId) acks.push({channelId, readStateType:type, messageId});
                    }
                    for (let i=0;i<acks.length;i+=100) api.readActions.bulkAck(acks.slice(i,i+100));
                    dms=acks.length;
                }
            }
        } catch (error) {
            // What was already cleared stays cleared; say so instead of only the error.
            const done=guilds ? " ("+pl(guilds,"{n} server was marked as read","{n} servers were marked as read")+")" : "";
            reviewToast(ui,tr("Couldn't mark as read: {problem}",{problem:String(error && error.message || error)})+done,venusIcon(6026,"CircleXIcon")); return;
        }
        if (guilds || dms) readAllDone();
        const parts=[];
        if (guilds) parts.push(pl(guilds,"{n} server","{n} servers"));
        if (dms) parts.push(pl(dms,"{n} DM","{n} DMs"));
        reviewToast(ui, parts.length ? tr("Marked {what} as read",{what:joinAnd(parts)}) : "Nothing unread",venusIcon(15161,"DoubleCheckmarkIcon"));
    }
    // Holding the button: Discord's own action sheet with the three one-time choices.
    function readAllChooser() {
        const ui=reviewUI();
        const options=[["guilds",tr("Mark servers as read")],["dms",tr("Mark DMs as read")],["both",tr("Mark servers and DMs as read")]]
            .map(([mode,label]) => ({label, onPress:() => readAll(mode)}));
        if (typeof ui.simpleSheet==="function") try { ui.simpleSheet({key:"VenusReadAll",header:{title:tr("Read all")},options}); return; } catch (_) {}
        if (RN && RN.Alert) RN.Alert.alert(tr("Read all"),undefined,options.map(option => ({text:option.label,onPress:option.onPress})).concat([{text:tr("Cancel"),style:"cancel"}]));
    }
    let readAllStyleHook, readAllStylesTried=false;
    const READ_ALL_WRAP_STYLE = {width:"100%"}, READ_ALL_OUTER_STYLE = {height:READ_ALL_HEIGHT,alignItems:"center",justifyContent:"center"};
    const READ_ALL_PILL_BASE = {height:26,minWidth:48,paddingHorizontal:8,borderRadius:13,alignItems:"center",justifyContent:"center"};
    const READ_ALL_PRESSED_SCALE = {transform:[{scale:0.96}]}, READ_ALL_TEXT_BASE = {fontSize:11,fontWeight:"700",includeFontPadding:false};
    const READ_ALL_FALLBACK_STYLES = {pill:{backgroundColor:"#4e505899"},pressed:{backgroundColor:"#4e5058"},text:{color:"#dbdee1"}};
    function readAllPress() { readAll(settings.readAllMode); }
    // For a moment after it clears something, the pill shows a check instead of its label, then goes back.
    let readAllDoneUntil=0, readAllDoneTimer;
    function readAllDone() {
        readAllDoneUntil=Date.now()+1400; notify("readAll");
        if (readAllDoneTimer!==undefined && global.clearTimeout) global.clearTimeout(readAllDoneTimer);
        readAllDoneTimer=later(() => { readAllDoneTimer=undefined; readAllDoneUntil=0; notify("readAll"); },1450,false);
    }
    function ReadAllButton() {
        useSettings("readAll");
        const ui=reviewUI(), done=readAllDoneUntil>Date.now();
        // Discord's semantic tokens, so the pill follows light, dark and custom themes.
        if (!readAllStylesTried) {
            const c=ui.colors;
            if (typeof ui.createStyles==="function" && c) {
                readAllStylesTried=true;
                try {
                    readAllStyleHook=ui.createStyles({pill:{backgroundColor:c.BACKGROUND_MOD_NORMAL},pressed:{backgroundColor:c.BACKGROUND_MOD_STRONG},text:{color:c.TEXT_DEFAULT}});
                } catch (_) { readAllStyleHook=null; }
            }
        }
        let styles=null;
        if (readAllStyleHook) try { styles=readAllStyleHook(); } catch (_) {}
        styles=styles || READ_ALL_FALLBACK_STYLES;
        return el(RN.View,{style:READ_ALL_OUTER_STYLE},
            el(RN.Pressable,{accessibilityRole:"button",accessibilityLabel:tr("Read all"),accessibilityHint:tr("Hold to choose"),
                hitSlop:6,onPress:readAllPress,onLongPress:readAllChooser,delayLongPress:350,
                style:({pressed}) => [READ_ALL_PILL_BASE,styles.pill,
                    pressed ? styles.pressed : null,pressed ? READ_ALL_PRESSED_SCALE : null]},
                done ? popIn("done",el(venusIcon(6555,"CheckmarkSmallIcon"),{size:"xs",color:styles.text && styles.text.color})) :
                    el(RN.Text,{numberOfLines:1,allowFontScaling:false,style:[READ_ALL_TEXT_BASE,styles.text]},tr("Read all"))));
    }
    function readAllBarProps(orig, self, args) {
        const result=orig.apply(self,args);
        if (React) useSettings("readAll");
        const data=result && result.listDataProps;
        if (!enabled("readAll") || !React || !RN || !data || typeof data.itemSize!=="function" || typeof data.renderItem!=="function") return result;
        // The wrapped list data is shared per native listDataProps, but the returned props are per result:
        // keying the whole view on listDataProps handed back an older result's listProps.
        const known=readAllViews.get(result);
        if (known) return known;
        let listDataProps=readAllData.get(data);
        if (!listDataProps) {
            const enums=readAllExports().renderSections, separator=enums && typeof enums.SEPARATOR==="number" ? enums.SEPARATOR : 6;
            const itemSize=data.itemSize, renderItem=data.renderItem;
            listDataProps=Object.assign({},data,{
                itemSize:function (section) { const size=itemSize.apply(this,arguments); return section===separator && enabled("readAll") ? size+READ_ALL_HEIGHT : size; },
                renderItem:function (section) {
                    const node=renderItem.apply(this,arguments);
                    return section===separator && enabled("readAll") ? el(RN.View,{key:"venus-read-all",style:READ_ALL_WRAP_STYLE},el(ReadAllButton,null),node) : node;
                }});
            readAllData.set(data, listDataProps);
        }
        const view=Object.assign({},result,{listDataProps});
        readAllViews.set(result, view);
        return view;
    }
    // Message tap gestures (a port of Geastures+ by kmmiio99o): double-tap replies, or edits your own
    // message; tapping a third time deletes your own message. It takes over Discord's double-tap handler
    // (DoubleTapToReactUtils 7414, which every double-tap reaches), so Discord's own "double-tap to
    // react" setting needs nothing changed. Reply and edit go through the same actions as swiping:
    // replyToMessage (11047) and LongPressMessageActionSheetUtils.handleEdit (11032).
    // The third tap is not a second double-tap. Discord's native tap tracker (NestedScrollOnTouchTracker)
    // starts over once a double-tap fires, so the next touch is reported as a single tap
    // (MessagesHandlers.handleTapMessage, 10905), and only after Android's double-tap timeout (300 ms)
    // passes with no fourth tap. Waiting 260 ms for another double-tap meant the editor always opened
    // first. Edit now waits long enough for that single tap: a quick third tap lands 400-550 ms after
    // the double-tap. A second double-tap (tap four) still counts too.
    const GESTURE_TRIPLE_MS = 650, GESTURE_PAIR_MS = 1500, GESTURE_DELETED_MS = 3000;
    const gesture = {timer:undefined, pending:null, channel:null, chatInputRef:null, pendingAt:0, deleted:null, deletedAt:0, handlers:null,
        replyFn:null, editFn:null, canEditFn:null, canReplyFn:null, hapticFn:null, hapticType:undefined};
    function gestureCancel() { if (gesture.timer !== undefined && global.clearTimeout) global.clearTimeout(gesture.timer); gesture.timer = undefined; gesture.pending = null; gesture.channel = null; gesture.chatInputRef = null; }
    function gestureOwn(message) {
        const user = userStore && userStore.getCurrentUser();
        return !!(user && message && message.author && message.author.id === user.id);
    }
    function gestureChatInputRef(channel) {
        try {
            const params = gesture.handlers && gesture.handlers.params;
            if (!params || typeof params !== "object") return null;
            if (channel && params.selectedChannelId && String(params.selectedChannelId) !== String(channel.id)) return null;
            return params.chatInputRef || null;
        } catch (_) { return null; }
    }
    function gestureHaptic() {
        try {
            const trigger = gesture.hapticFn || (gesture.hapticFn = inspectedExport(4802, "triggerHapticFeedback"));
            if (typeof trigger !== "function") return;
            if (gesture.hapticType === undefined) {
                const types = inspectedExport(4803, "default") || inspectedExport(4802, "HapticFeedbackTypes");
                gesture.hapticType = types && types.IMPACT_LIGHT !== undefined ? types.IMPACT_LIGHT : 0;
            }
            trigger(gesture.hapticType);
        } catch (_) {}
    }
    function gestureCanReply(channel, message) {
        const canReply = gesture.canReplyFn || (gesture.canReplyFn = inspectedExport(7422, "canReplyToMessage"));
        if (typeof canReply !== "function") return true;
        try { return !!canReply(channel, message); } catch (_) { return true; }
    }
    function gestureReply(message, channel, chatInputRef) {
        if (!gestureCanReply(channel, message)) return false;
        const reply = gesture.replyFn || (gesture.replyFn = inspectedExport(11047, "default"));
        if (typeof reply !== "function") return false;
        const ref = chatInputRef !== undefined ? chatInputRef : gestureChatInputRef(channel);
        try { gestureHaptic(); reply({message, channel, chatInputRef:ref, actionSource:"message_swipe", invertible:true}); return true; } catch (_) { return false; }
    }
    function gestureEdit(message, channel, chatInputRef) {
        // Only what Discord itself would let you edit (sent, yours, not a system message); otherwise reply.
        const canEdit = gesture.canEditFn || (gesture.canEditFn = inspectedExport(11120, "default")), user = userStore && userStore.getCurrentUser();
        try { if (typeof canEdit === "function" && !canEdit(message, user && user.id)) return false; } catch (_) { return false; }
        const edit = gesture.editFn || (gesture.editFn = inspectedExport(11032, "handleEdit"));
        if (typeof edit !== "function") return false;
        const ref = chatInputRef !== undefined ? chatInputRef : gestureChatInputRef(channel);
        try { gestureHaptic(); edit(message, channel, ref, "message_swipe", true); return true; } catch (_) { return false; }
    }
    function gestureDelete(message, channel) {
        if (message && message.state && message.state !== "SENT") return false;
        const actions = msgActions || inspectedExport(6880, "default");
        if (!actions || typeof actions.deleteMessage !== "function") return false;
        // Discord's own delete, with QuickDelete and NoDelete still applying to it.
        try { gestureHaptic(); const result = actions.deleteMessage(channel && channel.id || message.channel_id, message.id, false);
            if (result && typeof result.catch === "function") result.catch(() => {}); return true; } catch (_) { return false; }
    }
    function gestureDeletePending(now) {
        const message = gesture.pending, channel = gesture.channel;
        gestureCancel();
        gesture.deleted = message.id; gesture.deletedAt = now;
        gestureDelete(message, channel);
    }
    // A single tap on the message that was just double-tapped is the third tap.
    function gestureTap(event) {
        if (!enabled("gestures") || !settings.gestureTripleDelete || !gesture.pending) return false;
        const data = event && event.nativeEvent, id = data && data.messageId, now = Date.now();
        if (id == null || String(id) !== String(gesture.pending.id) || now - gesture.pendingAt >= GESTURE_PAIR_MS) return false;
        gestureDeletePending(now);
        return true;
    }
    // MessagesHandlers defines handleTapMessage and handleDoubleTapMessage on each instance in its constructor.
    function hookTapHandlers(exports) {
        const Handlers = exports && exports.MessagesHandlers;
        if (typeof Handlers !== "function" || typeof Reflect === "undefined" || typeof Reflect.construct !== "function") return exports;
        function MessagesHandlers() {
            const handlers = Reflect.construct(Handlers, arguments);
            gesture.handlers = handlers;
            const tap = handlers && handlers.handleTapMessage;
            if (typeof tap === "function") handlers.handleTapMessage = function (event) {
                gesture.handlers = handlers;
                try { if (gestureTap(event)) return undefined; } catch (_) {}
                return tap.apply(this, arguments);
            };
            const dbl = handlers && handlers.handleDoubleTapMessage;
            if (typeof dbl === "function") handlers.handleDoubleTapMessage = function () {
                gesture.handlers = handlers;
                return dbl.apply(this, arguments);
            };
            return handlers;
        }
        MessagesHandlers.prototype = Handlers.prototype;
        try { Object.setPrototypeOf(MessagesHandlers, Handlers); } catch (_) {}
        return replaceValue(exports, "MessagesHandlers", MessagesHandlers);
    }
    function gestureAct(message, channel, chatInputRef) {
        if (!message || !channel) return;
        const own = gestureOwn(message);
        if (own && settings.gestureOwn === "edit" && gestureEdit(message, channel, chatInputRef)) return;
        gestureReply(message, channel, chatInputRef);
    }
    function doubleTapMessage(orig, self, args) {
        if (!enabled("gestures")) return orig.apply(self, args);
        const message = args[0], channel = args[1], id = message && message.id;
        if (!id) return orig.apply(self, args);
        const now = Date.now(), ref = gestureChatInputRef(channel);
        // The taps that just deleted a message can land once more before it disappears: ignore them.
        if (gesture.deleted === id && now - gesture.deletedAt < GESTURE_DELETED_MS) { gestureCancel(); return; }
        if (gesture.pending && gesture.pending.id === id && now - gesture.pendingAt < GESTURE_PAIR_MS) {
            if (settings.gestureTripleDelete && gestureOwn(message) && (!message.state || message.state === "SENT")) { gesture.channel = channel; gestureDeletePending(now); return; }
            gestureCancel(); gestureAct(message, channel, ref);
            return;
        }
        gestureCancel();
        // Nothing waits for a third tap when it couldn't delete anything (including unsent messages).
        if (!settings.gestureTripleDelete || !gestureOwn(message) || message.state && message.state !== "SENT") { gestureAct(message, channel, ref); return; }
        gesture.pending = message; gesture.channel = channel; gesture.chatInputRef = ref; gesture.pendingAt = now;
        gesture.timer = later(() => { gesture.timer = undefined; const waiting = gesture.pending, waitingChannel = gesture.channel, waitingRef = gesture.chatInputRef; gesture.pending = null; gesture.channel = null; gesture.chatInputRef = null;
            // Switching gestures off while it waited used to still open the editor (or reply) a moment later.
            if (waiting === message && enabled("gestures")) gestureAct(message, waitingChannel, waitingRef); }, GESTURE_TRIPLE_MS);
    }
    function hideWhenGestures(orig, self, args) {
        if (React) useSettings("gestures");
        return enabled("gestures") ? null : orig.apply(self, args);
    }
    // Watch: Sam asks, you double-tap to reply and say you're in, Sam says it's at 6 AM, you regret it and triple-tap
    // your message away. Try it: the same chat, with a tip pointing at what to tap next. Both follow your choices below.
    const GESTURE_TAP_MS = 300;
    function GesturePreview(props) {
        useSettings("gestures");
        const s = useChatPreviewStyles(), k = usePreviewChrome(), Press = RN.Pressable || RN.View, [mode, setMode] = usePreviewMode();
        const blank = {mode:null, target:null, gone:false, mine:true, late:false, draft:"", pulse:null, done:{}};
        const [state, setState] = React.useState(blank), taps = React.useRef({who:null, count:0, at:0, timer:undefined});
        React.useEffect(() => () => { const t = taps.current; if (t.timer !== undefined && global.clearTimeout) global.clearTimeout(t.timer); }, []);
        const on = props.on, own = settings.gestureOwn === "edit", triple = settings.gestureTripleDelete, watching = on && mode === "watch";
        const update = change => setState(st => Object.assign({}, st, typeof change === "function" ? change(st) : change));
        const pulse = who => update(st => ({pulse:{who, id:(st.pulse ? st.pulse.n + 1 : 1) + ":" + who, n:st.pulse ? st.pulse.n + 1 : 1}}));
        // The story, built from your settings: what a double-tap on your own message does, and whether triple-tap deletes.
        const story = useStory(watching, () => {
            const steps = [[0, () => setState(Object.assign({}, blank, {mine:false})), tr("Sam asks if anyone wants to play")],
                [1200, () => pulse("theirs"), tr("You double-tap Sam's message")], [200, () => pulse("theirs")],
                [500, () => { animateLayout(); gestureHaptic(); update({mode:"reply", target:"theirs"}); }, tr("A reply to Sam opens, ready to type")]];
            typeSteps(tr("I'm in!"), text => update({draft:text}), 110).forEach(step => steps.push(step));
            steps.push([600, () => { animateLayout(); update({mode:null, target:null, draft:"", mine:true}); }, tr("You send it")],
                [1200, () => { animateLayout(); update({late:true}); }, tr("Then Sam says it starts at 6 AM")]);
            if (triple) steps.push([1000, () => pulse("mine"), tr("You change your mind and tap your message three times")],
                [220, () => pulse("mine")], [220, () => pulse("mine")],
                [500, () => { animateLayout(); gestureHaptic(); update({mode:"deleted", target:"mine", gone:true}); }, tr("It's deleted at once, with no question")],
                [1500, () => {}]);
            else steps.push([1000, () => pulse("mine"), tr("You double-tap your own message")], [200, () => pulse("mine")],
                [500, () => { animateLayout(); update({mode:own ? "edit" : "reply", target:"mine", draft:own ? tr("I'm in!") : ""}); },
                    tr(own ? "It opens for editing, so you can fix it" : "A reply to your own message opens")], [1500, () => {}]);
            return steps;
        }, [own, triple]);
        const act = (who, count) => {
            if (!on || watching) return;
            if (who === "mine" && count >= 3 && triple) {
                animateLayout(); gestureHaptic(); update(st => ({mode:"deleted", target:"mine", gone:true, done:Object.assign({}, st.done, {del:true})}));
                later(() => { animateLayout(); update(st => st.mode === "deleted" ? {mode:null, target:null, gone:false} : {}); }, 2200, false);
                return;
            }
            if (count < 2) return;
            animateLayout(); gestureHaptic();
            update(st => ({mode:who === "mine" && own ? "edit" : "reply", target:who, gone:false,
                done:Object.assign({}, st.done, who === "mine" ? {own:true} : {reply:true})}));
        };
        // Same rule as in chat: a third tap soon after a double-tap deletes your own message instead.
        const tap = who => {
            if (watching) return;
            const t = taps.current, now = Date.now();
            t.count = t.who === who && now - t.at < GESTURE_TAP_MS * 2 ? t.count + 1 : 1; t.who = who; t.at = now;
            if (t.timer !== undefined && global.clearTimeout) global.clearTimeout(t.timer);
            const waitForThird = who === "mine" && triple && t.count === 2;
            if (t.count >= 3 || (t.count === 2 && !waitForThird)) { const n = t.count; t.count = 0; act(who, n); return; }
            if (waitForThird) t.timer = later(() => { t.timer = undefined; if (t.count === 2) { t.count = 0; act(who, 2); } }, GESTURE_TAP_MS * 2, false);
        };
        const switchMode = value => { setMode(value); setState(blank); };
        const Trash = venusIcon(4791, "TrashIcon"), Spine = {borderColor:k.iconMuted.color};
        // Try it: a tip under the message to tap next, step by step, until you've tried everything your options allow.
        const done = state.done, next = !on || watching ? null : !done.reply ? ["theirs", tr("Double-tap Sam's message to reply")] :
            !done.own ? ["mine", tr(own ? "Now double-tap your message to edit it" : "Now double-tap your message to reply to it")] :
            triple && !done.del ? ["mine", tr("Now tap your message three times to delete it")] : null;
        const picked = who => state.target === who && state.mode !== "deleted";
        const replyLine = who => who !== "mine" ? null : el(RN.View, {style:{flexDirection:"row", alignItems:"center", paddingHorizontal:12, paddingTop:4, marginBottom:-2}},
            el(RN.View, {style:[{width:28, height:10, marginLeft:19, marginRight:4, marginTop:6, borderLeftWidth:2, borderTopWidth:2, borderTopLeftRadius:6}, Spine]}),
            el(RN.View, {style:{width:16, height:16, borderRadius:8, backgroundColor:"#eb459e", alignItems:"center", justifyContent:"center", marginRight:4}},
                el(RN.Text, {style:{color:"#ffffff", fontSize:9, fontWeight:"700"}}, "S")),
            el(RN.Text, {style:[s.muted, {fontWeight:"600", marginRight:4}], numberOfLines:1}, "Sam"),
            el(RN.Text, {style:[s.muted, {flex:1}], numberOfLines:1}, tr("Anyone up for a game later?")));
        const message = (who, name, color, time, text) => el(RN.View, {key:who},
            el(Press, {onPress:() => tap(who), accessibilityRole:"button",
                accessibilityHint:tr(who === "mine" ? (own ? "Double-tap to edit" : "Double-tap to reply") : "Double-tap to reply")},
                el(RN.View, {style:picked(who) ? {backgroundColor:"#5865f21f"} : null},
                    picked(who) ? el(RN.View, {style:{position:"absolute", left:0, top:0, bottom:0, width:2, backgroundColor:"#5865f2"}}) : null,
                    replyLine(who),
                    previewMessage(s, who, name, color, time, el(RN.Text, {style:s.text}, text)), tapRipple(state.pulse, who))),
            next && next[0] === who ? previewTip(k, next[1]) : null);
        const showMine = watching ? state.mine && !state.gone : !state.gone;
        const close = watching ? null : () => { animateLayout(); update({mode:null, target:null, gone:false, draft:""}); };
        const bar = state.mode === "deleted" ? previewBar(k, s, Trash, tr("Message deleted"), null) :
            state.mode === "edit" ? previewBar(k, s, null, tr("Editing message"), close) :
            state.mode === "reply" ? previewBar(k, s, null, tr("Replying to {name}", {name:state.target === "mine" ? tr("You") : "Sam"}), close, "bar", true) : null;
        const allDone = on && !watching && !next && done.reply;
        return el(RN.View, {key:"preview"}, on ? previewToggle(mode, switchMode) : null,
            previewScreen(s, "chat", "Tap gestures preview", [
                message("theirs", "Sam", "#eb459e", tr("Today at 4:01 PM"), tr("Anyone up for a game later?")),
                showMine ? message("mine", tr("You"), "#5865f2", tr("Today at 4:02 PM"), tr("I'm in!")) : null,
                watching && state.late ? el(RN.View, {key:"late"}, popIn("late", previewMessage(s, "late", "Sam", "#eb459e", tr("Today at 4:03 PM"),
                    el(RN.Text, {style:s.text}, tr("Great, it starts at 6 AM!"))))) : null,
                allDone ? previewTip(k, tr("That's everything. Double-tap again any time.")) : null],
                {header:previewHeader(k, {title:"general"}),
                 footer:el(RN.View, {key:"foot"}, previewInput(k, s, {bar, text:state.draft, placeholder:tr("Message {channel}", {channel:"#general"})}),
                    watching ? storyStrip(k, s, story) : null)}));
    }
    function GestureSettings() {
        useSettings("gestures");
        const ui = reviewUI();
        if (!RN) return null;
        const on = enabled("gestures");
        const groups = [
            on ? null : offCard("status", venusIcon(8216, "ReactionIcon")),
            el(GesturePreview, {key:"preview", on}),
            radioGroup(ui, "own", "Double-tap your own message", "gestureOwn", on, [
                ["edit", "Edit it", "Opens it for editing, when Discord lets you.", rowIcon(9829, "PencilIcon")],
                ["reply", "Reply to it", "Same as someone else's message.", rowIcon(11108, "ArrowAngleLeftUpIcon")]]),
            el(ui.TableRowGroup || RN.View, {key:"triple", title:tr("Triple-tap")},
                switchRow(ui.TableSwitchRow, "gestureTripleDelete", "Triple-tap to delete", "Tap your own message three times to delete it, with no confirmation. Never affects other people's messages.",
                    rowIcon(4791, "TrashIcon"))),
            footnote("note", "Double-tapping no longer adds a reaction. Hold a message to react instead.")];
        return settingsBody(ui, groups);
    }
    // Quest Completer: finds unfinished Quests and completes them in the background, with no screen.
    // Based on the community quest scripts (aamiaa's gist, CompleteDiscordQuest, Questify), rebuilt on
    // 348.10's own modules: QuestStore (7120), fetchCurrentQuests (9765), questUserStatusFromServer (7127)
    // and the HTTP client (1283). Video, Play and Activity tasks are run; stream tasks need a real Go Live.
    const QUEST_VIDEO_TASKS = ["WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO"], QUEST_ACTIVITY_TASK = "PLAY_ACTIVITY", QUEST_PLAY_TASK = "PLAY_ON_DESKTOP";
    // QuestContent.QUEST_HOME_MOBILE: where Discord's own app says a quest was accepted from.
    const QUEST_HOME_MOBILE = 12;
    // Video progress may run at most ~10 s ahead of the time since accepting; report about every 7 s like the player.
    // Play and Activity heartbeats follow Discord's desktop QuestProgressManager: one a minute, and when less
    // than a minute is left it waits exactly what's left plus one second.
    const QUEST_VIDEO_LEEWAY = 10, QUEST_VIDEO_STEP = 7, QUEST_HEARTBEAT_MS = 60000, QUEST_HEARTBEAT_TAIL_MS = 1000;
    // QuestVariants.MOBILE_ACTIVITY_QUEST: an Activity Quest that Discord's phone app reports itself.
    const QUEST_MOBILE_ACTIVITY = 36;
    // Discord answers 401 when a phone reports play time, so Play and Activity heartbeats are sent as Discord
    // Stable for Windows: host 1.0.9261, web build 634304, updater metadata 93252, Electron 42.11.10.
    const QUEST_DESKTOP = {version:"1.0.9261", build:634304, native:93252, electron:"42.11.10", chrome:"148.0.7778.280",
        osVersion:"10.0.26100", osSdk:"26100"};
    const QUEST_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/" +
        QUEST_DESKTOP.version + " Chrome/" + QUEST_DESKTOP.chrome + " Electron/" + QUEST_DESKTOP.electron + " Safari/537.36";
    // Bits desktop's launch signature keeps clear when it detects no client mod (docs.discord.food, Launch Signature).
    const QUEST_SIGNATURE_BITS = [119, 108, 100, 91, 84, 75, 61, 55, 48, 38, 24, 11];
    const QUEST_HEARTBEAT_SESSION_MS = 30 * 60 * 1000;
    const QUEST_REFETCH_MS = 30 * 60 * 1000, QUEST_RETRY_MS = 30 * 60 * 1000, QUEST_REFUSED_MS = 6 * 60 * 60 * 1000, QUEST_OFFLINE_MS = 5 * 60 * 1000;
    // Heartbeats in a row that Discord answers without counting any more time before Quest Completer gives up for now.
    const QUEST_STALLED_BEATS = 5;
    const quest = {store:null, dispatcher:null, generation:0, running:null, enrolling:false, skip:new Map(), enrollBlockedUntil:0,
        scanTimer:undefined, refetchTimer:undefined, user:null, completed:0, last:"", error:"", desktop:null, executables:new Map()};
    function questSleep(ms) { return new Promise(resolve => { later(resolve, ms); }); }
    function questStore() {
        if (quest.store) return quest.store;
        const store = inspectedExport(7120, "default");
        if (!store || typeof store.getQuest !== "function") return null;
        questAttach(store);
        return store;
    }
    function questAttach(store) {
        if (quest.store || !store || typeof store.getQuest !== "function") return;
        quest.store = store;
        if (typeof store.addChangeListener === "function") store.addChangeListener(questsChanged);
    }
    // Store updates arrive in bursts (fetch, enroll, progress). One scan per burst is enough.
    function questsChanged() { if (enabled("quests")) questsSchedule(1500); }
    function questsSchedule(ms) {
        if (quest.scanTimer !== undefined || typeof global.setTimeout !== "function") return;
        quest.scanTimer = global.setTimeout(questsScan, ms);
    }
    // Kept as the English text and its parts, and put in the settings language when shown.
    function questStatus(text, error, vars) {
        const status = {text, vars};
        if (error) quest.error = status; else { quest.last = status; quest.error = ""; }
        notify("quests");
    }
    // Discord's HTTP client (its auth and headers), with this request's own interceptResponse. Discord asks
    // it before its global handler (captcha, MFA, restricted-hours screens), so taking every failed response
    // here means a challenge just fails the request quietly instead of opening a screen.
    function questIntercept(response, retry, cancel) {
        if (!response || response.ok || typeof cancel !== "function") return false;
        const error = new Error("HTTP " + response.status);
        error.status = response.status; error.body = response.body;
        cancel(error);
        return true;
    }
    // desktop: send this request as the Windows desktop app. Only Play and Activity heartbeats (and the game
    // lookup that names their executable) do; enrolling and video progress stay the phone, which Discord accepts.
    function questRequest(url, body, desktop, method) {
        const http = inspectedExport(1283, "HTTP"), send = http && http[method || "post"];
        if (typeof send !== "function") return Promise.reject(new Error("Discord's network client isn't ready"));
        const request = {url, interceptResponse:questIntercept};
        if (body !== undefined) request.body = body;
        if (desktop) request.onRequestCreated = questDesktopRequest;
        return Promise.resolve().then(() => send.call(http, request));
    }
    function questHex(count) { let hex = ""; for (let i = 0; i < count; i++) hex += Math.floor(Math.random() * 16).toString(16); return hex; }
    function questUuidText(hex) { return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20, 32); }
    // RFC 4122 version 4, like crypto.randomUUID().
    function questUuid() { const hex = questHex(32); return hex.slice(0, 12) + "4" + hex.slice(13, 16) + "89ab"[Math.floor(Math.random() * 4)] + hex.slice(17); }
    // A random UUID with every client-mod bit cleared, the way desktop makes one when it detects no mods.
    function questLaunchSignature() {
        const digits = questUuid().split("").map(c => parseInt(c, 16));
        for (const bit of QUEST_SIGNATURE_BITS) { const i = 31 - Math.floor(bit / 4); digits[i] &= ~(1 << bit % 4); }
        return questUuidText(digits.map(d => d.toString(16)).join(""));
    }
    function questBase64(text) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", bytes = [];
        for (const c of unescape(encodeURIComponent(text))) bytes.push(c.charCodeAt(0));
        let out = "";
        for (let i = 0; i < bytes.length; i += 3) {
            const n = bytes[i] << 16 | (bytes[i + 1] || 0) << 8 | (bytes[i + 2] || 0);
            out += chars[n >> 18 & 63] + chars[n >> 12 & 63] + (i + 1 < bytes.length ? chars[n >> 6 & 63] : "=") + (i + 2 < bytes.length ? chars[n & 63] : "=");
        }
        return out;
    }
    function questLocale() {
        try {
            const read = inspectedExport(1348, "getSuperProperties"), own = typeof read === "function" ? read() : null;
            const locale = own && own.system_locale;
            if (typeof locale === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) return locale;
        } catch (_) {}
        return "en-US";
    }
    // One desktop launch per Discord launch: its launch id and signature stay the same, and the analytics
    // heartbeat session id rolls over every 30 minutes like desktop's. The locale is the phone's own.
    function questDesktopProperties() {
        const now = Date.now();
        const identity = quest.desktop || (quest.desktop = {launch:questUuidText(questUuid()), signature:questLaunchSignature(),
            locale:questLocale(), session:"", sessionAt:0});
        if (!identity.session || now - identity.sessionAt >= QUEST_HEARTBEAT_SESSION_MS) { identity.session = questUuidText(questUuid()); identity.sessionAt = now; }
        // Same keys, in the same order, as desktop's getSuperProperties.
        const properties = {os:"Windows", browser:"Discord Client", release_channel:"stable", client_version:QUEST_DESKTOP.version,
            os_version:QUEST_DESKTOP.osVersion, os_arch:"x64", app_arch:"x64", system_locale:identity.locale, has_client_mods:false,
            client_launch_id:identity.launch, browser_user_agent:QUEST_DESKTOP_UA, browser_version:QUEST_DESKTOP.electron,
            os_sdk_version:QUEST_DESKTOP.osSdk, client_build_number:QUEST_DESKTOP.build, native_build_number:QUEST_DESKTOP.native,
            client_event_source:null, launch_signature:identity.signature, client_heartbeat_session_id:identity.session,
            client_app_state:"unfocused"};
        try {
            const encode = inspectedExport(1283, "encodeProperties"), encoded = typeof encode === "function" ? encode(properties) : null;
            if (typeof encoded === "string" && encoded) return encoded;
        } catch (_) {}
        return questBase64(JSON.stringify(properties));
    }
    // Discord's HTTP client hands over the request before its prepareRequest adds the phone's X-Super-Properties,
    // so those headers are swapped as they're set. The native User-Agent interceptor leaves this Windows agent
    // alone (see questCompleter in DiscordPatches.kt); every other request still says Discord-Android.
    function questDesktopRequest(request) {
        if (!request || typeof request.set !== "function") return;
        const properties = questDesktopProperties(), set = request.set;
        const value = (name, original) => {
            const key = String(name).toLowerCase();
            return key === "x-super-properties" ? properties : key === "user-agent" ? QUEST_DESKTOP_UA : original;
        };
        request.set = function (name, original) {
            if (name && typeof name === "object") {
                const copy = {};
                for (const key of Object.keys(name)) copy[key] = value(key, name[key]);
                return set.call(this, copy);
            }
            return set.call(this, name, value(name, original));
        };
        request.set("User-Agent", QUEST_DESKTOP_UA);
        request.set("X-Super-Properties", properties);
    }
    // QuestStore exposes these as getters in 348.10; accept a method too.
    function questFlag(store, key) {
        try { const value = store[key]; return typeof value === "function" ? value.call(store) : value; } catch (_) { return undefined; }
    }
    function questDispatch(action) {
        const dispatcher = quest.dispatcher || inspectedExport(585, "default");
        try {
            if (!dispatcher || typeof dispatcher.dispatch !== "function") return false;
            const result = dispatcher.dispatch(action);
            if (result && typeof result.catch === "function") result.catch(() => {});
            return true;
        } catch (_) { return false; }
    }
    function questUserStatus(body) {
        const convert = inspectedExport(7127, "questUserStatusFromServer");
        try { return body && typeof convert === "function" ? convert(body) : null; } catch (_) { return null; }
    }
    function questRetryAfter(error) {
        const body = error && error.body, value = body && (body.retry_after != null ? body.retry_after : body.retryAfter);
        const seconds = Number(value != null ? value : error && error.retryAfter);
        return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) * 1000 : error && error.status === 429 ? 60000 : 0;
    }
    function questTime(value) {
        if (value == null || value === "") return NaN;
        const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
        return Number.isFinite(time) ? time : NaN;
    }
    function questName(item) {
        const messages = item && item.config && item.config.messages;
        return messages && typeof messages.questName === "string" && messages.questName ? messages.questName : "a Quest";
    }
    // The game a Play or Activity task counts time for. Since mid-2026 it lives on the task
    // (taskConfigV2.tasks.<TYPE>.applications[0].id); older quests carry it on config.application.
    function questApplication(item, task) {
        const apps = task && task.applications, first = Array.isArray(apps) ? apps.find(app => app && app.id) : null;
        const id = first ? first.id : item && item.config && item.config.application && item.config.application.id;
        return id != null && /^\d{5,25}$/.test(String(id)) ? String(id) : null;
    }
    // The first task this phone can do, in the order the settings allow.
    function questTask(item) {
        const config = item && item.config, tasks = config && (config.taskConfigV2 || config.taskConfig);
        const all = tasks && tasks.tasks;
        if (!all || typeof all !== "object") return null;
        if (settings.questsVideo) for (const type of QUEST_VIDEO_TASKS) {
            const target = Number(all[type] && all[type].target);
            if (target > 0) return {type, target, kind:"video"};
        }
        // "Play <game> for 15 minutes": the same heartbeat Discord's desktop app sends while the game runs.
        const play = all[QUEST_PLAY_TASK], playTarget = Number(play && play.target), playApp = questApplication(item, play);
        if (settings.questsPlay && playTarget > 0 && playApp) return {type:QUEST_PLAY_TASK, target:playTarget, kind:"play", applicationId:playApp};
        const activity = all[QUEST_ACTIVITY_TASK], target = Number(activity && activity.target);
        const activityApp = questApplication(item, activity), features = config.features;
        const mobile = Array.isArray(features) && features.includes(QUEST_MOBILE_ACTIVITY);
        if (settings.questsActivity && target > 0 && activityApp) return {type:QUEST_ACTIVITY_TASK, target, kind:"activity", applicationId:activityApp, mobile};
        return null;
    }
    function questProgress(item, type) {
        const progress = item && item.userStatus && item.userStatus.progress, value = Number(progress && progress[type] && progress[type].value);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }
    function questOpen(item, now) {
        if (!item || typeof item.id !== "string" || !item.config) return false;
        if (item.userStatus && item.userStatus.completedAt) return false;
        const expires = questTime(item.config.expiresAt);
        return !(expires <= now + 60000) && !((quest.skip.get(item.id) || 0) > now);
    }
    function questsScan() {
        quest.scanTimer = undefined;
        if (!enabled("quests")) return;
        const store = questStore();
        if (!store) return;
        if (questFlag(store, "isQuestAccessSuspended") === true) { if (!quest.error) questStatus("Discord has paused Quests on this account.", true); return; }
        let all;
        try { all = store.quests; } catch (_) { return; }
        if (!all || typeof all.values !== "function") return;
        const now = Date.now(), ready = [], waiting = [];
        for (const item of all.values()) {
            if (!questOpen(item, now) || !questTask(item)) continue;
            if (item.userStatus && item.userStatus.enrolledAt) ready.push(item); else if (settings.questsEnroll) waiting.push(item);
        }
        // Soonest-expiring first, so nothing runs out while another quest is going.
        const expiry = item => { const time = questTime(item.config.expiresAt); return Number.isFinite(time) ? time : Infinity; };
        const soonest = (a, b) => expiry(a) - expiry(b);
        ready.sort(soonest); waiting.sort(soonest);
        const blocked = quest.enrollBlockedUntil > now || questTime(questFlag(store, "questEnrollmentBlockedUntil")) > now;
        if (waiting.length && !quest.enrolling && !blocked) questEnroll(waiting[0]);
        if (!quest.running && ready.length) questRun(ready[0]);
    }
    // Accepting one at a time, a few seconds apart. Includes Discord's own QuestDataUtils (7116) ad decision and
    // sealed metadata fields (matching _enrollInQuest in 9765) so the enrollment body is identical to a manual tap.
    function questEnrollBody(id) {
        const body = {location:QUEST_HOME_MOBILE};
        const data = global.__r && global.__r(7116);
        try {
            const decision = data && typeof data.getAdDecisionData === "function" ? data.getAdDecisionData(id, QUEST_HOME_MOBILE) : null;
            if (decision && typeof decision === "object") Object.assign(body, decision);
        } catch (_) {}
        let meta = null, traffic = null;
        try { if (data && typeof data.getAdMetadataSealed === "function") meta = data.getAdMetadataSealed(QUEST_HOME_MOBILE, id); } catch (_) {}
        try { if (data && typeof data.getAdTrafficMetadataSealed === "function") traffic = data.getAdTrafficMetadataSealed(QUEST_HOME_MOBILE, id); } catch (_) {}
        body.metadata_sealed = meta != null ? meta : null;
        body.traffic_metadata_sealed = traffic != null ? traffic : null;
        return body;
    }
    function questEnroll(item) {
        const generation = quest.generation, id = item.id;
        quest.enrolling = true;
        backgroundSync();
        questRequest("/quests/" + id + "/enroll", questEnrollBody(id)).then(response => {
            if (generation !== quest.generation) return;
            const status = questUserStatus(response && response.body);
            if (!status || !questDispatch({type:"QUESTS_ENROLL_SUCCESS", enrolledQuestUserStatus:status})) questsFetch(true);
        }, error => {
            if (generation !== quest.generation) return;
            const wait = questRetryAfter(error);
            if (wait) quest.enrollBlockedUntil = Date.now() + wait;
            // Only a real answer from Discord (refused, captcha) leaves the Quest alone for hours. No connection
            // means Discord never saw the request, so it's tried again sooner.
            const refused = error && Number.isFinite(error.status) && error.status > 0;
            quest.skip.set(id, Date.now() + Math.max(wait, refused ? QUEST_REFUSED_MS : QUEST_OFFLINE_MS));
        }).then(() => {
            if (generation !== quest.generation) return;
            quest.enrolling = false;
            backgroundSync();
            questsSchedule(3000 + Math.floor(Math.random() * 2000));
        });
    }
    function questActive(entry) { return quest.running === entry && entry.generation === quest.generation && enabled("quests"); }
    function questRun(item) {
        const task = questTask(item), entry = {id:item.id, task, generation:quest.generation, name:questName(item)};
        quest.running = entry;
        backgroundSync();
        notify("quests");
        const work = task.kind === "video" ? questVideo(entry, item) : task.kind === "play" ? questPlay(entry) : questActivity(entry);
        work.then(done => {
            if (!done || entry.generation !== quest.generation) return;
            quest.completed++;
            // The store's own update follows; don't pick the same quest again in the meantime.
            quest.skip.set(entry.id, Date.now() + 10 * 60 * 1000);
            questStatus("Completed {name}.", false, {name:entry.name});
        }, error => {
            if (entry.generation !== quest.generation) return;
            const wait = questRetryAfter(error);
            quest.skip.set(entry.id, Date.now() + Math.max(wait, QUEST_RETRY_MS));
            questStatus("Couldn't finish {name}: {problem}", true, {name:entry.name, problem:String(error && error.message || error)});
        }).then(() => {
            if (quest.running === entry) { quest.running = null; backgroundSync(); notify("quests"); }
            if (entry.generation === quest.generation) questsSchedule(2000 + Math.floor(Math.random() * 2000));
        });
    }
    // Mirrors the server's answer into QuestStore, so Discord's own Quest screens stay right.
    // How far the running Quest is, for the progress bar on the Quests page. Only that page listens.
    function questProgressed(entry, value) {
        const n = Number(value);
        if (!Number.isFinite(n) || quest.running !== entry) return;
        entry.progress = Math.max(0, Math.min(entry.task.target, n));
        notify("quests");
    }
    function questVideoStatus(response) {
        const body = response && response.body;
        if (body && body.quest_id) questDispatch({type:"QUESTS_USER_STATUS_UPDATE", user_status:body});
        return !!(body && body.completed_at);
    }
    function questOptimisticProgress(id, taskType, progress) {
        const update = inspectedExport(9765, "updateOptimisticProgress");
        try { if (typeof update === "function") update(id, taskType, progress); } catch (_) {}
    }
    async function questVideo(entry, item) {
        const enrolled = questTime(item.userStatus && item.userStatus.enrolledAt), target = entry.task.target;
        if (!Number.isFinite(enrolled)) throw new Error("no accepted time");
        let done = questProgress(item, entry.task.type), completed = false;
        questProgressed(entry, done);
        while (questActive(entry) && done < target) {
            const step = 6 + Math.random() * 2;
            const allowed = (Date.now() - enrolled) / 1000 + QUEST_VIDEO_LEEWAY, next = Math.min(target, done + step);
            if (allowed < next) { await questSleep(Math.max(1000, Math.ceil((next - allowed) * 1000))); continue; }
            const timestamp = next < target ? Math.min(target, next + Math.random() * 0.5) : target;
            questOptimisticProgress(entry.id, entry.task.type, timestamp);
            const response = await questRequest("/quests/" + entry.id + "/video-progress", {timestamp});
            if (!questActive(entry)) return false;
            completed = questVideoStatus(response);
            done = next;
            questProgressed(entry, done);
            if (completed) break;
            await questSleep(1000 + Math.floor(Math.random() * 500));
        }
        if (!questActive(entry)) return false;
        if (!completed) {
            questOptimisticProgress(entry.id, entry.task.type, target);
            completed = questVideoStatus(await questRequest("/quests/" + entry.id + "/video-progress", {timestamp:target}));
        }
        return completed;
    }
    // The executable_path desktop reports for a running game: the last two parts of its lowercase path, the way
    // its QuestProgressManager trims exePath (973522 Ic). Discord's own list of the game's Windows executables
    // is read once per game, and a test build, launcher or helper is never the one picked.
    function questExecutableName(app) {
        const all = app && Array.isArray(app.executables) ? app.executables : [];
        const rank = name => (/(^|[\/_.-])(test|launcher|crash|helper|setup|update|install|unins)/i.test(name) ? 2 : 0) + (name.includes("/") ? 1 : 0);
        const names = all.filter(e => e && e.os === "win32" && !e.is_launcher && typeof e.name === "string" && /\.exe$/i.test(e.name))
            .map(e => e.name.replace(/^>/, "").replace(/\\/g, "/").toLowerCase()).filter(name => !/(^|\/)\.\.(\/|$)/.test(name));
        names.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
        return names[0] || null;
    }
    function questExecutablePath(app, exe) {
        const parts = exe.split("/").filter(Boolean);
        if (parts.length >= 2) return parts.slice(-2).join("/");
        const folder = String(app && app.name || "").toLowerCase().replace(/[<>:"\/\\|?*]/g, "").trim();
        return folder ? folder + "/" + parts[0] : null;
    }
    async function questExecutable(applicationId) {
        if (quest.executables.has(applicationId)) return quest.executables.get(applicationId);
        let path = null;
        try {
            const response = await questRequest("/applications/public?application_ids=" + applicationId, undefined, true, "get");
            const list = response && response.body, app = Array.isArray(list) ? list.find(a => a && String(a.id) === applicationId) : null;
            const exe = questExecutableName(app);
            if (exe) path = questExecutablePath(app, exe);
            // Only Discord's answer is remembered. A dropped connection used to leave the game unnamed until Discord restarted.
            if (quest.executables.size >= 64) quest.executables.delete(quest.executables.keys().next().value);
            quest.executables.set(applicationId, path);
        } catch (_) {}
        // Unknown is fine: desktop sends no path for a game it can't place either.
        return path;
    }
    // Same body as Discord's own sendHeartbeat (9765): application_id names the game or Activity, and a game
    // also says which executable is running. Play and Activity heartbeats go out as Discord for Windows.
    async function questHeartbeat(entry, desktop) {
        const body = {application_id:entry.task.applicationId, terminal:false};
        if (entry.executablePath) body.executable_path = entry.executablePath;
        const response = await questRequest("/quests/" + entry.id + "/heartbeat", body, desktop);
        const reply = response && response.body, status = questUserStatus(reply), type = entry.task.type;
        if (status) questDispatch({type:"QUESTS_SEND_HEARTBEAT_SUCCESS", questId:entry.id, userStatus:status});
        const value = Number(reply && reply.progress && reply.progress[type] && reply.progress[type].value);
        return {value:Number.isFinite(value) ? value : 0, completed:!!(reply && reply.completed_at)};
    }
    // Desktop's pace: a beat right away, then one a minute. With under a minute left it waits what's left plus a
    // second, and stops once Discord says the Quest is done. A finished Quest gets no terminal beat on desktop.
    async function questBeat(entry, desktop) {
        const target = entry.task.target;
        let best = -1, stalled = 0;
        while (questActive(entry)) {
            const beat = await questHeartbeat(entry, desktop);
            if (!questActive(entry)) return false;
            questProgressed(entry, beat.value);
            if (beat.completed || beat.value >= target) return true;
            // A Quest Discord stops counting used to get a heartbeat every minute for as long as Discord stayed open.
            if (beat.value > best) { best = beat.value; stalled = 0; }
            else if (++stalled >= QUEST_STALLED_BEATS) throw new Error("Discord stopped counting time");
            const left = Math.max(0, (target - beat.value) * 1000);
            await questSleep(left <= QUEST_HEARTBEAT_MS ? left + QUEST_HEARTBEAT_TAIL_MS : QUEST_HEARTBEAT_MS);
        }
        return false;
    }
    // Activity Quests: Discord counts time in the Activity without it being started. A mobile Activity Quest is
    // one the phone app reports itself, so only the others are sent as desktop.
    function questActivity(entry) { return questBeat(entry, !entry.task.mobile); }
    // Play Quests: Discord counts time for the quest's game without it being installed or started.
    async function questPlay(entry) {
        entry.executablePath = await questExecutable(entry.task.applicationId);
        if (!questActive(entry)) return false;
        return questBeat(entry, true);
    }
    // Mobile only loads Quests when you open them; ask for them once in a while, through Discord's own fetch.
    function questsFetch(force) {
        const store = questStore(), fetch = inspectedExport(9765, "fetchCurrentQuests");
        if (!store || typeof fetch !== "function") return;
        try {
            if (questFlag(store, "isFetchingCurrentQuests") === true) return;
            const last = questTime(questFlag(store, "lastFetchedCurrentQuests")) || 0;
            if (!force && last && Date.now() - last < QUEST_REFETCH_MS) return;
            const result = fetch();
            if (result && typeof result.catch === "function") result.catch(() => {});
        } catch (_) {}
    }
    function questsRefetchLoop() {
        quest.refetchTimer = undefined;
        if (!enabled("quests") || typeof global.setTimeout !== "function") return;
        questsFetch(false); questsSchedule(1000);
        quest.refetchTimer = global.setTimeout(questsRefetchLoop, QUEST_REFETCH_MS);
    }
    function questsStart(delay) {
        if (!enabled("quests") || typeof global.setTimeout !== "function") return;
        if (quest.refetchTimer !== undefined && global.clearTimeout) global.clearTimeout(quest.refetchTimer);
        quest.refetchTimer = global.setTimeout(questsRefetchLoop, delay);
    }
    // Stops everything in flight: switching it off, logging out, or another account signing in.
    function questsStop() {
        quest.generation++;
        quest.running = null; quest.enrolling = false; quest.enrollBlockedUntil = 0; quest.skip.clear();
        if (global.clearTimeout) {
            if (quest.scanTimer !== undefined) global.clearTimeout(quest.scanTimer);
            if (quest.refetchTimer !== undefined) global.clearTimeout(quest.refetchTimer);
        }
        quest.scanTimer = undefined; quest.refetchTimer = undefined;
        backgroundSync();
    }
    function questsReset() { questsStop(); quest.completed = 0; quest.last = ""; quest.error = ""; notify("quests"); }
    function questsConnected(event) {
        const id = event && event.user && event.user.id;
        if (id && quest.user && id !== quest.user) questsReset();
        if (id) quest.user = id;
        // A reconnect keeps the quest that's running; a first connect waits for Discord to settle.
        questsStart(8000);
    }
    function questsInit(dispatcher) {
        if (quest.dispatcher || !dispatcher || typeof dispatcher.subscribe !== "function") return;
        quest.dispatcher = dispatcher;
        dispatcher.subscribe("CONNECTION_OPEN", questsConnected);
        dispatcher.subscribe("LOGOUT", () => { questsReset(); quest.user = null; });
    }
    // Discord can connect before the saved settings finish loading. Quest Completer was still off at that
    // moment, so it never started until the next reconnect. Start it now if Discord is already connected.
    function questsLoaded() {
        if (quest.user && quest.refetchTimer === undefined && !quest.running) questsStart(8000);
    }
    function questsSettingChanged(key, value) {
        if (key === "quests" && !value) { questsStop(); return; }
        if (!enabled("quests")) return;
        if (key === "quests") { questsStart(1000); return; }
        // Turning a quest type off stops that kind if it's the one running.
        const running = quest.running && quest.running.task;
        if (!value && running && (key === "questsVideo" && running.kind === "video" || key === "questsActivity" && running.kind === "activity" ||
            key === "questsPlay" && running.kind === "play")) {
            quest.generation++; quest.running = null; quest.enrolling = false;
            if (quest.scanTimer !== undefined && global.clearTimeout) global.clearTimeout(quest.scanTimer);
            quest.scanTimer = undefined;
            backgroundSync();
        }
        questsSchedule(1000);
    }
    function questStatusText() {
        if (!enabled("quests")) return "Turned off. Switch it on in Features to start.";
        const lines = [quest.completed ? pl(quest.completed, "Completed {n} Quest since Discord opened.", "Completed {n} Quests since Discord opened.") : tr("Waiting for new Quests.")];
        if (quest.running) {
            const share = questShare(), left = share != null ? Math.ceil((quest.running.task.target - quest.running.progress) / 60) : 0;
            lines.push(tr("Now: {name}.", {name:quest.running.name}) + (share != null && left > 0 ? " " + pl(left, "About {n} minute left.", "About {n} minutes left.") : ""));
        }
        if (quest.last) lines.push(tr("Last: {name}", {name:tr(quest.last.text, quest.last.vars)}));
        if (quest.error) lines.push(tr(quest.error.text, quest.error.vars));
        return lines.join("\n");
    }
    // The running Quest's progress, 0 to 1, or null before its first report.
    function questShare() {
        const entry = quest.running, target = entry && entry.task && entry.task.target;
        return entry && target > 0 && typeof entry.progress === "number" ? entry.progress / target : null;
    }
    function questStatusTitle() {
        if (quest.error) return tr("Something went wrong");
        if (quest.running) return tr("Completing a Quest");
        return quest.completed ? pl(quest.completed, "{n} Quest done", "{n} Quests done") : tr("Watching for Quests");
    }
    // Settings page: the Quest types, a status card and what to know.
    function QuestSettings() {
        // Every status change (start, finish, error) already notifies "quests"; no 5-second redraw timer.
        useSettings("quests");
        const ui = reviewUI();
        if (!RN) return null;
        const Group = ui.TableRowGroup || RN.View, Switch = ui.TableSwitchRow, on = enabled("quests");
        const toggle = (key, label, subLabel, icon) => switchRow(Switch, key, label, subLabel, icon);
        const groups = [
            on ? statusCard("status", questStatusText(), {title:questStatusTitle(), IconComponent:venusIcon(quest.error ? 11840 : quest.running ? 10968 : 14519,
                quest.error ? "ChatWarningIcon" : quest.running ? "TimerIcon" : "QuestsIcon"),
                footer:questShare() != null ? el(VenusProgress, {key:"progress:" + quest.running.id, value:questShare()}) : null}) : offCard("status", venusIcon(14519, "QuestsIcon")),
            el(Group, {key:"types", title:tr("Quests to complete")},
                toggle("questsVideo", "Video Quests", "Reported as watched at normal speed, without playing the video.", rowIcon(10976, "VideoIcon")),
                toggle("questsPlay", "Play Quests", "Play time counts without installing or opening the game.", rowIcon(8532, "GameControllerIcon")),
                toggle("questsActivity", "Activity Quests", "Activity time counts without starting the Activity.", rowIcon(12246, "MagicWandIcon"))),
            el(Group, {key:"enroll", title:tr("New Quests")},
                toggle("questsEnroll", "Accept new Quests", "Accepts Quests you haven't started, one at a time. Off: only Quests you accept yourself.", rowIcon(4793, "CircleCheckIcon"))),
            footnote("note", "You still claim rewards yourself. Stream Quests need a real stream, so they're skipped. Discord may pause Quests on accounts that complete them automatically.")];
        return settingsBody(ui, groups);
    }
    // Motion, from React Native's own Animated and LayoutAnimation. Opacity, position and scale run on the native
    // driver, so nothing extra runs in JS while a page animates. Without them, or with Android's "Remove animations"
    // on, everything simply shows at once.
    let reduceMotion = false, reduceMotionAsked = false;
    function motion() {
        const A = RN && RN.Animated;
        if (!A || typeof A.timing !== "function" || typeof A.Value !== "function") return null;
        if (!reduceMotionAsked) {
            reduceMotionAsked = true;
            const info = RN.AccessibilityInfo;
            try { if (info && typeof info.isReduceMotionEnabled === "function") Promise.resolve(info.isReduceMotionEnabled()).then(on => { reduceMotion = !!on; }, () => {}); } catch (_) {}
            try { if (info && typeof info.addEventListener === "function") info.addEventListener("reduceMotionChanged", on => { reduceMotion = !!on; }); } catch (_) {}
        }
        return A;
    }
    // The next layout change on screen eases into place instead of jumping: rows that appear, a bar that widens.
    function animateLayout() {
        const animate = RN && RN.LayoutAnimation;
        if (reduceMotion || !animate || typeof animate.configureNext !== "function") return;
        try { animate.configureNext(typeof animate.create === "function" ? animate.create(200, "easeInEaseOut", "opacity") : animate.Presets.easeInEaseOut); } catch (_) {}
    }
    function easeOut() { const E = RN && RN.Easing; try { return E && E.out && E.cubic ? E.out(E.cubic) : undefined; } catch (_) { return undefined; } }
    // An option page's groups rise into place one after another when the page opens, and a row group that
    // appears later (Manage, a hex box) fades in the same way.
    function VenusReveal(props) {
        const A = motion(), ref = React.useRef(null);
        if (!ref.current && A) {
            const value = new A.Value(reduceMotion ? 1 : 0);
            ref.current = {value, style:{opacity:value, transform:[{translateY:value.interpolate({inputRange:[0, 1], outputRange:[14, 0]})}]}};
        }
        React.useEffect(() => {
            const state = ref.current;
            if (!state || reduceMotion) return undefined;
            const run = A.timing(state.value, {toValue:1, duration:280, delay:Math.min(props.index || 0, 6) * 45, easing:easeOut(), useNativeDriver:true});
            run.start();
            return () => { run.stop(); state.value.setValue(1); };
        }, []);
        return ref.current ? el(A.View, {style:ref.current.style}, props.children) : props.children;
    }
    // A check mark or choice that pops in with a small spring when it's picked.
    function PopIn(props) {
        const A = motion(), ref = React.useRef(null);
        if (!ref.current && A) {
            const value = new A.Value(reduceMotion ? 1 : 0);
            ref.current = {value, style:{opacity:value.interpolate({inputRange:[0, 1], outputRange:[0, 1], extrapolate:"clamp"}),
                transform:[{scale:value.interpolate({inputRange:[0, 1], outputRange:[0.4, 1]})}]}};
        }
        React.useEffect(() => {
            const state = ref.current;
            if (!state || reduceMotion || typeof A.spring !== "function") { if (state) state.value.setValue(1); return undefined; }
            const run = A.spring(state.value, {toValue:1, speed:20, bounciness:12, useNativeDriver:true});
            run.start();
            return () => run.stop();
        }, []);
        return ref.current ? el(A.View, {style:ref.current.style, pointerEvents:"none"}, props.children) : props.children;
    }
    function popIn(key, child) { return child ? el(PopIn, {key}, child) : child; }
    // Every preview can be watched or tried. Watch plays a short story of the feature on a loop; Try it lets you tap the
    // preview yourself. The choice is shared by every page until Discord restarts, so you only pick it once.
    let previewModeChoice = "watch";
    function usePreviewMode() {
        const [mode, setMode] = React.useState(previewModeChoice);
        return [mode, value => { previewModeChoice = value; animateLayout(); setMode(value); }];
    }
    // Steps that type text into a preview's message box one letter at a time.
    function typeSteps(text, set, ms) { return Array.from(text).map((_, i) => [ms || 70, () => set(text.slice(0, i + 1))]); }
    // Where the demo's finger taps: a soft circle that grows and fades once each time it mounts (key it on the tap).
    function TapRipple(props) {
        const A = motion(), ref = React.useRef(null);
        if (!ref.current && A) ref.current = new A.Value(0);
        React.useEffect(() => {
            const value = ref.current;
            if (!value || reduceMotion) return undefined;
            const run = A.timing(value, {toValue:1, duration:420, easing:easeOut(), useNativeDriver:true});
            run.start();
            return () => run.stop();
        }, []);
        const base = Object.assign({position:"absolute", width:34, height:34, borderRadius:17, backgroundColor:"#ffffff"}, props.at || {right:22, top:14});
        if (!ref.current) return el(RN.View, {pointerEvents:"none", style:[base, {opacity:0.25}]});
        return el(A.View, {pointerEvents:"none", style:[base, {opacity:ref.current.interpolate({inputRange:[0, 1], outputRange:[0.45, 0]}),
            transform:[{scale:ref.current.interpolate({inputRange:[0, 1], outputRange:[0.5, 1.7]})}]}]});
    }
    function tapRipple(pulse, who, at) { return pulse && pulse.who === who ? el(TapRipple, {key:"tap:" + pulse.id, at}) : null; }
    const PREVIEW_TOGGLE_DARK = {wrap:{flexDirection:"row", alignSelf:"flex-end", padding:3, gap:3, borderRadius:16, backgroundColor:"#1e1f22", marginHorizontal:12, marginBottom:4},
        on:{flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:10, paddingVertical:5, borderRadius:13, backgroundColor:"#4e5058"},
        off:{flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:10, paddingVertical:5, borderRadius:13}};
    // The small Watch / Try it switch at the top of a preview, in Discord's segmented-control colors. Its own component,
    // so a preview can show it only while the feature is on without changing the preview's hooks.
    function previewToggle(mode, setMode) { return el(PreviewToggle, {key:"toggle", mode, setMode}); }
    function PreviewToggle(props) {
        const mode = props.mode, setMode = props.setMode;
        const s = useThemed("previewToggle", c => ({wrap:Object.assign({}, PREVIEW_TOGGLE_DARK.wrap, {backgroundColor:c.MOBILE_SEGMENTED_CONTROL_BACKGROUND}),
            on:Object.assign({}, PREVIEW_TOGGLE_DARK.on, {backgroundColor:c.MOBILE_SEGMENTED_CONTROL_INDICATOR_BACKGROUND}), off:PREVIEW_TOGGLE_DARK.off}), PREVIEW_TOGGLE_DARK);
        const Text = inspectedExport(4833, "Text"), Press = RN.Pressable || RN.View;
        const pill = (value, label, Icon) => el(Press, {key:value, style:mode === value ? s.on : s.off, accessibilityRole:"button", accessibilityLabel:tr(label),
            accessibilityState:{selected:mode === value}, onPress:() => { if (mode !== value) setMode(value); }, hitSlop:{top:6, bottom:6, left:4, right:4}},
            el(Icon, {size:"xxs", color:mode === value ? undefined : "#949ba4"}),
            Text ? el(Text, {variant:"text-xs/semibold", color:mode === value ? "interactive-text-active" : "text-muted"}, tr(label)) :
                el(RN.Text, {style:{fontSize:12, fontWeight:"600", color:mode === value ? "#ffffff" : "#949ba4"}}, tr(label)));
        return el(RN.View, {key:"toggle", style:s.wrap}, pill("watch", "Watch", venusIcon(7726, "PlayIcon")), pill("try", "Try it", venusIcon(9370, "HandRequestSpeakIcon")));
    }
    // Watch plays like a short video: a story is a list of [wait ms, step, caption?]. Each caption stays up long enough
    // to read (storyPlan stretches the wait before the next one), the clock ticks once a second, and a bar under the
    // preview shows where it is, how long it is, and lets you pause or start over. It loops, and starts over when the
    // options below change. Its timers end when you switch to Try it or leave the page.
    function readMs(text) { return Math.max(2400, Math.min(5000, 1500 + 55 * String(text || "").length)); }
    function storyPlan(list) {
        const out = list.filter(Boolean).map(step => step.slice());
        let last = null, since = 0;
        out.forEach(step => {
            if (step[2] && last !== null && since + step[0] < readMs(last)) step[0] += readMs(last) - since - step[0];
            if (step[2]) { last = step[2]; since = 0; } else since += step[0];
        });
        if (last !== null && since < readMs(last)) out.push([readMs(last) - since, () => {}]);
        return out;
    }
    function useStory(active, build, deps) {
        const [view, setView] = React.useState({t:0, total:0, caption:"", chapter:0, chapters:[], playing:true, segment:null});
        const control = React.useRef({});
        React.useEffect(() => {
            if (!active) return undefined;
            const plan = storyPlan(build()), at = [];
            let sum = 0;
            plan.forEach(step => { sum += step[0]; at.push(sum); });
            const total = sum, chapters = plan.map((step, i) => step[2] ? at[i] : null).filter(x => x !== null);
            const st = {i:0, t:0, timer:undefined, cancelled:false, paused:false, caption:"", chapter:0, seg:0};
            const show = segment => setView({t:st.t, total, caption:st.caption, chapter:st.chapter, chapters, playing:!st.paused, segment});
            const stop = () => { if (st.timer !== undefined && global.clearTimeout) global.clearTimeout(st.timer); st.timer = undefined; };
            const schedule = () => {
                if (st.cancelled || st.paused) return;
                const due = st.i < at.length ? at[st.i] : total, target = Math.min(due, Math.floor(st.t / 1000) * 1000 + 1000);
                const wait = Math.max(0, target - st.t);
                show({from:st.t, to:target, ms:wait, id:++st.seg});
                st.timer = later(() => {
                    st.timer = undefined;
                    if (st.cancelled) return;
                    st.t = target;
                    while (st.i < plan.length && at[st.i] <= st.t) {
                        const step = plan[st.i++];
                        if (step[2]) { st.caption = step[2]; st.chapter++; }
                        try { step[1](); } catch (_) {}
                    }
                    if (st.i >= plan.length) { st.i = 0; st.t = 0; st.caption = ""; st.chapter = 0; }
                    schedule();
                }, wait, false);
            };
            control.current = {
                pause() { if (st.paused) return; st.paused = true; stop(); show(null); },
                play() { if (!st.paused) return; st.paused = false; schedule(); },
                replay() { stop(); st.i = 0; st.t = 0; st.caption = ""; st.chapter = 0; st.paused = false; schedule(); }
            };
            schedule();
            return () => { st.cancelled = true; stop(); control.current = {}; };
        }, [active].concat(deps || []));
        return Object.assign({}, view, {pause:() => control.current.pause && control.current.pause(),
            play:() => control.current.play && control.current.play(), replay:() => control.current.replay && control.current.replay()});
    }
    function clockText(ms) { const sec = Math.round(ms / 1000); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
    const PREVIEW_CHROME_DARK = {
        header:{flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:8, height:48, borderBottomWidth:1, borderBottomColor:"#ffffff0f"},
        headerPill:{width:32, height:32, borderRadius:16, alignItems:"center", justifyContent:"center", backgroundColor:"#2b2d31"},
        title:{color:"#f2f3f5", fontSize:16, fontWeight:"700"}, sub:{color:"#949ba4", fontSize:12}, icon:{color:"#b5bac1"}, iconMuted:{color:"#80848e"},
        inputRow:{flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:8, paddingTop:8, paddingBottom:8},
        round:{width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center", backgroundColor:"#2b2d31"},
        emojiBtn:{width:44, height:44, borderRadius:22, alignItems:"center", justifyContent:"center", backgroundColor:"#2b2d31"},
        pill:{flex:1, minHeight:40, borderRadius:20, paddingHorizontal:14, flexDirection:"row", alignItems:"center", gap:10, backgroundColor:"#2b2d31"},
        send:{width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center", backgroundColor:"#5865f2"},
        bar:{flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:16, paddingVertical:8, backgroundColor:"#232428", borderTopWidth:1, borderTopColor:"#ffffff0f", borderBottomWidth:1, borderBottomColor:"#ffffff0f"},
        barDivider:{width:1, height:16, backgroundColor:"#ffffff14"},
        brand:{backgroundColor:"#5865f2"}, brandText:{color:"#ffffff"}, brandFg:{color:"#5865f2"},
        secondary:{backgroundColor:"#4e505899"}, secondaryText:{color:"#f2f3f5"},
        segTrack:{backgroundColor:"#1e1f22"}, segIndicator:{backgroundColor:"#4e5058"},
        searchField:{backgroundColor:"#111214"}, pickerCatBar:{backgroundColor:"#2b2d31", borderTopColor:"#ffffff0f"},
        sheet:{backgroundColor:"#232428", borderTopLeftRadius:16, borderTopRightRadius:16, paddingTop:8, paddingBottom:4},
        sheetRow:{backgroundColor:"#2b2d31", borderColor:"#ffffff0f"}, modal:{backgroundColor:"#313338", borderRadius:16, padding:16, gap:12}, scrim:{backgroundColor:"#000000a6"},
        strip:{backgroundColor:"#4e50581a", borderTopWidth:1, borderTopColor:"#ffffff0f"}, track:{backgroundColor:"#4e505899"}, fill:{backgroundColor:"#5865f2"},
        mention:{backgroundColor:"#5865f23d", color:"#c9cdfb"}, category:{color:"#949ba4", fontSize:13, fontWeight:"600"},
        channel:{color:"#949ba4"}, selected:{backgroundColor:"#4e505866"}, card:{backgroundColor:"#2b2d31", borderColor:"#ffffff14"}};
    function usePreviewChrome() {
        return useThemed("previewChrome", c => ({
            header:Object.assign({}, PREVIEW_CHROME_DARK.header, {borderBottomColor:c.MOBILE_HEADER_BORDER || c.BORDER_SUBTLE}),
            headerPill:Object.assign({}, PREVIEW_CHROME_DARK.headerPill, {backgroundColor:c.REDESIGN_BUTTON_TERTIARY_BACKGROUND || c.BACKGROUND_BASE_LOW || c.BACKGROUND_MOD_SUBTLE}),
            title:Object.assign({}, PREVIEW_CHROME_DARK.title, {color:c.MOBILE_TEXT_HEADING_PRIMARY || c.TEXT_STRONG}),
            sub:Object.assign({}, PREVIEW_CHROME_DARK.sub, {color:c.TEXT_MUTED}),
            icon:{color:c.MOBILE_HEADER_ICON_DEFAULT || c.INTERACTIVE_ICON_DEFAULT}, iconMuted:{color:c.ICON_MUTED || c.TEXT_SUBTLE},
            inputRow:PREVIEW_CHROME_DARK.inputRow,
            round:Object.assign({}, PREVIEW_CHROME_DARK.round, {backgroundColor:c.CHAT_INPUT_ACTION_BUTTON_BACKGROUND || c.BACKGROUND_MOD_SUBTLE}),
            emojiBtn:Object.assign({}, PREVIEW_CHROME_DARK.emojiBtn, {backgroundColor:c.MOBILE_EMOJI_BUTTON_BACKGROUND || c.CARD_BACKGROUND_DEFAULT || c.BACKGROUND_MOD_SUBTLE}),
            pill:Object.assign({}, PREVIEW_CHROME_DARK.pill, {backgroundColor:c.REDESIGN_CHAT_INPUT_BACKGROUND || c.CHAT_INPUT_BACKGROUND}),
            send:Object.assign({}, PREVIEW_CHROME_DARK.send, {backgroundColor:c.CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND || c.BACKGROUND_BRAND}),
            bar:Object.assign({}, PREVIEW_CHROME_DARK.bar, {backgroundColor:c.MOBILE_FLOATING_ACCESSORY_BACKGROUND || c.BACKGROUND_MOD_SUBTLE, borderTopColor:c.BORDER_MUTED || c.BORDER_SUBTLE, borderBottomColor:c.BORDER_MUTED || c.BORDER_SUBTLE}),
            barDivider:Object.assign({}, PREVIEW_CHROME_DARK.barDivider, {backgroundColor:c.BORDER_SUBTLE}),
            brand:{backgroundColor:c.BACKGROUND_BRAND}, brandText:{color:c.CONTROL_BRAND_FOREGROUND_NEW || c.WHITE || "#ffffff"},
            brandFg:{color:c.CONTROL_BRAND_FOREGROUND || c.TEXT_BRAND || c.BACKGROUND_BRAND || "#5865f2"},
            secondary:{backgroundColor:c.CONTROL_SECONDARY_BACKGROUND_DEFAULT}, secondaryText:{color:c.CONTROL_SECONDARY_TEXT_DEFAULT},
            segTrack:{backgroundColor:c.MOBILE_SEGMENTED_CONTROL_BACKGROUND || c.BACKGROUND_BASE_LOWEST},
            segIndicator:{backgroundColor:c.MOBILE_SEGMENTED_CONTROL_INDICATOR_BACKGROUND || c.BACKGROUND_MOD_STRONG},
            searchField:{backgroundColor:c.INPUT_BACKGROUND_DEFAULT || c.BACKGROUND_BASE_LOWEST},
            pickerCatBar:{backgroundColor:c.BACKGROUND_SURFACE_HIGH || c.CARD_BACKGROUND_DEFAULT, borderTopColor:c.BORDER_SUBTLE},
            sheet:Object.assign({}, PREVIEW_CHROME_DARK.sheet, {backgroundColor:c.MOBILE_ACTIONSHEET_BACKGROUND || c.BACKGROUND_BASE_LOW}),
            sheetRow:{backgroundColor:c.CARD_BACKGROUND_DEFAULT, borderColor:c.BORDER_SUBTLE}, modal:Object.assign({}, PREVIEW_CHROME_DARK.modal, {backgroundColor:c.MODAL_BACKGROUND}),
            scrim:{backgroundColor:c.BACKGROUND_SCRIM}, strip:Object.assign({}, PREVIEW_CHROME_DARK.strip, {backgroundColor:c.BACKGROUND_MOD_SUBTLE, borderTopColor:c.BORDER_SUBTLE}),
            track:{backgroundColor:c.PROGRESSBAR_TRACK_BACKGROUND || c.BACKGROUND_MOD_STRONG}, fill:{backgroundColor:c.PROGRESSBAR_INDICATOR_BACKGROUND || c.BACKGROUND_BRAND},
            mention:{backgroundColor:c.MENTION_BACKGROUND, color:c.MENTION_FOREGROUND},
            category:Object.assign({}, PREVIEW_CHROME_DARK.category, {color:c.TEXT_SUBTLE || c.TEXT_MUTED}), channel:{color:c.CHANNELS_DEFAULT || c.TEXT_MUTED},
            selected:{backgroundColor:c.MOBILE_CHANNEL_ITEM_BACKGROUND_SELECTED || c.BACKGROUND_MOD_NORMAL}, card:{backgroundColor:c.CARD_BACKGROUND_DEFAULT, borderColor:c.BORDER_MUTED || c.BORDER_SUBTLE}}),
            PREVIEW_CHROME_DARK);
    }
    // Discord's channel header: back arrow, the channel (or person) with its small right chevron, and circular 32px action buttons on the right.
    function previewHeader(k, props) {
        const Back = venusIcon(5937, "ArrowLargeLeftIcon"), Hash = venusIcon(15125, "HashmarkIcon"), Chevron = venusIcon(6631, "ChevronSmallRightIcon");
        return el(RN.View, {key:"header", style:k.header},
            el(RN.View, {style:{width:32, height:32, alignItems:"center", justifyContent:"center"}}, el(Back, {size:"md", color:k.icon.color})),
            el(RN.View, {style:{flex:1, flexDirection:"row", alignItems:"center", gap:8}},
                props.leading || el(Hash, {size:"sm", color:k.iconMuted.color}),
                el(RN.View, {style:{flex:1, flexDirection:"row", alignItems:"center", gap:4}},
                    el(RN.Text, {style:k.title, numberOfLines:1}, props.title),
                    props.badges || null,
                    el(Chevron, {size:"xxs", color:k.iconMuted.color}))),
            el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:8}},
                (props.icons || [[5388, "ThreadIcon"], [6473, "MagnifyingGlassIcon"]]).map(([id, name]) =>
                    el(RN.View, {key:name, style:k.headerPill}, el(venusIcon(id, name), {size:"sm", color:k.icon.color})))));
    }
    // Discord's message bar: the + button, the text pill with its gift and emoji/keyboard buttons, then the mic, or Send once there's text.
    function previewInput(k, s, props) {
        const Plus = venusIcon(10455, "PlusLargeIcon"), Gift = venusIcon(10528, "GiftIcon"),
            Expr = props.pickerOpen ? venusIcon(10813, "KeyboardIcon") : venusIcon(8216, "ReactionIcon"),
            Mic = venusIcon(9461, "MicrophoneIcon"), Send = venusIcon(4778, "SendMessageIcon"), Press = RN.Pressable || RN.View, text = props.text || "";
        const showGift = !text && !(features.hideGift && enabled("hideGift"));
        const exprIcon = el(RN.View, {style:{justifyContent:"center", alignItems:"center"}},
            el(Expr, {size:"sm", color:props.pickerOpen ? s.name.color : k.icon.color}), props.smileRipple || null);
        return el(RN.View, {key:"input"}, props.bar || null, props.above || null,
            el(RN.View, {style:k.inputRow},
                el(RN.View, {style:k.round}, el(Plus, {size:"sm", color:k.icon.color})),
                el(RN.View, {style:k.pill}, el(RN.Text, {style:[text ? s.text : s.muted, {flex:1, fontSize:15}], numberOfLines:1}, text || props.placeholder),
                    showGift ? el(Gift, {size:"sm", color:k.icon.color}) : null,
                    props.onSmile ? el(Press, {onPress:props.onSmile, accessibilityRole:"button",
                        accessibilityLabel:tr(props.pickerOpen ? "Close expression picker" : "Open expression picker"),
                        hitSlop:{top:8, bottom:8, left:8, right:8}}, exprIcon) : exprIcon),
                text ? popIn("send", el(RN.View, {style:k.send}, el(Send, {size:"sm", color:k.brandText.color}))) :
                    el(RN.View, {style:k.round}, el(Mic, {size:"sm", color:k.icon.color}))));
    }
    // The bar above the message box while replying or editing (ChatInputContextBar 11808): what it is, the @ ON toggle + vertical divider on replies, and the close X.
    function previewBar(k, s, Icon, text, onClose, key, mention) {
        const X = venusIcon(5940, "XSmallIcon"), At = venusIcon(5405, "AtIcon"), Press = RN.Pressable || RN.View;
        return el(RN.View, {key:key || "bar", style:k.bar},
            Icon ? popIn("icon:" + text, el(Icon, {size:"xs", color:k.icon.color})) : null,
            el(RN.Text, {style:[s.muted, {flex:1, fontSize:14, fontWeight:"500"}], numberOfLines:1}, text),
            mention ? el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:3}},
                el(At, {size:"xxs", color:k.brandFg.color}),
                el(RN.Text, {style:[k.brandFg, {fontSize:12, fontWeight:"700"}]}, "ON")) : null,
            mention && onClose ? el(RN.View, {style:[k.barDivider, {marginHorizontal:8}]}) : null,
            onClose ? el(Press, {onPress:onClose, accessibilityRole:"button", accessibilityLabel:tr("Cancel"), hitSlop:{top:8, bottom:8, left:8, right:8}},
                el(X, {size:"xs", color:k.icon.color})) : null);
    }
    // A Discord tooltip pointing at what to tap in Try it: the brand color, white text and a small arrow.
    function previewTip(k, text, side) {
        if (!text) return null;
        const down = side === "down";
        return el(RN.View, {key:"tip", style:{alignItems:"flex-start", paddingHorizontal:16, paddingTop:down ? 0 : 6, paddingBottom:down ? 6 : 0}},
            popIn("tip:" + text, el(RN.View, null,
                down ? null : el(RN.View, {style:[k.brand, {width:10, height:10, marginLeft:22, marginBottom:-5, transform:[{rotate:"45deg"}]}]}),
                el(RN.View, {style:[k.brand, {borderRadius:8, paddingHorizontal:12, paddingVertical:8, maxWidth:300}]},
                    el(RN.Text, {style:[k.brandText, {fontSize:14, fontWeight:"600"}]}, text)),
                down ? el(RN.View, {style:[k.brand, {width:10, height:10, marginLeft:22, marginTop:-5, transform:[{rotate:"45deg"}]}]}) : null)));
    }
    // A preview's surface: Discord's chat colors, its header on top, and Watch's player strip at the bottom.
    function previewScreen(s, key, label, children, extra) {
        return el(RN.View, {key, style:[s.chat, {paddingVertical:0}], accessible:false, accessibilityLabel:tr(label)},
            extra && extra.header || null, el(RN.View, {style:{paddingVertical:4}}, children), extra && extra.footer || null);
    }
    // The progress bar of the player: glides from one tick to the next, stops where it is while paused.
    function StoryTrack(props) {
        const A = motion(), ref = React.useRef(null), story = props.story, k = props.k, total = story.total || 1;
        if (!ref.current && A) ref.current = new A.Value(0);
        const seg = story.segment;
        React.useEffect(() => {
            const value = ref.current;
            if (!value || !seg) return undefined;
            value.setValue(seg.from / total);
            if (reduceMotion || typeof A.timing !== "function") { value.setValue(seg.to / total); return undefined; }
            const run = A.timing(value, {toValue:seg.to / total, duration:seg.ms, useNativeDriver:false});
            run.start();
            return () => run.stop();
        }, [seg && seg.id]);
        const width = ref.current ? ref.current.interpolate({inputRange:[0, 1], outputRange:["0%", "100%"]}) : Math.round(story.t / total * 100) + "%";
        return el(RN.View, {style:[k.track, {flex:1, height:4, borderRadius:2, overflow:"hidden"}], accessible:true, accessibilityRole:"progressbar",
            accessibilityValue:{min:0, max:Math.round(total / 1000), now:Math.round(story.t / 1000)}},
            el(ref.current ? A.View : RN.View, {style:[k.fill, {position:"absolute", left:0, top:0, bottom:0, width}]}),
            story.chapters.map((at, i) => i ? el(RN.View, {key:"c" + i, style:{position:"absolute", top:0, bottom:0, width:2,
                left:(at / total * 100) + "%", backgroundColor:"#00000059"}}) : null));
    }
    // What Watch is showing (step 2 of 5), and the player: pause or play, the bar, the time, start over.
    function storyStrip(k, s, story) {
        const Press = RN.Pressable || RN.View, Play = venusIcon(7726, "PlayIcon"), Pause = venusIcon(7728, "PauseIcon"), Again = venusIcon(11106, "RetryIcon");
        const button = (key, Icon, label, onPress) => el(Press, {key, onPress, accessibilityRole:"button", accessibilityLabel:tr(label),
            hitSlop:{top:10, bottom:10, left:10, right:10}, style:{width:28, height:28, borderRadius:14, alignItems:"center", justifyContent:"center"}},
            el(Icon, {size:"xs", color:k.icon.color}));
        const steps = story.chapters.length;
        return el(RN.View, {key:"strip", style:[k.strip, {paddingHorizontal:12, paddingTop:10, paddingBottom:8, gap:8}]},
            el(RN.View, {style:{flexDirection:"row", alignItems:"flex-start", gap:8, minHeight:40}},
                steps ? el(RN.View, {style:[k.secondary, {borderRadius:8, paddingHorizontal:6, paddingVertical:2, marginTop:1}]},
                    el(RN.Text, {style:[k.secondaryText, {fontSize:12, fontWeight:"700"}]}, Math.max(1, story.chapter) + "/" + steps)) : null,
                el(RN.View, {style:{flex:1}}, story.caption ? popIn("cap:" + story.caption,
                    el(RN.Text, {style:[s.text, {fontSize:14, lineHeight:20}]}, story.caption)) : null)),
            el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:6}},
                story.playing ? button("pause", Pause, "Pause", story.pause) : button("play", Play, "Play", story.play),
                el(StoryTrack, {story, k}),
                el(RN.Text, {style:[s.muted, {fontSize:12, minWidth:72, textAlign:"right"}]}, clockText(story.t) + " / " + clockText(story.total)),
                button("again", Again, "Start over", story.replay)));
    }
    // A muted line under a preview: what's happening in Watch, what to tap in Try it.
    function previewCaption(s, text) {
        return text ? el(RN.View, {key:"hint", style:{paddingHorizontal:16, paddingTop:2}}, popIn("cap:" + text, el(RN.Text, {style:s.muted}, text))) : null;
    }
    // Shared by every option page: Discord's spacing and scrolling, with each group revealed in turn.
    function settingsBody(ui,groups,scroll) {
        const shown=groups.filter(Boolean).map((group,i) => typeof group==="object" ?
            el(VenusReveal,{key:group.key != null ? group.key : group.props && group.props.key != null ? group.props.key : "group"+i,index:i},group) : group);
        const body=ui.Stack ? el(ui.Stack,{style:{paddingVertical:24,paddingHorizontal:12},spacing:24},shown) :
            el(RN.View,{style:{paddingVertical:24,paddingHorizontal:12,gap:24}},shown);
        return RN.ScrollView ? el(RN.ScrollView,scroll || null,body) : body;
    }
    // Greyed out while the main switch is off, like the options on the Settings list.
    function switchRow(Switch,key,label,subLabel,icon) {
        const owner=featureFor(key);
        return Switch ? el(Switch,{key,label:tr(label),subLabel:subLabel && tr(subLabel),icon,value:settings[key],disabled:owner!==key && !settings[owner],
            onValueChange:value => { animateLayout(); setSetting(key,value); }}) : null;
    }
    // One choice from a few: Discord's radio list (TableRadioGroup 5995 / TableRadioRow 5994), or check-marked rows.
    // Each choice may carry a fourth item, its row icon (rowIcon), like Discord's own radio lists.
    function radioGroup(ui,key,title,setting,on,choices,raw) {
        title=tr(title); if (!raw) choices=choices.map(([value,label,subLabel,icon]) => [value,tr(label),subLabel && tr(subLabel),icon]);
        const RadioGroup=inspectedExport(5995,"TableRadioGroup"), RadioRow=inspectedExport(5994,"TableRadioRow");
        if (RadioGroup && RadioRow) return el(RadioGroup,{key,title,value:settings[setting],onChange:value => setSetting(setting,value)},
            choices.map(([value,label,subLabel,icon]) => el(RadioRow,{key:value,value,label,subLabel,icon,disabled:!on})));
        return el(ui.TableRowGroup || RN.View,{key,title},choices.map(([value,label,subLabel,icon]) => ui.TableRow &&
            el(ui.TableRow,{key:value,label:(settings[setting]===value ? "\u2713 " : "")+label,subLabel,icon,disabled:!on,onPress:() => setSetting(setting,value)})));
    }
    // Small muted text under a page's groups: what else to know, without a row of its own.
    function footnote(key,text) {
        text=tr(text);
        const Text=inspectedExport(4833,"Text");
        return el(RN.View,{key,style:{paddingHorizontal:16}},
            Text ? el(Text,{variant:"text-xs/medium",color:"text-muted"},text) : el(RN.Text,{style:{color:"#949ba4",fontSize:12}},text));
    }
    // Discord's color tokens (588 colors) are objects that only createStyles turns into real colors for the current
    // theme. Each style set is made once, so a mounted page always calls the same hooks; the fallback is the dark theme.
    const themedHooks = new Map();
    function useThemed(name, make, fallback) {
        if (!themedHooks.has(name)) {
            const ui = reviewUI(), c = ui.colors;
            let hook = null;
            if (typeof ui.createStyles === "function" && c) try { hook = ui.createStyles(make(c)); } catch (_) { hook = null; }
            themedHooks.set(name, hook);
        }
        const hook = themedHooks.get(name);
        let styles = null;
        if (hook) try { styles = hook(); } catch (_) { styles = null; }
        return styles || fallback;
    }
    const STATUS_CARD_DARK = {card:{backgroundColor:"#2b2d31", borderRadius:16, paddingHorizontal:16, paddingVertical:14, flexDirection:"row", alignItems:"center", gap:14},
        badge:{width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center", backgroundColor:"#4e50584d"}};
    // The card at the top of an option page: an optional icon or avatars, a bold title line and the details under it.
    function VenusStatusCard(props) {
        // Called straight from a page render (not as its own component), so its texts stay part of the page.
        const s = useThemed("statusCard", c => ({card:Object.assign({}, STATUS_CARD_DARK.card, {backgroundColor:c.CARD_BACKGROUND_DEFAULT}),
            badge:Object.assign({}, STATUS_CARD_DARK.badge, {backgroundColor:c.BACKGROUND_MOD_SUBTLE})}), STATUS_CARD_DARK);
        const Text = inspectedExport(4833, "Text"), Icon = props.IconComponent, title = props.title, body = props.body;
        const line = (value, variant, color, fallback) => Text ? el(Text, {variant, color}, value) : el(RN.Text, {style:fallback}, value);
        return el(RN.View, {key:props.key, style:s.card, accessible:true},
            // The badge pops in when the page opens, and again whenever the card's state (its title) changes.
            popIn("badge:" + (title || ""), props.leading || (Icon ? el(RN.View, {style:s.badge}, el(Icon, {size:"md"})) : null)),
            el(RN.View, {style:{flex:1, gap:2}},
                title ? line(title, "text-md/semibold", "text-strong", {color:"#f2f3f5", fontSize:16, fontWeight:"600"}) : null,
                body ? line(body, "text-sm/medium", title ? "text-muted" : "text-default", {color:title ? "#949ba4" : "#dbdee1", fontSize:14}) : null,
                props.footer || null));
    }
    // A thin rounded progress bar in the theme's brand color that glides to each new value.
    function VenusProgress(props) {
        const s = useThemed("progress", c => ({track:{height:6, borderRadius:3, overflow:"hidden", backgroundColor:c.BACKGROUND_MOD_STRONG || c.BACKGROUND_MOD_NORMAL},
            fill:{height:6, borderRadius:3, backgroundColor:c.BACKGROUND_BRAND || c.TEXT_BRAND}}),
            {track:{height:6, borderRadius:3, overflow:"hidden", backgroundColor:"#4e505899"}, fill:{height:6, borderRadius:3, backgroundColor:"#5865f2"}});
        const A = motion(), ref = React.useRef(null), share = Math.max(0, Math.min(1, Number(props.value) || 0));
        if (!ref.current && A) ref.current = new A.Value(reduceMotion ? share : 0);
        React.useEffect(() => {
            const value = ref.current;
            if (!value) return undefined;
            if (reduceMotion) { value.setValue(share); return undefined; }
            // Width can't run on the native driver; it's one small view, animated once per Quest update.
            const run = A.timing(value, {toValue:share, duration:600, easing:easeOut(), useNativeDriver:false});
            run.start();
            return () => run.stop();
        }, [share]);
        const width = ref.current ? ref.current.interpolate({inputRange:[0, 1], outputRange:["0%", "100%"]}) : Math.round(share * 100) + "%";
        return el(RN.View, {key:props.key, style:[s.track, {marginTop:8}], accessible:true, accessibilityRole:"progressbar",
            accessibilityValue:{min:0, max:100, now:Math.round(share * 100)}},
            el(ref.current ? A.View : RN.View, {style:[s.fill, {width}]}));
    }
    // A rounded card with live status, in the theme's card colors. extra: {title, IconComponent, leading}.
    function statusCard(key,text,extra) {
        return VenusStatusCard(Object.assign({key,body:tr(text)},extra));
    }
    // Pages share one look for "off": a muted title and the hint to switch it on.
    function offCard(key,IconComponent) {
        return VenusStatusCard({key,title:tr("Turned off"),body:tr("Switch it on in Features to start."),IconComponent});
    }
    // A small chat surface for page previews, in the theme's chat colors (same tokens as the Message highlights one).
    const CHAT_PREVIEW_DARK = {chat:{borderRadius:16, overflow:"hidden", backgroundColor:"#1a1a1e", borderWidth:1, borderColor:"#ffffff14", paddingVertical:8},
        name:{color:"#f2f3f5", fontSize:15, fontWeight:"600"}, text:{color:"#dbdee1", fontSize:15, lineHeight:20}, muted:{color:"#949ba4", fontSize:12},
        faded:{color:"#949ba4", fontSize:14, textDecorationLine:"line-through"}, quote:{borderLeftWidth:4, borderColor:"#4e5058", paddingLeft:8, marginTop:4}};
    function useChatPreviewStyles() {
        return useThemed("chatPreview", c => ({chat:Object.assign({}, CHAT_PREVIEW_DARK.chat, {backgroundColor:c.CHANNEL_BACKGROUND_DEFAULT || c.BACKGROUND_BASE_LOWER, borderColor:c.BORDER_SUBTLE}),
            name:Object.assign({}, CHAT_PREVIEW_DARK.name, {color:c.TEXT_STRONG}), text:Object.assign({}, CHAT_PREVIEW_DARK.text, {color:c.TEXT_DEFAULT}),
            muted:Object.assign({}, CHAT_PREVIEW_DARK.muted, {color:c.TEXT_MUTED}), faded:Object.assign({}, CHAT_PREVIEW_DARK.faded, {color:c.TEXT_MUTED}),
            quote:Object.assign({}, CHAT_PREVIEW_DARK.quote, {borderColor:c.BORDER_STRONG})}), CHAT_PREVIEW_DARK);
    }
    // One message in a preview: a 40px round letter avatar at 12px margin (64px start guideline), the name, timestamp (+8px) and body.
    function previewMessage(s, key, who, color, time, body, extra) {
        return el(RN.View, Object.assign({key, style:{paddingHorizontal:12, paddingVertical:6, flexDirection:"row", gap:12}}, extra),
            el(RN.View, {style:{width:40, height:40, borderRadius:20, backgroundColor:color, alignItems:"center", justifyContent:"center"}},
                el(RN.Text, {style:{color:"#ffffff", fontSize:16, fontWeight:"700"}}, who.slice(0, 1).toUpperCase())),
            el(RN.View, {style:{flex:1}},
                el(RN.View, {style:{flexDirection:"row", alignItems:"baseline", marginBottom:2}},
                    el(RN.Text, {style:extra && extra.nameColor ? [s.name, {color:extra.nameColor}] : s.name, numberOfLines:1}, who),
                    extra && extra.badges ? el(RN.View, {style:{marginLeft:4}}, extra.badges) : null,
                    el(RN.Text, {style:[s.muted, {marginLeft:8}]}, time)),
                body));
    }
    // Discord's own icon in a settings row (TableRowIcon 5922), the way its own settings pages show them.
    function rowIcon(id,name) {
        const RowIcon=inspectedExport(5922,"TableRowIcon");
        return RowIcon ? el(RowIcon,{IconComponent:venusIcon(id,name)}) : undefined;
    }
    // A group title on its own, above something that isn't a list of rows (TableRowGroupTitle 5997).
    function groupTitle(key,title) {
        const Title=inspectedExport(5997,"TableRowGroupTitle"), Text=inspectedExport(4833,"Text");
        return Title ? el(Title,{key,title:tr(title)}) : el(RN.View,{key,style:{paddingHorizontal:16}},
            Text ? el(Text,{variant:"text-sm/semibold",color:"text-muted"},tr(title)) : el(RN.Text,{style:{color:"#949ba4",fontSize:13,fontWeight:"600"}},tr(title)));
    }
    // The chosen pill of a segmented control, as one view that slides between choices with a soft spring.
    // It measures the track once; until then the pills draw their own background, so nothing ever flickers.
    const segmentMeasured = new Map();
    function SegmentedSlider(props) {
        const A = motion(), [width, setWidth] = React.useState(segmentMeasured.get(props.slot) || 0), ref = React.useRef(null);
        if (!ref.current) ref.current = {x:new A.Value(0), placed:false};
        const state = ref.current, pill = width ? (width - 4 * (props.count - 1)) / props.count : 0, target = props.index * (pill + 4);
        React.useEffect(() => {
            if (!pill) return undefined;
            if (!state.placed || reduceMotion || typeof A.spring !== "function") { state.placed = true; state.x.setValue(target); return undefined; }
            const run = A.spring(state.x, {toValue:target, speed:18, bounciness:6, useNativeDriver:true});
            run.start();
            return () => run.stop();
        }, [target, pill]);
        return el(RN.View, {pointerEvents:"none", style:{position:"absolute", left:4, right:4, top:4, bottom:4},
            onLayout:event => { const w = event && event.nativeEvent && event.nativeEvent.layout && event.nativeEvent.layout.width;
                if (w && Math.abs(w - width) > 0.5) { segmentMeasured.set(props.slot, w); setWidth(w); } }},
            pill ? el(A.View, {style:{position:"absolute", top:0, bottom:0, left:0, width:pill, borderRadius:20, backgroundColor:props.color,
                transform:[{translateX:state.x}]}}) : null);
    }
    // A choice of two to four, drawn like Discord's segmented control (its MOBILE_SEGMENTED_CONTROL tokens).
    function venusSegmented(props) {
        const index=Math.max(0,props.items.findIndex(item => item.value===props.value));
        const pick=i => { const item=props.items[i]; if (item && !props.disabled && item.value!==props.value) { animateLayout(); props.onChange(item.value); } };
        const pill={flex:1,paddingVertical:9,borderRadius:20,alignItems:"center"};
        const s=useThemed("segmented",c => ({wrap:{flexDirection:"row",padding:4,gap:4,borderRadius:24,backgroundColor:c.MOBILE_SEGMENTED_CONTROL_BACKGROUND},
            on:Object.assign({},pill,{backgroundColor:c.MOBILE_SEGMENTED_CONTROL_INDICATOR_BACKGROUND}),off:pill}),
            {wrap:{flexDirection:"row",padding:4,gap:4,borderRadius:24,backgroundColor:"#1e1f22"},on:Object.assign({},pill,{backgroundColor:"#4e5058"}),off:pill});
        const Text=inspectedExport(4833,"Text"), Press=RN.Pressable || RN.View;
        // Once its slider has measured the track, the chosen pill slides to the new choice instead of jumping.
        const slot=String(props.key)+":"+props.items.length, sliding=!!motion() && segmentMeasured.has(slot);
        const indicator=s.on && s.on.backgroundColor;
        return el(RN.View,{key:props.key,style:[s.wrap,{opacity:props.disabled ? 0.5 : 1}],accessibilityRole:"tablist"},
            motion() ? el(SegmentedSlider,{key:"slider",slot,index,count:props.items.length,color:indicator}) : null,
            props.items.map((item,i) => el(Press,{key:String(item.value),style:i===index && !sliding ? s.on : s.off,accessibilityRole:"tab",accessibilityLabel:item.label,
                accessibilityState:{selected:i===index,disabled:!!props.disabled},disabled:!!props.disabled,onPress:() => pick(i)},
                Text ? el(Text,{variant:"text-sm/semibold",color:i===index ? "interactive-text-active" : "text-muted"},item.label) :
                    el(RN.Text,{style:{color:i===index ? "#ffffff" : "#949ba4",fontWeight:"600"}},item.label))));
    }
    // A text box with Discord's button (Button 5282) beside it, like its own "add" fields.
    function inputWithButton(ui,key,inputProps,onChange,buttonText,onPress,disabled) {
        const Button=inspectedExport(5282,"Button");
        const input=ui.TextInput ? el(ui.TextInput,Object.assign({onChange},inputProps)) :
            el(RN.TextInput,Object.assign({onChangeText:onChange,style:{fontSize:16,padding:12}},inputProps));
        const button=Button ? el(Button,{text:tr(buttonText),size:"md",variant:"primary",disabled:!!disabled,onPress}) :
            el(RN.Pressable || RN.View,{onPress:disabled ? undefined : onPress,accessibilityRole:"button",accessibilityLabel:tr(buttonText),disabled:!!disabled,
                style:{paddingHorizontal:16,height:40,borderRadius:20,justifyContent:"center",backgroundColor:"#5865f2",opacity:disabled ? 0.5 : 1}},
                el(RN.Text,{style:{color:"#ffffff",fontWeight:"600"}},tr(buttonText)));
        return el(RN.View,{key,style:{flexDirection:"row",alignItems:"flex-end",gap:8}},el(RN.View,{style:{flex:1}},input),button);
    }
    function hexInt(hex) { const m=/^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); return m ? parseInt(m[1],16) : null; }
    function intHex(n) { return typeof n==="number" && isFinite(n) ? "#"+(n & 0xffffff).toString(16).padStart(6,"0") : null; }
    function isLightHex(hex) {
        const n=hexInt(hex); if (n==null) return false;
        return ((n >> 16 & 255) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000 > 170;
    }
    // The colors Discord draws its own status dots in.
    const STATUS_HEX = {online:"#23a55a", idle:"#f0b232", dnd:"#f23f43", offline:"#80848e", invisible:"#80848e"};
    // A full-width row that does something once, like clearing what a feature saved.
    function actionRow(ui,key,label,subLabel,onPress,disabled,danger) {
        return ui.TableRow ? el(ui.TableRow,{key,label:tr(label),subLabel:subLabel && tr(subLabel),onPress,disabled:!!disabled,variant:danger ? "danger" : undefined}) : null;
    }
    function confirmAction(title,body,confirmText,onConfirm) {
        title=tr(title); body=tr(body); confirmText=tr(confirmText);
        const ui=reviewUI();
        if (ui.alerts && typeof ui.alerts.show==="function") try { ui.alerts.show({title,body,confirmText,cancelText:tr("Cancel"),onConfirm}); return; } catch (_) {}
        if (RN && RN.Alert) RN.Alert.alert(title,body,[{text:tr("Cancel"),style:"cancel"},{text:confirmText,style:"destructive",onPress:onConfirm}]);
    }
    function count(n,word) { return pl(n,"{n} "+word,"{n} "+word+"s"); }
    // Settings page: Discord's own radio list (TableRadioGroup 5995 / TableRadioRow 5994).
    // Hidden channels: one choice, whether tapping a locked channel shows its details or does nothing.
    // The locked channel in the preview: pressable like a real row, and it gives a small shake when tapping does nothing
    // (each time props.shake goes up).
    function HiddenPreviewRow(props) {
        const A = motion(), ref = React.useRef(null), Press = RN.Pressable || RN.View;
        if (!ref.current && A) ref.current = new A.Value(0);
        React.useEffect(() => {
            const value = ref.current;
            if (!props.shake || !value || reduceMotion || typeof A.sequence !== "function") return undefined;
            value.setValue(0);
            const run = A.sequence([1, -1, 1, 0].map(to => A.timing(value, {toValue:to, duration:60, useNativeDriver:true})));
            run.start();
            return () => run.stop();
        }, [props.shake]);
        const row = {flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:8, paddingVertical:7, marginHorizontal:8, borderRadius:8};
        const style = ref.current ? [row, {transform:[{translateX:ref.current.interpolate({inputRange:[-1, 1], outputRange:[-6, 6]})}]}] : row;
        return el(Press, {onPress:props.onPress, accessibilityRole:"button", accessibilityLabel:props.label + ", " + tr("locked")},
            el(ref.current ? A.View : RN.View, {style}, props.children), props.ripple || null);
    }
    // A server's channel list the way Discord draws it: the server name, a category and its channels, the locked one with
    // Discord's own # and lock icon. Watch: scrolling past it opens nothing, then a tap opens its details in Discord's
    // dialog (or nothing at all, when details are off). Try it: tap it yourself and Discord's real dialog opens.
    const HIDDEN_SAMPLE = {id:"1180000000000000000", guild_id:"1", type:0, name:"staff-only", lastMessageId:"1290000000000000000"};
    function HiddenChannelsPreview(props) {
        useSettings("hiddenChannels");
        const s = useChatPreviewStyles(), k = usePreviewChrome(), [mode, setMode] = usePreviewMode(), on = props.on, menu = settings.hiddenChannelsMenu;
        const Hash = venusIcon(15125, "HashmarkIcon"), TextLock = venusIcon(5393, "TextLockIcon"), Down = venusIcon(10604, "ChevronSmallDownIcon");
        const blank = {shake:0, pulse:null, card:false, scroll:0, tried:false};
        const [state, setState] = React.useState(blank), watching = on && mode === "watch";
        const update = change => setState(st => Object.assign({}, st, typeof change === "function" ? change(st) : change));
        const shake = () => update(st => ({shake:st.shake + 1}));
        const story = useStory(watching, () => [[0, () => setState(blank), tr("Locked channels show in the list with a lock, like staff-only here")],
            [1200, () => { animateLayout(); update({scroll:1}); }, tr("Scrolling past it, or opening the server, opens nothing")],
            [1400, () => { animateLayout(); update({scroll:0}); }],
            [1000, () => update(st => ({pulse:{who:"locked", id:"tap" + st.shake}})), tr(menu ? "Only a tap on it opens its details" : "You tap it")],
            [400, () => { if (menu) { animateLayout(); update({card:true}); } else shake(); },
                menu ? tr("You see when it was made and last used. View Anyway would open it") : tr("Nothing happens: you turned its details off")],
            [3000, () => { animateLayout(); update({card:false}); }], [600, () => {}]], [menu]);
        const tapLocked = () => { if (!on || watching) return; update({tried:true}); if (menu) showHidden(HIDDEN_SAMPLE); else shake(); };
        const channel = (name, locked, selected) => el(locked ? HiddenPreviewRow : RN.View, locked ?
            {key:name, onPress:tapLocked, label:name, shake:state.shake, ripple:tapRipple(state.pulse, "locked", {right:40, top:2})} :
            {key:name, style:[{flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:8, paddingVertical:7, marginHorizontal:8, borderRadius:8},
                selected ? k.selected : null]},
            el(locked ? TextLock : Hash, {size:"sm", color:selected ? s.name.color : locked ? k.iconMuted.color : k.channel.color}),
            el(RN.Text, {style:[s.text, {flex:1, color:selected ? s.name.color : k.channel.color, fontWeight:selected ? "600" : "500"}], numberOfLines:1}, name));
        // Discord's alert, drawn inside the preview while it plays: a title, the details and its two buttons.
        const button = (text, brand) => el(RN.View, {key:text, style:[brand ? k.brand : k.secondary, {borderRadius:20, paddingVertical:10, alignItems:"center"}]},
            el(RN.Text, {style:[brand ? k.brandText : k.secondaryText, {fontWeight:"600"}]}, text));
        const card = watching && state.card ? el(RN.View, {key:"card", style:[k.scrim, {position:"absolute", left:0, right:0, top:0, bottom:0, justifyContent:"center", padding:16}]},
            popIn("card", el(RN.View, {style:k.modal},
                el(RN.Text, {style:[s.name, {fontSize:18, fontWeight:"700", textAlign:"center"}]}, tr("Locked channel")),
                hiddenDetails(HIDDEN_SAMPLE).map(([label, stamp]) => el(RN.View, {key:label},
                    el(RN.Text, {style:[s.muted, {fontSize:11, fontWeight:"700"}]}, label.toUpperCase()), el(RN.Text, {style:s.text}, stamp.relative))),
                button(tr("View Anyway"), true), button(tr("Cancel"), false)))) : null;
        const list = el(RN.View, {key:"list", style:{paddingVertical:6, transform:state.scroll ? [{translateY:-14}] : []}},
            el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:16, paddingVertical:6}},
                el(Down, {size:"xxs", color:k.category.color}), el(RN.Text, {style:k.category}, tr("Text channels").toUpperCase())),
            channel("general", false, true), on ? channel("staff-only", true) : null, channel("memes", false), channel("clips", false));
        const tip = on && !watching ? previewTip(k, !state.tried ? tr(menu ? "Tap staff-only to see its details" : "Tap staff-only: nothing will open") :
            tr(menu ? "That's the dialog you'll see in Discord" : "Tapping a locked channel now does nothing")) : null;
        const Chevron = venusIcon(6631, "ChevronSmallRightIcon"), Search = venusIcon(6473, "MagnifyingGlassIcon");
        const server = el(RN.View, {key:"server", style:[k.header, {height:52, paddingHorizontal:16}]},
            el(RN.View, {style:{flex:1, flexDirection:"row", alignItems:"center", gap:4}},
                el(RN.Text, {style:[k.title, {fontSize:18}], numberOfLines:1}, tr("Game Night")),
                el(Chevron, {size:"xxs", color:k.iconMuted.color})),
            el(RN.View, {style:k.headerPill}, el(Search, {size:"sm", color:k.icon.color})),
            el(RN.View, {style:k.headerPill}, el(venusIcon(7364, "MoreHorizontalIcon"), {size:"sm", color:k.icon.color})));
        return el(RN.View, {key:"preview"}, on ? previewToggle(mode, value => { setMode(value); setState(blank); }) : null,
            previewScreen(s, "preview", "Hidden channels preview", [el(RN.View, {key:"body", style:{minHeight:210, overflow:"hidden"}}, list, card), tip],
                {header:server, footer:watching ? storyStrip(k, s, story) : null}));
    }
    function HiddenChannelsSettings() {
        useSettings("hiddenChannels");
        const ui=reviewUI();
        if (!React || !RN) return null;
        const on=enabled("hiddenChannels"), Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow, lock=venusIcon(5410,"LockIcon");
        const groups=[
            on ? null : offCard("status",lock),
            el(HiddenChannelsPreview,{key:"preview",on}),
            el(Group,{key:"tap",title:tr("When you tap a locked channel")},
                switchRow(Switch,"hiddenChannelsMenu","Show its details","Shows when it was created, its last message and last pin, with View Anyway.",rowIcon(4788,"CircleInformationIcon"))),
            footnote("note","Only a tap opens it: scrolling past a locked channel, opening a server or opening Discord never does.")];
        return settingsBody(ui,groups);
    }
    function ReadAllSettings() {
        useSettings("readAll");
        const ui=reviewUI();
        if (!React || !RN) return null;
        const on=enabled("readAll");
        const groups=[
            on ? null : offCard("status",venusIcon(15161,"DoubleCheckmarkIcon")),
            radioGroup(ui,"mode","When you tap Read all","readAllMode",on,[["guilds","Servers","Marks every unread server as read.",rowIcon(8584,"ServerIcon")],
                ["dms","Direct messages","Marks every unread DM and group DM as read.",rowIcon(6503,"EnvelopeIcon")],
                ["both","Servers and DMs","Marks everything as read in one tap.",rowIcon(15161,"DoubleCheckmarkIcon")]]),
            footnote("note","Hold the button to pick just once, without changing this.")];
        return settingsBody(ui,groups);
    }
    // Nitro stickers and emojis: what a sent emoji looks like with each link style, then the switches.
    // The preview's emoji and sticker are Discord's own Wumpus art, shipped inside the app (drawable resources, loaded by
    // name like Discord's own images), so nothing is read from your servers and nothing is downloaded.
    const NITRO_SAMPLES = {emoji:{name:"wumpus_wave", res:"modules_guilds_bar_native_images_wumpus_wave", size:48, glyph:"\ud83d\udc4b"},
        sticker:{name:"Wumpus Surprise", res:"images_native_gifting_wumpus_box_premium120", size:140, glyph:"\ud83c\udf81"}};
    // Each one moves the way an animated emoji or sticker does: the emoji waves, the sticker hops. Tap to play it again.
    function NitroArt(props) {
        const A = motion(), ref = React.useRef(null), [failed, setFailed] = React.useState(false), item = props.item;
        if (!ref.current && A) ref.current = new A.Value(0);
        React.useEffect(() => {
            const value = ref.current;
            if (!value || reduceMotion || typeof A.sequence !== "function") return undefined;
            value.setValue(0);
            const run = props.kind === "emoji" ?
                A.sequence([0.6, -0.6, 0.6, -0.6, 0].map(to => A.timing(value, {toValue:to, duration:130, useNativeDriver:true}))) :
                A.sequence([A.timing(value, {toValue:1, duration:170, easing:easeOut(), useNativeDriver:true}),
                    A.spring(value, {toValue:0, speed:14, bounciness:14, useNativeDriver:true})]);
            run.start();
            return () => run.stop();
        }, [props.kind, props.play]);
        const motionStyle = !ref.current ? null : props.kind === "emoji" ?
            {transform:[{rotate:ref.current.interpolate({inputRange:[-1, 1], outputRange:["-18deg", "18deg"]})}]} :
            {transform:[{translateY:ref.current.interpolate({inputRange:[0, 1], outputRange:[0, -14]})},
                {scale:ref.current.interpolate({inputRange:[0, 1], outputRange:[1, 1.06]})}]};
        const art = !failed && RN.Image ? el(RN.Image, {source:{uri:item.res, width:item.size, height:item.size}, style:{width:item.size, height:item.size},
            resizeMode:"contain", accessibilityLabel:item.name, onError:() => setFailed(true)}) :
            el(RN.Text, {style:{fontSize:Math.round(item.size * 0.75), lineHeight:item.size}}, item.glyph);
        return el(ref.current ? A.View : RN.View, {style:motionStyle}, art);
    }
    // The message as everyone sees it: just the emoji or sticker, the way chat shows a link to one.
    // Watch: you tap the emoji button in the message bar, pick a Nitro emoji from another server (unlocked by Venus, so
    // there's no lock icon on it), it's sent and everyone sees it; then the same with a sticker. Try it: send one yourself.
    function NitroPicker(props) {
        const k = props.k, s = props.s, Press = RN.Pressable || RN.View, Down = venusIcon(10604, "ChevronSmallDownIcon"),
            Search = venusIcon(6473, "MagnifyingGlassIcon"), Nitro = venusIcon(8119, "NitroWheelIcon"),
            Smile = venusIcon(8216, "ReactionIcon"), Sticker = venusIcon(11937, "StickerIcon"), Backspace = venusIcon(9742, "BackspaceIcon");
        const kinds = props.kinds, tab = props.tab, item = NITRO_SAMPLES[tab], canSwitch = kinds.length > 1;
        const tabPill = (kind, label, enabledTab) => {
            const active = tab === kind;
            return el(Press, {key:kind, onPress:enabledTab && props.onTab ? () => props.onTab(kind) : undefined,
                disabled:!enabledTab || !props.onTab, accessibilityRole:"tab", accessibilityState:{selected:active, disabled:!enabledTab},
                style:[{flex:1, paddingVertical:6, borderRadius:16, alignItems:"center", opacity:enabledTab ? 1 : 0.45}, active ? k.segIndicator : null]},
                el(RN.Text, {style:[active ? {color:s.name.color} : s.muted, {fontWeight:"600", fontSize:13}]}, label));
        };
        const plain = kind => kind === "emoji" ? ["\ud83d\ude00", "\ud83d\ude02", "\ud83d\udc4d", "\ud83c\udf89", "\ud83d\udd25", "\u2728"] : [];
        return el(RN.View, {key:"picker", style:[k.sheet, {borderTopLeftRadius:16, borderTopRightRadius:16, paddingTop:8, paddingBottom:0, gap:8}]},
            el(RN.View, {style:{alignSelf:"center", width:36, height:4, borderRadius:2, backgroundColor:"#80848e66"}}),
            el(RN.View, {style:[k.segTrack, {flexDirection:"row", padding:3, gap:3, borderRadius:20, marginHorizontal:12}]},
                tabPill("emoji", tr("Emojis"), kinds.includes("emoji")),
                tabPill("gif", tr("GIFs"), false),
                tabPill("sticker", tr("Stickers"), kinds.includes("sticker"))),
            el(RN.View, {style:[k.searchField, {flexDirection:"row", alignItems:"center", gap:8, height:36, borderRadius:18, paddingHorizontal:12, marginHorizontal:12}]},
                el(Search, {size:"xs", color:k.iconMuted.color}),
                el(RN.Text, {style:[s.muted, {flex:1, fontSize:14}], numberOfLines:1}, tr(tab === "emoji" ? "Find the perfect emoji" : "Find the perfect sticker"))),
            el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, marginTop:2}},
                el(Down, {size:"xxs", color:k.category.color}),
                el(RN.Text, {style:k.category}, tr("Game Night").toUpperCase()),
                el(Nitro, {size:"xxs", color:k.brandFg.color})),
            el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:8, flexWrap:"wrap", paddingHorizontal:12, paddingBottom:4}},
                el(Press, {key:"nitro", onPress:props.onPick, accessibilityRole:"button", accessibilityLabel:item.name, accessibilityHint:tr("Tap to send it"),
                    style:[{padding:6, borderRadius:10, borderWidth:1.5, borderColor:k.brandFg.color + "66", backgroundColor:k.brandFg.color + "14"}, props.highlight ? k.selected : null]},
                    el(RN.View, {style:{width:tab === "emoji" ? 33 : 64, height:tab === "emoji" ? 33 : 64, alignItems:"center", justifyContent:"center"}},
                        RN.Image ? el(RN.Image, {source:{uri:item.res, width:tab === "emoji" ? 33 : 64, height:tab === "emoji" ? 33 : 64},
                            style:{width:tab === "emoji" ? 33 : 64, height:tab === "emoji" ? 33 : 64}, resizeMode:"contain"}) :
                            el(RN.Text, {style:{fontSize:tab === "emoji" ? 26 : 48}}, item.glyph)),
                    tapRipple(props.pulse, "pick", {left:0, top:0})),
                plain(tab).map(e => el(RN.View, {key:e, style:{width:45, height:45, alignItems:"center", justifyContent:"center"}},
                    el(RN.Text, {style:{fontSize:28}}, e)))),
            el(RN.View, {style:[k.pickerCatBar, {flexDirection:"row", alignItems:"center", height:40, paddingHorizontal:12, gap:14, borderTopWidth:1}]},
                el(RN.View, {style:[k.selected, {width:28, height:28, borderRadius:14, alignItems:"center", justifyContent:"center"}]},
                    el(RN.Text, {style:{color:s.name.color, fontSize:12, fontWeight:"700"}}, "G")),
                el(tab === "emoji" ? Smile : Sticker, {size:"xs", color:k.iconMuted.color}),
                el(RN.View, {style:{flex:1}}),
                canSwitch && props.onTab ? el(Press, {onPress:() => props.onTab(tab === "emoji" ? "sticker" : "emoji"), accessibilityRole:"button",
                    accessibilityLabel:tr(tab === "emoji" ? "Stickers" : "Emojis"), hitSlop:{top:8, bottom:8, left:8, right:8}},
                    el(tab === "emoji" ? Sticker : Smile, {size:"xs", color:k.icon.color})) : null,
                tab === "emoji" ? el(Backspace, {size:"xs", color:k.icon.color}) : null));
    }
    function NitroPreview(props) {
        useSettings("freeNitro");
        const s = useChatPreviewStyles(), k = usePreviewChrome(), [mode, setMode] = usePreviewMode(), on = props.on;
        const blank = {pick:0, sent:[], picker:null, open:true, pulse:null, tried:{}};
        const kinds = [settings.emojis && "emoji", settings.stickers && "sticker"].filter(Boolean);
        const [state, setState] = React.useState(blank), watching = on && kinds.length > 0 && mode === "watch";
        const update = change => setState(st => Object.assign({}, st, typeof change === "function" ? change(st) : change));
        const send = kind => update(st => ({picker:null, open:false, pulse:null, pick:st.pick + 1, sent:st.sent.concat([kind]).slice(-2), tried:Object.assign({}, st.tried, {[kind]:true})}));
        const link = settings.hyperlinks ? tr("a short link") : tr("a link");
        const story = useStory(watching, () => {
            const steps = [[0, () => setState(Object.assign({}, blank, {open:false}))]];
            kinds.forEach((kind, i) => {
                steps.push([i ? 600 : 900, () => update({pulse:{who:"smile", id:kind}}), tr(kind === "emoji" ? "You open the emoji picker" : i ? "Then you open the sticker picker" : "You open the sticker picker")],
                    [400, () => { animateLayout(); update({picker:kind, open:true}); }],
                    [1400, () => update({pulse:{who:"pick", id:"p" + kind}}), tr(kind === "emoji" ? "You pick a Nitro emoji from another server. Venus unlocks it so there's no lock" :
                        "You pick a Nitro sticker. Venus unlocks it too")],
                    [500, () => { animateLayout(); send(kind); }, tr(kind === "emoji" ? "Venus sends it as {link}, and everyone sees the emoji" : "It's sent as {link} too, and everyone sees the sticker", {link})],
                    [1200, () => {}]);
            });
            return steps;
        }, [settings.emojis, settings.stickers, settings.hyperlinks]);
        // Try it: the picker opens under the chat; tap the unlocked Nitro emoji or sticker (or the emoji button in the message bar) to send it.
        const tab = watching ? state.picker : on && kinds.length && state.open ? (state.picker && kinds.includes(state.picker) ? state.picker : kinds[0]) : null;
        const messages = state.sent.map((kind, i) => el(RN.View, {key:"msg" + state.pick + ":" + i}, popIn("msg" + i + kind + state.pick,
            previewMessage(s, "m" + i, tr("You"), "#5865f2", tr("Today at 4:01 PM"), el(RN.View, {style:{alignItems:"flex-start", paddingTop:2}},
                el(NitroArt, {key:kind, kind, item:NITRO_SAMPLES[kind], play:state.pick}))))));
        const sample = state.sent.length || watching ? null : el(RN.View, {key:"empty", style:{paddingHorizontal:16, paddingVertical:20}},
            el(RN.Text, {style:[s.muted, {textAlign:"center"}]}, tr("Nothing sent yet")));
        const last = state.sent[state.sent.length - 1], item = last && NITRO_SAMPLES[last];
        const sentAs = item ? el(RN.View, {key:"sent", style:{paddingHorizontal:16, paddingBottom:4}},
            el(RN.Text, {style:s.muted, numberOfLines:1}, tr("Sent as {link}", {link:settings.hyperlinks ? "[" + item.name + "](\u2026)" :
                last === "emoji" ? "https://cdn.discordapp.com/emojis/\u2026.gif" : "https://media.discordapp.net/stickers/\u2026.png"}))) : null;
        const picker = tab ? el(NitroPicker, {key:"picker", k, s, kinds, tab, pulse:state.pulse, highlight:watching && state.pulse && state.pulse.who === "pick",
            onTab:watching ? null : kind => { animateLayout(); update({picker:kind, open:true}); },
            onPick:watching ? null : () => { animateLayout(); send(tab); }}) : null;
        const remaining = kinds.filter(kind => !state.tried[kind]);
        const tip = on && !watching && kinds.length ? previewTip(k, !tab ?
            tr(remaining.length ? "Tap the emoji button in the message bar to try a sticker" : "That's how everyone sees it. Tap the emoji button to send more") :
            remaining.length === kinds.length ? tr(tab === "emoji" ? "Tap the Nitro emoji below to send it as a link" : "Tap the Nitro sticker below to send it as a link") :
            remaining.length ? tr(tab === remaining[0] ? (tab === "sticker" ? "Tap the Nitro sticker below to send it as a link" : "Tap the Nitro emoji below to send it as a link") :
                remaining[0] === "sticker" ? "Now try a sticker: tap Stickers, then the Nitro sticker" : "Now try an emoji: tap Emojis, then the Nitro emoji") :
            tr("That's how everyone sees it. You can send more"), "down") : null;
        const togglePicker = on && !watching && kinds.length ? () => {
            animateLayout();
            update(st => ({open:!st.open, picker:!st.open ? (remaining[0] || st.picker || kinds[0]) : st.picker}));
        } : null;
        return el(RN.View, {key:"preview"}, on && kinds.length ? previewToggle(mode, value => { setMode(value); setState(blank); }) : null,
            previewScreen(s, "preview", "Nitro link preview", [el(RN.View, {key:"chat", style:{minHeight:watching ? 140 : 96}}, messages.length ? messages : sample), sentAs],
                {header:previewHeader(k, {title:"general"}),
                 footer:el(RN.View, {key:"foot"}, tip, previewInput(k, s, {placeholder:tr("Message {channel}", {channel:"#general"}),
                    pickerOpen:!!tab, onSmile:togglePicker, smileRipple:tapRipple(state.pulse, "smile", {left:-7, top:-7})}),
                    picker, watching ? storyStrip(k, s, story) : null)}));
    }
    function FreeNitroSettings() {
        useSettings("freeNitro");
        const ui=reviewUI();
        if (!React || !RN) return null;
        const on=enabled("freeNitro"), Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow, hasAny=!!(settings.emojis || settings.stickers);
        const groups=[
            !on ? offCard("status",venusIcon(8119,"NitroWheelIcon")) : !hasAny ? statusCard("status","Turn on emojis or stickers below.",
                {title:tr("Sending as links"),IconComponent:venusIcon(8119,"NitroWheelIcon")}) : null,
            el(NitroPreview,{key:"preview",on}),
            el(Group,{key:"send",title:tr("Send as links")},
                switchRow(Switch,"emojis","Emojis","Emojis from other servers, and animated emojis.",rowIcon(8719,"ChatSmileIcon")),
                switchRow(Switch,"stickers","Stickers","Stickers from other servers. Animated ones may not move.",rowIcon(11937,"StickerIcon"))),
            el(Group,{key:"style",title:tr("Link style")},
                switchRow(Switch,"hyperlinks","Short links","In chat it looks the same either way. Short links only change what's copied or quoted.",rowIcon(4776,"LinkIcon"))),
            footnote("note","Everyone sees the image, but it's a link, not a real Nitro emoji or sticker.")];
        return settingsBody(ui,groups);
    }
    // Pastel names: a live chat preview showing names in their own pastel color (and Sam with a role color).
    // The switches below (Replace role colors, Color message text) update the preview live.
    function PastelPreview(props) {
        useSettings("pastelize");
        const s=useChatPreviewStyles(), k=usePreviewChrome(), on=!!props.on;
        const tint=(seed,sat,light,fallback) => { const c=on && pastelColor(seed,sat,light); return c ? c.hex : fallback; };
        const people=[["Alex","#3ba55c",tr("Has anyone tried the new update?"),null],["Sam","#eb459e",tr("Yes, it looks great!"),"#e67e22"],["Jordan","#faa61a",tr("Same here.")]];
        const chat=people.map(([who,avatar,text,role],i) => {
            const kept=role && !settings.pastelAll;
            const name=kept ? role : tint(who,0.75,0.6,s.name.color);
            const body=on && settings.pastelContent && !kept ? tint(who,0.85,0.75,null) : null;
            return el(RN.View,{key:who},previewMessage(s,who,who,avatar,tr(["Today at 4:01 PM","Today at 4:03 PM","Today at 4:05 PM"][i]),
                el(RN.Text,{style:body ? [s.text,{color:body}] : s.text},text),{nameColor:name}));
        });
        return el(RN.View,{key:"preview"},
            previewScreen(s,"preview","Pastel names preview",[el(RN.View,{key:"chat"},chat)],
                {header:previewHeader(k,{title:"general"}),
                 footer:previewInput(k,s,{placeholder:tr("Message {channel}",{channel:"#general"})})}));
    }
    function PastelSettings() {
        useSettings("pastelize");
        const ui=reviewUI();
        if (!React || !RN) return null;
        const on=enabled("pastelize"), Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow;
        const groups=[
            on ? null : offCard("status",venusIcon(14795,"PaintPaletteIcon")),
            el(PastelPreview,{key:"preview",on}),
            el(Group,{key:"colors",title:tr("Colors")},
                switchRow(Switch,"pastelAll","Replace role colors","Every name uses its pastel color, even with a role color.",rowIcon(10398,"CrownIcon")),
                switchRow(Switch,"pastelContent","Color message text","What people write is colored too, in a lighter shade of their name.",rowIcon(5395,"TextIcon"))),
            footnote("note","Each person always gets the same color, on every device.")];
        return settingsBody(ui,groups);
    }
    // Device indicators: the icons shown where Discord shows them, inside the screen around them: a DM's header, the
    // member list and a profile, each following its own switch. Pick the screen, or change Alex's devices to see them update.
    const PLATFORM_DEMO = [{desktop:"online", mobile:"idle"}, {mobile:"online"}, {desktop:"dnd", web:"dnd"}, {embedded:"online", desktop:"idle"}];
    const PLATFORM_SCREENS = [["piDmHeader"], ["piUserList"], ["piProfile"]];
    const PLATFORM_PEOPLE = [["Sam", "#eb459e", {desktop:"online"}], ["Riley", "#faa61a", {mobile:"online"}]];
    // Discord's segmented control inside a preview, as its own component so its theme hook only runs while it's shown.
    function PreviewSegmented(props) { return venusSegmented(props); }
    function PlatformPreview(props) {
        useSettings("platformIndicators");
        const s = useChatPreviewStyles(), k = usePreviewChrome(), Press = RN.Pressable || RN.View;
        const blank = {demo:0, screen:"piDmHeader", pulse:null};
        const [state, setState] = React.useState(blank), demo = state.demo, on = props.on;
        const update = change => setState(st => Object.assign({}, st, typeof change === "function" ? change(st) : change));
        const shown = key => on && settings[key];
        const clients = PLATFORM_DEMO[demo % PLATFORM_DEMO.length];
        const statusOf = c => c.desktop || c.mobile || c.web || c.embedded || "offline";
        const icons = (place, c, keyed) => shown(place) ? popIn(place + ":" + (keyed || "") + demo, el(RN.View, {style:{flexDirection:"row", gap:2, alignItems:"center"}},
            Object.keys(c).map(platform => el(RN.View, {key:platform, accessible:true, accessibilityLabel:tr(PLATFORM_LABELS[platform]) + ": " + tr(PLATFORM_STATUS[c[platform]])},
                el(PlatformPng, {platform, color:PLATFORM_COLORS[c[platform]]}))))) : null;
        // Discord's avatar: a status dot, or a small phone instead when the only device is a phone (unless hidden).
        const avatar = (letter, color, c, size, ring) => {
            const mobileOnly = !!c.mobile && Object.keys(c).length === 1, phone = mobileOnly && !(on && settings.piHideMobile), dot = Math.round(size * 0.3);
            return el(RN.View, {style:{width:size, height:size}},
                el(RN.View, {style:{width:size, height:size, borderRadius:size / 2, backgroundColor:color, alignItems:"center", justifyContent:"center"}},
                    el(RN.Text, {style:{color:"#ffffff", fontWeight:"700", fontSize:Math.round(size * 0.42)}}, letter)),
                el(RN.View, {style:{position:"absolute", right:-2, bottom:-2, padding:Math.max(2, Math.round(size / 24)), borderRadius:size, backgroundColor:ring || s.chat.backgroundColor}},
                    phone ? el(RN.View, {style:{width:Math.round(dot * 0.72), height:Math.round(dot * 1.1), borderRadius:2, backgroundColor:STATUS_HEX[statusOf(c)]}}) :
                        el(RN.View, {style:{width:dot, height:dot, borderRadius:dot / 2, backgroundColor:STATUS_HEX[statusOf(c)]}})));
        };
        const ripple = tapRipple(state.pulse, "alex", {left:12, top:4});
        const screen = state.screen, Text = RN.Text;
        // A DM with Alex: Discord's header with the icons next to the name, a short chat and the message bar.
        const dm = () => [
            el(RN.View, {key:"msgs", style:{paddingTop:4}},
                previewMessage(s, "a1", "Alex", "#3ba55c", tr("Today at 4:01 PM"), el(Text, {style:s.text}, tr("Are you coming to the game tonight?"))),
                previewMessage(s, "a2", tr("You"), "#5865f2", tr("Today at 4:02 PM"), el(Text, {style:s.text}, tr("Yes, see you there!")))),
            previewInput(k, s, {placeholder:tr("Message {channel}", {channel:"@Alex"})})];
        const dmHeader = () => el(RN.View, {key:"hd"}, previewHeader(k, {title:"Alex", leading:avatar("A", "#3ba55c", clients, 32, k.header.backgroundColor),
            badges:icons("piDmHeader", clients), icons:[[7309, "PhoneCallIcon"], [10976, "VideoIcon"], [6473, "MagnifyingGlassIcon"]]}), ripple);
        // The member list: Discord's "Online — 3" header and a row per person, status under the name.
        const memberRow = (name, color, c, alex) => el(RN.View, {key:name, style:[{flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:16, paddingVertical:6},
            alex ? {marginHorizontal:8, paddingHorizontal:8, borderRadius:8} : null]},
            avatar(name.slice(0, 1), color, c, 32), el(RN.View, {style:{flex:1}},
                el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:6}}, el(Text, {style:[s.name, {fontSize:15}], numberOfLines:1}, name), icons("piUserList", c, name)),
                el(Text, {style:s.muted}, tr(PLATFORM_STATUS[statusOf(c)] || "Online"))), alex ? ripple : null);
        const list = () => [el(RN.View, {key:"members", style:{paddingTop:6, paddingBottom:8}},
            el(Text, {style:[k.category, {paddingHorizontal:16, paddingBottom:4}]}, tr("Online").toUpperCase() + " \u2014 3"),
            memberRow("Alex", "#3ba55c", clients, true), PLATFORM_PEOPLE.map(([n, color, c]) => memberRow(n, color, c, false)))];
        // A profile: Discord's banner, the 80px avatar with 6px cutout overlapping it, the name with the icons and action buttons.
        const profile = () => [el(RN.View, {key:"profile"},
            el(RN.View, {style:{height:68, backgroundColor:"#2d7d46"}}),
            el(RN.View, {style:{paddingHorizontal:16, marginTop:-42, gap:6, paddingBottom:12}},
                el(RN.View, {style:{alignSelf:"flex-start", padding:6, borderRadius:46, backgroundColor:s.chat.backgroundColor}}, avatar("A", "#3ba55c", clients, 72), ripple),
                el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:8, marginTop:2}}, el(Text, {style:[s.name, {fontSize:22, fontWeight:"800"}]}, "Alex"), icons("piProfile", clients)),
                el(Text, {style:[s.muted, {fontSize:14, fontWeight:"600"}]}, "alex"),
                el(RN.View, {style:{flexDirection:"row", gap:8, marginTop:4}},
                    el(RN.View, {style:[k.brand, {flex:1, borderRadius:20, paddingVertical:10, alignItems:"center", flexDirection:"row", justifyContent:"center", gap:8}]},
                        el(venusIcon(5386, "ChatIcon"), {size:"sm", color:k.brandText.color}), el(Text, {style:[k.brandText, {fontWeight:"600"}]}, tr("Message"))),
                    el(RN.View, {style:[k.secondary, {width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center"}]},
                        el(venusIcon(7309, "PhoneCallIcon"), {size:"sm", color:k.secondaryText.color})),
                    el(RN.View, {style:[k.secondary, {width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center"}]},
                        el(venusIcon(10976, "VideoIcon"), {size:"sm", color:k.secondaryText.color})))))];
        const body = screen === "piDmHeader" ? dm() : screen === "piUserList" ? list() : profile();
        const header = screen === "piDmHeader" ? dmHeader() : screen === "piUserList" ? previewHeader(k, {title:"general"}) : null;
        const off = on && !settings[screen] ? el(RN.View, {key:"off", style:{marginHorizontal:12, marginBottom:8, padding:10, borderRadius:8, backgroundColor:"#4e505833"}},
            el(Text, {style:[s.muted, {fontSize:13}]}, tr("Off in your options: no icons here"))) : null;
        const now = Object.keys(clients).map(platform => tr(PLATFORM_LABELS[platform]) + " (" + tr(PLATFORM_STATUS[clients[platform]]) + ")").join(", ");
        const tryBar = on ? el(RN.View, {key:"try", style:[k.strip, {padding:12, gap:10}]},
            el(PreviewSegmented, {key:"platformScreen", value:screen, onChange:value => update({screen:value}),
                items:PLATFORM_SCREENS.map(([key]) => ({value:key, label:tr(key === "piDmHeader" ? "DM" : key === "piUserList" ? "Members" : "Profile")}))}),
            el(Press, {onPress:() => { animateLayout(); update(st => ({demo:st.demo + 1, pulse:{who:"alex", id:"t" + (st.demo + 1)}})); },
                accessibilityRole:"button", accessibilityHint:tr("Tap to change Alex's devices"),
                style:[k.secondary, {borderRadius:20, paddingVertical:10, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8}]},
                el(venusIcon(14470, "LaptopPhoneIcon"), {size:"sm", color:k.secondaryText.color}),
                el(Text, {style:[k.secondaryText, {fontWeight:"600"}]}, tr("Change Alex's devices"))),
            el(Text, {style:[s.muted, {fontSize:13}]}, tr("Alex is on: {devices}", {devices:now}))) : null;
        return el(RN.View, {key:"preview"},
            previewScreen(s, "preview", "Device indicators preview", [el(RN.View, {key:"screen:" + screen, style:{minHeight:236}}, popIn("screen:" + screen,
                el(RN.View, null, body))), off],
                {header, footer:tryBar}));
    }
    function PlatformSettings() {
        useSettings("platformIndicators");
        const ui=reviewUI();
        if (!React || !RN) return null;
        const on=enabled("platformIndicators"), Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow;
        const hasPlace=!!(settings.piDmHeader || settings.piUserList || settings.piProfile);
        const groups=[
            !on ? offCard("status",venusIcon(14470,"LaptopPhoneIcon")) : !hasPlace ? statusCard("status","Turn on at least one place below.",
                {title:tr("Device indicators"),IconComponent:venusIcon(14470,"LaptopPhoneIcon")}) : null,
            el(PlatformPreview,{key:"preview",on}),
            el(Group,{key:"where",title:tr("Show icons")},
                switchRow(Switch,"piDmHeader","In DMs","Next to the name at the top of a DM.",rowIcon(6503,"EnvelopeIcon")),
                switchRow(Switch,"piUserList","In lists","Member list, friends, DM list and voice channels.",rowIcon(5404,"GroupIcon")),
                switchRow(Switch,"piProfile","On profiles","Next to the name on a profile.",rowIcon(11177,"UserIcon"))),
            el(Group,{key:"avatars",title:tr("Avatars")},
                switchRow(Switch,"piHideMobile","Hide the phone badge","Avatars show a plain status dot, since the icons already show mobile.",rowIcon(6376,"MobilePhoneIcon"))),
            footnote("note","Icons are colored by status on each device: desktop, mobile, web, console or VR.")];
        return settingsBody(ui,groups);
    }
    const deletedHighlight = {};
    const highlightProcessed = new Map();
    const highlightRecent = new Map();
    function highlightColorHex(choice, defaultHex) {
        if (typeof choice !== "string" || choice === "default") return defaultHex;
        const clean = normalizeHighlightColor(choice);
        return clean.startsWith("#") ? clean : HIGHLIGHT_COLOR_MAP[clean] || defaultHex;
    }
    function highlightProcess(colorStr) {
        if (!RN || typeof RN.processColor !== "function") return null;
        if (highlightProcessed.owner !== RN.processColor) {
            highlightProcessed.clear();
            highlightProcessed.owner = RN.processColor;
        }
        if (highlightProcessed.has(colorStr)) return highlightProcessed.get(colorStr);
        let value = null;
        try { value = RN.processColor(colorStr); } catch (_) {}
        if (value != null) highlightProcessed.set(colorStr, value);
        return value;
    }
    function highlightEncodeGutter(colorInt, mult) {
        if (typeof colorInt !== "number") return colorInt;
        if (!Number.isFinite(mult) || mult <= 1) return colorInt;
        const m = Math.max(2, Math.min(8, Math.floor(mult)));
        return ((256 - m) << 24) | (colorInt & 0x00ffffff);
    }
    function highlightCustomPair(hex, mult) {
        const gutter = highlightProcess(hex);
        const background = highlightProcess(hex + "1a");
        if (gutter == null || background == null) return null;
        return {backgroundColor:background, gutterColor:highlightEncodeGutter(gutter, mult)};
    }
    function highlightMentioned(source, message) {
        if (source && source.mentioned || message && message.mentioned) return true;
        if (!source || typeof source !== "object") return false;
        if (source.mention_everyone || source.mentionEveryone) return true;
        const me = currentUser();
        const myId = me && me.id;
        if (!myId) return false;
        const mentions = source.mentions;
        if (Array.isArray(mentions) && mentions.some(u => u && (u === myId || u.id === myId))) return true;
        const ref = source.referenced_message || source.referencedMessage && source.referencedMessage.message;
        const refAuthor = ref && ref.author && ref.author.id;
        if (refAuthor && refAuthor === myId) return true;
        return false;
    }
    function highlightRemember(channelId, id, source) {
        if (!features.messageHighlight || typeof channelId !== "string" || !channelId || typeof id !== "string" || !id) return;
        const key = channelId + ":" + id;
        if (highlightRecent.has(key)) highlightRecent.delete(key);
        else if (highlightRecent.size >= 80) highlightRecent.delete(highlightRecent.keys().next().value);
        highlightRecent.set(key, {
            channelId,
            id,
            content:source && typeof source.content === "string" ? source.content : "",
            embeds:source && Array.isArray(source.embeds) ? source.embeds : null,
            components:source && Array.isArray(source.components) ? source.components : null
        });
    }
    function messageHighlightRedraw() {
        let d = dispatcher;
        if (!d) {
            const mod = inspectedExport(585, "default");
            if (mod && typeof mod.dispatch === "function") d = mod.dispatch.bind(mod);
        }
        if (typeof d !== "function" || !highlightRecent.size) return;
        const entries = Array.from(highlightRecent.values());
        entries.forEach(entry => {
            let live = null;
            try { if (msgStore && typeof msgStore.getMessage === "function") live = msgStore.getMessage(entry.channelId, entry.id); } catch (_) {}
            const content = live && typeof live.content === "string" ? live.content : entry.content;
            const embeds = live && Array.isArray(live.embeds) ? live.embeds : entry.embeds;
            const components = live && Array.isArray(live.components) ? live.components : entry.components;
            const restore = {id:entry.id, channel_id:entry.channelId};
            if (embeds && embeds.length) restore.embeds = embeds.slice();
            if (components && components.length) restore.components = components.slice();
            if (content) {
                restore.content = content;
                const temp = Object.assign({}, restore, {content:content + "\u200b"});
                try { d({type:"MESSAGE_UPDATE", message:temp}); } catch (_) {}
                later(() => { try { d({type:"MESSAGE_UPDATE", message:restore}); } catch (_) {} }, 60);
            } else if (restore.embeds || restore.components) {
                try { d({type:"MESSAGE_UPDATE", message:restore}); } catch (_) {}
            }
        });
    }
    function messageRow(orig, self, args) {
        const result = orig.apply(self,args), row = args[0];
        if (!result || !row || row.rowType !== 1 || !result.message) return result;
        const pastelOn = enabled("pastelize"), translateOn = enabled("translate"), noDeleteOn = enabled("noDelete"), highlightOn = enabled("messageHighlight");
        let message = result.message;
        if (pastelOn) message = pastelMessage(message,row.message);
        if (features.pastelize && message.referencedMessage && message.referencedMessage.message) {
            const reply = pastelReply(message.referencedMessage.message);
            if (reply !== message.referencedMessage.message) message = Object.assign({},message,{referencedMessage:Object.assign({},message.referencedMessage,{message:reply})});
        }
        let next = message === result.message ? result : Object.assign({},result,{message});
        if (!translateOn && !features.translate && !(noDeleteOn && (edits.size || deleted.size)) && !highlightOn && !features.messageHighlight) return next;
        const source = row.message || message;
        const channelId = source.channel_id || source.channelId || message.channelId;
        const id = source.id || message.id;
        // Before edit history, so the crossed-out old versions above it stay as they were written.
        if (translateOn) {
            let shown = translateRow(next.message, source, channelId, id);
            if (shown.referencedMessage) shown = translateReply(shown, source, channelId, id);
            if (shown !== next.message) next = Object.assign({},next,{message:shown});
        } else if (features.translate) translateSeen(source, channelId, id, null);
        if (edits.size && noDeleteOn) {
            const shown = withEditHistory(next.message, channelId, id);
            if (shown !== next.message) next = Object.assign({},next,{message:shown});
        }
        const bucket = deleted.size && noDeleteOn && deletedByChannel.get(channelId);
        const isDeletedRow = !!(bucket && bucket.has(deletedKey(channelId,id)));
        const isMentionRow = !isDeletedRow && highlightMentioned(source, next.message);
        if (features.messageHighlight && (isDeletedRow || isMentionRow || next.backgroundHighlight))
            highlightRemember(channelId, id, source);
        const mult = highlightOn ? settings.messageHighlightThickness : 1;
        if (isDeletedRow && RN && typeof RN.processColor === "function") {
            // Native row highlight schema from RowGeneratorConstants (7379). No injected notice, altered
            // message content, or AutoMod state. Only retained local rows are tinted.
            const delHex = highlightOn ? highlightColorHex(settings.messageHighlightDeletedColor, "#f23f43") : "#f23f43";
            const custom = highlightCustomPair(delHex, mult);
            if (custom) {
                next = Object.assign({},next,{backgroundHighlight:custom});
            } else {
                if (deletedHighlight.owner !== RN.processColor) {
                    deletedHighlight.owner = RN.processColor;
                    deletedHighlight.gutter = RN.processColor("#f23f43");
                    deletedHighlight.background = RN.processColor("#f23f431a");
                }
                next = Object.assign({},next,{backgroundHighlight:{backgroundColor:deletedHighlight.background,gutterColor:highlightEncodeGutter(deletedHighlight.gutter, mult)}});
            }
        } else if (highlightOn && RN && typeof RN.processColor === "function") {
            const existing = next.backgroundHighlight;
            if (isMentionRow && settings.messageHighlightPingColor !== "default") {
                const pingHex = highlightColorHex(settings.messageHighlightPingColor, "#f0b232");
                const custom = highlightCustomPair(pingHex, mult);
                if (custom) next = Object.assign({},next,{backgroundHighlight:custom});
            } else if (existing && typeof existing.gutterColor === "number" && mult > 1) {
                next = Object.assign({},next,{backgroundHighlight:Object.assign({},existing,{gutterColor:highlightEncodeGutter(existing.gutterColor, mult)})});
            }
        }
        return next;
    }
    // Deferred retention bookkeeping; runs immediately where timers are absent.
    function later(fn, ms, immediate) { if (typeof global.setTimeout === "function") return global.setTimeout(fn, ms); if (immediate !== false) fn(); return undefined; }
    function inspectedExport(id, key) {
        // Demand-load only a verified bundled helper at the UI action/render boundary.
        // No module scans, remote scripts, or eager initialization of unrelated screens.
        if (typeof global.__r !== "function") return null;
        try { const exports = global.__r(id); return exports && exports[key]; } catch (_) { return null; }
    }
    const PLATFORM_COLORS = {online:"#23a55a",idle:"#f0b232",dnd:"#f23f43"};
    const PLATFORM_LABELS = {desktop:"Desktop",mobile:"Mobile",web:"Web",embedded:"Console",vr:"VR"};
    const PLATFORM_STATUS = {online:"Online",idle:"Idle",dnd:"Do Not Disturb"};
    // This user's clients as a stable key, so a badge only re-renders when its own presence changes.
    function platformClients(userId) {
        let clients = presenceStore.getClientStatus(userId);
        const current = userStore && userStore.getCurrentUser();
        if (current && current.id === userId && sessionsStore && typeof sessionsStore.getSessions === "function") {
            clients = {};
            Object.values(sessionsStore.getSessions() || {}).forEach(session => {
                const client = session.clientInfo && session.clientInfo.client;
                if (client && client !== "unknown") clients[client] = session.status;
            });
        }
        return clients || null;
    }
    function clientsKey(clients) {
        if (!clients) return "";
        let key = "";
        for (const name in clients) key += name + ":" + clients[name] + ",";
        return key;
    }
    function platformKey(userId) { return clientsKey(presenceStore && platformClients(userId)); }
    // One listener per store for every badge on screen, not two per badge. Each change works
    // out a person's clients once, however many badges show them, and wakes only those badges.
    const platformSubs = new Map(), platformStores = new Set();
    // PresenceStore changes for every presence update of anyone: the key is built without temporary arrays.
    function platformChanged() {
        platformSubs.forEach((entry, userId) => {
            const key = platformKey(userId);
            if (key !== entry.key) { entry.key = key; entry.fns.forEach(fn => fn()); }
        });
    }
    function platformSubscribe(userId, fn) {
        let entry = platformSubs.get(userId);
        if (!entry) platformSubs.set(userId, entry = {key:platformKey(userId), fns:new Set()});
        entry.fns.add(fn);
        [presenceStore,sessionsStore].forEach(store => {
            if (store && !platformStores.has(store) && typeof store.addChangeListener === "function" && typeof store.removeChangeListener === "function") {
                platformStores.add(store); store.addChangeListener(platformChanged);
            }
        });
        return () => {
            entry.fns.delete(fn);
            if (!entry.fns.size && platformSubs.get(userId) === entry) platformSubs.delete(userId);
            if (!platformSubs.size) { platformStores.forEach(store => store.removeChangeListener(platformChanged)); platformStores.clear(); }
        };
    }
    function PlatformBadges(props) {
        useSettings("platformIndicators");
        const [,update] = React.useState(0);
        // SessionsStore is the upstream source for the current user's own clients.
        if (enabled("platformIndicators")) {
            if (!sessionsStore) sessionsStore = inspectedExport(4855,"default");
            if (!presenceStore) presenceStore = inspectedExport(4877,"default");
            if (!userStore) userStore = inspectedExport(1378,"default");
        }
        const userId = props.userId;
        React.useEffect(() => platformSubscribe(userId, () => update(n => n+1)),[presenceStore,sessionsStore,userId]);
        if (!enabled("platformIndicators") || !presenceStore || !RN) return null;
        const clients = platformClients(userId);
        if (!clients) return null;
        const colors = PLATFORM_COLORS, labels = PLATFORM_LABELS;
        // One icon per reported client, in presence order.
        const icons = Object.keys(clients).filter(key => key !== "unknown" && colors[clients[key]]).map(key =>
            el(RN.View,{key,accessible:true,accessibilityRole:"image",accessibilityLabel:tr(labels[key] || key)+": "+tr(PLATFORM_STATUS[clients[key]] || clients[key])},
                el(PlatformPng,{platform:key,color:colors[clients[key]]})));
        return icons.length ? el(RN.View,{key:"venus-platforms",style:{flexDirection:"row",gap:2,alignItems:"center"}},icons) : null;
    }
    function platformName(orig, self, args) {
        if (React) useSettings("platformIndicators");
        const tree = orig.apply(self,args), user = args[0] && args[0].user;
        if (!enabled("platformIndicators") || !settings.piProfile || !React || !RN || !tree || !user) return tree;
        return el(RN.View,{style:{flexDirection:"row",flexWrap:"wrap",gap:6,alignItems:"center"}},tree,el(PlatformBadges,{userId:user.id}));
    }
    // DM header (HBC fn58674 PrivateChannelHeader) renders its name inside a separate
    // ChannelTitle component (fn58681, props title/accessibleTitle/userId), so the badge
    // goes inside ChannelTitle's own output: right after the name, before the arrow.
    // One cached wrapper per component and placement, so React keeps the same element type.
    const platformTypes = {piDmHeader:new WeakMap(), piUserList:new WeakMap()};
    function platformType(target, option) {
        let type = platformTypes[option].get(target);
        if (!type) platformTypes[option].set(target, type = function () { return platformPlacement(target,this,arguments,option); });
        return type;
    }
    function platformHeader(orig,self,args) {
        if (React) useSettings("platformIndicators");
        const tree = orig.apply(self,args);
        if (!enabled("platformIndicators") || !settings.piDmHeader || !React || !RN || !tree) return tree;
        let swapped = false;
        function visit(node,depth) {
            if (!node || depth > 18 || typeof node !== "object") return node;
            if (Array.isArray(node)) { const next = node.map(child => visit(child,depth+1)); return next.some((c,i)=>c!==node[i]) ? next : node; }
            if (!node.props) return node;
            const p = node.props;
            if (!swapped && typeof node.type === "function" && "accessibleTitle" in p && "title" in p && typeof p.userId === "string") {
                swapped = true;
                const type = platformType(node.type,"piDmHeader");
                return el(type,Object.assign({},p,{key:node.key}));
            }
            const child = visit(p.children,depth+1);
            return child === p.children ? node : React.cloneElement(node,{children:child});
        }
        const next = visit(tree,0);
        return swapped ? next : placePlatformTree(tree,args[0] || {},"piDmHeader");
    }
    // DM list rows (MessagesItemChannelContent, fn65485): the name shares its line with the
    // server tag, so icons go in the right-side channelIcons row beside the muted/favorite
    // icon (props muted/selected/blocked), above the timestamp.
    function platformDmRow(orig,self,args) {
        if (React) useSettings("platformIndicators");
        const tree = orig.apply(self,args), channel = args[0] && args[0].channel;
        if (!enabled("platformIndicators") || !settings.piUserList || !React || !RN || !tree || !channel) return tree;
        const userId = channel.type === 1 && Array.isArray(channel.recipients) && channel.recipients.length === 1 && channel.recipients[0];
        if (!userId) return tree;
        const isIcon = child => child && child.props && "muted" in child.props && "selected" in child.props && "blocked" in child.props;
        let added = false;
        const next = cloneTree(tree,(node,p) => {
            if (added || node.type === RN.Text) return p;
            const children = Array.isArray(p.children) ? p.children : [p.children];
            if (!children.some(isIcon)) return p;
            added = true;
            return Object.assign({},p,{children:children.concat(el(RN.View,{key:"venus-platform-dm",style:{marginRight:4}},el(PlatformBadges,{userId})))});
        },0);
        return added ? next : placePlatformTree(tree,args[0] || {},"piUserList");
    }
    function platformPlacement(orig,self,args,option) {
        if (React) useSettings("platformIndicators");
        return placePlatformTree(orig.apply(self,args),args[0] || {},option);
    }
    // Pure tree transform: header/DM fallbacks MUST NOT subscribe a second time.
    // Their chosen placement changes while loading, changing channels or toggling
    // settings; putting hooks here changes the parent fiber's hook count.
    function placePlatformTree(tree,props,option) {
        if (!enabled("platformIndicators") || (option && !settings[option]) || !React || !RN || !tree) return tree;
        const channel = props.channel || channelStore && props.channelId && channelStore.getChannel(props.channelId);
        const userId = props.user && props.user.id || props.userId || channel && channel.type === 1 && channel.recipients && channel.recipients.length === 1 && channel.recipients[0];
        if (!userId) return tree;
        // Verified UserRow exposes label; private headers / DM content expose a
        // channel-title Text; voice MemberRowItem exposes its username Text. Preserve
        // every handler, subtitle, trailing action and frozen child.
        let added = false;
        return cloneTree(tree,(node,p) => {
            if (added) return p;
            if (p.label != null && typeof p.label !== "string" && typeof p.label !== "number") {
                added = true;
                return Object.assign({},p,{label:el(RN.View,{key:"venus-platform-label",style:{flexDirection:"row",alignItems:"center",gap:6,flexShrink:1}},p.label,el(PlatformBadges,{userId}))});
            }
            const children = Array.isArray(p.children) ? p.children : [p.children];
            const title = children.find(child => child && child.props && (child.type === RN.Text && typeof child.props.children === "string" || typeof child.props.variant === "string" && /(?:channel-title|heading|semibold)/.test(child.props.variant) || typeof child.props.userName === "string" && "userId" in child.props));
            // A React Native Text must not contain a View.
            if (!title || node.type === RN.Text) return p;
            added = true;
            return Object.assign({},p,{children:children.map(child => child !== title ? child : el(RN.View,{key:"venus-platform-title",style:{flexDirection:"row",alignItems:"center",gap:6,flexShrink:1}},child,el(PlatformBadges,{userId})))});
        },0);
    }
    const platformRenderers = new WeakMap();
    function platformRow(row) {
        // Swap a list row's private UserRow for a cached wrapper adding badges after its label.
        if (!row || typeof row !== "object" || typeof row.type !== "function" || !React) return row;
        return el(platformType(row.type,"piUserList"),Object.assign({},row.props,{key:row.key}));
    }
    function wrapProfileTree(tree, target, operation, cache) {
        if (!tree || !target || !React) return tree;
        let patched = cache.get(target);
        if (!patched) {
            patched = function () { return operation(target,this,arguments); };
            cache.set(target,patched);
        }
        // cloneTree transforms props, not element types; replace the specific named
        // child without invoking it outside React's hook lifecycle.
        function visit(node,depth) {
            if (!node || depth>18 || typeof node!=="object" || !node.props) return node;
            if (node.type === target) return el(patched,Object.assign({},node.props,{key:node.key}));
            const children=node.props.children;
            if (Array.isArray(children)) {
                const next=children.map(child=>visit(child,depth+1));
                return next.some((child,i)=>child!==children[i]) ? React.cloneElement(node,{children:next}) : node;
            }
            const child=visit(children,depth+1);
            return child===children ? node : React.cloneElement(node,{children:child});
        }
        return visit(tree,0);
    }
    function hiddenInfo(orig,self,args) {
        if (React) useSettings("hiddenChannels");
        const tree = orig.apply(self,args), channel = args[0] && args[0].channel;
        if (!tree || !React || !RN || !hiddenMetadata(channel)) return tree;
        // Discord already draws its own locked-channel icon (TextLockIcon, the # with a small lock) for these rows,
        // so a second lock beside the name only doubled it. Screen readers still hear that the channel is locked.
        return el(RN.View,{style:{flexDirection:"row",alignItems:"center"},accessible:true,accessibilityLabel:hiddenName(channel)+", "+tr("locked")},tree);
    }
    function authorizationUrl(result) {
        // Do not depend on a browser-complete global URL / URLSearchParams in RN.
        // Rebuild ONLY our fixed HTTPS endpoint; untrusted query keys cannot add
        // credentials, change the host, request another client mod or leak a token.
        const location = typeof result === "string" ? result : result && result.location;
        if (typeof location !== "string" || location.length > 8192) throw new Error("Invalid authorization redirect");
        const match = /^https:\/\/manti\.vendicated\.dev\/api\/reviewdb\/auth\?([^#]*)$/.exec(location);
        if (!match) throw new Error("Invalid authorization redirect");
        const values = {};
        match[1].split("&").forEach(part => {
            const index = part.indexOf("="), key = decodeURIComponent(index < 0 ? part : part.slice(0,index));
            if (!["code","error","error_description"].includes(key)) return;
            if (owns(values,key)) throw new Error("Invalid authorization redirect");
            values[key] = decodeURIComponent((index < 0 ? "" : part.slice(index+1)).replace(/\+/g," "));
        });
        if (values.error) throw new Error(values.error === "access_denied" ? "Authorization cancelled" : "Discord did not authorize ReviewDB");
        if (!values.code || values.code.length > 2048 || /[\s\u0000-\u001f]/.test(values.code)) throw new Error("Invalid authorization redirect");
        return REVIEW_API+"/auth?code="+encodeURIComponent(values.code)+"&returnType=json&clientMod=vendetta";
    }
    async function reviewJson(url,options,timeoutMessage) {
        const controller = typeof global.AbortController === "function" ? new global.AbortController() : null;
        let timer;
        const task = Promise.resolve().then(async () => {
            const response = await global.fetch(url,Object.assign({credentials:"omit",headers:{accept:"application/json","content-type":"application/json"}},options,controller ? {signal:controller.signal} : {}));
            let result;
            try {result = await response.json();} catch (_) {throw new Error("ReviewDB returned an unreadable response (HTTP "+response.status+")");}
            if (!response.ok || !result || result.success === false) throw new Error(result && result.message || "ReviewDB HTTP "+response.status);
            return result;
        });
        // Abort alone is insufficient on Android versions without AbortController,
        // or on fetch implementations that don't reject when the signal aborts.
        const timeout = new Promise((resolve,reject) => {
            if (global.setTimeout) timer = global.setTimeout(() => {reject(new Error(timeoutMessage || "ReviewDB took too long to respond. Try again."));if (controller) controller.abort();},15000);
        });
        try {return await Promise.race([task,timeout]);}
        finally {if (timer !== undefined && global.clearTimeout) global.clearTimeout(timer);}
    }
    async function reviewRequest(path, method, body) {
        if (!enabled("reviewDB") || typeof global.fetch !== "function") throw new Error("ReviewDB is disabled or networking is unavailable");
        if (!/^\/(users(?:\/\d{17,20}\/reviews)?|reports)(?:\?|$)/.test(path)) throw new Error("Invalid ReviewDB request");
        // Credentials go in the Authorization header as ReviewDB's API expects, never in
        // JSON bodies (which proxies and error reporters are more likely to log).
        const token = method && method !== "GET" ? reviewAuth() : "";
        const headers = {accept:"application/json","content-type":"application/json",...(token ? {authorization:token} : {})};
        return reviewJson(REVIEW_API+path,{method:method || "GET",headers,...(body ? {body:JSON.stringify(body)} : {})});
    }
    function clearReviewAuth() {
        // Every Discord logout lands here: only rewrite preferences when a sign-in was saved.
        const saved=!!(reviewToken || reviewAccount);
        reviewAuthAttempt++;reviewToken="";reviewAccount=null;reviewAuthState="idle";reviewAuthError="";
        reviewCache.clear();if (saved) save();notify("reviewDB");
    }
    // One UserStore listener for every review view, and it only wakes them when the signed-in
    // account actually changes. Before, each open view re-rendered every review view on any user update.
    let reviewWatchers=0, reviewWatchStore=null, reviewWatchId;
    function reviewUserChanged() {
        const id=currentId();
        if (id===reviewWatchId) return;
        reviewWatchId=id;
        reviewAuth();
        notify("reviewDB");
    }
    function useReviews() {
        useSettings("reviewDB");
        React.useEffect(() => {
            const store=userStore;
            if (!store || typeof store.addChangeListener!=="function") return;
            if (!reviewWatchers++) { reviewWatchStore=store; reviewWatchId=currentId(); store.addChangeListener(reviewUserChanged); }
            return () => {
                if (--reviewWatchers || !reviewWatchStore) return;
                if (typeof reviewWatchStore.removeChangeListener==="function") reviewWatchStore.removeChangeListener(reviewUserChanged);
                reviewWatchStore=null;
            };
        },[userStore]);
    }
    function currentId() { const user=userStore && userStore.getCurrentUser(); return user && user.id; }
    // Discord design-system parts traced in the pinned HBC98 bundle. Demand-loaded at
    // render/action time only; no extra Metro factories are wrapped for them.
    const reviewExports=new Map();
    let reviewParts=null;
    function reviewUI() {
        // Once every part has loaded, reuse the same object: this runs on every render.
        if (reviewParts) return reviewParts;
        // Keep successful exports, never a partially initialized UI snapshot.
        // Missing exports must be retried when Metro finishes initializing them.
        const x=(id,key) => {
            const slot=id+":"+key;
            if (reviewExports.has(slot)) return reviewExports.get(slot);
            const value=inspectedExport(id,key);
            if (value != null) reviewExports.set(slot,value);
            return value;
        };
        let tokens=null;
        try { const t=typeof global.__r==="function" && global.__r(588); tokens=t && (t.default || t); } catch (_) {}
        const parts={TableRow:x(5916,"TableRow"),TableRowGroup:nativeRowGroup || x(5997,"TableRowGroup"),TableSwitchRow:nativeSwitchRow || x(6621,"TableSwitchRow"),
            Stack:x(5280,"Stack"),Card:x(5918,"Card"),FormRow:x(8057,"FormRow"),FormLabel:x(8057,"FormLabel"),FormSubLabel:x(8057,"FormSubLabel"),
            TextInput:x(6021,"TextInput"),Send:x(4778,"SendMessageIcon"),ActionSheet:x(6624,"ActionSheet"),Header:x(6571,"BottomSheetTitleHeader"),
            Close:x(6619,"ActionSheetCloseButton"),sheets:x(4801,"default"),showSheet:x(4801,"showActionSheet"),simpleSheet:x(6616,"showSimpleActionSheet"),clipboard:x(6614,"Clipboard"),
            alerts:x(5205,"default"),toasts:x(4531,"default"),pushModal:x(4694,"pushModal"),popModal:x(4694,"popModal"),OAuth:oauthModal || x(8510,"default"),
            createStyles:x(4837,"createStyles"),theme:x(4551,"useThemeContext"),colors:tokens && tokens.colors};
        if (Object.keys(parts).every(key => parts[key] != null)) reviewParts=parts;
        return parts;
    }
    let reviewToastSeq = 0;
    // Discord's own toasts carry an icon for what just happened; IconComponent is optional (venusIcon).
    function reviewToast(ui,content,IconComponent) {
        try { if (ui.toasts && typeof ui.toasts.open==="function") ui.toasts.open(Object.assign({key:"venus-toast:" + (++reviewToastSeq),content:tr(content)},IconComponent ? {IconComponent} : null)); } catch (_) {}
    }
    function hideReviewSheet(ui,key) { try { if (ui.sheets && typeof ui.sheets.hideActionSheet==="function") ui.sheets.hideActionSheet(key); } catch (_) {} }
    // Styles from Discord's createStyles: semantic tokens resolve
    // per theme. Decided once so a mounted card never changes its hook count.
    let reviewStyleHook, reviewStylesTried=false;
    function useReviewStyles(ui) {
        if (!reviewStylesTried) {
            reviewStylesTried=true;
            const c=ui.colors;
            if (typeof ui.createStyles==="function" && c) try {
                reviewStyleHook=ui.createStyles({card:{backgroundColor:c.CARD_BACKGROUND_DEFAULT,borderRadius:16,padding:8},
                    row:{backgroundColor:c.CARD_SECONDARY_BG},text:{color:c.TEXT_DEFAULT},muted:{color:c.TEXT_MUTED},
                    placeholder:{color:c.INPUT_PLACEHOLDER_TEXT_DEFAULT}});
            } catch (_) { reviewStyleHook=null; }
        }
        let styles=null;
        if (reviewStyleHook) try { styles=reviewStyleHook(); } catch (_) {}
        return styles || {card:{borderRadius:16,padding:8},row:{},text:{},muted:{},placeholder:{}};
    }
    function ReviewSettings() {
        useReviews();
        const ui=reviewUI();
        if (!React || !RN || !ui.TableRow) return null;
        const authenticated=!!reviewAuth(), pending=reviewAuthState==="exchanging", on=enabled("reviewDB");
        const Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow;
        const me=currentUser(), myName=me && (me.globalName || me.global_name || me.username);
        const groups=[
            !on ? offCard("status",venusIcon(7358,"ThumbsUpIcon")) :
                statusCard("status",authenticated ? "You can read, write, delete and report reviews." : "You can read reviews. Sign in to write your own.",
                    {title:authenticated && myName ? tr("Signed in as {name}",{name:myName}) : tr(pending ? "Signing in..." : "Reading reviews"),
                        IconComponent:venusIcon(7358,"ThumbsUpIcon"),leading:authenticated && me ? avatarBubble(me,40) : null}),
            // One row: the action you can take now. The status card already says whether you're signed in.
            el(Group,{key:"auth",title:tr("Account")},
                authenticated ? el(ui.TableRow,{key:"logout",label:tr("Sign out of ReviewDB"),icon:rowIcon(9348,"DoorExitIcon"),variant:"danger",onPress:clearReviewAuth,
                    subLabel:tr("ReviewDB stays in Discord's Authorized Apps until you remove it there.")}) :
                el(ui.TableRow,{key:"login",label:tr(pending ? "Signing in..." : "Sign in to ReviewDB"),icon:rowIcon(6374,"KeyIcon"),
                    arrow:true,disabled:!on || pending,onPress:authenticateReviews,subLabel:reviewAuthError || tr("Needed to post, delete or report reviews. Never uses your Discord token.")})),
            el(Group,{key:"settings",title:tr("Display")},
                switchRow(Switch,"reviewWarning","Show the be-respectful note","ReviewDB's reminder to be kind, shown above reviews.",rowIcon(8699,"ShieldIcon"))),
            footnote("note","Reviews come from manti.vendicated.dev. Opening reviews sends that profile's or server's ID to ReviewDB.")];
        return settingsBody(ui,groups);
    }
    // A live chat preview: Alex's edited message with earlier versions faded and crossed out above it, and Sam's kept
    // deleted message outlined in your deleted highlight color. Toggling Show edit history updates it live.
    function NoDeletePreview(props) {
        const s=useChatPreviewStyles(), k=usePreviewChrome();
        const red=highlightColorHex(features.messageHighlight && enabled("messageHighlight") ? settings.messageHighlightDeletedColor : "default","#f23f43");
        const bar=(features.messageHighlight && enabled("messageHighlight") ? settings.messageHighlightThickness : 1)*2;
        const versions=[tr("See you at 6"),tr("See you at 7"),tr("See you at 8")];
        const history=props.edits ? versions.slice(0,2) : [];
        return el(RN.View,{key:"preview"},
            previewScreen(s,"preview","Deleted messages preview",[
            el(RN.View,{key:"edited"},
                previewMessage(s,"edited","Alex","#3ba55c",tr("Today at 4:01 PM"),el(RN.View,null,
                    history.map((text,i) => popIn("old:"+i,el(RN.Text,{style:s.faded},text))),
                    el(RN.Text,{style:s.text},versions[2],el(RN.Text,{style:s.muted}," "+tr("(edited)")))))),
            el(RN.View,{key:"deleted",style:{backgroundColor:red+"1a"}},
                el(RN.View,{style:{position:"absolute",left:0,top:0,bottom:0,width:bar,backgroundColor:red}}),
                previewMessage(s,"msg","Sam","#eb459e",tr("Today at 4:03 PM"),el(RN.Text,{style:s.text},tr("Oops, wrong chat. Deleting this."))))],
            {header:previewHeader(k,{title:"general"}),footer:previewInput(k,s,{placeholder:tr("Message {channel}",{channel:"#general"})})}));
    }
    const NODELETE_LIMITS = [100, 512, 1000, MAX_DELETED];
    function NoDeleteSettings() {
        useSettings();
        const ui=reviewUI();
        if (!React || !RN) return null;
        const Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow;
        // How many to keep is a choice of four, not a number to type. A number saved by an older version shows
        // as the closest choice and stays as it is until you pick another.
        const limit=settings.noDeleteLimit, nearest=NODELETE_LIMITS.reduce((best,n) => Math.abs(n-limit)<Math.abs(best-limit) ? n : best,NODELETE_LIMITS[0]);
        const kept=deleted.size, changed=edits.size, hasKept=kept>0 || changed>0;
        const summary=hasKept ? tr(settings.noDeleteSave ? "{deleted} and {edited} kept, saved on this phone." : "{deleted} and {edited} kept until Discord restarts.",
            {deleted:count(kept,"deleted message"),edited:count(changed,"edited message")}) : "";
        const groups=[
            !settings.noDelete ? offCard("status",venusIcon(4791,"TrashIcon")) : hasKept ? statusCard("status",summary,{title:pl(kept+changed,"{n} message kept","{n} messages kept"),
                IconComponent:venusIcon(4791,"TrashIcon")}) : null,
            el(NoDeletePreview,{key:"preview",edits:!!settings.noDeleteEdits,on:!!settings.noDelete}),
            el(Group,{key:"edits",title:tr("Edited messages")},toggle("noDeleteEdits","Show edit history","What a message said before it was edited, faded and crossed out above it. Up to 10 versions each.",rowIcon(9829,"PencilIcon"))),
            el(Group,{key:"save",title:tr("Storage")},toggle("noDeleteSave","Keep after restarting","Deleted and edited messages survive closing Discord. Saved only on this phone, for this account.",rowIcon(4782,"DownloadIcon"))),
            el(RN.View,{key:"limit",style:{gap:8}},
                groupTitle("title","Keep up to"),
                venusSegmented({key:"choice",value:nearest,disabled:!settings.noDelete,onChange:value => setSetting("noDeleteLimit",value),
                    items:NODELETE_LIMITS.map(n => ({value:n,label:String(n)}))}),
                footnote("hint","When it's full, the oldest is removed first.")),
            el(Group,{key:"clear",title:tr("Manage")},actionRow(ui,"clear","Clear kept messages","Removes every deleted message and edit history Venus kept, from chat and from this phone.",
                () => confirmAction("Clear kept messages?","Every deleted message and edit history Venus kept is removed. This can't be undone.","Clear",forgetKept),!kept && !changed,true)),
            footnote("note","Delete a kept message again to hide just that one.")];
        return settingsBody(ui,groups);
        function toggle(key,label,subLabel,icon) { return switchRow(Switch,key,label,subLabel,icon); }
    }
    // Clear kept messages: every kept deletion leaves chat and the saved file, and so does edit history.
    // Removals go through Discord's own dispatch, bound before Venus hooked it, so they aren't kept again.
    function forgetKept() {
        const events=Array.from(deleted.values());
        deleted.clear(); deletedByChannel.clear(); edits.clear(); invalidateDeleted();
        dispatchRemovals(events); persistDeleted(); notify("noDelete");
        reviewToast(reviewUI(),"Kept messages cleared",venusIcon(4791,"TrashIcon"));
    }
    function authenticateReviews() {
        if (!enabled("reviewDB") || reviewAuthState==="exchanging") return;
        const ui=reviewUI();
        if (typeof ui.pushModal!=="function" || typeof ui.popModal!=="function" || !ui.OAuth) {RN.Alert.alert("ReviewDB",tr("Discord's authorization screen is unavailable. Reopen this page and try again."));return;}
        const accountId=currentId();
        if (!accountId) {RN.Alert.alert("ReviewDB",tr("Discord account unavailable"));return;}
        const attempt=++reviewAuthAttempt, key="oauth2-authorize";
        let closed=false;
        reviewAuthError="";notify("reviewDB");
        const live=() => enabled("reviewDB") && attempt===reviewAuthAttempt && currentId()===accountId;
        const close=() => { if (closed) return; closed=true; try { ui.popModal(key); } catch (_) {} };
        function fail(error) {
            if (!live()) return;
            reviewAuthState="idle";reviewAuthError=String(error && error.message || error);notify("reviewDB");
            reviewToast(ui,tr("Couldn't sign in: {problem}",{problem:reviewAuthError}),venusIcon(6026,"CircleXIcon"));
        }
        ui.pushModal({key,modal:{key,modal:ui.OAuth,animation:"slide-up",shouldPersistUnderModals:false,closable:true,props:{
            clientId:"915703782174752809",redirectUri:REVIEW_API+"/auth",scopes:["identify"],responseType:"code",permissions:BigInt(0),cancelCompletesFlow:false,
            // Traced in 347.12 and 348.10 (useOAuth2AuthorizeForm, fn124513): after Authorize the form calls
            // dismissOAuthModal FIRST, waits 100 ms, and only THEN calls callback({location}).
            // Dismissal is never a cancellation; treating it as one discarded every sign-in.
            dismissOAuthModal:close,
            callback:result => {
                close();
                if (!live() || !result || result.canceled===true) return;
                let url;
                try { url=authorizationUrl(result); } catch (error) { fail(error); return; }
                reviewAuthState="exchanging";notify("reviewDB");
                reviewJson(url,{method:"GET"},"ReviewDB took too long to authorize. Try again.").then(auth => {
                    if (!live()) return;
                    if (auth.success!==true || typeof auth.token!=="string" || !auth.token.trim() || auth.token.length>8192) throw new Error(auth.message || "ReviewDB did not return a token");
                    reviewToken=auth.token;reviewAccount=accountId;reviewAuthState="idle";reviewAuthError="";reviewCache.clear();
                    save();notify("reviewDB");reviewToast(ui,"Signed in to ReviewDB",venusIcon(4793,"CircleCheckIcon"));
                }).catch(fail);
            }}}});
    }
    function reviewsFor(userId, refresh) {
        if (!/^\d{17,20}$/.test(userId)) return Promise.reject(new Error("Invalid profile ID"));
        const cached = reviewCache.get(userId);
        if (!refresh && cached && cached.expires>Date.now()) return cached.promise;
        // Refreshing a cached profile replaces it in place; only a new profile evicts the oldest one.
        if (cached) reviewCache.delete(userId);
        else if (reviewCache.size>=32) reviewCache.delete(reviewCache.keys().next().value);
        const promise=reviewRequest("/users/"+userId+"/reviews").then(result=>{
            if (!Array.isArray(result.reviews)) throw new Error("Invalid review list");
            return result.reviews.slice(0,100).filter(review=>review && review.sender && typeof review.comment==="string");
        }).catch(error=>{
            // A newer request for this profile owns the slot; only drop our own failed entry.
            const current=reviewCache.get(userId);
            if (current && current.promise===promise) reviewCache.delete(userId);
            throw error;
        });
        reviewCache.set(userId,{promise,expires:Date.now()+60000});return promise;
    }
    function reviewAuth() {
        const current=currentId();
        // Only an actual account switch invalidates the token; an unloaded store at startup does not.
        if (reviewToken && reviewAccount && current && current!==reviewAccount) {
            reviewAuthAttempt++;reviewToken="";reviewAccount=null;reviewAuthState="idle";reviewCache.clear();save();
        }
        return reviewToken;
    }
    let reviewAdminsLoaded=false;
    const reviewAdmins=new Set();
    function loadReviewAdmins() {
        if (reviewAdminsLoaded || typeof global.fetch!=="function") return;
        reviewAdminsLoaded=true;
        reviewJson("https://manti.vendicated.dev/admins",{method:"GET"}).then(list => {
            if (Array.isArray(list)) list.forEach(id => { if (typeof id==="string") reviewAdmins.add(id); });
        },() => {reviewAdminsLoaded=false;});
    }
    const reviewImage=uri => typeof uri==="string" && /^https:\/\//.test(uri);
    function reviewActions(review, owner, ui, refetch) {
        const system=review.type===3, me=currentId(), sender=review.sender || {};
        function confirm(title, content, onConfirm) {
            if (ui.alerts && typeof ui.alerts.show==="function") try { ui.alerts.show({title,body:content,confirmText:tr("Yes"),cancelText:tr("No"),onConfirm}); return; } catch (_) {}
            RN.Alert.alert(title,content,[{text:tr("No"),style:"cancel"},{text:tr("Yes"),style:"destructive",onPress:onConfirm}]);
        }
        function mutate(path, method, body, done) {
            reviewRequest(path,method,body).then(result => {reviewCache.delete(owner);refetch();reviewToast(ui,result && result.message || done,venusIcon(4793,"CircleCheckIcon"));},
                error => reviewToast(ui,String(error && error.message || error),venusIcon(6026,"CircleXIcon")));
        }
        const options=[{label:tr("Copy Text"),onPress:() => {
            try { (ui.clipboard || RN.Clipboard).setString(review.comment); } catch (_) {}
            reviewToast(ui,"Copied Review Text",venusIcon(4780,"CopyIcon"));
        }}];
        if (reviewAuth() && !system) {
            if (sender.discordID===me || owner===me || reviewAdmins.has(me)) options.push({label:tr("Delete Review"),isDestructive:true,
                onPress:() => confirm(tr("Delete Review"),tr("Are you sure you want to delete this review?"),() => mutate("/users/"+owner+"/reviews","DELETE",{reviewid:review.id},"Review deleted"))});
            options.push({label:tr("Report Review"),isDestructive:true,
                onPress:() => confirm(tr("Report Review"),tr("Are you sure you want to report this review?"),() => mutate("/reports","PUT",{reviewid:review.id},"Review reported"))});
        }
        const title=system ? tr("ReviewDB System Message") : tr("Review by {name}",{name:String(sender.username || "Unknown")});
        if (typeof ui.simpleSheet==="function") try {
            ui.simpleSheet({key:"ReviewOverflow",header:{title,onClose:() => hideReviewSheet(ui,"ReviewOverflow")},options});return;
        } catch (_) {}
        RN.Alert.alert(title,undefined,options.map(option => ({text:option.label,style:option.isDestructive ? "destructive" : "default",onPress:option.onPress}))
            .concat([{text:tr("Cancel"),style:"cancel"}]));
    }
    function ReviewRow(props) {
        const review=props.review, ui=props.ui, styles=props.styles, sender=review.sender;
        const timestamp=review.type!==3 && Number.isFinite(review.timestamp) ? new Date(review.timestamp*1000).toLocaleDateString() : "";
        const badges=(Array.isArray(sender.badges) ? sender.badges.slice(0,8) : []).filter(badge => badge && reviewImage(badge.icon));
        const label=el(RN.View,{style:{flexDirection:"row",alignItems:"center"}},
            el(ui.FormLabel,{text:String(sender.username || "Unknown"),style:styles.text}),
            el(RN.View,{style:{flexDirection:"row",alignItems:"center"}},badges.map((badge,index) =>
                el(RN.Pressable,{key:String(index),style:{marginLeft:4},onPress:() => reviewToast(ui,String(badge.name || ""))},
                    el(RN.Image,{source:{uri:badge.icon,width:16,height:16},style:{width:16,height:16}})))),
            el(ui.FormLabel,{text:timestamp,style:[styles.muted,{marginLeft:5}]}));
        return el(ui.TableRowGroup || RN.View,{style:[styles.row]},
            el(ui.FormRow,{style:[styles.row],label,
                subLabel:el(ui.FormSubLabel,{text:review.comment,style:styles.text}),
                leading:reviewImage(sender.profilePhoto) ? el(RN.Image,{style:{height:36,width:36,borderRadius:18},source:{uri:sender.profilePhoto}}) : undefined,
                onLongPress:() => reviewActions(review,props.owner,ui,props.refetch)}));
    }
    let reviewThemeHook, reviewThemeTried=false;
    function ReviewInput(props) {
        const ui=props.ui, styles=props.styles;
        const [text,setText]=React.useState(""), [busy,setBusy]=React.useState(false);
        // Like the style hook, choose once. Retrying missing UI exports must not
        // add a theme hook to an input which already mounted without one.
        if (!reviewThemeTried) {reviewThemeTried=true;reviewThemeHook=typeof ui.theme==="function" ? ui.theme : null;}
        // 348.10 useThemeContext (fn31267) throws outside its Provider. Reviews
        // on a server are not a user profile; keep the hook call but use the
        // standard send color when that optional context is absent.
        let theme=null;
        if (reviewThemeHook) try {theme=reviewThemeHook();} catch (_) {}
        const authenticated=!!reviewAuth(), canSend=authenticated && !busy && text.trim().length>0;
        const placeholder=tr(!authenticated ? "Sign in to ReviewDB in Venus settings to write a review." : props.shouldEdit ? "Tap to edit your review" : "Tap to add a review");
        function send() {
            if (!canSend || !text.trim()) return;
            setBusy(true);
            reviewRequest("/users/"+props.userId+"/reviews","PUT",{comment:text.trim()}).then(result => {
                setText("");props.refetch();reviewToast(ui,result && result.message || "Review posted",venusIcon(4793,"CircleCheckIcon"));
            },error => reviewToast(ui,String(error && error.message || error),venusIcon(6026,"CircleXIcon"))).then(() => setBusy(false));
        }
        const input=ui.TextInput ?
            el(ui.TextInput,{style:[{flex:1,fontSize:16},styles.text],isDisabled:!authenticated,placeholder,placeholderTextColor:styles.placeholder.color,
                value:text,onChange:setText,maxLength:1000}) :
            el(RN.TextInput,{style:[{flex:1,fontSize:16},styles.text],editable:authenticated,placeholder,placeholderTextColor:styles.placeholder.color,
                value:text,onChangeText:setText,maxLength:1000});
        const color=theme && theme.primaryColor || "#5865f2";
        return el(RN.View,{style:{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:8,paddingVertical:4}},
            el(RN.View,{style:{flex:1}},input),
            el(RN.Pressable,{accessibilityRole:"button",accessibilityLabel:tr(props.shouldEdit ? "Update review" : "Send review"),disabled:!canSend,onPress:send,
                style:{minHeight:40,minWidth:40,borderRadius:999,alignItems:"center",justifyContent:"center",backgroundColor:color,opacity:canSend ? 1 : 0.25}},
                ui.Send ? el(ui.Send,{size:"sm",color:"#ffffff"}) : el(RN.Text,{style:{color:"#ffffff",fontWeight:"700"}},">")));
    }
    function ReviewSection(props) {
        useReviews();
        const ui=reviewUI(), styles=useReviewStyles(ui), userId=props.userId;
        const [reviews,setReviews]=React.useState(null), [generation,reload]=React.useState(0), [error,setError]=React.useState("");
        const valid=typeof userId==="string" && /^\d{17,20}$/.test(userId);
        React.useEffect(() => {
            let live=true;
            if (!enabled("reviewDB") || !valid) return;
            setReviews(null);setError("");loadReviewAdmins();
            reviewsFor(userId,generation>0).then(list => {if (live) setReviews(list);},failure => {
                if (live) {setReviews(null);setError(String(failure && failure.message || failure).slice(0,512));}
            });
            return () => {live=false;};
        },[userId,generation,settings.reviewDB]);
        const Card=props.standalone ? RN && RN.View : ui.Card;
        if (!enabled("reviewDB") || !valid || !RN || !Card || !ui.FormRow) return null;
        const list=reviews || [], me=currentId();
        const shown=settings.reviewWarning ? list : list.filter(review => review.type!==3);
        const refetch=() => {reviewCache.delete(userId);reload(n => n+1);};
        const rows=error ? el(RN.View,{style:{gap:8}},
            el(RN.Text,{accessibilityRole:"alert",style:styles.text},tr("Couldn't load reviews: {problem}",{problem:error})),
            reviewRetry(refetch)) :
            reviews===null ? el(RN.Text,{accessibilityLiveRegion:"polite",style:styles.muted},tr("Loading reviews...")) :
            !shown.length ? el(RN.Text,{style:styles.muted},tr("No reviews yet.")) :
            shown.map((review,index) => el(ReviewRow,{key:(review.id==null ? "" : String(review.id))+":"+index,review,owner:userId,ui,styles,refetch}));
        return el(RN.View,{style:[styles.card]},
            el(Card,props.standalone ? {accessibilityLabel:tr("Reviews")} : {title:tr("Reviews")},
                el(RN.View,{style:{gap:8}},rows),
                el(ReviewInput,{userId,ui,styles,refetch,shouldEdit:list.some(review => review.type!==3 && review.sender.discordID===me)})));
    }
    // Discord's own small secondary button (Button 5282), or a themed pill if it hasn't loaded.
    function reviewRetry(onPress) {
        const Button=inspectedExport(5282,"Button");
        if (Button) return el(RN.View,{style:{alignSelf:"flex-start"}},
            el(Button,{text:tr("Retry"),size:"sm",variant:"secondary",accessibilityLabel:tr("Retry reviews"),onPress}));
        return el(RN.Pressable,{accessibilityRole:"button",accessibilityLabel:tr("Retry reviews"),onPress,
            style:{alignSelf:"flex-start",paddingHorizontal:16,height:32,borderRadius:16,justifyContent:"center",backgroundColor:"#4e505899"}},
            el(RN.Text,{style:{color:"#ffffff",fontWeight:"600"}},tr("Retry")));
    }
    function ReviewSheet(props) {
        const ui=reviewUI();
        return el(ui.ActionSheet,{header:ui.Header ? el(ui.Header,{title:tr("Reviews"),trailing:ui.Close ? el(ui.Close,{onPress:() => hideReviewSheet(ui,props.sheetKey)}) : undefined}) : undefined},
            el(RN.View,null,el(RN.ScrollView,{style:{gap:12,marginBottom:12}},el(ReviewSection,{userId:props.userId,standalone:true}))));
    }
    function openReviewSheet(userId) {
        if (!enabled("reviewDB") || !React || !RN || typeof userId!=="string" || !/^\d{17,20}$/.test(userId)) return;
        const ui=reviewUI();
        if (!ui.ActionSheet || typeof ui.showSheet!=="function") { reviewToast(ui,"Reviews are unavailable. Reopen the server menu and try again.",venusIcon(6026,"CircleXIcon")); return; }
        // 4801's NAMED showActionSheet (HBC fn32121) takes an already-created
        // element, then schedules SHOW_ACTION_SHEET through Dispatcher.wait.
        // Reviews are bundled, not lazy imports: avoid openLazy's detached Promise
        // chain entirely. The inspected store (fn31181) accepts "stack".
        const key="VenusReviews:"+userId;
        try { ui.showSheet({key,content:el(ReviewSheet,{userId,sheetKey:key}),stackingBehavior:"stack"}); }
        catch (error) { reviewToast(ui,tr("Couldn't open reviews: {problem}",{problem:String(error && error.message || error)}),venusIcon(6026,"CircleXIcon")); }
    }
    // Profiles: reviews go in as the LAST card of the profile card stack
    // (after the note). In 348.10 UserProfileNote (12627) is that last card in the normal, bot,
    // tabbed and You-screen layouts, so reviews render directly beneath it.
    function reviewNote(orig,self,args) {
        const tree=orig.apply(self,args), userId=args[0] && args[0].userId;
        if (!React || !RN || !features.reviewDB || typeof userId!=="string") return tree;
        return el(React.Fragment,null,tree,el(ReviewSection,{key:"venus-reviews:"+userId,userId}));
    }
    // The server sheet already supplies its native scrolling/presentation context
    // (GuildActionSheet fn60681). Expand content there instead of spawning a second
    // dialog. No detached dispatcher callback, new portal or nested RN ScrollView.
    function ServerReviews(props) {
        useReviews();
        const [open,setOpen]=React.useState(false), ui=reviewUI();
        React.useEffect(() => {setOpen(false);},[props.guildId]);
        if (!enabled("reviewDB") || !RN || !ui.TableRow) return null;
        return el(RN.View,null,
            el(ui.TableRowGroup || RN.View,null,el(ui.TableRow,{label:tr("Reviews"),arrow:!open,
                subLabel:tr(open ? "Tap to close server reviews." : "Read and write community reviews for this server."),
                accessibilityState:{expanded:open},onPress:() => {if (enabled("reviewDB")) setOpen(value => !value);}})),
            open ? el(ReviewSection,{key:props.guildId,userId:props.guildId,standalone:true}) : null);
    }
    function reviewGuild(orig,self,args) {
        if (React) useSettings("reviewDB");
        const props=args[0] || {}, guild=props.guild, ui=reviewUI();
        if (!enabled("reviewDB") || !React || !RN || !guild || !/^\d{17,20}$/.test(guild.id) || !ui.TableRow) return React ? el(orig,props) : orig.apply(self,args);
        return el(ServerReviews,{key:guild.id,guildId:guild.id});
    }
    // User long-press context menu gets a "Reviews" item.
    function reviewMenu(orig,self,args) {
        const props=args[0], menu=props && props.menu, id=menu && menu.key;
        if (!enabled("reviewDB") || !menu || !Array.isArray(menu.items) || menu.items.length!==3 || typeof id!=="string" || !/^\d{17,20}$/.test(id)) return orig.apply(self,args);
        const next=Array.from(args);
        next[0]=Object.assign({},props,{menu:Object.assign({},menu,{items:menu.items.concat([{label:tr("Reviews"),action:() => openReviewSheet(id)}])})});
        return orig.apply(self,next);
    }
    // Rewrites a component's props before Discord's own render, through memo and forwardRef wrappers.
    // The change runs inside the render, so it may use hooks, and it always runs, so the hook count never changes.
    function propsComponent(component, change) {
        if (typeof component === "function") {
            const patched = function (props) {
                const args = Array.from(arguments); args[0] = change(props);
                return component.apply(this, args);
            };
            if (component.displayName) patched.displayName = component.displayName;
            return patched;
        }
        if (component && typeof component === "object" && component.$$typeof) for (const key of ["type", "render"]) {
            const inner = data(component, key);
            if (!inner || typeof inner !== "function" && typeof inner !== "object") continue;
            const patched = propsComponent(inner, change);
            if (patched !== inner) return cloneWith(component, key, patched);
        }
        return component;
    }
    function withoutGift(props) {
        useSettings("hideGift");
        return enabled("hideGift") && props && props.shouldShowGiftButton ? Object.assign({}, props, {shouldShowGiftButton:false}) : props;
    }
    // Unlock app icons: lets you pick any Discord app icon in Settings -> App Icon without Nitro, stops
    // AppIconPremiumManager (17096) from resetting the icon on app state changes, and removes the "Unlock all
    // icons with Nitro" upsell button and "Nitro" section heading on the App Icon screen (15065 / 15066).
    const appIconCache = new WeakMap();
    function appIconObject(icon) {
        if (!enabled("appIcons") || !icon || typeof icon !== "object" || !icon.isPremium) return icon;
        let cached = appIconCache.get(icon);
        if (!cached) appIconCache.set(icon, cached = Object.assign({}, icon, {isPremium:false}));
        return cached;
    }
    function appIconsList(orig, self, args) {
        const list = orig.apply(self, args);
        return enabled("appIcons") && Array.isArray(list) ? list.map(appIconObject) : list;
    }
    function hookAppIconConstants(exports) {
        if (!exports) return exports;
        exports = hookExport(exports, "getIconById", (orig, self, args) => appIconObject(orig.apply(self, args)));
        exports = hookExport(exports, "getIcons", appIconsList);
        exports = hookExport(exports, "getOfficialAlternateIcons", appIconsList);
        return hookExport(exports, "getLimitedAlternateIcons", appIconsList);
    }
    function hookAppIconPremiumManager(exports) {
        const mgr = exports && exports.default;
        if (!mgr) return exports;
        let patched = hookExport(mgr, "validateAndResetIfNeeded", function (orig, self, args) {
            return enabled("appIcons") ? Promise.resolve() : orig.apply(self, args);
        });
        patched = hookExport(patched, "resetIcon", function (orig, self, args) {
            if (enabled("appIcons")) return;
            return orig.apply(self, args);
        });
        return replaceValue(exports, "default", patched);
    }
    function withoutAppIconUpsell(node, depth, UpsellButton, TableRow) {
        if (!node || typeof node !== "object" || depth > 8) return node;
        if (Array.isArray(node)) {
            let changed = false;
            const out = [];
            for (let i = 0; i < node.length; i++) {
                const child = withoutAppIconUpsell(node[i], depth + 1, UpsellButton, TableRow);
                if (child !== node[i]) changed = true;
                if (child !== null) out.push(child);
            }
            return changed ? out : node;
        }
        if (typeof node.type === "function" && (node.type.name === "AppIconRows" || node.type.displayName === "AppIconRows")) {
            try { return withoutAppIconUpsell(node.type(node.props || {}), depth + 1, UpsellButton, TableRow); } catch (_) {}
        }
        if (!node.props) return node;
        if (UpsellButton && (node.type === UpsellButton || node.type && node.type.type === UpsellButton)) return null;
        if (typeof node.props.text === "string" && typeof node.props.onPress === "function" &&
            node.type !== TableRow) return null;
        let props = node.props;
        // AppIconRows (15066) sets title="Nitro" on the alternate icons TableRowGroup when !hasNitro.
        if (typeof props.title === "string" && /nitro/i.test(props.title))
            props = Object.assign({}, props, {title:undefined});
        const children = props.children, next = withoutAppIconUpsell(children, depth + 1, UpsellButton, TableRow);
        if (next !== children) {
            if (next === null || Array.isArray(next) && !next.length && props.style && !props.label && !props.icon) return null;
            props = Object.assign({}, props, {children:next});
        }
        return props === node.props ? node : React.cloneElement(node, props);
    }
    function appIconsScreen(orig, self, args) {
        useSettings("appIcons");
        const rendered = orig.apply(self, args);
        return enabled("appIcons") && React ? withoutAppIconUpsell(rendered, 0, inspectedExport(9421, "default"), inspectedExport(5916, "TableRow") || null) : rendered;
    }
    // Hide call button: UserProfileContactButtons (12696) draws Message and Call side by side, each in a
    // flex:1 slot, or as icon buttons next to a friend button. Its disableCalls prop only greys Call out, so
    // the Call button and the slot it sat in are left out of what it renders. Message's slot then takes the
    // whole row, and the change animates when the setting flips while a profile is open.
    // The icon is looked up once per render, not once for every element in the row.
    function withoutCall(node, depth, Phone) {
        if (!node || typeof node !== "object" || depth > 12) return node;
        if (Array.isArray(node)) {
            let changed = false;
            const next = node.map(child => { const value = withoutCall(child, depth + 1, Phone); if (value !== child) changed = true; return value; });
            return changed ? next.filter(child => child !== null) : node;
        }
        if (!node.props) return node;
        const icon = node.props.icon;
        if (icon && icon.type === Phone) return null;
        const children = node.props.children, next = withoutCall(children, depth + 1, Phone);
        if (next === children) return node;
        // A slot that only held the Call button goes too, so nothing keeps half the row.
        if (next === null || Array.isArray(next) && !next.length) return null;
        return React.cloneElement(node, Object.assign({}, node.props, {children:next}));
    }
    function profileButtons(orig, self, args) {
        useSettings("hideCall");
        const hidden = !!enabled("hideCall"), last = React.useRef(hidden);
        if (last.current !== hidden) {
            last.current = hidden;
            const animate = RN && RN.LayoutAnimation;
            try { if (animate && animate.Presets) animate.configureNext(animate.Presets.easeInEaseOut); } catch (_) {}
        }
        const rendered = orig.apply(self, args);
        if (!hidden) return rendered;
        const Phone = inspectedExport(7309, "PhoneCallIcon");
        return Phone ? withoutCall(rendered, 0, Phone) : rendered;
    }
    // Discord's own "no Quest to show" answer, so the dock, the space kept for it and its tracking all go away together.
    let noQuestDock = null;
    function questDockHidden() { useSettings("hideQuestDock"); return enabled("hideQuestDock"); }
    function hideQuestHooks(exports) {
        const types = inspectedExport(5764, "AdCreativeType");
        if (!types || types.NO_FILL === undefined) return exports;
        noQuestDock = Object.freeze({type:types.NO_FILL});
        exports = hookExport(exports, "useMobileQuestDock", (orig, self, args) => { const dock = orig.apply(self, args); return questDockHidden() ? noQuestDock : dock; });
        exports = hookExport(exports, "useMobileQuestDockHeight", (orig, self, args) => { const height = orig.apply(self, args); return questDockHidden() ? 0 : height; });
        for (const key of ["useIsMobileQuestDockRendered", "useIsMobileQuestDockRenderedBase", "useIsMobileQuestDockVisibleToUser"])
            exports = hookExport(exports, key, (orig, self, args) => { const value = orig.apply(self, args); return questDockHidden() ? false : value; });
        return exports;
    }
    // The dock itself sits in its own component, so switching it off unmounts it instead of changing its hooks.
    function hideQuestDock(exports) {
        const Dock = exports && exports.default;
        if (!Dock) return exports;
        const HiddenQuestDock = function (props) { return questDockHidden() ? null : el(Dock, props); };
        HiddenQuestDock.displayName = "QuestDock";
        return replaceValue(exports, "default", HiddenQuestDock);
    }
    // React Native emojis (reaction lists, statuses, the emoji grid) draw a Unicode emoji with the phone's
    // font when forceTextEmoji is set. Only Unicode emojis: custom ones have a CDN picture and a word for a name.
    function systemEmojiProps(props) {
        // A word is a custom emoji's name. Keycaps (#\uFE0F\u20E3, 1\uFE0F\u20E3...) start with a digit or # but
        // are Unicode emojis too, and used to keep Discord's picture.
        if (!emojiInUse || !features.systemEmoji || !props || props.forceTextEmoji || typeof props.name !== "string" || !props.name ||
            /[A-Za-z_:]/.test(props.name) || /[0-9#*]/.test(props.name) && !/^[0-9#*]\uFE0F?\u20E3$/.test(props.name)) return props;
        const src = props.src, uri = src && typeof src === "object" ? src.uri : src;
        if (uri != null && !(typeof uri === "string" && /^asset:/.test(uri))) return props;
        return Object.assign({}, props, {forceTextEmoji:true});
    }
    function cloneWith(object, key, value) {
        // ES module markers, React tags, symbols and lazy getters are not necessarily enumerable.
        // Object.assign loses them and Metro imports the exports object as a component.
        const descriptors = Object.getOwnPropertyDescriptors(object);
        const old = descriptors[key];
        descriptors[key] = { value, writable: true, configurable: true, enumerable: old ? old.enumerable : true };
        return Object.create(Object.getPrototypeOf(object), descriptors);
    }
    function replaceValue(object, key, value) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        // Flux/store methods live on prototypes. Shadow them on the same instance:
        // cloning a live store would split dispatch state, subscriptions or private fields.
        if (!descriptor && Object.isExtensible(object)) {
            Object.defineProperty(object, key, {value, writable:true, configurable:true, enumerable:true});
            return object;
        }
        if (descriptor && descriptor.configurable) {
            Object.defineProperty(object, key, { value, writable: true, configurable: true, enumerable: descriptor.enumerable });
            return object;
        }
        if (descriptor && "value" in descriptor && descriptor.writable) { object[key] = value; return object; }
        return cloneWith(object, key, value);
    }
    function hookExport(exports, key, operation) {
        const orig = exports && exports[key];
        if (typeof orig !== "function") return exports;
        const patched = function () { return operation(orig, this, arguments); };
        return replaceValue(exports, key, patched);
    }
    // Hook a component export (plain function, or memo/forwardRef object) without breaking React tags.
    function hookComponent(exports, operation, key) {
        key = key || "default";
        const component = exports && exports[key];
        if (component && typeof component === "object" && component.$$typeof) {
            const inner = typeof component.type === "function" ? "type" : typeof component.render === "function" ? "render" : null;
            if (!inner) return exports;
            const orig = component[inner];
            return replaceValue(exports, key, cloneWith(component, inner, function () { return operation(orig, this, arguments); }));
        }
        return hookExport(exports, key, operation);
    }
    // Fix unknown mentions (based on ValidUser by fshin, o.oer and kmmiio99o): a mention of someone Discord hasn't
    // loaded shows as @unknown-user. Instead of a "Fix mentions" button on every message, messages are checked as
    // they arrive or load. Unknown IDs are looked up one at a time with Discord's own getUser (GET /users/:id, which
    // adds the user to UserStore), and each affected message is redrawn so the mention shows the name.
    const MENTION_ID = /<@!?(\d{17,20})>/g;
    const VALID_EVENTS = ["MESSAGE_CREATE", "MESSAGE_UPDATE", "LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES_AROUND_SUCCESS", "LOCAL_MESSAGES_LOADED"];
    const valid = {dispatcher:null, queue:[], queued:new Set(), tried:new Set(), waiting:new Map(), running:false, refreshing:new Set(), generation:0};
    function mentionIds(text, out) {
        // Most text has no mention at all: one indexOf, no regex run.
        if (typeof text !== "string" || text.indexOf("<@") < 0) return;
        MENTION_ID.lastIndex = 0;
        let match;
        while ((match = MENTION_ID.exec(text))) out.add(match[1]);
    }
    function componentIds(components, out, depth) {
        if (!Array.isArray(components) || depth > 6) return;
        for (const component of components) if (component) {
            mentionIds(component.content, out);
            componentIds(component.components, out, depth + 1);
        }
    }
    // Every place a raw (server-shaped) message can mention someone: text, embeds, components and forwards.
    function messageMentionIds(message, out) {
        mentionIds(message.content, out);
        if (Array.isArray(message.embeds)) for (const embed of message.embeds) if (embed) {
            mentionIds(embed.title, out); mentionIds(embed.description, out);
            mentionIds(embed.rawTitle, out); mentionIds(embed.rawDescription, out);
            if (embed.footer) mentionIds(embed.footer.text, out);
            if (Array.isArray(embed.fields)) for (const field of embed.fields) if (field) {
                mentionIds(field.name, out); mentionIds(field.value, out); mentionIds(field.rawName, out); mentionIds(field.rawValue, out);
            }
        }
        componentIds(message.components, out, 0);
        const snapshots = message.message_snapshots || message.messageSnapshots;
        if (Array.isArray(snapshots)) for (const snapshot of snapshots) {
            const inner = snapshot && snapshot.message;
            if (inner) { mentionIds(inner.content, out); componentIds(inner.components, out, 0); }
        }
        return out;
    }
    function knownUser(id) { try { return !!(userStore && userStore.getUser(id)); } catch (_) { return true; } }
    function validInit(dispatcher) {
        if (valid.dispatcher || !dispatcher || typeof dispatcher.subscribe !== "function") return;
        valid.dispatcher = dispatcher;
        VALID_EVENTS.forEach(type => dispatcher.subscribe(type, validEvent));
        dispatcher.subscribe("LOGOUT", validReset);
    }
    function validReset() {
        valid.generation++; valid.queue.length = 0; valid.queued.clear(); valid.tried.clear(); valid.waiting.clear(); valid.running = false;
    }
    // One reused set per check: a channel load hands over 50 messages at once.
    const validScratch = new Set();
    function validEvent(event) {
        if (!enabled("validUser") || !event || !userStore) return;
        const channelId = event.channelId;
        if (event.message) validMessage(event.message, event.message.channel_id || channelId);
        if (Array.isArray(event.messages)) for (const message of event.messages) validMessage(message, message && message.channel_id || channelId);
    }
    function validMessage(message, channelId) {
        if (!message || !message.id || !channelId || valid.refreshing.has(message.id)) return;
        validScratch.clear();
        messageMentionIds(message, validScratch);
        if (!validScratch.size) return;
        const missing = [];
        validScratch.forEach(id => { if (!valid.tried.has(id) && !knownUser(id)) missing.push(id); });
        validScratch.clear();
        if (!missing.length) return;
        // Remember the raw message so it can be redrawn once its people are known.
        const key = channelId + ":" + message.id;
        let entry = valid.waiting.get(key);
        if (!entry) {
            if (valid.waiting.size >= 300) valid.waiting.delete(valid.waiting.keys().next().value);
            valid.waiting.set(key, entry = {channelId, id:message.id, ids:new Set()});
        }
        entry.content = typeof message.content === "string" ? message.content : "";
        entry.embeds = Array.isArray(message.embeds) ? message.embeds : null;
        entry.components = Array.isArray(message.components) ? message.components : null;
        missing.forEach(id => {
            entry.ids.add(id);
            if (!valid.queued.has(id)) { valid.queued.add(id); valid.queue.push(id); }
        });
        // Never dispatch in the middle of Discord's own dispatch.
        if (!valid.running) { valid.running = true; later(validNext, 250); }
    }
    function deletedUser(id) {
        return {id, username:"Deleted User", global_name:null, discriminator:"0000", avatar:null, avatar_decoration_data:null, bot:false, system:false, public_flags:0};
    }
    function validNext() {
        const generation = valid.generation;
        if (!enabled("validUser")) { valid.running = false; return; }
        const id = valid.queue.shift();
        if (id === undefined) { valid.running = false; return; }
        valid.queued.delete(id);
        if (valid.tried.size >= 5000) valid.tried.delete(valid.tried.values().next().value);
        valid.tried.add(id);
        const getUser = inspectedExport(7630, "getUser");
        let wait = 400;
        Promise.resolve().then(() => {
            if (knownUser(id)) return;
            if (typeof getUser !== "function") throw new Error("getUser unavailable");
            return getUser(id);
        }).catch(error => {
            const code = error && (error.status || error.statusCode), body = error && error.body;
            // Only a real "Unknown User" answer means the account is gone; anything else is retried later.
            if (code === 404 || body && body.code === 10013) {
                if (valid.dispatcher) valid.dispatcher.dispatch({type:"USER_UPDATE", user:deletedUser(id)});
            } else {
                valid.tried.delete(id);
                if (code === 429) {
                    const retry = Number(body && body.retry_after);
                    wait = Math.min(60000, Math.max(1000, Number.isFinite(retry) ? retry * 1000 : 5000));
                    if (!valid.queued.has(id)) { valid.queued.add(id); valid.queue.unshift(id); }
                }
            }
        }).then(() => {
            if (generation !== valid.generation) return;
            validRefresh();
            later(validNext, wait);
        });
    }
    // Redraw each waiting message whose people are all known now. Discord keeps a row until its message record
    // changes, so its text is changed for a moment (a zero-width space) and then put back, like ValidUser does.
    function validRefresh() {
        if (!valid.dispatcher) return;
        for (const [key, entry] of Array.from(valid.waiting)) {
            let pending = false;
            entry.ids.forEach(id => { if (!knownUser(id) && (valid.queued.has(id) || !valid.tried.has(id))) pending = true; });
            if (pending) continue;
            valid.waiting.delete(key);
            if (!Array.from(entry.ids).some(knownUser)) continue;
            validRedraw(entry);
        }
    }
    function validRedraw(entry) {
        const dispatch = message => { try { valid.dispatcher.dispatch({type:"MESSAGE_UPDATE", message}); } catch (_) {} };
        const restore = {id:entry.id, channel_id:entry.channelId};
        if (entry.embeds && entry.embeds.length) restore.embeds = entry.embeds.slice();
        if (entry.components && entry.components.length) restore.components = entry.components.slice();
        if (entry.content) restore.content = entry.content;
        valid.refreshing.add(entry.id);
        if (entry.content) {
            const temp = {id:entry.id, channel_id:entry.channelId, content:entry.content + "\u200b"};
            if (restore.embeds) temp.embeds = entry.embeds.slice();
            if (restore.components) temp.components = entry.components.slice();
            dispatch(temp);
            later(() => { dispatch(restore); valid.refreshing.delete(entry.id); }, 120);
        } else {
            // Cloned embed and component arrays make a new record reference by themselves.
            if (restore.embeds || restore.components) dispatch(restore);
            valid.refreshing.delete(entry.id);
        }
    }

    // User activity notifications (based on UserNotif by cywrx and coder.gg): shows a toast when chosen friends or
    // people by user ID change status, start typing or send a message. Friends can be watched all at once or picked
    // one by one from the friend picker, and non-friends who share a server can be added by user ID as a backup.
    // Leaving the app on Android normally closes Discord's Gateway socket (GatewayConnectionStore 5590 ->
    // GatewaySocketSingleton 13174 socket.close(true)) and lets Android suspend timers. While a Quest is running or
    // background push notifications are enabled, keep the socket open and hold Discord's ForegroundServiceManager
    // (7179) wake lock so Quests finish and activity notifications arrive outside the app.
    const BACKGROUND_SERVICE_KEY = "venus-background";
    const bgKeepAlive = {active:false, title:"", content:"", socketHooked:false, pauseHooked:false, fg:null, setIsPaused:null};
    function isAppActive() {
        const store = inspectedExport(1986, "default");
        try {
            if (store && typeof store.getState === "function") return store.getState() === "active";
        } catch (_) {}
        try {
            const state = RN && RN.AppState && RN.AppState.currentState;
            if (typeof state === "string" && state) return state === "active";
        } catch (_) {}
        return true;
    }
    function userNotifHasTargets() {
        return !!(enabled("userNotif") && (settings.userNotifStatus || settings.userNotifMessages || settings.userNotifTyping) &&
            (settings.userNotifFriends || userNotif.ids.size > 0));
    }
    function backgroundNeeded() {
        const questBusy = !!(enabled("quests") && (quest.running || quest.enrolling));
        const pushListening = !!(settings.userNotifPush && userNotifHasTargets());
        return questBusy || pushListening;
    }
    function unpauseGateway() {
        let fn = bgKeepAlive.setIsPaused;
        if (typeof fn !== "function") {
            const named = inspectedExport(13212, "setIsPaused");
            if (typeof named === "function") fn = named;
            else {
                const def = inspectedExport(13212, "default");
                if (def && typeof def.setIsPaused === "function") fn = def.setIsPaused.bind(def);
            }
        }
        try { if (typeof fn === "function") fn(false); } catch (_) {}
    }
    function backgroundSync() {
        const questBusy = !!(enabled("quests") && (quest.running || quest.enrolling));
        const pushListening = !!(settings.userNotifPush && userNotifHasTargets());
        const needed = questBusy || pushListening;
        if (needed) unpauseGateway();
        const fg = bgKeepAlive.fg || inspectedExport(7179, "default");
        if (!needed) {
            if (!bgKeepAlive.active) return;
            bgKeepAlive.active = false; bgKeepAlive.title = ""; bgKeepAlive.content = "";
            try { if (fg && typeof fg.removeServiceHandler === "function") fg.removeServiceHandler(BACKGROUND_SERVICE_KEY); } catch (_) {}
            return;
        }
        const title = tr("Venus Patches");
        const content = questBusy && quest.running ? tr("Now: {name}.", {name:quest.running.name}) :
            questBusy ? tr("Quest Completer") : tr("Activity notifications");
        if (bgKeepAlive.active && bgKeepAlive.title === title && bgKeepAlive.content === content && fg) return;
        if (fg && typeof fg.updateServiceHandler === "function") {
            bgKeepAlive.active = true; bgKeepAlive.title = title; bgKeepAlive.content = content;
            try { fg.updateServiceHandler(BACKGROUND_SERVICE_KEY, {title, content, priority:2, type:0, usesGateway:true}); } catch (_) {}
        }
    }
    function hookPauseGateway(exports) {
        if (!exports || bgKeepAlive.pauseHooked) return exports;
        bgKeepAlive.pauseHooked = true;
        const target = typeof exports.setIsPaused === "function" ? exports :
            exports.default && typeof exports.default.setIsPaused === "function" ? exports.default : null;
        if (!target) return exports;
        const origSet = target.setIsPaused;
        bgKeepAlive.setIsPaused = v => origSet.call(target, v);
        let patched = hookExport(target, "setIsPaused", (orig, self, args) => {
            if (args[0] === true && !isAppActive() && backgroundNeeded()) return orig.call(self, false);
            return orig.apply(self, args);
        });
        if (typeof target.getIsPaused === "function") {
            patched = hookExport(patched, "getIsPaused", (orig, self, args) => {
                if (!isAppActive() && backgroundNeeded()) return false;
                return orig.apply(self, args);
            });
        }
        return target === exports ? patched : replaceValue(exports, "default", patched);
    }
    function hookGatewaySocket(exports) {
        const socket = exports && exports.socket;
        if (!socket || typeof socket.close !== "function" || bgKeepAlive.socketHooked) return exports;
        bgKeepAlive.socketHooked = true;
        const origClose = socket.close;
        replaceValue(socket, "close", function (clean) {
            if (clean === true && !isAppActive() && backgroundNeeded()) {
                unpauseGateway();
                return;
            }
            return origClose.apply(this, arguments);
        });
        return exports;
    }
    const USER_NOTIF_MAX_IDS = 500, USER_NOTIF_COOLDOWN_MS = 8000;
    const USER_NOTIF_EVENTS = ["PRESENCE_UPDATES", "PRESENCE_UPDATE", "MESSAGE_CREATE", "TYPING_START", "CONNECTION_OPEN",
        "CONNECTION_OPEN_SUPPLEMENTAL", "PRESENCES_REPLACE", "OVERLAY_INITIALIZE", "RELATIONSHIP_ADD", "RELATIONSHIP_UPDATE",
        "CONNECTION_RESUMED", "GUILD_CREATE", "IDLE", "LOGOUT"];
    const userNotif = {dispatcher:null, subscribed:false, relationships:null, guilds:null, ids:new Set(), dirty:false,
        statuses:new Map(), cooldowns:new Map(), shown:0, last:null, permissionGranted:null};
    function userNotifNativePerm() {
        const native = RN && RN.NativeModules;
        return native && (native.NativePermissionManager || native.RTNNativePermissionManager) || null;
    }
    function userNotifCheckPermissions() {
        const perm = userNotifNativePerm();
        if (perm && typeof perm.getNotificationAuthorizationStatus === "function") {
            return Promise.resolve().then(() => perm.getNotificationAuthorizationStatus()).then(code => {
                const ok = code === 2 || code === "authorized" || code === true;
                userNotif.permissionGranted = ok; notify("userNotif");
                return ok;
            }, () => true);
        }
        return Promise.resolve(true);
    }
    function userNotifRequestPermissions(showFeedback) {
        const ui = reviewUI(), pushMod = inspectedExport(8741, "default"), perm = userNotifNativePerm();
        const openSystemSettings = () => {
            try { if (pushMod && typeof pushMod.openNotificationSettings === "function") { pushMod.openNotificationSettings(); return; } } catch (_) {}
            try { if (perm && typeof perm.openSettings === "function") perm.openSettings(); } catch (_) {}
        };
        const askEnableInSystem = () => {
            userNotif.permissionGranted = false; notify("userNotif");
            confirmAction("Allow Discord notifications?",
                "Android notifications are turned off for Discord. Enable them in system settings to receive push notifications outside the app.",
                "Open settings", openSystemSettings);
        };
        const checkStatus = () => userNotifCheckPermissions().then(ok => {
            if (!ok) askEnableInSystem();
            else if (showFeedback) reviewToast(ui, "Notification permission granted", venusIcon(4793,"CircleCheckIcon"));
            return ok;
        });
        if (perm && typeof perm.requestNotificationAuthorization === "function") {
            return Promise.resolve().then(() => perm.requestNotificationAuthorization()).then(() => checkStatus(), () => checkStatus());
        }
        const permsAndroid = RN && RN.PermissionsAndroid;
        if (permsAndroid && typeof permsAndroid.request === "function") {
            const postNotif = permsAndroid.PERMISSIONS && permsAndroid.PERMISSIONS.POST_NOTIFICATIONS || "android.permission.POST_NOTIFICATIONS";
            return Promise.resolve().then(() => permsAndroid.request(postNotif)).then(res => {
                const granted = !res || res === "granted" || (permsAndroid.RESULTS && res === permsAndroid.RESULTS.GRANTED);
                userNotif.permissionGranted = granted; notify("userNotif");
                if (!granted) askEnableInSystem();
                else if (showFeedback) reviewToast(ui, "Notification permission granted", venusIcon(4793,"CircleCheckIcon"));
                return granted;
            }, () => checkStatus());
        }
        return checkStatus();
    }
    function userNotifPushSend(content) {
        if (!settings.userNotifPush || isAppActive()) return;
        const pushMod = inspectedExport(8741, "default");
        const mid = String(userNotif.shown);
        try {
            if (pushMod && typeof pushMod.presentLocalNotification === "function")
                pushMod.presentLocalNotification({alertTitle:tr("Activity notifications"), alertBody:content,
                    channelId:"venus-user-notif", channel_id:"venus-user-notif", messageId:mid, message_id:mid});
        } catch (_) {}
    }
    function userNotifFriendIds() {
        const store = userNotif.relationships || (userNotif.relationships = inspectedExport(4482, "default"));
        try {
            const list = store && typeof store.getFriendIDs === "function" ? store.getFriendIDs() : null;
            return Array.isArray(list) ? list.filter(id => typeof id === "string" && /^\d{17,20}$/.test(id)) : [];
        } catch (_) { return []; }
    }
    function userNotifIsFriend(id) {
        const store = userNotif.relationships || (userNotif.relationships = inspectedExport(4482, "default"));
        try {
            if (store && typeof store.isFriend === "function") return !!store.isFriend(id);
            if (store && typeof store.getFriendIDs === "function") {
                const list = store.getFriendIDs();
                return Array.isArray(list) && list.includes(id);
            }
        } catch (_) {}
        return false;
    }
    function userNotifWatched(id) {
        if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return false;
        const me = currentUser();
        if (me && me.id === id) return false;
        return userNotif.ids.has(id) || !!(settings.userNotifFriends && userNotifIsFriend(id));
    }
    function userNotifPersonName(id, fallbackUser) {
        const store = userNotif.relationships || (userNotif.relationships = inspectedExport(4482, "default"));
        try {
            const nick = store && typeof store.getNickname === "function" && store.getNickname(id);
            if (typeof nick === "string" && nick.trim()) return nick.trim();
        } catch (_) {}
        let user = fallbackUser;
        try { if ((!user || !user.username && !user.globalName && !user.global_name) && userStore) user = userStore.getUser(id) || user; } catch (_) {}
        const name = user && (user.globalName || user.global_name || user.username);
        return typeof name === "string" && name.trim() ? name.trim() : id;
    }
    function userNotifStatusName(statusValue) {
        return statusValue === "online" ? tr("Online") : statusValue === "idle" ? tr("Idle") :
            statusValue === "dnd" ? tr("Do Not Disturb") : tr("Offline");
    }
    function userNotifPlace(channelId, guildId) {
        const channel = channelId ? receivedChannel(channelId) : null;
        const gId = guildId || channel && (channel.guild_id || channel.guildId);
        const guilds = userNotif.guilds || (userNotif.guilds = inspectedExport(2073, "default"));
        const guild = guilds && gId && typeof guilds.getGuild === "function" ? guilds.getGuild(gId) : null;
        const cName = channel && typeof channel.name === "string" && channel.name.trim() ? channel.name.trim() : "";
        const gName = guild && typeof guild.name === "string" && guild.name.trim() ? guild.name.trim() : "";
        const isDm = !gId && (!channel || channel.type === 1 || channel.type === 3);
        return {isDm:!!isDm, cName, gName};
    }
    function userNotifSubscribeGuild(guildId, subFn) {
        if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) return;
        const sub = subFn !== undefined ? subFn : inspectedExport(6731, "subscribeGuild");
        try {
            if (typeof sub === "function") { sub(guildId); return; }
        } catch (_) {}
        const d = userNotif.dispatcher;
        try { if (d && typeof d.dispatch === "function") d.dispatch({type:"GUILD_SUBSCRIPTIONS", guildId}); } catch (_) {}
    }
    function userNotifSubscribeGuilds() {
        if (!userNotifHasTargets()) return;
        const guilds = userNotif.guilds || (userNotif.guilds = inspectedExport(2073, "default"));
        if (!guilds) return;
        let ids = null;
        try {
            if (typeof guilds.getGuildIds === "function") ids = guilds.getGuildIds();
            else if (typeof guilds.getGuilds === "function") {
                const map = guilds.getGuilds();
                if (map && typeof map === "object") ids = Object.keys(map);
            }
        } catch (_) {}
        if (!Array.isArray(ids)) return;
        const sub = inspectedExport(6731, "subscribeGuild");
        for (let i = 0; i < ids.length && i < 200; i++) userNotifSubscribeGuild(ids[i], sub);
    }
    function userNotifAllowed(id, kind) {
        const now = Date.now(), key = id + ":" + kind, prev = userNotif.cooldowns.get(key) || 0;
        if (now - prev < USER_NOTIF_COOLDOWN_MS) return false;
        if (userNotif.cooldowns.size >= 500) userNotif.cooldowns.delete(userNotif.cooldowns.keys().next().value);
        userNotif.cooldowns.set(key, now);
        return true;
    }
    function userNotifShow(text, vars) {
        userNotif.shown++;
        userNotif.last = {text, vars};
        const content = tr(text, vars);
        const ui = reviewUI(), Icon = venusIcon(9044, "BellIcon");
        try {
            if (ui.toasts && typeof ui.toasts.open === "function")
                ui.toasts.open({key:"venus-user-notif:" + userNotif.shown, content, IconComponent:Icon});
        } catch (_) {}
        userNotifPushSend(content);
        notify("userNotif");
    }
    function userNotifSeedStatuses(includeOffline) {
        if (!presenceStore || typeof presenceStore.getStatus !== "function") return;
        const seedId = id => {
            if (userNotif.statuses.has(id)) return;
            try {
                const current = presenceStore.getStatus(id);
                if (typeof current === "string" && current && (includeOffline !== false || current !== "offline" && current !== "invisible"))
                    userNotif.statuses.set(id, current);
            } catch (_) {}
        };
        userNotif.ids.forEach(seedId);
        if (!settings.userNotifFriends) return;
        const store = userNotif.relationships || (userNotif.relationships = inspectedExport(4482, "default"));
        try {
            const list = store && typeof store.getFriendIDs === "function" ? store.getFriendIDs() : null;
            if (Array.isArray(list)) for (let i = 0; i < list.length; i++) {
                const id = list[i];
                if (typeof id === "string" && /^\d{17,20}$/.test(id)) seedId(id);
            }
        } catch (_) {}
    }
    function userNotifPresence(update) {
        if (!update || !enabled("userNotif") || !settings.userNotifStatus) return;
        const user = update.user, id = user && user.id || update.userId;
        const nextStatus = typeof update.status === "string" ? update.status : "";
        if (!id || !nextStatus || !userNotifWatched(id)) return;
        let prev = userNotif.statuses.get(id);
        if (prev === undefined && presenceStore && typeof presenceStore.getStatus === "function") {
            try {
                const stored = presenceStore.getStatus(id);
                if (typeof stored === "string" && stored && stored !== nextStatus) prev = stored;
            } catch (_) {}
        }
        // Flux stores update before dispatcher.subscribe listeners run: if a watched person was offline (never seeded
        // or not yet in statuses) and just came online/idle/dnd, PresenceStore.getStatus(id) already equals nextStatus.
        if (prev === undefined && nextStatus !== "offline" && nextStatus !== "invisible") prev = "offline";
        if (userNotif.statuses.size >= 2000 && !userNotif.statuses.has(id))
            userNotif.statuses.delete(userNotif.statuses.keys().next().value);
        userNotif.statuses.set(id, nextStatus);
        if (!prev || prev === nextStatus || !userNotifAllowed(id, "status:" + nextStatus)) return;
        userNotifShow("{name} is now {status}", {name:userNotifPersonName(id, user), status:userNotifStatusName(nextStatus)});
    }
    function userNotifMessage(event) {
        if (!enabled("userNotif") || !settings.userNotifMessages || !event || event.optimistic) return;
        const message = event.message;
        if (!message || message.state === "SENDING") return;
        const author = message.author, id = author && author.id;
        if (!id || !userNotifWatched(id) || !userNotifAllowed(id, "message")) return;
        const name = userNotifPersonName(id, author);
        const place = userNotifPlace(message.channel_id || message.channelId || event.channelId, message.guild_id || message.guildId || event.guildId);
        if (place.isDm) userNotifShow("{name} sent you a DM", {name});
        else if (place.cName && place.gName) userNotifShow("{name} sent a message in #{channel} ({server})", {name, channel:place.cName, server:place.gName});
        else if (place.cName) userNotifShow("{name} sent a message in #{channel}", {name, channel:place.cName});
        else userNotifShow("{name} sent a message", {name});
    }
    function userNotifTyping(event) {
        if (!enabled("userNotif") || !settings.userNotifTyping || !event) return;
        const id = event.userId || event.user && event.user.id;
        if (!id || !userNotifWatched(id) || !userNotifAllowed(id, "typing")) return;
        const name = userNotifPersonName(id, event.user);
        const place = userNotifPlace(event.channelId || event.channel_id, event.guildId || event.guild_id);
        if (place.isDm) userNotifShow("{name} is typing in your DM", {name});
        else if (place.cName && place.gName) userNotifShow("{name} is typing in #{channel} ({server})", {name, channel:place.cName, server:place.gName});
        else if (place.cName) userNotifShow("{name} is typing in #{channel}", {name, channel:place.cName});
        else userNotifShow("{name} is typing", {name});
    }
    function userNotifEvent(event) {
        if (!event || !enabled("userNotif")) return;
        if (event.type === "PRESENCE_UPDATES" && Array.isArray(event.updates)) {
            for (let i = 0; i < event.updates.length; i++) userNotifPresence(event.updates[i]);
        } else if (event.type === "PRESENCE_UPDATE") userNotifPresence(event);
        else if (event.type === "MESSAGE_CREATE") userNotifMessage(event);
        else if (event.type === "TYPING_START") userNotifTyping(event);
        else if (event.type === "CONNECTION_OPEN") { userNotif.statuses.clear(); userNotifSeedStatuses(false); userNotifSubscribeGuilds(); }
        else if (event.type === "CONNECTION_OPEN_SUPPLEMENTAL" || event.type === "PRESENCES_REPLACE" || event.type === "OVERLAY_INITIALIZE") {
            userNotifSeedStatuses(true);
            userNotifSubscribeGuilds();
        } else if (event.type === "RELATIONSHIP_ADD" || event.type === "RELATIONSHIP_UPDATE") userNotifSeedStatuses(true);
        else if (event.type === "CONNECTION_RESUMED" || event.type === "IDLE") userNotifSubscribeGuilds();
        else if (event.type === "GUILD_CREATE") {
            userNotifSeedStatuses(true);
            if (event.guild && event.guild.id) userNotifSubscribeGuild(event.guild.id);
        } else if (event.type === "LOGOUT") { userNotif.statuses.clear(); userNotif.cooldowns.clear(); userNotif.shown = 0; userNotif.last = null; notify("userNotif"); }
    }
    function userNotifSync() {
        const d = userNotif.dispatcher;
        if (!d || typeof d.subscribe !== "function") return;
        const active = enabled("userNotif");
        if (active && !userNotif.subscribed) {
            userNotif.subscribed = true;
            userNotifSeedStatuses();
            userNotifSubscribeGuilds();
            USER_NOTIF_EVENTS.forEach(type => d.subscribe(type, userNotifEvent));
        } else if (!active && userNotif.subscribed) {
            userNotif.subscribed = false;
            if (typeof d.unsubscribe === "function") USER_NOTIF_EVENTS.forEach(type => d.unsubscribe(type, userNotifEvent));
            userNotif.statuses.clear(); userNotif.cooldowns.clear();
        } else if (active) {
            userNotifSeedStatuses();
            userNotifSubscribeGuilds();
        }
    }
    function userNotifInit(d) {
        if (userNotif.dispatcher || !d || typeof d.subscribe !== "function") return;
        userNotif.dispatcher = d;
        userNotifSync();
    }
    function userNotifSetId(id, wanted) {
        if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return false;
        if (wanted) {
            if (userNotif.ids.has(id)) return true;
            if (userNotif.ids.size >= USER_NOTIF_MAX_IDS) userNotif.ids.delete(userNotif.ids.values().next().value);
            userNotif.ids.add(id);
            if (presenceStore && typeof presenceStore.getStatus === "function") {
                try { const s = presenceStore.getStatus(id); if (typeof s === "string" && s) userNotif.statuses.set(id, s); } catch (_) {}
            }
        } else if (!userNotif.ids.delete(id)) return true;
        userNotif.dirty = true;
        save();
        backgroundSync();
        notify("userNotif");
        return true;
    }
    function userNotifClearIds() {
        if (!userNotif.ids.size && settings.userNotifFriends) return;
        userNotif.ids.clear();
        userNotif.dirty = true;
        if (!settings.userNotifFriends) {
            settings.userNotifFriends = true;
            dirty.add("userNotifFriends");
            userNotifSeedStatuses();
        }
        save();
        if (enabled("userNotif")) userNotifSubscribeGuilds();
        backgroundSync();
        notify("userNotif");
        reviewToast(reviewUI(), "People list reset", venusIcon(4793,"CircleCheckIcon"));
    }
    function userNotifAvatarUri(user, size) {
        if (!user) return null;
        let uri = null;
        const avatars = inspectedExport(1403, "default");
        try { if (avatars && typeof avatars.getUserAvatarURL === "function") uri = avatars.getUserAvatarURL(user, false, size || 64); } catch (_) {}
        if ((typeof uri !== "string" || !/^https?:\/\//.test(uri)) && typeof user.id === "string" && typeof user.avatar === "string" && user.avatar)
            uri = "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png?size=" + (size || 64);
        return typeof uri === "string" && /^https?:\/\//.test(uri) ? uri : null;
    }
    // A round avatar like Discord's lists: the picture, or the first letter on a color of its own, with an optional
    // status dot cut out of the corner (ringColor is whatever is behind it, so the cut-out blends in).
    const AVATAR_TINTS = ["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#00a8fc", "#9b59b6"];
    function avatarBubble(user, size, statusValue, ringColor) {
        if (!RN) return undefined;
        size = size || 32;
        const uri = RN.Image ? userNotifAvatarUri(user, size >= 40 ? 128 : 64) : null;
        const name = user && (user.globalName || user.global_name || user.username) || "?";
        const id = user && typeof user.id === "string" ? user.id : name;
        let hash = 0; for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
        const face = uri ? el(RN.Image, {source:{uri}, style:{width:size, height:size, borderRadius:size / 2}}) :
            el(RN.View, {style:{width:size, height:size, borderRadius:size / 2, backgroundColor:AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length], alignItems:"center", justifyContent:"center"}},
                el(RN.Text, {style:{color:"#ffffff", fontSize:Math.round(size * 0.42), fontWeight:"700"}}, name.slice(0, 1).toUpperCase()));
        if (!statusValue) return face;
        const dot = Math.max(10, Math.round(size * 0.34));
        return el(RN.View, {style:{width:size, height:size}}, face,
            el(RN.View, {style:{position:"absolute", right:-2, bottom:-2, width:dot + 4, height:dot + 4, borderRadius:(dot + 4) / 2,
                backgroundColor:ringColor || "#2b2d31", alignItems:"center", justifyContent:"center"}},
                el(RN.View, {style:{width:dot, height:dot, borderRadius:dot / 2, backgroundColor:STATUS_HEX[statusValue] || STATUS_HEX.offline}})));
    }
    function userNotifAvatar(user) { return user ? avatarBubble(user, 32) : undefined; }
    // Up to four overlapping avatars of the people being watched, like Discord's avatar piles.
    function avatarPile(users, ringColor) {
        if (!users.length || !RN) return null;
        const shown = users.slice(0, 4);
        return el(RN.View, {style:{flexDirection:"row", alignItems:"center"}},
            shown.map((user, i) => el(RN.View, {key:user.id || String(i), style:{marginLeft:i ? -10 : 0, borderRadius:15, borderWidth:2, borderColor:ringColor || "#2b2d31"}},
                avatarBubble(user, 26))));
    }
    // Who is watched right now: every friend while All friends is on, plus the people picked or added by ID.
    function userNotifWatchedIds() {
        const out = settings.userNotifFriends ? userNotifFriendIds() : [];
        userNotif.ids.forEach(id => { if (!out.includes(id)) out.push(id); });
        return out;
    }
    function userNotifAnyEvent() { return !!(settings.userNotifStatus || settings.userNotifMessages || settings.userNotifTyping); }
    function userNotifSummaryTitle() {
        if (!enabled("userNotif")) return tr("Turned off");
        const watched = userNotifWatchedIds().length;
        if (!watched) return tr("No one chosen yet");
        if (!userNotifAnyEvent()) return tr("Nothing to notify about");
        return settings.userNotifFriends && !userNotif.ids.size ? pl(watched, "Watching {n} friend", "Watching all {n} friends") :
            pl(watched, "Watching {n} person", "Watching {n} people");
    }
    function userNotifSummary() {
        if (!enabled("userNotif")) return tr("Turned off. Switch it on in Features to start.");
        if (!userNotifWatchedIds().length) return tr("Choose who to watch below.");
        if (!userNotifAnyEvent()) return tr("Turn on at least one thing to be notified about.");
        const countLine = userNotif.shown ? pl(userNotif.shown, "Shown {n} notification since Discord opened.", "Shown {n} notifications since Discord opened.") :
            tr("No notifications shown yet since Discord opened.");
        return userNotif.last ? countLine + "\n" + tr("Last: {name}", {name:tr(userNotif.last.text, userNotif.last.vars)}) : countLine;
    }
    const USER_NOTIF_DARK = {ring:{backgroundColor:"#2b2d31"}, row:{backgroundColor:"#2b2d31"},
        button:{width:32, height:32, borderRadius:16, alignItems:"center", justifyContent:"center", backgroundColor:"#4e50584d"}};
    function UserNotifSettings() {
        useSettings("userNotif");
        const ui = reviewUI();
        const [query, setQuery] = React.useState(""), [idDraft, setIdDraft] = React.useState(""), [, redraw] = React.useState(0);
        React.useEffect(() => {
            const stores = [userStore, presenceStore, userNotif.relationships || (userNotif.relationships = inspectedExport(4482, "default"))].filter(Boolean);
            const wake = () => redraw(n => n + 1);
            stores.forEach(s => { try { if (typeof s.addChangeListener === "function") s.addChangeListener(wake); } catch (_) {} });
            return () => stores.forEach(s => { try { if (typeof s.removeChangeListener === "function") s.removeChangeListener(wake); } catch (_) {} });
        }, []);
        if (!React || !RN) return null;
        const theme = useThemed("userNotif", c => ({ring:{backgroundColor:c.CARD_BACKGROUND_DEFAULT}, row:{backgroundColor:c.CARD_BACKGROUND_DEFAULT},
            button:Object.assign({}, USER_NOTIF_DARK.button, {backgroundColor:c.BACKGROUND_MOD_SUBTLE})}), USER_NOTIF_DARK);
        const ringColor = theme.ring && theme.ring.backgroundColor, rowColor = theme.row && theme.row.backgroundColor;
        const Group = ui.TableRowGroup || RN.View, Switch = ui.TableSwitchRow, Row = ui.TableRow, Press = RN.Pressable || RN.View;
        const CheckboxRow = inspectedExport(5913, "TableCheckboxRow"), SearchField = inspectedExport(6472, "SearchField");
        const on = enabled("userNotif"), allFriends = !!settings.userNotifFriends;
        const friends = userNotifFriendIds(), friendSet = new Set(friends);
        const lookup = id => {
            let user = null, st = "offline";
            try { if (userStore) user = userStore.getUser(id); } catch (_) {}
            try { if (presenceStore && typeof presenceStore.getStatus === "function") st = presenceStore.getStatus(id) || "offline"; } catch (_) {}
            return {id, user, name:userNotifPersonName(id, user), username:user && user.username || "", status:st};
        };
        const friendEntries = friends.map(lookup).sort((a, b) => {
            const aPicked = allFriends || userNotif.ids.has(a.id), bPicked = allFriends || userNotif.ids.has(b.id);
            if (aPicked !== bPicked) return aPicked ? -1 : 1;
            const aOnline = a.status && a.status !== "offline", bOnline = b.status && b.status !== "offline";
            if (aOnline !== bOnline) return aOnline ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        const searchText = typeof query === "string" ? query : "", cleanQuery = searchText.trim().toLowerCase(), idText = typeof idDraft === "string" ? idDraft : "";
        const filteredFriends = cleanQuery ? friendEntries.filter(f => f.name.toLowerCase().includes(cleanQuery) || f.username.toLowerCase().includes(cleanQuery) || f.id.includes(cleanQuery)) : friendEntries;
        const shownFriends = filteredFriends.slice(0, 60);
        const customIds = [];
        userNotif.ids.forEach(id => { if (!friendSet.has(id)) customIds.push(id); });
        let pickedFriendsCount = 0;
        userNotif.ids.forEach(id => { if (friendSet.has(id)) pickedFriendsCount++; });
        // Unticking one friend while All friends is on starts from everyone, minus that friend.
        const toggleFriend = id => {
            if (!on) return;
            if (allFriends) {
                userNotif.ids.clear();
                friends.forEach(fId => { if (fId !== id && userNotif.ids.size < USER_NOTIF_MAX_IDS) userNotif.ids.add(fId); });
                customIds.forEach(cId => { if (userNotif.ids.size < USER_NOTIF_MAX_IDS) userNotif.ids.add(cId); });
                userNotif.dirty = true;
                setSetting("userNotifFriends", false);
                return;
            }
            userNotifSetId(id, !userNotif.ids.has(id));
        };
        // Switching to "People I pick" keeps everyone who was watched ticked, so nothing goes quiet by surprise.
        const setWho = value => {
            if (!on || (value === "all") === allFriends) return;
            if (value === "all") { setSetting("userNotifFriends", true); return; }
            if (!pickedFriendsCount) {
                friends.forEach(fId => { if (userNotif.ids.size < USER_NOTIF_MAX_IDS) userNotif.ids.add(fId); });
                userNotif.dirty = true;
            }
            setSetting("userNotifFriends", false);
        };
        const handle = entry => entry.username && entry.username !== entry.name ? "@" + entry.username : "";
        const personSub = entry => [handle(entry), userNotifStatusName(entry.status)].filter(Boolean).join(" \u00b7 ");
        const friendRow = entry => {
            const checked = allFriends || userNotif.ids.has(entry.id);
            const avatar = avatarBubble(entry.user || {id:entry.id, username:entry.name}, 32, entry.status, rowColor);
            if (CheckboxRow) return el(CheckboxRow, {key:entry.id, label:entry.name, subLabel:personSub(entry), icon:avatar, checked, disabled:!on, onPress:() => toggleFriend(entry.id)});
            return Row ? el(Row, {key:entry.id, label:(checked ? "\u2713 " : "") + entry.name, subLabel:personSub(entry), icon:avatar, disabled:!on, onPress:() => toggleFriend(entry.id)}) : null;
        };
        const searchBox = friends.length > 5 ? (SearchField ?
            el(SearchField, {key:"search", placeholder:tr("Search friends"), value:searchText, onChange:text => setQuery(String(text || "")), isDisabled:!on}) :
            ui.TextInput ? el(ui.TextInput, {key:"search", placeholder:tr("Search friends"), value:searchText, onChange:text => setQuery(String(text || "")), isDisabled:!on, editable:on}) : null) : null;
        const friendRows = !friends.length ? [Row ? el(Row, {key:"empty", label:tr("No friends found"), subLabel:tr("Open your friends list once if Discord hasn't loaded it yet."), disabled:true}) : null] :
            !shownFriends.length ? [Row ? el(Row, {key:"none", label:tr("No matching friends"), disabled:true}) : null] :
            shownFriends.map(friendRow);
        if (filteredFriends.length > shownFriends.length && Row)
            friendRows.push(el(Row, {key:"more", label:tr("Search to see {n} more", {n:filteredFriends.length - shownFriends.length}), disabled:true}));
        const onIdText = text => setIdDraft(String(text || "").replace(/[^0-9]/g, "").slice(0, 20));
        const validDraft = /^\d{17,20}$/.test(idText);
        const addById = () => {
            if (!on || !validDraft) return;
            const me = currentUser();
            if (me && me.id === idText) { reviewToast(ui, "That's your own user ID", venusIcon(4788,"CircleInformationIcon")); return; }
            userNotifSetId(idText, true);
            const getUser = inspectedExport(7630, "getUser");
            if (!knownUser(idText) && typeof getUser === "function") try { Promise.resolve(getUser(idText)).catch(() => {}); } catch (_) {}
            setIdDraft("");
        };
        const idInput = inputWithButton(ui, "input", {value:idText, keyboardType:"number-pad", maxLength:20, placeholder:tr("17 to 20 digit user ID"),
            onSubmitEditing:addById, returnKeyType:"done", editable:on, isDisabled:!on}, onIdText, "Add", addById, !on || !validDraft);
        const removeButton = id => el(Press, {style:[theme.button, {opacity:on ? 1 : 0.5}], accessibilityRole:"button", accessibilityLabel:tr("Stop watching"),
            disabled:!on, hitSlop:{top:6, bottom:6, left:6, right:6}, onPress:on ? () => userNotifSetId(id, false) : undefined}, el(venusIcon(5940, "XSmallIcon"), {size:"sm"}));
        const customRows = customIds.map(id => {
            const entry = lookup(id), known = entry.name !== id;
            const sub = known ? [handle(entry), userNotifStatusName(entry.status)].filter(Boolean).join(" \u00b7 ") : tr("Not loaded yet");
            return Row ? el(Row, {key:"id:" + id, label:entry.name, subLabel:sub, icon:avatarBubble(entry.user || {id, username:"#"}, 32, known ? entry.status : null, rowColor),
                trailing:removeButton(id), disabled:!on}) : null;
        });
        const watchedUsers = userNotifWatchedIds().slice(0, 4).map(lookup).map(e => e.user || {id:e.id, username:e.name});
        const groups = [
            VenusStatusCard({key:"status", title:userNotifSummaryTitle(), IconComponent:venusIcon(9044, "BellIcon"),
                leading:on && userNotifAnyEvent() && watchedUsers.length ? avatarPile(watchedUsers, ringColor) : null, body:userNotifSummary()}),
            el(Group, {key:"events", title:tr("Notify me when they")},
                switchRow(Switch, "userNotifStatus", "Change status", "Online, Idle, Do Not Disturb or Offline.", rowIcon(10420, "UserCircleIcon")),
                switchRow(Switch, "userNotifMessages", "Send a message", "In DMs or in any server channel your client receives.", rowIcon(5386, "ChatIcon")),
                switchRow(Switch, "userNotifTyping", "Start typing", "In DMs or in a channel you have open.", rowIcon(10813, "KeyboardIcon"))),
            el(Group, {key:"push", title:tr("Outside Discord")},
                switchRow(Switch, "userNotifPush", "Phone notifications", "Also notify you while Discord is closed. Keeps Discord connected, which uses more battery.", rowIcon(6376, "MobilePhoneIcon")),
                settings.userNotifPush && userNotif.permissionGranted === false && Row ?
                    el(Row, {key:"perm", label:tr("Allow notification permission"), subLabel:tr("Android notifications are turned off for Discord. Tap to check or open system settings."),
                        icon:rowIcon(9586, "BellSlashIcon"), variant:"danger", arrow:true, disabled:!on, onPress:() => userNotifRequestPermissions(true)}) : null),
            el(RN.View, {key:"who", style:{gap:8}},
                groupTitle("title", "Who to watch"),
                venusSegmented({key:"choice", value:allFriends ? "all" : "picked", disabled:!on, onChange:setWho,
                    items:[{value:"all", label:tr("All friends")}, {value:"picked", label:tr("People I pick")}]}),
                allFriends ? el(Group, {key:"all"},
                    Row ? el(Row, {key:"all", label:friends.length ? pl(friends.length, "{n} friend", "{n} friends") : tr("All friends"),
                        subLabel:tr("Everyone on your friends list, new friends too."), icon:rowIcon(4532, "FriendsIcon"), disabled:!on,
                        trailing:watchedUsers.length ? avatarPile(watchedUsers, rowColor) : undefined}) : null) : null),
            allFriends ? null : el(RN.View, {key:"friends", style:{gap:8}},
                searchBox,
                el(Group, {title:pickedFriendsCount ? pl(pickedFriendsCount, "Friends \u00b7 {n} picked", "Friends \u00b7 {n} picked") : tr("Friends")}, friendRows)),
            el(Group, {key:"ids", title:tr("People who aren't your friends")},
                el(RN.View, {key:"input", style:{padding:12}}, idInput),
                customRows),
            userNotif.ids.size || !allFriends ? el(Group, {key:"manage", title:tr("Manage")},
                actionRow(ui, "reset", "Reset chosen people", tr("Switches All friends back on and clears {count}.", {count:pl(userNotif.ids.size, "{n} chosen person", "{n} chosen people")}),
                    () => confirmAction("Reset chosen people?", "Your picked friends and custom user IDs will be cleared, and All friends will be turned back on.", "Reset", userNotifClearIds),
                    false, true)) : null,
            footnote("note", "Notifications show as banners while Discord is open. For people who aren't your friends, Discord only sends what happens in servers you share.")];
        return settingsBody(ui, groups, {keyboardShouldPersistTaps:"handled"});
    }

    // Settings button on the profile bar ("You bar"), next to the notifications bell. Same button Discord uses for
    // its own bar buttons (YouBarButton 16031), with Discord's settings icon, opening Discord's own settings.
    let youBarParts = null;
    function YouBarSettingsButton(props) {
        useSettings("youBarSettings");
        if (!enabled("youBarSettings") || !RN) return null;
        // Looked up once they've all loaded, not on every render of the bar.
        if (!youBarParts) {
            const Button = inspectedExport(16031, "default"), Icon = inspectedExport(6799, "SettingsIcon");
            if (!Button || !Icon) return null;
            const size = inspectedExport(14615, "YOU_BAR_BUTTON_ICON_SIZE") || 20;
            youBarParts = {Button, Icon, style:{width:size, height:size}};
        }
        const nameplate = !!(props && props.hasNameplate);
        return el(youBarParts.Button, {hasNameplate:nameplate, hasBadge:false, accessibilityLabel:tr("Venus settings"), onPress:openSettings,
            icon:el(youBarParts.Icon, {size:"custom", style:youBarParts.style, color:nameplate ? "white" : undefined})});
    }
    // Opens Venus settings, not Discord's. openUserSettings (6801) opens the settings navigator on the screen it's
    // given, and every settings route node, VENUS_PLUGINS too, is one of that navigator's screens (14239
    // getSettingScreens), so Back goes to Discord's settings like when you open Venus from there.
    function openSettings() {
        // Ensure SettingsRendererConfig (14130) and SettingListRenderer (14236) are initialized before
        // opening SettingsNavigator so VENUS_PLUGINS is registered even on first tap after app restart
        // and SettingsList is non-null so the page never renders a blank black screen (#58).
        if (!status.menu) inspectedExport(14130, "SETTING_RENDERER_CONFIG");
        if (!SettingsList) SettingsList = inspectedExport(14236, "SettingsList");
        const screen = status.menu ? "VENUS_PLUGINS" : undefined;
        const open = inspectedExport(6801, "openUserSettings");
        try { if (typeof open === "function") { open(screen ? {screen} : undefined); return; } } catch (_) {}
        try { const ref = inspectedExport(4695, "getRootNavigationRef"); const nav = ref && ref(); if (nav) nav.navigate("settings", screen ? {screen} : undefined); } catch (_) {}
    }
    function youBarButtons(orig, self, args) {
        // Always the same shape, so switching it on or off never remounts the bell.
        const nameplate = args[0] && args[0].hasNameplate;
        const children = [orig.apply(self, args)];
        if (features.accountSwitcher) children.push(el(YouBarAccountSwitcherButton, {hasNameplate:nameplate}));
        if (features.youBarSettings) children.push(el(YouBarSettingsButton, {hasNameplate:nameplate}));
        return el.apply(null, [React.Fragment, null].concat(children));
    }

    // Account switcher: unlocks Discord's built-in mobile multi-account engine (MultiAccountStore 11800,
    // MultiAccountActionCreators 11804, YouAccountActionSheet 16009 and ManageAccountsModal 16013), which Discord
    // hides behind isStaffFromRawUser (11802) on mobile. Also places an optional button on the bottom profile bar
    // (YouBarNotificationsButton 16032 / YouBarButton 16031).
    const ACCOUNT_SWITCHER_DEFAULT_LIMIT = 5, ACCOUNT_SWITCHER_RAISED_LIMIT = 50;
    const accountSwitcher = {store:null, origUsers:null, origValidUsers:null, realMaxAccounts:ACCOUNT_SWITCHER_DEFAULT_LIMIT,
        youBarParts:null};
    function multiAccountLimit() {
        // MultiAccountStore (11800) and PushNotificationActionCreators (11799) read MAX_ACCOUNTS /
        // MAX_PUSH_SYNC_ACCOUNTS once at module evaluation time during startup (before venus-patches.json
        // finishes restoring settings.accountSwitcher) and permanently cache the number in a closure slot.
        // Always return the raised limit when the patch is built in so CONNECTION_OPEN never splices >5 accounts.
        return features.accountSwitcher ?
            ACCOUNT_SWITCHER_RAISED_LIMIT : accountSwitcher.realMaxAccounts;
    }
    function multiAccountConstants(exports) {
        if (!exports || typeof exports !== "object") return;
        for (const key of ["MAX_ACCOUNTS", "MAX_PUSH_SYNC_ACCOUNTS"]) {
            const desc = Object.getOwnPropertyDescriptor(exports, key);
            if (!desc || !desc.configurable) continue;
            if (typeof desc.value === "number" && desc.value > 0) accountSwitcher.realMaxAccounts = desc.value;
            Object.defineProperty(exports, key, {get:multiAccountLimit, enumerable:desc.enumerable, configurable:true});
        }
    }
    function accountSwitcherCurrentEntry() {
        const me = currentUser();
        if (!me || !me.id) return null;
        const statuses = inspectedExport(11800, "MultiAccountTokenStatus");
        const validStatus = statuses && typeof statuses.VALID === "number" ? statuses.VALID : 2;
        return {id:me.id, avatar:me.avatar || null, username:me.username || "", discriminator:me.discriminator || "0", tokenStatus:validStatus};
    }
    function accountSwitcherWithCurrent(list, validOnly) {
        const base = Array.isArray(list) ? list : [];
        if (!enabled("accountSwitcher")) return base;
        const entry = accountSwitcherCurrentEntry();
        if (!entry) return base;
        const statuses = inspectedExport(11800, "MultiAccountTokenStatus");
        const invalidStatus = statuses && typeof statuses.INVALID === "number" ? statuses.INVALID : 0;
        const filtered = validOnly ? base.filter(u => u && u.tokenStatus !== invalidStatus) : base;
        if (filtered.some(u => u && u.id === entry.id)) return filtered;
        return [entry].concat(filtered);
    }
    function accountSwitcherStore() {
        return accountSwitcher.store || (accountSwitcher.store = inspectedExport(11800, "default"));
    }
    function accountSwitcherUsers() {
        const store = accountSwitcherStore();
        let list = [];
        try {
            if (store && typeof store.getUsers === "function") list = store.getUsers() || [];
            else if (accountSwitcher.origUsers) list = accountSwitcher.origUsers() || [];
        } catch (_) {}
        return accountSwitcherWithCurrent(list, false);
    }
    // Discord's saved data (Storage 510/511) is read asynchronously at startup. Until it has loaded, the saved
    // account list and tokens look empty, so nothing may be written yet.
    function accountSwitcherStorageReady() {
        const storage = inspectedExport(510, "Storage");
        return !storage || storage.hasLoaded !== false;
    }
    function accountSwitcherSync() {
        const store = accountSwitcherStore();
        // MultiAccountStore is a PersistedStore: initializeIfNeeded() reads the saved list once and then never again.
        // Calling it (or initialize + asyncPersist) before Discord loaded its storage and signed in, as happens on a
        // cold start, read an empty list and saved it over every account (#63). Only Discord initializes the store;
        // Venus adds the signed-in account afterwards, and only when it is missing.
        const me = enabled("accountSwitcher") ? currentUser() : null;
        if (me && me.id && accountSwitcherStorageReady()) {
            const rawTokenMod = global.__r && global.__r(1112);
            const tokenMgr = rawTokenMod && typeof rawTokenMod.setToken === "function" ? rawTokenMod :
                rawTokenMod && rawTokenMod.default && typeof rawTokenMod.default.setToken === "function" ? rawTokenMod.default : null;
            try {
                if (tokenMgr && typeof tokenMgr.getToken === "function") {
                    const activeToken = tokenMgr.getToken();
                    if (typeof activeToken === "string" && activeToken && !tokenMgr.getToken(me.id))
                        tokenMgr.setToken(activeToken, me.id);
                }
            } catch (_) {}
            try {
                if (store && store._isInitialized !== false && typeof store.initialize === "function" && typeof store.getState === "function") {
                    const state = store.getState() || {};
                    const saved = Array.isArray(state.users) ? state.users : [];
                    if (!saved.some(u => u && u.id === me.id)) {
                        store.initialize(Object.assign({}, state, {users:accountSwitcherWithCurrent(saved, false), canUseMultiAccountMobile:true}));
                        if (typeof store.asyncPersist === "function") store.asyncPersist();
                    }
                }
            } catch (_) {}
        }
        try { if (store && typeof store.emitChange === "function") store.emitChange(); } catch (_) {}
        notify("accountSwitcher");
    }
    function hookMultiAccountStore(exports) {
        const store = exports && exports.default;
        if (!store) return exports;
        accountSwitcher.store = store;
        if (!accountSwitcher.origUsers && typeof store.getUsers === "function")
            accountSwitcher.origUsers = store.getUsers.bind(store);
        if (!accountSwitcher.origValidUsers && typeof store.getValidUsers === "function")
            accountSwitcher.origValidUsers = store.getValidUsers.bind(store);
        let patched = hookExport(store, "getCanUseMultiAccountMobile", function (orig, self, args) {
            return enabled("accountSwitcher") ? true : orig.apply(self, args);
        });
        patched = hookExport(patched, "getUsers", function (orig, self, args) {
            const res = orig.apply(self, args);
            return enabled("accountSwitcher") ? accountSwitcherWithCurrent(res, false) : res;
        });
        patched = hookExport(patched, "getValidUsers", function (orig, self, args) {
            const res = orig.apply(self, args);
            return enabled("accountSwitcher") ? accountSwitcherWithCurrent(res, true) : res;
        });
        patched = hookExport(patched, "getHasLoggedInAccounts", function (orig, self, args) {
            const res = orig.apply(self, args);
            return enabled("accountSwitcher") ? (res || accountSwitcherUsers().length > 0) : res;
        });
        const out = replaceValue(exports, "default", patched);
        if (enabled("accountSwitcher")) accountSwitcherSync();
        return out;
    }
    function hookIsStaffForMultiAccount(exports) {
        if (!exports) return exports;
        const wrap = function (orig, self, args) {
            const res = orig.apply(self, args);
            if (res || !enabled("accountSwitcher")) return res;
            const user = args[0], me = currentUser();
            if (!me || (user && user.id === me.id)) return true;
            const store = accountSwitcherStore();
            try { if (store && typeof store.getCanUseMultiAccountMobile === "function" && !store.getCanUseMultiAccountMobile()) return true; } catch (_) {}
            return res;
        };
        if (typeof exports.default === "function") exports = hookExport(exports, "default", wrap);
        if (typeof exports.isStaffFromRawUser === "function") exports = hookExport(exports, "isStaffFromRawUser", wrap);
        return exports;
    }
    function openAccountSwitcherSheet() {
        accountSwitcherSync();
        const showSheet = inspectedExport(16007, "showYouAccountActionSheet");
        try { if (typeof showSheet === "function") { showSheet(false); return; } } catch (_) {}
        openManageAccounts();
    }
    function openManageAccounts(screen) {
        accountSwitcherSync();
        if (!screen) {
            const screens = inspectedExport(16014, "ManageAccountsScreens") || inspectedExport(16014, "ManageAccountsModalRoutes");
            screen = screens && screens.MANAGE_ACCOUNTS || "manage_accounts";
        }
        const openModal = inspectedExport(16012, "default");
        try { if (typeof openModal === "function") { openModal(screen); return; } } catch (_) {}
    }
    function openAddAccountModal() {
        const screens = inspectedExport(16014, "ManageAccountsScreens") || inspectedExport(16014, "ManageAccountsModalRoutes");
        const loginRoute = screens && screens.LOGIN || "login";
        openManageAccounts(loginRoute);
    }
    function switchToAccount(userId) {
        if (typeof userId !== "string" || !userId) return;
        const me = currentUser();
        if (me && me.id === userId) return;
        accountSwitcherSync();
        const rawActions = global.__r && global.__r(11804);
        const actions = rawActions && typeof rawActions.switchAccount === "function" ? rawActions : rawActions && rawActions.default;
        const locs = inspectedExport(11801, "MultiAccountSwitchLocation");
        const location = locs && (locs.MANAGE_ACCOUNTS_MODAL || locs.YOU_ACCOUNT_ACTION_SHEET) || "manage_accounts_modal";
        try {
            if (actions && typeof actions.switchAccount === "function") {
                actions.switchAccount(userId, undefined, location);
                return;
            }
        } catch (_) {}
    }
    function removeSavedAccount(userId) {
        if (typeof userId !== "string" || !userId) return;
        const me = currentUser();
        if (me && me.id === userId) return;
        const rawActions = global.__r && global.__r(11804);
        const actions = rawActions && typeof rawActions.removeAccount === "function" ? rawActions : rawActions && rawActions.default;
        try { if (actions && typeof actions.removeAccount === "function") actions.removeAccount(userId); } catch (_) {}
        notify("accountSwitcher");
    }
    function YouBarAccountSwitcherButton(props) {
        useSettings("accountSwitcher");
        useSettings("accountSwitcherYouBar");
        if (!enabled("accountSwitcher") || !settings.accountSwitcherYouBar || !RN) return null;
        if (!accountSwitcher.youBarParts) {
            const Button = inspectedExport(16031, "default"), Icon = inspectedExport(5404, "GroupIcon") || inspectedExport(10420, "UserCircleIcon");
            if (!Button || !Icon) return null;
            const size = inspectedExport(14615, "YOU_BAR_BUTTON_ICON_SIZE") || 20;
            accountSwitcher.youBarParts = {Button, Icon, style:{width:size, height:size}};
        }
        const nameplate = !!(props && props.hasNameplate);
        return el(accountSwitcher.youBarParts.Button, {hasNameplate:nameplate, hasBadge:false,
            accessibilityLabel:tr("Switch accounts"), onPress:openAccountSwitcherSheet, onLongPress:() => openManageAccounts(),
            icon:el(accountSwitcher.youBarParts.Icon, {size:"custom", style:accountSwitcher.youBarParts.style, color:nameplate ? "white" : undefined})});
    }
    function accountSwitcherSummary() {
        if (!enabled("accountSwitcher")) return tr("Turned off. Switch it on in Features to start.");
        const accounts = accountSwitcherUsers();
        const me = currentUser();
        const limit = multiAccountLimit();
        const countText = accounts.length ? pl(accounts.length, "{n} account saved (up to {max}).", "{n} accounts saved (up to {max}).", {max:limit}) :
            tr("No accounts saved yet (up to {max}).", {max:limit});
        const activeName = me && (me.globalName || me.global_name || me.username);
        return activeName ? countText + "\n" + tr("Signed in as {name}.", {name:activeName}) : countText;
    }
    function AccountSwitcherSettings() {
        useSettings("accountSwitcher");
        const [, forceUpdate] = React.useState(0);
        const ui = reviewUI();
        React.useEffect(() => {
            accountSwitcherSync();
            const validate = inspectedExport(11804, "validateMultiAccountTokens");
            try { if (enabled("accountSwitcher") && typeof validate === "function") validate(); } catch (_) {}
            const wake = () => forceUpdate(n => n + 1);
            const stores = [userStore, accountSwitcherStore()].filter(Boolean);
            stores.forEach(s => { try { if (typeof s.addChangeListener === "function") s.addChangeListener(wake); } catch (_) {} });
            return () => stores.forEach(s => { try { if (typeof s.removeChangeListener === "function") s.removeChangeListener(wake); } catch (_) {} });
        }, []);
        if (!React || !RN) return null;
        const Group = ui.TableRowGroup || RN.View, Switch = ui.TableSwitchRow, Row = ui.TableRow;
        const on = enabled("accountSwitcher");
        const me = currentUser(), myId = me && me.id;
        const accounts = accountSwitcherUsers();
        const statuses = inspectedExport(11800, "MultiAccountTokenStatus");
        const invalidStatus = statuses && typeof statuses.INVALID === "number" ? statuses.INVALID : 0;
        const validatingStatus = statuses && typeof statuses.VALIDATING === "number" ? statuses.VALIDATING : 1;
        const accountRows = accounts.length ? accounts.map(acc => {
            if (!acc || !acc.id || !Row) return null;
            const active = myId && acc.id === myId;
            const fullUser = (active ? me : userStore && userStore.getUser(acc.id)) || acc;
            const displayName = fullUser && (fullUser.globalName || fullUser.global_name || fullUser.username) || acc.username || acc.id;
            const handle = acc.username && acc.username !== displayName ? "@" + acc.username + " \u00b7 " : "";
            const statusText = active ? tr("Active account \u00b7 Tap for the quick switcher") :
                acc.tokenStatus === invalidStatus ? tr("Session expired \u00b7 Tap to sign in again") :
                acc.tokenStatus === validatingStatus ? tr("Checking session...") : tr("Tap to switch");
            return el(Row, {key:"acc:" + acc.id, label:displayName, subLabel:handle + statusText,
                icon:avatarBubble(fullUser, 32, active ? "online" : acc.tokenStatus === invalidStatus ? "dnd" : null), disabled:!on,
                trailing:active ? popIn("on:" + acc.id, el(venusIcon(6555, "CheckmarkSmallIcon"), {size:"md"})) : undefined,
                onPress:() => {
                    if (active) { openAccountSwitcherSheet(); return; }
                    if (acc.tokenStatus === invalidStatus) { openAddAccountModal(); return; }
                    switchToAccount(acc.id);
                },
                onLongPress:!active ? () => confirmAction("Remove account?",
                    tr("Remove {name} from this phone's account switcher? You can add it again anytime.", {name:displayName}),
                    "Remove", () => removeSavedAccount(acc.id)) : undefined});
        }) : [Row ? el(Row, {key:"empty", label:tr("No saved accounts yet"), subLabel:tr("Tap Add account below to sign in to another account."), disabled:true}) : null];
        const groups = [
            on ? statusCard("status", accountSwitcherSummary(), {title:accounts.length > 1 ? pl(accounts.length, "{n} account", "{n} accounts") : tr("One account so far"),
                IconComponent:venusIcon(5404, "GroupIcon"), leading:accounts.length ? avatarPile(accounts.slice(0, 4).map(acc => (myId && acc.id === myId ? me : userStore && userStore.getUser(acc.id)) || acc)) : null}) :
                offCard("status", venusIcon(5404, "GroupIcon")),
            el(Group, {key:"accounts", title:tr("Accounts")},
                accountRows,
                Row ? el(Row, {key:"add", label:tr("Add account"), subLabel:tr("Sign in to another Discord account on this phone."), icon:rowIcon(4770, "UserPlusIcon"),
                    arrow:true, disabled:!on || accounts.length >= multiAccountLimit(), onPress:openAddAccountModal}) : null,
                Row ? el(Row, {key:"manage", label:tr("Manage accounts"), subLabel:tr("Open Discord's account manager to reorder or remove accounts."), icon:rowIcon(6799, "SettingsIcon"),
                    arrow:true, disabled:!on, onPress:() => openManageAccounts()}) : null,
                null),
            el(Group, {key:"shortcuts", title:tr("Shortcuts")},
                switchRow(Switch, "accountSwitcherYouBar", "Button on the profile bar", "Shows a Switch accounts button next to the notifications bell on the bottom bar.", rowIcon(10420, "UserCircleIcon"))),
            footnote("note", "Tap your avatar on the You tab, or hold the You tab, to switch from anywhere. Hold an account above to remove it.")];
        return settingsBody(ui, groups);
    }

    // Send messages longer than the limit (based on SplitLargeMessages by sunnie): the message box accepts
    // any length, and a long message is sent as several, each within Discord's limit.
    const SPLIT_UNLIMITED = 1 << 30;
    const realLimits = {normal:2000, premium:4000};
    const split = {generation:0, premium:null, canBypassSlowmode:null};
    function messageLimit() {
        const user = currentUser();
        if (!user) return realLimits.normal;
        try {
            const premium = split.premium || (split.premium = inspectedExport(4491, "default"));
            const check = premium && premium.canUseIncreasedMessageLength;
            if (typeof check === "function") return check.call(premium, user) ? realLimits.premium : realLimits.normal;
        } catch (_) {}
        return user.premiumType === 2 ? realLimits.premium : realLimits.normal;
    }
    // Splits at the last line break, else the last space, else anywhere. A code block cut in two is closed at
    // the end of one part and opened again, with its language, at the start of the next.
    const FENCE = /```([^\s`]{0,20})/g;
    function splitContent(text, limit) {
        const chunks = [];
        let start = 0, prefix = "";
        while (prefix.length + (text.length - start) > limit) {
            const budget = limit - prefix.length - 4;
            if (budget < 16) return null;
            const searchEnd = start + budget;
            let cut = text.lastIndexOf("\n", searchEnd);
            if (cut - start < budget / 2) {
                const space = text.lastIndexOf(" ", searchEnd);
                if (space > cut) cut = space;
            }
            if (cut <= start) cut = searchEnd;
            const code = text.charCodeAt(cut - 1);
            if (code >= 0xD800 && code <= 0xDBFF && cut - 1 > start) cut--;
            let piece = prefix + text.slice(start, cut);
            start = cut;
            if (text[start] === "\n" || text[start] === " ") start++;
            let open = false, language = "";
            if (piece.indexOf("```") >= 0) {
                let match;
                FENCE.lastIndex = 0;
                while ((match = FENCE.exec(piece))) { open = !open; if (open) language = match[1]; }
            }
            if (open) { piece += "\n```"; prefix = "```" + language + "\n"; } else prefix = "";
            if (piece.trim()) chunks.push(piece);
        }
        const last = prefix + (start ? text.slice(start) : text);
        if (last.trim() && last.trim() !== prefix.trim()) chunks.push(last);
        return chunks;
    }
    function splitGapMs(channelId) {
        const channel = receivedChannel(channelId);
        const slowmode = channel && Number(channel.rateLimitPerUser) || 0;
        if (slowmode <= 0) return 1000;
        const canBypass = split.canBypassSlowmode || (split.canBypassSlowmode = inspectedExport(7105, "canBypassSlowmode"));
        try { if (typeof canBypass === "function" && canBypass(channel)) return 1000; } catch (_) {}
        return Math.max(1000, slowmode * 1000 + 500);
    }
    function splitFollowUpOptions(options) {
        if (!options || typeof options !== "object") return {};
        const next = {};
        if (options.location !== undefined) next.location = options.location;
        if (options.flags !== undefined) next.flags = options.flags;
        if (options.allowedMentions !== undefined) next.allowedMentions = options.allowedMentions;
        if (options.eagerDispatch !== undefined) next.eagerDispatch = options.eagerDispatch;
        if (options.doNotNotifyOnError !== undefined) next.doNotNotifyOnError = options.doNotNotifyOnError;
        return next;
    }
    function splitSend(orig, self, args) {
        const channelId = args[0], message = args[1], waitForReady = args[2], options = args[3];
        // Hot path: every send that fits goes straight through after one length check.
        if (!message || typeof message.content !== "string" || message.content.length <= 2000 || !enabled("splitMessages")) return orig.apply(self, args);
        // Never split scheduled messages: createScheduledMessage (297457) schedules a single server payload.
        if (options && options.scheduledTimestamp != null) return orig.apply(self, args);
        const limit = messageLimit();
        if (message.content.length <= limit) return orig.apply(self, args);
        const chunks = splitContent(message.content, limit);
        if (!chunks || chunks.length < 2) return orig.apply(self, args);
        const generation = split.generation;
        const first = Array.from(args); first[1] = Object.assign({}, message, {content:chunks[0]});
        const result = orig.apply(self, first);
        const gap = splitGapMs(channelId);
        const followOptions = splitFollowUpOptions(options);
        const followMessageBase = {tts:!!message.tts, invalidEmojis:message.invalidEmojis || [],
            validNonShortcutEmojis:message.validNonShortcutEmojis || []};
        // The rest follow one at a time, without the reply or attachments, only after the previous part succeeds.
        let chain = Promise.resolve(result).then(res => !(res && res.hasErr), () => false);
        for (let i = 1; i < chunks.length; i++) {
            const content = chunks[i];
            chain = chain.then(ok => {
                if (!ok || !enabled("splitMessages") || split.generation !== generation) return false;
                return new Promise(resolve => later(resolve, gap)).then(() => {
                    if (!enabled("splitMessages") || split.generation !== generation) return false;
                    return orig.call(self, channelId, Object.assign({content}, followMessageBase), waitForReady, Object.assign({}, followOptions));
                }).then(res => !(res && res.hasErr), () => false);
            });
        }
        return result;
    }
    // useMessageMaxLength (8602): the message box, its counter and the "too long" check all ask it.
    // Its internal useStateFromStores closure (97597 / 97598) reads MAX_MESSAGE_LENGTH / MAX_MESSAGE_LENGTH_PREMIUM
    // from lexical environment slots [2, 4] and [2, 5] captured once when 8602's factory ran, so lengthConstants
    // always returns SPLIT_UNLIMITED when features.splitMessages is built in, and maxLengthModule restores the real
    // limit when the toggle is off.
    function maxLengthModule(exports) {
        const big = (orig, self, args) => {
            const value = orig.apply(self, args);
            if (enabled("splitMessages")) return SPLIT_UNLIMITED;
            return value === SPLIT_UNLIMITED ? messageLimit() : value;
        };
        exports = hookExport(exports, "getMaxMessageLength", big);
        return hookExport(exports, "default", (orig, self, args) => {
            if (React) useSettings("splitMessages");
            return big(orig, self, args);
        });
    }
    // Constants (1086): DraftStore (5201) and useMessageMaxLength (8602) both read MAX_MESSAGE_LENGTH and
    // MAX_MESSAGE_LENGTH_PREMIUM once at module evaluation time during startup (before venus-patches.json finishes
    // loading settings.splitMessages) and cache the numbers in closure environment slots. Always return
    // SPLIT_UNLIMITED while features.splitMessages is built in so DraftStore never truncates long drafts to 4500
    // characters and 8602's closure slots hold SPLIT_UNLIMITED.
    function lengthConstants(exports) {
        if (!exports) return exports;
        for (const [key, slot] of [["MAX_MESSAGE_LENGTH", "normal"], ["MAX_MESSAGE_LENGTH_PREMIUM", "premium"]]) {
            const descriptor = Object.getOwnPropertyDescriptor(exports, key);
            if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number" || !descriptor.configurable) continue;
            realLimits[slot] = descriptor.value;
            const value = descriptor.value;
            Object.defineProperty(exports, key, {configurable:true, enumerable:descriptor.enumerable,
                get:() => features.splitMessages ? SPLIT_UNLIMITED : value, set:() => {}});
        }
        return exports;
    }

    // Translate messages: every message on screen that isn't in your language is shown translated, with a note
    // saying from what. Google Translate's free, keyless endpoint (the one its browser extension uses) translates
    // and detects the language in one go, and takes many messages per request: messages are sent in batches, only
    // once each, and only when they're drawn. Mentions, emojis, links, code and timestamps are never sent as text:
    // they're replaced by numbered tags the translator keeps in place, and put back as they were.
    const TRANSLATE_HOSTS = ["https://translate.googleapis.com", "https://clients5.google.com"];
    const TRANSLATE_PATH = "/translate_a/t?client=dict-chrome-ex&sl=auto&tl=";
    // Per request: Google accepts more, but smaller requests fail less and look like the extension's.
    const TRANSLATE_BATCH = 40, TRANSLATE_BATCH_CHARS = 6000, TRANSLATE_MAX_TEXT = 4500, TRANSLATE_CACHE = 2000;
    // Up to three requests at once, each with its own timeout: one slow answer no longer holds up the rest.
    // Translations are saved on the phone, so a chat opened again after a restart needs no request at all.
    const TRANSLATE_PARALLEL = 3, TRANSLATE_TIMEOUT_MS = 8000, TRANSLATE_FILE = "venus-translations.json", TRANSLATE_SAVED = 1500, TRANSLATE_SAVED_BYTES = 2 * 1024 * 1024;
    // Formatting whose words are translated. Every other node (mentions, emojis, links, code, timestamps) is kept as it is.
    const TRANSLATE_GROUPS = new Set(["strong", "em", "u", "s", "spoiler", "blockQuote", "subtext", "heading", "paragraph", "link"]);
    // Letters of any script, but not digits, punctuation or emojis (surrogates): those need no translating.
    const TRANSLATE_LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u1FFF\u2C00-\uD7FF\uF900-\uFDFF\uFE70-\uFEFF\uFF21-\uFF5A\uFF66-\uFFDC]/g;
    const LANGUAGE_NAMES = {af:"Afrikaans", ar:"Arabic", bg:"Bulgarian", bn:"Bengali", ca:"Catalan", cs:"Czech", cy:"Welsh", da:"Danish", de:"German",
        el:"Greek", en:"English", eo:"Esperanto", es:"Spanish", et:"Estonian", fa:"Persian", fi:"Finnish", fil:"Filipino", tl:"Filipino", fr:"French",
        ga:"Irish", gl:"Galician", gu:"Gujarati", he:"Hebrew", hi:"Hindi", hr:"Croatian", hu:"Hungarian", hy:"Armenian", id:"Indonesian", is:"Icelandic",
        it:"Italian", ja:"Japanese", jv:"Javanese", ka:"Georgian", kk:"Kazakh", km:"Khmer", ko:"Korean", la:"Latin", lt:"Lithuanian", lv:"Latvian",
        mk:"Macedonian", ml:"Malayalam", mn:"Mongolian", mr:"Marathi", ms:"Malay", my:"Burmese", ne:"Nepali", nl:"Dutch", no:"Norwegian", pa:"Punjabi",
        pl:"Polish", pt:"Portuguese", ro:"Romanian", ru:"Russian", sk:"Slovak", sl:"Slovenian", sq:"Albanian", sr:"Serbian", sv:"Swedish", sw:"Swahili",
        ta:"Tamil", te:"Telugu", th:"Thai", tr:"Turkish", uk:"Ukrainian", ur:"Urdu", uz:"Uzbek", vi:"Vietnamese", zh:"Chinese"};
    const translate = {dispatcher:null, cache:new Map(), queue:[], shown:new Map(), timer:undefined, active:0,
        host:0, pausedUntil:0, failures:0, translated:0, error:"", generation:0, version:0, layouts:new WeakMap(), refreshing:new Set(),
        restored:false, restoring:false, saveTimer:undefined, saving:false,
        // Your choice for single messages from the hold menu: true translates it, false keeps the original.
        // With "Only when you ask", only messages set to true are translated.
        choice:new Map(), asked:new Set()};
    const TRANSLATE_CHOICES = 1000;
    function translateWanted(id) {
        const choice = translate.choice.get(id);
        return settings.translateMode === "manual" ? choice === true : choice !== false;
    }
    function translateInit(dispatcher) {
        if (translate.dispatcher || !dispatcher || typeof dispatcher.dispatch !== "function") return;
        translate.dispatcher = dispatcher;
        if (typeof dispatcher.subscribe === "function") dispatcher.subscribe("LOGOUT", () => {
            translate.generation++; translate.cache.clear(); translate.queue.length = 0; translate.shown.clear(); translate.choice.clear(); translate.asked.clear();
            // Another account's messages must never be shown from this one's translations.
            if (files) Promise.resolve().then(() => files.writeFile("documents", TRANSLATE_FILE, "{\"version\":1,\"entries\":[]}", "utf8")).catch(() => {});
        });
    }
    // Saved translations: only finished ones, newest last, read once when Discord opens. A damaged file is ignored.
    function translateRestore() {
        if (translate.restored || translate.restoring || !files || !features.translate) return;
        let constants;
        try { constants = typeof files.getConstants === "function" ? files.getConstants() : files; } catch (_) { constants = null; }
        const directory = constants && constants.DocumentsDirPath;
        if (typeof directory !== "string") { translate.restored = true; return; }
        const path = directory.replace(/\/$/, "") + "/" + TRANSLATE_FILE, generation = translate.generation;
        translate.restoring = true;
        Promise.resolve().then(() => files.fileExists(path)).then(exists => exists ? files.readFile(path, "utf8") : null).then(text => {
            if (!text || text.length > TRANSLATE_SAVED_BYTES || generation !== translate.generation) return;
            const saved = JSON.parse(text);
            if (!saved || saved.version !== 1 || !Array.isArray(saved.entries)) return;
            let restored = 0;
            // Messages you translated, or kept original, from the hold menu. A choice made since Discord opened wins.
            if (Array.isArray(saved.choices)) saved.choices.slice(-TRANSLATE_CHOICES).forEach(item => {
                if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && /^\d{1,20}$/.test(item[0]) && typeof item[1] === "boolean" &&
                    !translate.choice.has(item[0])) { translate.choice.set(item[0], item[1]); restored++; }
            });
            saved.entries.slice(-TRANSLATE_SAVED).forEach(item => {
                if (!Array.isArray(item) || item.length !== 4 || !item.every(part => typeof part === "string")) return;
                const [target, text, translated, language] = item, key = translateKey(target, text), known = translate.cache.get(key);
                if (known && known.state !== "queued") return;
                if (known) { known.state = "done"; known.translated = translated; known.language = language; known.layout = null; known.ids.clear(); known.restored = true; restored++; return; }
                translateRemember(key, {state:"done", text, target, translated, language, layout:null, ids:new Set(), restored:true});
                restored++;
            });
            if (restored) translateChanged();
        }).catch(() => {}).then(() => { translate.restoring = false; translate.restored = true; if (enabled("translate")) translateSchedule(0); });
    }
    function translatePersist() {
        if (!files || translate.saveTimer !== undefined) return;
        translate.saveTimer = later(() => {
            translate.saveTimer = undefined;
            if (translate.saving) { translatePersist(); return; }
            const entries = [];
            translate.cache.forEach(entry => { if (entry.state === "done" && typeof entry.translated === "string") entries.push([entry.target, entry.text, entry.translated, entry.language || ""]); });
            const choices = Array.from(translate.choice.entries());
            let text = JSON.stringify(choices.length ? {version:1, entries:entries.slice(-TRANSLATE_SAVED), choices} : {version:1, entries:entries.slice(-TRANSLATE_SAVED)});
            // Too big to read back: keep the newest half instead.
            if (text.length > TRANSLATE_SAVED_BYTES) text = JSON.stringify({version:1, entries:entries.slice(-Math.floor(TRANSLATE_SAVED / 2)), choices});
            translate.saving = true;
            Promise.resolve().then(() => files.writeFile("documents", TRANSLATE_FILE, text, "utf8")).catch(() => {}).then(() => { translate.saving = false; });
        }, 3000, false);
    }
    // Discord's language (Settings -> Language) or the phone's, as a Google language code.
    function localeCode(kind) {
        let value = null;
        try { value = localeStore && (kind === "phone" ? localeStore.systemLocale : localeStore.locale); } catch (_) {}
        if (typeof value !== "string" || !/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(value)) value = kind === "phone" ? localeCode("discord") : "en-US";
        return value.replace("_", "-");
    }
    function translateTarget() {
        const locale = localeCode(settings.translateTarget === "phone" ? "phone" : "discord");
        const parts = locale.split("-"), base = parts[0].toLowerCase();
        if (base === "zh") return /^(TW|HK|MO|Hant)$/i.test(parts[1] || "") ? "zh-TW" : "zh-CN";
        if (base === "nb" || base === "nn") return "no";
        return base;
    }
    // "iw" and "zh-CN" from Google, "he" and "zh-TW" from Discord: the same language either way.
    function languageBase(code) {
        const base = String(code || "").split("-")[0].toLowerCase();
        return ({iw:"he", jw:"jv", nb:"no", nn:"no", tl:"fil"})[base] || base;
    }
    // Language names in the language Venus is shown in.
    const languageNames = new Map();
    function languageName(code) {
        // The language actually shown: English until the chosen one has loaded, so a line never mixes two.
        const chosen = uiLanguage(), pack = i18n.packs.get(chosen);
        const base = languageBase(code), ui = chosen === "en" || pack && pack !== EMPTY_PACK ? chosen : "en";
        if (!languageNames.has(ui)) {
            let names = null;
            try { if (global.Intl && typeof global.Intl.DisplayNames === "function") names = new global.Intl.DisplayNames([ui, "en"], {type:"language"}); } catch (_) {}
            languageNames.set(ui, names);
        }
        const names = languageNames.get(ui);
        try { const name = names && names.of(code); if (typeof name === "string" && name && name !== code) return name; } catch (_) {}
        return tr(LANGUAGE_NAMES[base] || "another language");
    }
    function escapeTranslate(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    // The row's content as text to translate: plain text stays text, formatting becomes <g i=N>...</g> around
    // the words it covers, and everything that must not change (mentions, emojis, code...) becomes <a i=N/>.
    // Worked out once per content array: rows are generated again for every change in the chat.
    function translateLayout(content) {
        let layout = translate.layouts.get(content);
        if (layout !== undefined) return layout;
        const nodes = [];
        let letters = 0, lines = false, failed = false;
        function walk(list, depth) {
            let out = "";
            if (depth > 8) { failed = true; return out; }
            for (const node of list) {
                if (!node || typeof node !== "object") continue;
                if (node.type === "text" && typeof node.content === "string") {
                    // A zero-width space is how a message is redrawn: never let it make a new translation.
                    const text = node.content.indexOf("\u200b") >= 0 ? node.content.replace(/\u200b/g, "") : node.content;
                    if (letters < 3) {
                        TRANSLATE_LETTER.lastIndex = 0;
                        while (letters < 3 && TRANSLATE_LETTER.exec(text)) letters++;
                    }
                    out += escapeTranslate(text);
                } else if (node.type === "br" || node.type === "newline") { lines = true; out += "\n"; }
                else if (TRANSLATE_GROUPS.has(node.type) && Array.isArray(node.content)) {
                    const index = nodes.push(node) - 1;
                    out += "<g i=" + index + ">" + walk(node.content, depth + 1) + "</g>";
                } else { const index = nodes.push(node) - 1; out += "<a i=" + index + "/>"; }
            }
            return out;
        }
        const text = Array.isArray(content) ? walk(content, 0) : "";
        // Nothing to translate: emojis, links, code or a word or two of letters ("ok", "xd").
        layout = failed || letters < 3 || text.length > TRANSLATE_MAX_TEXT ? null : {text, nodes, lines};
        translate.layouts.set(content, layout);
        return layout;
    }
    function unescapeTranslate(text) { return text.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, "\""); }
    // The translation back as Discord's own nodes. Every tag must come back exactly once and nested the same way,
    // or the original is shown: a mention can never be lost, doubled or turned into text.
    const TRANSLATE_TAG = /<a\s+i\s*=\s*"?(\d+)"?\s*\/>|<g\s+i\s*=\s*"?(\d+)"?\s*>|<\/g\s*>/g;
    function translateNodes(translated, layout) {
        const used = new Set(), root = [], stack = [{children:root, index:-1}];
        const text = value => {
            if (!value) return;
            const children = stack[stack.length - 1].children;
            if (!layout.lines) { children.push({type:"text", content:value}); return; }
            value.split("\n").forEach((part, i) => { if (i) children.push({type:"br"}); if (part) children.push({type:"text", content:part}); });
        };
        TRANSLATE_TAG.lastIndex = 0;
        let last = 0, match;
        while ((match = TRANSLATE_TAG.exec(translated))) {
            text(unescapeTranslate(translated.slice(last, match.index)));
            last = TRANSLATE_TAG.lastIndex;
            if (match[1] !== undefined || match[2] !== undefined) {
                const index = Number(match[1] !== undefined ? match[1] : match[2]), node = layout.nodes[index];
                const group = match[2] !== undefined;
                // A tag must come back as what it was sent as: <g> for formatting around words, <a/> for the rest.
                if (!node || used.has(index) || group !== (TRANSLATE_GROUPS.has(node.type) && Array.isArray(node.content))) return null;
                used.add(index);
                if (group) stack.push({children:[], index});
                else stack[stack.length - 1].children.push(node);
            } else {
                if (stack.length < 2) return null;
                const done = stack.pop();
                stack[stack.length - 1].children.push(Object.assign({}, layout.nodes[done.index], {content:done.children}));
            }
        }
        text(unescapeTranslate(translated.slice(last)));
        if (stack.length !== 1 || used.size !== layout.nodes.length) return null;
        return root;
    }
    function translateKey(target, text) { return target + "\u0000" + text; }
    function translateRemember(key, entry) {
        if (translate.cache.has(key)) translate.cache.delete(key);
        else if (translate.cache.size >= TRANSLATE_CACHE) translate.cache.delete(translate.cache.keys().next().value);
        translate.cache.set(key, entry);
    }
    function translateContentSource(message) {
        if (!message || typeof message !== "object") return null;
        if (typeof message.getContentMessage === "function") try { const inner = message.getContentMessage(); if (inner && typeof inner === "object") return inner; } catch (_) {}
        const snapshots = message.messageSnapshots || message.message_snapshots;
        if (Array.isArray(snapshots) && snapshots[0] && snapshots[0].message && typeof snapshots[0].message === "object") return snapshots[0].message;
        return message;
    }
    // MessageRowGenerator hook: a translated message's content, note and (if asked) original, or the message as it is.
    // Translations are kept by text, but drawn per message: "hi @A" and "hi @B" share one translation, not one mention.
    function translateRow(message, source, channelId, id) {
        const contentSource = translateContentSource(source);
        if (!message || !Array.isArray(message.content) || !contentSource || typeof contentSource.content !== "string" || !channelId || !id) return message;
        const author = source && source.author && source.author.id || message.authorId, me = currentUser();
        // Your own messages are already in a language you read, unless you ask for one from the hold menu.
        if (me && author === me.id && translate.choice.get(id) !== true || !translateWanted(id)) { translateSeen(source, channelId, id, null); return message; }
        const layout = translateLayout(message.content);
        if (!layout) { translateSeen(source, channelId, id, null); translateNothing(id); return message; }
        const target = translateTarget(), key = translateKey(target, layout.text);
        translateSeen(source, channelId, id, key);
        let entry = translate.cache.get(key);
        if (!entry) {
            entry = {state:"queued", text:layout.text, layout, target, ids:new Set()};
            translateRemember(key, entry);
            // Newest first: the message that just arrived, or the bottom of a chat you opened, is what you're reading.
            translate.queue.unshift(key);
            translateSchedule(60);
        }
        if (entry.state === "queued" || entry.state === "sending") { entry.ids.add(id); return message; }
        if (entry.state !== "done") { translateNothing(id); return message; }
        translate.asked.delete(id);
        if (layout.view === undefined || layout.viewOf !== entry || layout.viewVersion !== translate.version) {
            layout.viewOf = entry; layout.viewVersion = translate.version;
            layout.view = translateView(entry, layout, message.content);
        }
        return layout.view ? Object.assign({}, message, {content:layout.view}) : message;
    }
    // A message you asked to translate from the hold menu that has nothing to translate says so, once.
    function translateNothing(id) {
        if (!translate.asked.delete(id)) return;
        later(() => reviewToast(reviewUI(), "This message is already in your language", venusIcon(14958,"LanguageIcon")), 0);
    }
    // The message a reply quotes, above the reply. It was always shown as written, even when that message was
    // shown translated in chat (#51). It now gets the same translation, without the note or the original, since
    // the preview is one short line. Translations are kept by text, so this never costs a second request.
    function translateReply(message, source, channelId, id) {
        const quoted = message.referencedMessage && message.referencedMessage.message;
        if (!quoted || !Array.isArray(quoted.content) || !channelId || !id) return message;
        const reference = source && (source.messageReference || source.message_reference);
        const quotedId = quoted.id || reference && (reference.message_id || reference.messageId);
        // Known as the reply's row, so the reply is redrawn once its quote is translated or toggled.
        if (source) translateSeen(source, channelId, id, null, null, quotedId);
        const me = currentUser();
        if (!quotedId || me && quoted.authorId === me.id && translate.choice.get(quotedId) !== true || !translateWanted(quotedId)) return message;
        const layout = translateLayout(quoted.content);
        if (!layout) return message;
        const target = translateTarget(), key = translateKey(target, layout.text);
        if (source) translateSeen(source, channelId, id, null, key, quotedId);
        let entry = translate.cache.get(key);
        if (!entry) {
            entry = {state:"queued", text:layout.text, layout, target, ids:new Set()};
            translateRemember(key, entry);
            translate.queue.unshift(key);
            translateSchedule(60);
        }
        if (entry.state === "queued" || entry.state === "sending") { entry.ids.add(id); return message; }
        if (entry.state !== "done") return message;
        if (layout.preview === undefined || layout.previewOf !== entry) { layout.previewOf = entry; layout.preview = translateNodes(entry.translated, layout); }
        if (!layout.preview) return message;
        return Object.assign({}, message, {referencedMessage:Object.assign({}, message.referencedMessage,
            {message:Object.assign({}, quoted, {content:layout.preview})})});
    }
    // Hold a message: "Translate" or "Show original", for just that message.
    function translateToggle(message) {
        const id = message && message.id;
        if (!id || !enabled("translate")) return;
        const wanted = !translateShownFor(message);
        translate.choice.delete(id);
        // Back to what the mode does anyway (and not your own message): nothing to remember.
        const mine = currentUser() && message.author && message.author.id === currentUser().id;
        if (wanted !== (settings.translateMode !== "manual") || mine) {
            if (translate.choice.size >= TRANSLATE_CHOICES) translate.choice.delete(translate.choice.keys().next().value);
            translate.choice.set(id, wanted);
        }
        if (wanted) translate.asked.add(id); else translate.asked.delete(id);
        translatePersist();
        const channelId = message.channel_id || message.channelId;
        if (channelId) translateSeen(message, channelId, id, null);
        // Every row showing this message or quoting it.
        const ids = new Set([id]);
        translate.shown.forEach((entry, shownId) => { if (entry.quotes === id) ids.add(shownId); });
        translateRedraw(ids);
    }
    // Whether this message is (or will be) shown translated: your own only when you asked.
    function translateShownFor(message) {
        const mine = currentUser() && message.author && message.author.id === currentUser().id;
        return mine ? translate.choice.get(message.id) === true : translateWanted(message.id);
    }
    // LongPressMessageActionSheet (11023): one more row, after Discord's own, styled like them.
    function translateSheet(orig, self, args) {
        const tree = orig.apply(self, args), props = args[0], message = props && props.message;
        const contentSource = translateContentSource(message);
        if (!enabled("translate") || !React || !tree || !message || !message.id || !contentSource || typeof contentSource.content !== "string" || !contentSource.content.trim()) return tree;
        const label = translateShownFor(message) ? tr("Show original") : tr("Translate");
        let added = false;
        const Icon = venusIcon(14958, "LanguageIcon");
        return cloneTree(tree, function (node, nodeProps) {
            if (added || !Array.isArray(nodeProps.children)) return nodeProps;
            const rows = nodeProps.children.filter(child => child && child.props && typeof child.props.label === "string" && typeof child.props.onPress === "function");
            if (!rows.length || nodeProps.children.some(child => child && child.key === "venus-translate")) return nodeProps;
            added = true;
            const template = rows[rows.length - 1], icon = template.props.icon;
            const row = React.cloneElement(template, {key:"venus-translate", label, arrow:false, variant:undefined, disabled:false,
                icon:icon && icon.props && "IconComponent" in icon.props ? React.cloneElement(icon, {IconComponent:Icon}) : icon,
                onPress:function () {
                    const sheets = reviewUI().sheets;
                    try { if (sheets && typeof sheets.hideActionSheet === "function") sheets.hideActionSheet("MessageLongPressActionSheet"); } catch (_) {}
                    if (typeof props.onClose === "function") try { props.onClose(); } catch (_) {}
                    translateToggle(message);
                }});
            const index = nodeProps.children.indexOf(template) + 1;
            return Object.assign({}, nodeProps, {children:nodeProps.children.slice(0, index).concat([row], nodeProps.children.slice(index))});
        }, 0);
    }
    // Messages drawn lately, so switching on or changing an option can redraw them. Never while a redraw has
    // its zero-width space in, or that space would be put back for good.
    function translateSeen(source, channelId, id, key, quoteKey, quotedId) {
        if (!source || !channelId || !id || translate.refreshing.has(id)) return;
        const contentSource = translateContentSource(source);
        const raw = typeof source.content === "string" && source.content ? source.content : "";
        let snapshot = null;
        if (!raw && contentSource && contentSource !== source && typeof contentSource.content === "string" && contentSource.content) {
            const list = source.messageSnapshots || source.message_snapshots;
            const first = Array.isArray(list) && list[0];
            if (first && first.message) snapshot = {message:Object.assign({}, typeof first.message.toJS === "function" ? first.message.toJS() : first.message),
                moderator_report:first.moderatorReport !== undefined ? first.moderatorReport : first.moderator_report || null,
                rest:Array.isArray(list) && list.length > 1 ? list.slice(1).map(item => ({message:item && item.message && typeof item.message.toJS === "function" ? item.message.toJS() : item && item.message,
                    moderator_report:item && (item.moderatorReport !== undefined ? item.moderatorReport : item.moderator_report || null)})) : []};
        }
        if (!raw && !snapshot) return;
        let entry = translate.shown.get(id);
        if (entry) translate.shown.delete(id);
        else if (translate.shown.size >= 300) translate.shown.delete(translate.shown.keys().next().value);
        if (!entry) entry = {channelId, id, raw:"", snapshot:null, key:null, quoteKey:null, quotes:null};
        entry.raw = raw; entry.snapshot = snapshot; entry.key = key || entry.key; entry.quoteKey = quoteKey || entry.quoteKey;
        const reference = source.messageReference || source.message_reference;
        if (quotedId || reference && (reference.message_id || reference.messageId)) entry.quotes = quotedId || reference.message_id || reference.messageId;
        translate.shown.set(id, entry);
    }
    function translateView(entry, layout, original) {
        let view = translateNodes(entry.translated, layout);
        if (!view) return null;
        if (settings.translateNote || settings.translateOriginal) view = view.concat([{type:"br"}, {type:"subtext", content:[{type:"text",
            content:tr(settings.translateOriginal ? "Translated from {language}. Original:" : "Translated from {language}", {language:languageName(entry.language)})}]}]);
        // A quote can't hold a quote or a code block, so those originals just follow on the next line.
        if (settings.translateOriginal) view = view.concat(layout.nodes.some(node => node.type === "blockQuote" || node.type === "codeBlock") ?
            [{type:"br"}].concat(original) : [{type:"blockQuote", content:original}]);
        return view;
    }
    function translateSchedule(ms) {
        if (translate.timer !== undefined || translate.active >= TRANSLATE_PARALLEL || !translate.queue.length) return;
        // The first request waits for the saved translations, so nothing on screen is asked for twice.
        if (!translate.restored) { if (!files) translate.restored = true; else { translateRestore(); if (!translate.restored) return; } }
        const wait = Math.max(ms, translate.pausedUntil - Date.now());
        translate.timer = later(() => { translate.timer = undefined; translateNext(); }, wait, false);
    }
    // Drops what is no longer worth asking for: switched off, target changed, or long gone from the cache.
    function translateBatch() {
        const keys = [], target = translateTarget();
        let chars = 0;
        // After a batch failed more than once, try smaller ones: one bad text can't keep the rest waiting.
        const most = translate.failures > 1 ? Math.max(1, TRANSLATE_BATCH >> Math.min(5, translate.failures - 1)) : TRANSLATE_BATCH;
        while (translate.queue.length && keys.length < most) {
            const key = translate.queue[0], entry = translate.cache.get(key);
            if (!entry || entry.state !== "queued" || entry.target !== target) { translate.queue.shift(); if (entry && entry.state === "queued") translate.cache.delete(key); continue; }
            const size = encodeURIComponent(entry.text).length;
            if (keys.length && chars + size > TRANSLATE_BATCH_CHARS) break;
            translate.queue.shift(); keys.push(key); chars += size;
        }
        return {keys, target};
    }
    async function translateRequest(texts, target, host) {
        if (typeof global.fetch !== "function") throw new Error("networking is unavailable");
        const controller = typeof global.AbortController === "function" ? new global.AbortController() : null;
        let timer;
        const body = texts.map(text => "q=" + encodeURIComponent(text)).join("&");
        const url = TRANSLATE_HOSTS[(host === undefined ? translate.host : host) % TRANSLATE_HOSTS.length] + TRANSLATE_PATH + encodeURIComponent(target);
        const task = Promise.resolve().then(async () => {
            const response = await global.fetch(url, Object.assign({method:"POST", credentials:"omit",
                headers:{accept:"application/json", "content-type":"application/x-www-form-urlencoded;charset=UTF-8"}, body},
                controller ? {signal:controller.signal} : {}));
            if (!response.ok) { const error = new Error("HTTP " + response.status); error.status = response.status; throw error; }
            const result = await response.json();
            if (!Array.isArray(result)) throw new Error("unreadable answer");
            // One text comes back as [text, language] in an array of one; several as one pair each.
            return texts.map((_, i) => {
                const item = result[i];
                if (Array.isArray(item)) return {text:String(item[0] == null ? "" : item[0]), language:typeof item[1] === "string" ? item[1] : ""};
                if (typeof item === "string") return {text:item, language:""};
                return null;
            });
        });
        const timeout = new Promise((resolve, reject) => {
            if (global.setTimeout) timer = global.setTimeout(() => { reject(new Error("no answer")); if (controller) controller.abort(); }, TRANSLATE_TIMEOUT_MS);
        });
        try { return await Promise.race([task, timeout]); }
        finally { if (timer !== undefined && global.clearTimeout) global.clearTimeout(timer); }
    }
    function translateNext() {
        if (!enabled("translate")) return;
        // translateSchedule's timer already waited out any pause.
        while (translate.active < TRANSLATE_PARALLEL && translate.queue.length) {
            const {keys, target} = translateBatch();
            if (!keys.length) break;
            translateSend(keys, target);
        }
        if (translate.queue.length) translateSchedule(0);
    }
    function translateSend(keys, target) {
        const generation = translate.generation, host = translate.host;
        translate.active++;
        keys.forEach(key => { translate.cache.get(key).state = "sending"; });
        translateRequest(keys.map(key => translate.cache.get(key).text), target, host).then(results => {
            if (generation !== translate.generation) return;
            translate.failures = 0; translate.error = "";
            const redraw = new Set();
            keys.forEach((key, i) => {
                const entry = translate.cache.get(key), result = results[i];
                if (!entry) return;
                const ids = entry.ids; entry.ids = new Set();
                // Missing from the answer: asked for again, not given up on.
                if (!result) { entry.state = "queued"; translate.queue.push(key); return; }
                // Already in your language, or given back unchanged: nothing to show, and it's never asked for again.
                if (result.text === entry.text || result.language && languageBase(result.language) === languageBase(target)) { entry.state = "same"; entry.layout = null; return; }
                // A translation that lost, doubled or moved a mention or emoji out of its formatting is never shown.
                if (!translateNodes(result.text, entry.layout)) { entry.state = "failed"; entry.layout = null; return; }
                entry.translated = result.text; entry.language = result.language; entry.state = "done"; entry.layout = null; translate.translated++;
                // Only rows that change are redrawn: one in your language looks the same as before.
                ids.forEach(id => redraw.add(id));
            });
            translateRedraw(redraw);
            translatePersist();
        }, error => {
            if (generation !== translate.generation) return;
            // Back in front, in the same order, and on the other Google server next time.
            keys.slice().reverse().forEach(key => { const entry = translate.cache.get(key); if (entry) { entry.state = "queued"; translate.queue.unshift(key); } });
            translate.failures++;
            if (translate.host === host) translate.host++;
            // Asked to slow down: wait 15 s, longer each time, up to 10 minutes. A timeout or a dropped connection
            // is usually the network: the other server is tried in a moment, and only after a few in a row does it wait.
            const limited = error && error.status === 429;
            const wait = limited ? Math.min(600000, 15000 * Math.pow(2, Math.min(6, translate.failures - 1))) :
                translate.failures < 3 ? 500 * translate.failures : Math.min(120000, 5000 * Math.pow(2, Math.min(5, translate.failures - 3)));
            translate.pausedUntil = Math.max(translate.pausedUntil, Date.now() + wait);
            translate.error = translate.failures < 3 && !limited ? "" : (limited ? tr("Google Translate asked to slow down.") : tr("Google Translate isn't answering ({problem}).", {problem:String(error && error.message || error)})) +
                " " + tr("Trying again in {n} s.", {n:Math.max(1, Math.round(wait / 1000))});
        }).then(() => {
            translate.active--;
            if (generation === translate.generation && translate.queue.length) translateSchedule(translate.failures ? 0 : 30);
            notify("translate");
        });
    }
    // Discord keeps a row until its message record changes, so its text is changed for a moment (a zero-width
    // space) and then put back, like Fix unknown mentions does. The translation ignores that space.
    function translateRedraw(ids) {
        if (!translate.dispatcher) return;
        const entries = [];
        ids.forEach(id => {
            const entry = translate.shown.get(id);
            if (entry && (typeof entry.raw === "string" && entry.raw || entry.snapshot) && !translate.refreshing.has(id)) entries.push(entry);
        });
        if (!entries.length) return;
        const dispatch = message => { try { translate.dispatcher.dispatch({type:"MESSAGE_UPDATE", message}); } catch (_) {} };
        const update = (entry, suffix) => {
            if (entry.raw) return {id:entry.id, channel_id:entry.channelId, content:entry.raw + suffix};
            const snap = entry.snapshot;
            return {id:entry.id, channel_id:entry.channelId, message_snapshots:[{message:Object.assign({}, snap.message, {content:snap.message.content + suffix}),
                moderator_report:snap.moderator_report}].concat(snap.rest)};
        };
        entries.forEach(entry => { translate.refreshing.add(entry.id); dispatch(update(entry, "\u200b")); });
        later(() => entries.forEach(entry => { dispatch(update(entry, "")); translate.refreshing.delete(entry.id); }), 120);
    }
    // Switched on or off, or a different language or option: redraw what's on screen.
    // Only messages that are (or were) shown translated are redrawn.
    function translateChanged() {
        translate.version++;
        if (enabled("translate")) translateSchedule(0);
        // Messages known to be in your language, or that failed, look the same either way unless they quote a message that doesn't.
        const ids = new Set();
        translate.shown.forEach((entry, id) => {
            const cached = entry.key && translate.cache.get(entry.key);
            const quoted = entry.quoteKey && translate.cache.get(entry.quoteKey);
            if (!cached || cached.state !== "same" && cached.state !== "failed" ||
                entry.quotes && (!quoted || quoted.state !== "same" && quoted.state !== "failed")) ids.add(id);
        });
        translateRedraw(ids);
    }
    function translateRelabel() {
        translate.version++;
        const ids = new Set();
        translate.shown.forEach((entry, id) => { const cached = entry.key && translate.cache.get(entry.key); if (cached && cached.state === "done") ids.add(id); });
        translateRedraw(ids);
    }
    function translateStatus() {
        if (translate.error) return translate.error;
        const waiting = translate.queue.length;
        return (translate.translated ? pl(translate.translated, "Translated {n} message since Discord opened.", "Translated {n} messages since Discord opened.") : tr("Nothing translated yet since Discord opened.")) +
            (waiting ? " " + tr("{n} waiting.", {n:waiting}) : "");
    }
    // A message in Spanish shown the way Translate messages shows it, following the Display switches.
    // Watch: Lucía writes in Spanish and it turns into your language, on its own, or after you hold it and tap Translate
    // in Discord's message menu (whichever you chose below). Try it: hold the message to open Discord's menu, then tap
    // Translate or Show original in the menu, just like in real Discord.
    const TRANSLATE_SAMPLE = "\u00a1Hola a todos! \u00bfQui\u00e9n viene esta noche?";
    // A message's long-press menu (LongPressMessageActionSheet 6176 + EmojiRow 11970): 5 quick reactions + Add Reaction, and a rounded card of actions.
    function previewSheet(k, s, rows, pulse) {
        const Press = RN.Pressable || RN.View, AddReaction = venusIcon(8216, "ReactionIcon");
        return el(RN.View, {key:"sheet", style:[k.sheet, {marginTop:6}]},
            el(RN.View, {style:{alignSelf:"center", width:36, height:4, borderRadius:2, backgroundColor:"#80848e66", marginBottom:8}}),
            el(RN.View, {style:{flexDirection:"row", justifyContent:"space-between", paddingHorizontal:16, paddingBottom:10}},
                ["\ud83d\udc4d", "\u2764\ufe0f", "\ud83d\ude02", "\ud83d\ude2e", "\ud83d\ude22"].map(e => el(RN.View, {key:e, style:k.emojiBtn}, el(RN.Text, {style:{fontSize:20}}, e))),
                el(RN.View, {key:"more", style:k.emojiBtn}, el(AddReaction, {size:"sm", color:k.icon.color}))),
            el(RN.View, {style:[k.sheetRow, {marginHorizontal:16, marginBottom:8, borderRadius:16, overflow:"hidden"}]},
                rows.map(([key, Icon, label, onPress], i) => el(Press, {key, onPress, accessibilityRole:onPress ? "button" : undefined,
                    style:[{flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:16, height:48}, i ? {borderTopWidth:1, borderTopColor:k.sheetRow.borderColor} : null]},
                    el(Icon, {size:"sm", color:k.icon.color}), el(RN.Text, {style:[s.text, {fontSize:15, fontWeight:"500"}]}, label), tapRipple(pulse, key, {left:8, top:7})))));
    }
    function TranslatePreview(props) {
        useSettings("translate");
        const s = useChatPreviewStyles(), k = usePreviewChrome(), Press = RN.Pressable || RN.View, [mode, setMode] = usePreviewMode(), on = !!props.on;
        const blank = {shown:true, done:false, busy:false, menu:false, held:false, pulse:null, tried:{}};
        const [state, setState] = React.useState(blank), watching = on && mode === "watch", manual = settings.translateMode === "manual";
        const update = change => setState(st => Object.assign({}, st, typeof change === "function" ? change(st) : change));
        const target = languageName(localeCode(settings.translateTarget === "phone" ? "phone" : "discord"));
        const story = useStory(watching, () => {
            const steps = [[0, () => setState(Object.assign({}, blank, {shown:false}))],
                [700, () => { animateLayout(); update({shown:true}); }, tr("Luc\u00eda writes in Spanish")]];
            if (manual) steps.push([1400, () => update({pulse:{who:"msg", id:"hold"}, held:true}), tr("You hold the message to open its menu")],
                [700, () => { animateLayout(); update({menu:true}); }],
                [1800, () => update({pulse:{who:"translate", id:"tap"}}), tr("And tap Translate")],
                [600, () => { animateLayout(); update({menu:false, held:false, busy:true}); }]);
            else steps.push([1400, () => update({busy:true}), tr("Venus sees it's not in {language} and translates it on its own", {language:target})]);
            steps.push([1600, () => { animateLayout(); update({busy:false, done:true}); }, tr("Now it reads in {language}", {language:target})]);
            if (settings.translateNote || settings.translateOriginal) steps.push([300, () => {},
                tr(settings.translateOriginal ? "The note under it says what it was in, with the original quoted below" : "The small note under it says what language it was in")]);
            steps.push([800, () => {}]);
            return steps;
        }, [manual, settings.translateNote, settings.translateOriginal, target]);
        const startTry = () => Object.assign({}, blank, {done:!manual});
        const translated = on ? state.done : true;
        const Lang = venusIcon(14958, "LanguageIcon");
        const body = !state.shown ? null : state.busy ? el(RN.View, null, el(RN.Text, {style:s.text}, TRANSLATE_SAMPLE),
                el(RN.Text, {style:[s.muted, {marginTop:2}]}, tr("Translating\u2026"))) :
            !translated ? el(RN.Text, {style:s.text}, TRANSLATE_SAMPLE) : el(RN.View, null,
                popIn("tr", el(RN.Text, {style:s.text}, tr("Hi everyone! Who's coming tonight?"))),
                settings.translateNote ? el(RN.Text, {style:[s.muted, {marginTop:2}]}, settings.translateOriginal ? tr("Translated from {language}. Original:", {language:languageName("es")}) :
                    tr("Translated from {language}", {language:languageName("es")})) : null,
                settings.translateOriginal ? el(RN.View, {style:s.quote}, el(RN.Text, {style:s.muted}, TRANSLATE_SAMPLE)) : null);
        const holdMessage = () => {
            if (!on || watching) return;
            animateLayout();
            update(st => ({menu:!st.menu, held:!st.menu, pulse:{who:"msg", id:"hold:" + Date.now()}}));
        };
        const tapMenuTranslate = () => {
            if (!on || watching) return;
            animateLayout();
            update(st => ({menu:false, held:false, done:!st.done, pulse:{who:"translate", id:"tr:" + Date.now()},
                tried:Object.assign({}, st.tried, st.done ? {back:true} : {tr:true})}));
        };
        const closeMenu = () => { if (!on || watching) return; animateLayout(); update({menu:false, held:false}); };
        const msgView = el(RN.View, {key:"msg", style:state.held ? k.selected : null},
            popIn("msg", previewMessage(s, "msg", "Luc\u00eda", "#faa61a", tr("Today at 4:01 PM"), body)), tapRipple(state.pulse, "msg"));
        const message = !state.shown ? null : on && !watching ? el(Press, {key:"msg", onLongPress:holdMessage, onPress:holdMessage,
            accessibilityRole:"button", accessibilityHint:tr("Hold the message to open its menu")}, msgView) : msgView;
        const actionLabel = tr(state.done ? "Show original" : "Translate");
        const doneStep1 = manual ? state.tried.tr : state.tried.back, doneStep2 = manual ? state.tried.back : state.tried.tr;
        const tip = on && !watching ? previewTip(k, state.menu ? tr("Tap {action} in the menu", {action:actionLabel}) :
            !doneStep1 ? tr(state.done ? "Hold the message to see the original" : "Hold the message to open its menu") :
            !doneStep2 ? tr(state.done ? "Hold it again to show the original" : "Hold it again to translate it") : null,
            state.menu ? "down" : undefined) : null;
        const sheet = (watching || on) && state.menu ? previewSheet(k, s, [
            ["reply", venusIcon(11108, "ArrowAngleLeftUpIcon"), tr("Reply"), watching ? null : closeMenu],
            ["copy", venusIcon(4780, "CopyIcon"), tr("Copy Text"), watching ? null : closeMenu],
            ["translate", Lang, actionLabel, watching ? null : tapMenuTranslate]], state.pulse) : null;
        return el(RN.View, {key:"preview"}, on ? previewToggle(mode, value => { setMode(value); setState(value === "try" ? startTry() : blank); }) : null,
            previewScreen(s, "preview", "Translation preview", [message, tip, sheet],
                {header:previewHeader(k, {title:"general"}),
                 footer:el(RN.View, {key:"foot"}, sheet ? null : previewInput(k, s, {placeholder:tr("Message {channel}", {channel:"#general"})}),
                    watching ? storyStrip(k, s, story) : null)}));
    }
    function TranslateSettings() {
        useSettings("translate");
        const ui = reviewUI();
        if (!React || !RN) return null;
        const Group = ui.TableRowGroup || RN.View, Switch = ui.TableSwitchRow, on = enabled("translate");
        const name = kind => languageName(localeCode(kind));
        let saved = 0; translate.cache.forEach(entry => { if (entry.state === "done") saved++; });
        const groups = [
            on ? statusCard("status", translateStatus(), {title:tr("Into {language}", {language:name(settings.translateTarget === "phone" ? "phone" : "discord")}), IconComponent:venusIcon(14958, "LanguageIcon")}) :
                offCard("status", venusIcon(14958, "LanguageIcon")),
            el(TranslatePreview, {key:"preview", on}),
            radioGroup(ui, "mode", "When to translate", "translateMode", on, [["auto", "Automatically", "Every message on screen in another language.", rowIcon(16292, "SparklesIcon")],
                ["manual", "Only when you ask", "Hold a message and tap Translate. Nothing else is sent.", rowIcon(8216, "ReactionIcon")]]),
            radioGroup(ui, "target", "Translate into", "translateTarget", on, [["discord", tr("Discord's language"), tr("{language}. Change it in Discord's Language settings.", {language:name("discord")}), rowIcon(8719, "ChatSmileIcon")],
                ["phone", tr("Your phone's language"), name("phone") + ".", rowIcon(6376, "MobilePhoneIcon")]], true),
            el(Group, {key:"show", title:tr("Display")},
                switchRow(Switch, "translateNote", "Show the original language", "A small \"Translated from Spanish\" line under each translation.", rowIcon(8351, "GlobeEarthIcon")),
                switchRow(Switch, "translateOriginal", "Show the original text", "The untranslated message, in a quote under the translation.", rowIcon(8382, "QuoteIcon"))),
            el(Group, {key:"clear", title:tr("Manage")}, actionRow(ui, "clear", "Clear saved translations",
                saved ? tr("{count} kept on this phone, so chats you reopen show them at once.", {count:count(saved, "translation")}) : "Nothing saved yet.",
                () => confirmAction("Clear saved translations?", "Messages on screen will be translated again.", "Clear", translateForget), !saved, true)),
            footnote("note", settings.translateMode === "manual" ? "Only messages you choose are sent to Google Translate, once each, without your Discord account." :
                "Only messages on screen are sent to Google Translate, once each, without your Discord account. Hold a message to show its original, or translate your own.")];
        return settingsBody(ui, groups);
    }
    // Clear saved translations: forgets every translation, on the phone too, and translates what's on screen again.
    function translateForget() {
        translate.generation++; translate.cache.clear(); translate.queue.length = 0; translate.translated = 0; translate.error = ""; translate.choice.clear(); translate.asked.clear();
        if (files) Promise.resolve().then(() => files.writeFile("documents", TRANSLATE_FILE, "{\"version\":1,\"entries\":[]}", "utf8")).catch(() => {});
        translateChanged(); notify("translate");
        reviewToast(reviewUI(), "Saved translations cleared", venusIcon(4791, "TrashIcon"));
    }

    // Custom themes: installs Revenge / Vendetta JSON themes from links and compiles their rawColors,
    // semanticColors, plus extensions and optional background alpha straight into Discord's native color token
    // tables (RawColors 592 and SemanticColors 590) once when a theme is picked or toggled. Render-time color
    // lookups (resolveSemanticColor 588, useToken 4535 and createStyles 4837) run Discord's unmodified native
    // bytecode and Map caches with zero wrapper functions and zero per-render work, and optional background
    // wallpapers render as a single static native Image layer behind ChatViewWrapper (9542) outside the message list.
    const THEMES_FILE = "venus-themes.json", THEMES_MAX = 40, THEMES_MAX_BYTES = 512 * 1024, THEMES_TIMEOUT_MS = 10000;
    const THEME_SLOTS = ["dark", "light", "darker", "midnight"];
    // Maps Vendetta / Revenge legacy semantic color names to Discord 348.10's Mana SemanticColors (590) keys.
    const LEGACY_SEMANTIC_ALIASES = {
        BACKGROUND_PRIMARY: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT", "STANDALONE_CHANNEL_CONTENT_BACKGROUND", "PANEL_BG", "MOBILE_KEYBOARD_GAP_BACKGROUND", "MOBILE_TYPING_INDICATOR_BACKGROUND_DEFAULT"],
        BACKGROUND_MOBILE_PRIMARY: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT", "STANDALONE_CHANNEL_CONTENT_BACKGROUND", "PANEL_BG"],
        BG_BASE_PRIMARY: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT", "STANDALONE_CHANNEL_CONTENT_BACKGROUND", "PANEL_BG"],
        CHAT_BACKGROUND: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT", "STANDALONE_CHANNEL_CONTENT_BACKGROUND"],
        HOME_BACKGROUND: ["BACKGROUND_BASE_LOWER", "BACKGROUND_BASE_LOW"],
        BACKGROUND_SECONDARY: ["BACKGROUND_BASE_LOW", "BACKGROUND_SURFACE_HIGH", "CARD_BACKGROUND_DEFAULT", "TAB_BAR_BACKGROUND", "MOBILE_FLOATINGBAR_BACKGROUND", "MOBILE_COMMAND_BAR_BACKGROUND"],
        BACKGROUND_MOBILE_SECONDARY: ["BACKGROUND_BASE_LOW", "BACKGROUND_SURFACE_HIGH", "CARD_BACKGROUND_DEFAULT", "TAB_BAR_BACKGROUND"],
        BG_BASE_SECONDARY: ["BACKGROUND_BASE_LOW", "TAB_BAR_BACKGROUND"],
        BACKGROUND_SECONDARY_ALT: ["BACKGROUND_SECONDARY_ALT", "MOBILE_FLOATINGBAR_BACKGROUND_HIGHER"],
        BACKGROUND_TERTIARY: ["BACKGROUND_BASE_LOWEST", "ANDROID_NAVIGATION_BAR_BACKGROUND", "MOBILE_VOICE_PANEL_BACKGROUND", "USER_PROFILE_GRADIENT_BACKGROUND"],
        BG_BASE_TERTIARY: ["BACKGROUND_BASE_LOWEST", "ANDROID_NAVIGATION_BAR_BACKGROUND"],
        KEYBOARD: ["MOBILE_KEYBOARD_PANEL_BACKGROUND", "MOBILE_KEYBOARD_GAP_BACKGROUND", "MOBILE_EXPRESSION_PICKER_BACKGROUND_DEFAULT"],
        BACKGROUND_FLOATING: ["BACKGROUND_SURFACE_HIGHEST", "MODAL_BACKGROUND", "MODAL_FOOTER_BACKGROUND", "MOBILE_ACTIONSHEET_BACKGROUND", "MOBILE_ALERT_BACKGROUND_DEFAULT", "MOBILE_TOAST_BACKGROUND_DEFAULT"],
        BACKGROUND_NESTED_FLOATING: ["BACKGROUND_SURFACE_HIGHEST", "MODAL_BACKGROUND", "MOBILE_ACTIONSHEET_BACKGROUND"],
        BG_SURFACE_OVERLAY: ["BACKGROUND_SURFACE_HIGH", "MODAL_BACKGROUND", "MOBILE_ACTIONSHEET_BACKGROUND", "MOBILE_EXPRESSION_PICKER_BACKGROUND_DEFAULT"],
        BG_SURFACE_OVERLAY_TMP: ["BACKGROUND_SURFACE_HIGH", "MODAL_BACKGROUND", "MOBILE_ACTIONSHEET_BACKGROUND"],
        BG_SURFACE_RAISED: ["BG_SURFACE_RAISED", "BACKGROUND_SURFACE_HIGH", "CARD_BACKGROUND_DEFAULT"],
        CARD_PRIMARY_BG: ["CARD_BACKGROUND_DEFAULT", "BACKGROUND_SURFACE_HIGH", "EMBED_BACKGROUND", "MOBILE_EMBED_BACKGROUND_DEFAULT"],
        CARD_SECONDARY_BG: ["CARD_SECONDARY_BG", "CARD_SECONDARY_BACKGROUND_DEFAULT", "EMBED_BACKGROUND_ALTERNATE"],
        REDESIGN_ACTIVITY_CARD_BACKGROUND: ["CARD_BACKGROUND_DEFAULT", "CARD_SECONDARY_BACKGROUND_DEFAULT"],
        CHANNELTEXTAREA_BACKGROUND: ["CHANNELTEXTAREA_BACKGROUND", "REDESIGN_CHAT_INPUT_BACKGROUND", "CHAT_INPUT_BACKGROUND", "MOBILE_CHATINPUT_BACKGROUND_DEFAULT", "MOBILE_CHATINPUT_BACKGROUND_ACTIVE"],
        REDESIGN_CHAT_INPUT_BACKGROUND: ["REDESIGN_CHAT_INPUT_BACKGROUND", "CHAT_INPUT_BACKGROUND", "MOBILE_CHATINPUT_BACKGROUND_DEFAULT", "MOBILE_CHATINPUT_BACKGROUND_ACTIVE", "CHANNELTEXTAREA_BACKGROUND"],
        INPUT_BACKGROUND: ["INPUT_BACKGROUND_DEFAULT", "MOBILE_CHATINPUT_BACKGROUND_DEFAULT"],
        BACKGROUND_MODIFIER_ACCENT: ["BACKGROUND_MOD_MUTED", "BORDER_SUBTLE", "BORDER_MUTED"],
        BACKGROUND_MODIFIER_HOVER: ["BACKGROUND_MOD_SUBTLE", "INTERACTIVE_BACKGROUND_HOVER"],
        BACKGROUND_MODIFIER_ACTIVE: ["BACKGROUND_MOD_NORMAL", "INTERACTIVE_BACKGROUND_ACTIVE", "TABLEROW_BACKGROUND_PRESSED"],
        BACKGROUND_MODIFIER_SELECTED: ["BACKGROUND_MOD_STRONG", "INTERACTIVE_BACKGROUND_SELECTED", "MOBILE_CHANNEL_ITEM_BACKGROUND_SELECTED"],
        BG_MOD_FAINT: ["BACKGROUND_MOD_MUTED"],
        BG_MOD_SUBTLE: ["BACKGROUND_MOD_SUBTLE", "TABLEROW_BACKGROUND_DEFAULT"],
        BG_MOD_STRONG: ["BACKGROUND_MOD_STRONG"],
        BORDER_FAINT: ["BORDER_MUTED", "BORDER_SUBTLE"],
        BACKGROUND_MENTIONED: ["MESSAGE_MENTIONED_BACKGROUND_DEFAULT", "MENTION_BACKGROUND"],
        BACKGROUND_MENTIONED_HOVER: ["MESSAGE_MENTIONED_BACKGROUND_HOVER"],
        BACKGROUND_MESSAGE_HOVER: ["MESSAGE_BACKGROUND_HOVER"],
        HEADER_PRIMARY: ["TEXT_STRONG", "MOBILE_TEXT_HEADING_PRIMARY", "REDESIGN_CHANNEL_NAME_TEXT", "USER_PROFILE_ABOUT_ME_HEADING_TEXT", "NAVIGATOR_HEADER_TINT", "MOBILE_HEADER_ICON_DEFAULT"],
        HEADER_SECONDARY: ["TEXT_SUBTLE", "TEXT_MUTED", "REDESIGN_CHANNEL_NAME_MUTED_TEXT"],
        TEXT_NORMAL: ["TEXT_DEFAULT", "INPUT_TEXT_DEFAULT", "ICON_DEFAULT"],
        TEXT_PRIMARY: ["TEXT_DEFAULT", "TEXT_STRONG", "INPUT_TEXT_DEFAULT"],
        TEXT_MUTED: ["TEXT_MUTED", "ICON_MUTED", "REDESIGN_CHANNEL_NAME_MUTED_TEXT", "INPUT_PLACEHOLDER_TEXT_DEFAULT"],
        INPUT_PLACEHOLDER_TEXT: ["INPUT_PLACEHOLDER_TEXT_DEFAULT"],
        CHANNEL_TEXT_AREA_PLACEHOLDER: ["INPUT_PLACEHOLDER_TEXT_DEFAULT"],
        REDESIGN_CHANNEL_CATEGORY_NAME_TEXT: ["TEXT_MUTED", "CHANNELS_DEFAULT"],
        INTERACTIVE_NORMAL: ["INTERACTIVE_TEXT_DEFAULT", "INTERACTIVE_ICON_DEFAULT", "CHANNELS_DEFAULT", "CHANNEL_ICON", "MESSAGES_ITEM_CHANNEL_TEXT_DEFAULT", "CHAT_INPUT_ICON_DEFAULT_TINT"],
        INTERACTIVE_HOVER: ["INTERACTIVE_TEXT_HOVER", "INTERACTIVE_ICON_HOVER"],
        INTERACTIVE_ACTIVE: ["INTERACTIVE_TEXT_ACTIVE", "INTERACTIVE_ICON_ACTIVE", "TEXT_STRONG", "TABLEROW_ICON_COLOR_DEFAULT", "CHAT_INPUT_ACTION_ICON_ACTIVE_TINT"],
        INTERACTIVE_MUTED: ["INTERACTIVE_MUTED", "ICON_MUTED"],
        ANDROID_RIPPLE: ["MOBILE_ANDROID_BUTTON_BACKGROUND_RIPPLE"],
        BG_BACKDROP: ["BACKGROUND_SCRIM", "CONTEXT_MENU_BACKDROP_BACKGROUND"],
        TEXT_DANGER: ["TEXT_FEEDBACK_CRITICAL", "ICON_FEEDBACK_CRITICAL"],
        TEXT_POSITIVE: ["TEXT_FEEDBACK_POSITIVE", "STATUS_POSITIVE_TEXT"],
        TEXT_WARNING: ["TEXT_FEEDBACK_WARNING", "STATUS_WARNING_TEXT"],
        STATUS_DND: ["ICON_STATUS_DND", "TEXT_STATUS_DND"],
        STATUS_IDLE: ["ICON_STATUS_IDLE", "TEXT_STATUS_IDLE"],
        STATUS_OFFLINE: ["ICON_STATUS_OFFLINE", "TEXT_STATUS_OFFLINE"],
        STATUS_ONLINE: ["STATUS_ONLINE", "ICON_STATUS_ONLINE", "TEXT_STATUS_ONLINE"],
        REDESIGN_BUTTON_PRIMARY_BACKGROUND: ["CONTROL_PRIMARY_BACKGROUND_DEFAULT", "BACKGROUND_BRAND", "CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND", "SWITCH_BACKGROUND_SELECTED_DEFAULT", "CHECKBOX_BACKGROUND_SELECTED_DEFAULT"],
        REDESIGN_BUTTON_PRIMARY_PRESSED_BACKGROUND: ["CONTROL_PRIMARY_BACKGROUND_ACTIVE"],
        REDESIGN_BUTTON_SECONDARY_BACKGROUND: ["CONTROL_SECONDARY_BACKGROUND_DEFAULT", "MOBILE_LEGACY_BUTTON_SECONDARY_BACKGROUND_DEFAULT"],
        REDESIGN_BUTTON_SECONDARY_OVERLAY_PRESSED_BACKGROUND: ["CONTROL_SECONDARY_BACKGROUND_ACTIVE", "CONTROL_OVERLAY_SECONDARY_BACKGROUND_ACTIVE"],
        REDESIGN_BUTTON_SECONDARY_BORDER: ["CONTROL_SECONDARY_BORDER_DEFAULT", "MOBILE_LEGACY_BUTTON_SECONDARY_BORDER_DEFAULT"]
    };
    // Chat surface tokens whose opacity is multiplied by background.alpha when a theme wallpaper is displayed.
    const CHAT_SURFACE_TOKENS = [
        "CHANNEL_BACKGROUND_DEFAULT",
        "STANDALONE_CHANNEL_CONTENT_BACKGROUND",
        "BACKGROUND_BASE_LOWER",
        "PANEL_BG",
        "MOBILE_TYPING_INDICATOR_BACKGROUND_DEFAULT",
        "MOBILE_KEYBOARD_GAP_BACKGROUND"
    ];
    // Maps Vendetta Theme Plus (plus.icons) status keys to Discord's RawColors (592) and SemanticColors (590) tokens.
    const PLUS_STATUS_ICON_MAP = {
        StatusOnline: {raw:["GREEN_360"], sem:["STATUS_ONLINE", "ICON_STATUS_ONLINE", "TEXT_STATUS_ONLINE"]},
        StatusMobileOnline: {raw:["GREEN_360"], sem:["STATUS_ONLINE", "ICON_STATUS_ONLINE"]},
        StatusIdle: {raw:["YELLOW_300"], sem:["ICON_STATUS_IDLE", "TEXT_STATUS_IDLE"]},
        StatusDND: {raw:["RED_400"], sem:["ICON_STATUS_DND", "TEXT_STATUS_DND"]},
        StatusOffline: {raw:["PRIMARY_400"], sem:["ICON_STATUS_OFFLINE", "TEXT_STATUS_OFFLINE"]},
        StatusStreaming: {raw:["PLATFORM_TWITCH"], sem:[]}
    };
    // Maps Discord's Neutral & Plum raw tokens to the corresponding legacy Primary / Brand / Neutral shades
    // so themes that mainly customize rawColors (PRIMARY_600..800, PRIMARY_100..400, BRAND_500, etc.) also
    // theme Discord 348.10's Mana Neutral/Blurple palette without any runtime indirection.
    const LEGACY_RAW_BRIDGES = [
        ["NEUTRAL_100", ["PLUM_24", "PLUM_23", "PRIMARY_830", "PRIMARY_800", "BLACK"]],
        ["NEUTRAL_96", ["PLUM_23", "PLUM_22", "PRIMARY_800", "PRIMARY_730"]],
        ["NEUTRAL_92", ["PLUM_22", "PLUM_20", "PRIMARY_730", "PRIMARY_700"]],
        ["NEUTRAL_88", ["PLUM_20", "PLUM_19", "PRIMARY_700", "PRIMARY_660"]],
        ["NEUTRAL_86", ["PLUM_20", "PLUM_18", "PRIMARY_600", "PRIMARY_630"]],
        ["NEUTRAL_82", ["PLUM_19", "PLUM_17", "PRIMARY_630", "PRIMARY_660"]],
        ["NEUTRAL_79", ["PLUM_18", "PLUM_17", "PRIMARY_630", "PRIMARY_660", "PRIMARY_600"]],
        ["NEUTRAL_76", ["PLUM_17", "PLUM_16", "PRIMARY_660", "PRIMARY_630"]],
        ["NEUTRAL_73", ["PLUM_16", "PLUM_15", "PRIMARY_660", "PRIMARY_700"]],
        ["NEUTRAL_69", ["PRIMARY_600", "PLUM_18"]],
        ["NEUTRAL_66", ["PRIMARY_630", "PLUM_17"]],
        ["NEUTRAL_64", ["PRIMARY_630", "PRIMARY_660", "PLUM_16"]],
        ["NEUTRAL_60", ["PRIMARY_560", "PRIMARY_600", "PLUM_15"]],
        ["NEUTRAL_35", ["PLUM_11", "PLUM_10", "PRIMARY_360", "PRIMARY_400"]],
        ["NEUTRAL_31", ["PLUM_11", "PRIMARY_400"]],
        ["NEUTRAL_29", ["PLUM_10", "PLUM_11", "PRIMARY_360", "PRIMARY_400"]],
        ["NEUTRAL_23", ["PLUM_9", "PLUM_10", "PRIMARY_330", "PRIMARY_360"]],
        ["NEUTRAL_16", ["PRIMARY_300", "PLUM_9"]],
        ["NEUTRAL_12", ["PLUM_6", "PRIMARY_200", "PRIMARY_100"]],
        ["NEUTRAL_10", ["PLUM_6", "PLUM_3", "PRIMARY_100", "PRIMARY_200"]],
        ["NEUTRAL_8", ["PLUM_6", "PRIMARY_200"]],
        ["NEUTRAL_5", ["PLUM_4", "PLUM_3", "PRIMARY_200", "PRIMARY_100"]],
        ["NEUTRAL_4", ["PRIMARY_160", "PRIMARY_200", "PLUM_3"]],
        ["NEUTRAL_2", ["PLUM_3", "PRIMARY_100", "WHITE_500", "WHITE"]],
        ["NEUTRAL_1", ["PRIMARY_100", "WHITE_500", "WHITE"]],
        ["BLURPLE_50", ["BRAND_500", "BRAND_560"]],
        ["BLURPLE_36", ["BRAND_360", "BRAND_500"]],
        ["BLURPLE_26", ["BRAND_260", "BRAND_360"]],
        ["BLURPLE_19", ["BRAND_260", "BRAND_360", "BRAND_500"]],
        ["BLUE_NEW_37", ["BLUE_345", "BLUE_330", "BRAND_260"]]
    ];
    const THEME_BG_WRAP_STYLE = {flex:1};
    const THEME_BG_LAYER_STYLE = {position:"absolute", top:0, left:0, right:0, bottom:0};
    const customThemes = {
        rawTable:null, origRaw:null, semTable:null, origSem:null, themeStore:null, themeContextMod:null,
        list:[], active:"", loaded:false, loading:false, installing:false, error:"", revision:0, editCounter:0, appliedKey:""
    };
    function parseAlphaValue(rawAlpha) {
        if (rawAlpha === undefined || rawAlpha === null || rawAlpha === "") return 1;
        const s = String(rawAlpha).trim();
        const a = s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
        if (!Number.isFinite(a)) return null;
        return Math.max(0, Math.min(1, a));
    }
    // Accepts #rgb, #rgba, #rrggbb, #rrggbbaa (with or without leading # for 6/8-digit hex), or
    // rgb()/rgba()/hsl()/hsla() strings and converts them to {hex:"#rrggbb", opacity:0..1} once at theme compile
    // time so Discord's chroma/color tables never see malformed strings.
    function parseThemeColor(value) {
        if (typeof value !== "string") return null;
        const s = value.trim();
        if (!s) return null;
        if (s.toLowerCase() === "transparent") return {hex:"#000000", opacity:0};
        let m = /^#([0-9a-f]{3,8})$/i.exec(s) || /^([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
        if (m) {
            const hex = m[1].toLowerCase();
            if (hex.length === 3) return {hex:"#" + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2], opacity:1};
            if (hex.length === 4) {
                const a = parseInt(hex[3] + hex[3], 16) / 255;
                return {hex:"#" + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2], opacity:Number(a.toFixed(4))};
            }
            if (hex.length === 6) return {hex:"#" + hex, opacity:1};
            if (hex.length === 8) {
                const a = parseInt(hex.slice(6, 8), 16) / 255;
                return {hex:"#" + hex.slice(0, 6), opacity:Number(a.toFixed(4))};
            }
            return null;
        }
        m = /^rgba?\(\s*([0-9.]+%?)\s*(?:,\s*|\s+)([0-9.]+%?)\s*(?:,\s*|\s+)([0-9.]+%?)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i.exec(s);
        if (m) {
            const chan = part => {
                const v = part.endsWith("%") ? parseFloat(part) * 2.55 : parseFloat(part);
                return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
            };
            const a = parseAlphaValue(m[4]);
            if (a === null) return null;
            return {hex:"#" + chan(m[1]) + chan(m[2]) + chan(m[3]), opacity:Number(a.toFixed(4))};
        }
        m = /^hsla?\(\s*(-?[0-9.]+)(?:deg)?\s*(?:,\s*|\s+)([0-9.]+)%\s*(?:,\s*|\s+)([0-9.]+)%(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i.exec(s);
        if (m) {
            const h = (((parseFloat(m[1]) % 360) + 360) % 360) / 360;
            const sat = Math.max(0, Math.min(1, parseFloat(m[2]) / 100));
            const lig = Math.max(0, Math.min(1, parseFloat(m[3]) / 100));
            const a = parseAlphaValue(m[4]);
            if (a === null) return null;
            const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
            const p = 2 * lig - q;
            const hue2rgb = t => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const toHex = c => Math.max(0, Math.min(255, Math.round(c * 255))).toString(16).padStart(2, "0");
            const r = sat === 0 ? lig : hue2rgb(h + 1 / 3);
            const g = sat === 0 ? lig : hue2rgb(h);
            const b = sat === 0 ? lig : hue2rgb(h - 1 / 3);
            return {hex:"#" + toHex(r) + toHex(g) + toHex(b), opacity:Number(a.toFixed(4))};
        }
        return null;
    }
    function formatThemeColor(parsed) {
        return parsed.opacity < 1 ? parsed.hex + Math.round(parsed.opacity * 255).toString(16).padStart(2, "0") : parsed.hex;
    }
    function normalizeThemeUrl(input) {
        if (typeof input !== "string") return "";
        let url = input.trim();
        if (!/^https?:\/\//i.test(url)) return "";
        // Convert GitHub blob links and Gist page links to their raw JSON URLs automatically.
        url = url.replace(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i, "https://raw.githubusercontent.com/$1/$2/$3");
        url = url.replace(/^https?:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)\/?$/i, "https://gist.githubusercontent.com/$1/$2/raw");
        return url;
    }
    function sanitizeThemeBackground(bgIn) {
        if (!bgIn || typeof bgIn !== "object" || Array.isArray(bgIn)) return null;
        const url = typeof bgIn.url === "string" && /^https?:\/\/\S+/i.test(bgIn.url.trim()) ? bgIn.url.trim().slice(0, 1024) : "";
        const colorParsed = parseThemeColor(bgIn.color);
        const color = colorParsed ? formatThemeColor(colorParsed) : "";
        if (!url && !color) return null;
        const rawAlpha = Number(bgIn.alpha);
        const alpha = Number.isFinite(rawAlpha) ? Math.max(0, Math.min(1, Number(rawAlpha.toFixed(4)))) : 1;
        const rawBlur = Number(bgIn.blur);
        const blur = Number.isFinite(rawBlur) ? Math.max(0, Math.min(1, Number(rawBlur.toFixed(4)))) : 0;
        const out = {url, alpha, blur};
        if (color) out.color = color;
        return out;
    }
    function sanitizeThemePlus(plusIn) {
        if (!plusIn || typeof plusIn !== "object" || Array.isArray(plusIn)) return null;
        const out = {};
        let hasAny = false;
        for (const key of ["mentionLineColor", "unreadBadgeColor"]) {
            const v = plusIn[key];
            const str = Array.isArray(v) ? v[0] : v;
            const parsed = parseThemeColor(str);
            if (parsed) { out[key] = formatThemeColor(parsed); hasAny = true; }
        }
        const iconsIn = plusIn.icons;
        if (iconsIn && typeof iconsIn === "object" && !Array.isArray(iconsIn)) {
            const icons = {};
            for (const key of Object.keys(PLUS_STATUS_ICON_MAP)) {
                const v = iconsIn[key];
                const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : null;
                if (!arr || !arr.length) continue;
                const cleaned = arr.slice(0, 4).map(item => {
                    const p = parseThemeColor(item);
                    return p ? formatThemeColor(p) : null;
                });
                if (cleaned.some(Boolean)) { icons[key] = cleaned; hasAny = true; }
            }
            if (Object.keys(icons).length) out.icons = icons;
        }
        return hasAny ? out : null;
    }
    function sanitizeThemeSpec(data, sourceUrl) {
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(tr("That link didn't return a JSON theme."));
        const rawIn = data.rawColors && typeof data.rawColors === "object" && !Array.isArray(data.rawColors) ? data.rawColors : {};
        const semIn = data.semanticColors && typeof data.semanticColors === "object" && !Array.isArray(data.semanticColors) ? data.semanticColors : {};
        const rawColors = {}, semanticColors = {};
        let count = 0;
        for (const key of Object.keys(rawIn)) {
            if (!/^[A-Z0-9_]{1,80}$/.test(key)) continue;
            const parsed = parseThemeColor(rawIn[key]);
            if (parsed) { rawColors[key] = formatThemeColor(parsed); count++; }
        }
        for (const key of Object.keys(semIn)) {
            if (!/^[A-Z0-9_]{1,80}$/.test(key)) continue;
            const val = semIn[key];
            const arr = Array.isArray(val) ? val : typeof val === "string" ? [val] : null;
            if (!arr || !arr.length) continue;
            const cleaned = arr.slice(0, 4).map(v => {
                if (typeof v !== "string") return null;
                const parsed = parseThemeColor(v);
                return parsed ? formatThemeColor(parsed) : null;
            });
            if (cleaned.some(Boolean)) { semanticColors[key] = cleaned; count++; }
        }
        const background = sanitizeThemeBackground(data.background);
        const plus = sanitizeThemePlus(data.plus);
        if (background) count++;
        if (plus) count++;
        if (!count) throw new Error(tr("That JSON file has no semanticColors or rawColors."));
        let name = typeof data.name === "string" ? data.name.trim().slice(0, 80) : "";
        if (!name && typeof sourceUrl === "string") {
            const tail = sourceUrl.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
            name = decodeURIComponent(tail.replace(/\.json$/i, "")).slice(0, 80);
        }
        if (!name) name = tr("Custom theme");
        const description = typeof data.description === "string" ? data.description.trim().slice(0, 200) : "";
        const authors = Array.isArray(data.authors) ? data.authors.map(a => a && typeof a.name === "string" ? a.name.trim() : typeof a === "string" ? a.trim() : "").filter(Boolean).slice(0, 5).join(", ").slice(0, 100) : "";
        const spec = {
            id: sourceUrl || ("theme:" + name.toLowerCase()),
            url: typeof sourceUrl === "string" ? sourceUrl : "",
            name,
            description,
            authors,
            rawColors,
            semanticColors
        };
        if (background) spec.background = background;
        if (plus) spec.plus = plus;
        return spec;
    }
    function snapshotColorTables() {
        if (customThemes.rawTable && !customThemes.origRaw) {
            const copy = {};
            for (const k of Object.keys(customThemes.rawTable)) copy[k] = customThemes.rawTable[k];
            customThemes.origRaw = copy;
        }
        if (customThemes.semTable && !customThemes.origSem) {
            const copy = {};
            for (const k of Object.keys(customThemes.semTable)) {
                const entry = customThemes.semTable[k];
                if (!entry || typeof entry !== "object") continue;
                const snap = {};
                for (const slot of THEME_SLOTS) {
                    if (entry[slot] && typeof entry[slot] === "object")
                        snap[slot] = {raw:entry[slot].raw, opacity:entry[slot].opacity};
                }
                if ("gradient" in entry) snap.gradient = entry.gradient;
                if ("userProfileThemes" in entry) snap.userProfileThemes = entry.userProfileThemes;
                copy[k] = snap;
            }
            customThemes.origSem = copy;
        }
    }
    function restoreOriginalColorTables() {
        if (customThemes.rawTable && customThemes.origRaw) {
            for (const k of Object.keys(customThemes.rawTable)) {
                if (k.startsWith("__VENUS_")) delete customThemes.rawTable[k];
            }
            for (const k of Object.keys(customThemes.origRaw)) customThemes.rawTable[k] = customThemes.origRaw[k];
        }
        if (customThemes.semTable && customThemes.origSem) {
            for (const k of Object.keys(customThemes.origSem)) {
                const entry = customThemes.semTable[k], snap = customThemes.origSem[k];
                if (!entry || !snap) continue;
                for (const slot of THEME_SLOTS) {
                    if (snap[slot]) {
                        if (entry[slot] && typeof entry[slot] === "object") {
                            entry[slot].raw = snap[slot].raw;
                            entry[slot].opacity = snap[slot].opacity;
                        } else entry[slot] = {raw:snap[slot].raw, opacity:snap[slot].opacity};
                    }
                }
                if ("gradient" in snap) entry.gradient = snap.gradient;
                if ("userProfileThemes" in snap) entry.userProfileThemes = snap.userProfileThemes;
            }
        }
    }
    function compileThemeIntoTables(theme) {
        const raw = customThemes.rawTable, sem = customThemes.semTable;
        if (!raw || !sem) return;
        snapshotColorTables();
        restoreOriginalColorTables();
        if (!theme) return;
        const rawIn = theme.rawColors || {}, semIn = theme.semanticColors || {}, plus = theme.plus, bg = theme.background;
        // 1. Apply rawColors directly onto Discord's RawColors table (hex only; alpha is carried on semantic slots).
        for (const key of Object.keys(rawIn)) {
            const parsed = parseThemeColor(rawIn[key]);
            if (parsed) raw[key] = parsed.hex;
        }
        // 2. Bridge legacy PRIMARY / PLUM / BRAND raw colors to Discord 348.10's NEUTRAL / BLURPLE raw tokens
        // whenever the theme didn't already set the NEUTRAL / BLURPLE key directly.
        for (let i = 0; i < LEGACY_RAW_BRIDGES.length; i++) {
            const target = LEGACY_RAW_BRIDGES[i][0], sources = LEGACY_RAW_BRIDGES[i][1];
            if (rawIn[target]) continue;
            for (let j = 0; j < sources.length; j++) {
                const src = sources[j];
                if (rawIn[src]) {
                    const parsed = parseThemeColor(rawIn[src]);
                    if (parsed) { raw[target] = parsed.hex; break; }
                }
            }
        }
        // 3. Apply semanticColors onto Discord's SemanticColors table.
        // Helper that writes a parsed color into a SemanticColors[targetKey] entry across all 4 theme slots.
        // Revenge semanticColors arrays are [dark, light, amoled/midnight]:
        // - dark & darker (Ash) use index 0
        // - light uses index 1 (or falls back to index 0 when the theme is single-palette)
        // - midnight (Onyx) uses index 2 (or falls back to index 0)
        const directWritten = new Set();
        function writeSemanticTarget(targetKey, arr, isDirect) {
            const entry = sem[targetKey];
            if (!entry || typeof entry !== "object") return;
            if (!isDirect && directWritten.has(targetKey)) return;
            if (isDirect) directWritten.add(targetKey);
            const cDark = parseThemeColor(arr[0]);
            const cLight = parseThemeColor(arr[1] || arr[0]) || cDark;
            const cMidnight = parseThemeColor(arr[2] || arr[0]) || cDark;
            const cDarker = parseThemeColor(arr[3] || arr[0]) || cDark;
            const slotColors = {dark:cDark, darker:cDarker, light:cLight, midnight:cMidnight};
            for (const slot of THEME_SLOTS) {
                const picked = slotColors[slot];
                if (!picked) continue;
                const syntheticKey = "__VENUS_" + targetKey + "_" + slot;
                raw[syntheticKey] = picked.hex;
                if (entry[slot] && typeof entry[slot] === "object") {
                    entry[slot].raw = syntheticKey;
                    entry[slot].opacity = picked.opacity;
                } else entry[slot] = {raw:syntheticKey, opacity:picked.opacity};
            }
        }
        // First pass: aliases (so explicit Mana semantic keys in the same theme win over legacy aliases).
        for (const key of Object.keys(semIn)) {
            const arr = semIn[key];
            if (!Array.isArray(arr) || !arr.length) continue;
            const targets = LEGACY_SEMANTIC_ALIASES[key];
            if (targets) for (let i = 0; i < targets.length; i++) writeSemanticTarget(targets[i], arr, false);
        }
        // Second pass: direct Mana semantic keys.
        for (const key of Object.keys(semIn)) {
            const arr = semIn[key];
            if (!Array.isArray(arr) || !arr.length) continue;
            if (sem[key]) writeSemanticTarget(key, arr, true);
        }
        // 4. Apply declarative Vendetta Theme Plus (plus) extensions into the native token tables.
        if (plus && typeof plus === "object") {
            if (plus.mentionLineColor) {
                const mc = parseThemeColor(plus.mentionLineColor);
                if (mc && sem.BACKGROUND_MENTIONED_FEEDBACK) writeSemanticTarget("BACKGROUND_MENTIONED_FEEDBACK", [formatThemeColor(mc)], false);
                if (mc && !semIn.BACKGROUND_MENTIONED && !semIn.MESSAGE_MENTIONED_BACKGROUND_DEFAULT) {
                    const tint = {hex:mc.hex, opacity:Number(Math.min(0.25, mc.opacity * 0.16).toFixed(4))};
                    writeSemanticTarget("MESSAGE_MENTIONED_BACKGROUND_DEFAULT", [formatThemeColor(tint)], false);
                }
            }
            if (plus.unreadBadgeColor) {
                writeSemanticTarget("CHANNEL_UNREAD_PILL_CAP_BG", [plus.unreadBadgeColor], false);
                writeSemanticTarget("MOBILE_CHAT_NEW_MESSAGE_BORDER", [plus.unreadBadgeColor], false);
                writeSemanticTarget("MOBILE_CHAT_NEW_MESSAGE_TEXT", [plus.unreadBadgeColor], false);
            }
            if (plus.icons && typeof plus.icons === "object") {
                for (const iconKey of Object.keys(PLUS_STATUS_ICON_MAP)) {
                    const arr = plus.icons[iconKey];
                    if (!Array.isArray(arr) || !arr.length) continue;
                    const mapping = PLUS_STATUS_ICON_MAP[iconKey];
                    const first = parseThemeColor(arr[0]);
                    if (first) for (let i = 0; i < mapping.raw.length; i++) raw[mapping.raw[i]] = first.hex;
                    for (let i = 0; i < mapping.sem.length; i++) writeSemanticTarget(mapping.sem[i], arr, false);
                }
            }
        }
        // 5. Apply background color & wallpaper alpha to chat surfaces when background image is enabled.
        if (bg && typeof bg === "object") {
            const showBg = !!settings.customThemesBackground;
            if (bg.color && !semIn.CHAT_BACKGROUND && !semIn.CHANNEL_BACKGROUND_DEFAULT && !semIn.BACKGROUND_PRIMARY && !semIn.BACKGROUND_MOBILE_PRIMARY && !semIn.BG_BASE_PRIMARY) {
                for (let i = 0; i < CHAT_SURFACE_TOKENS.length; i++) writeSemanticTarget(CHAT_SURFACE_TOKENS[i], [bg.color], false);
            }
            if (showBg && bg.url && Number.isFinite(bg.alpha) && bg.alpha < 1) {
                const alpha = Math.max(0, Math.min(1, bg.alpha));
                for (let i = 0; i < CHAT_SURFACE_TOKENS.length; i++) {
                    const entry = sem[CHAT_SURFACE_TOKENS[i]];
                    if (!entry || typeof entry !== "object") continue;
                    for (const slot of THEME_SLOTS) {
                        const s = entry[slot];
                        if (s && typeof s === "object") {
                            const cur = Number.isFinite(s.opacity) ? s.opacity : 1;
                            s.opacity = Number((cur * alpha).toFixed(4));
                        }
                    }
                }
            }
        }
    }
    function customThemesActiveEntry() {
        if (!enabled("customThemes") || !customThemes.active) return null;
        return customThemes.list.find(t => t && t.id === customThemes.active) || null;
    }
    function customThemesBumpFallbackContextKey() {
        const mod = customThemes.themeContextMod || (customThemes.themeContextMod = global.__r && global.__r(4551));
        const fb = mod && mod.FALLBACK_THEME_CONTEXT_VALUE;
        if (fb && typeof fb === "object" && typeof fb.key === "string") {
            const base = fb.key.split("#v")[0];
            try { fb.key = customThemes.revision > 0 ? base + "#v" + customThemes.revision : base; } catch (_) {}
        }
    }
    function customThemesApply() {
        if (!customThemes.rawTable || !customThemes.semTable) {
            const m592 = global.__r && global.__r(592);
            const m590 = global.__r && global.__r(590);
            if (m592 && m592._private && m592._private.RawColors) customThemes.rawTable = m592._private.RawColors;
            if (m590 && m590._private && m590._private.SemanticColors) customThemes.semTable = m590._private.SemanticColors;
        }
        if (!customThemes.rawTable || !customThemes.semTable) return;
        const active = customThemesActiveEntry();
        const nextKey = active ? active.id + ":" + customThemes.editCounter + ":" + (settings.customThemesBackground ? "1" : "0") : "";
        if (nextKey === customThemes.appliedKey && (nextKey !== "" || customThemes.origRaw)) return;
        customThemes.appliedKey = nextKey;
        compileThemeIntoTables(active);
        customThemes.revision++;
        customThemesBumpFallbackContextKey();
        // Notify ThemeStore (1194) so RootThemeContextProvider re-evaluates createThemedContext (4551) with the new
        // revision key, invalidating createStyles (4837) and useToken (4535) caches once and keeping O(1) lookups.
        const store = customThemes.themeStore || (customThemes.themeStore = inspectedExport(1194, "default"));
        try { if (store && typeof store.emitChange === "function") store.emitChange(); } catch (_) {}
        notify("customThemes");
    }
    function hookRawColorsModule(exports) {
        const raw = exports && exports._private && exports._private.RawColors;
        if (raw && typeof raw === "object") {
            customThemes.rawTable = raw;
            snapshotColorTables();
            if (customThemes.semTable && enabled("customThemes")) customThemesApply();
        }
        return exports;
    }
    function hookSemanticColorsModule(exports) {
        const sem = exports && exports._private && exports._private.SemanticColors;
        if (sem && typeof sem === "object") {
            customThemes.semTable = sem;
            snapshotColorTables();
            if (customThemes.rawTable && enabled("customThemes")) customThemesApply();
        }
        return exports;
    }
    function hookCreateThemedContext(exports) {
        if (!exports) return exports;
        customThemes.themeContextMod = exports;
        customThemesBumpFallbackContextKey();
        if (typeof exports.createThemedContext !== "function") return exports;
        return hookExport(exports, "createThemedContext", function (orig, self, args) {
            const ctx = orig.apply(self, args);
            if (customThemes.revision > 0 && ctx && typeof ctx.key === "string")
                ctx.key = ctx.key.split("#v")[0] + "#v" + customThemes.revision;
            return ctx;
        });
    }
    function chatViewWrapperThemeBackground(orig, self, args) {
        useSettings("customThemes");
        const tree = orig.apply(self, args);
        if (!enabled("customThemes") || !settings.customThemesBackground || !React || !RN || !RN.Image || !tree) return tree;
        const active = customThemesActiveEntry();
        const bg = active && active.background;
        if (!bg || !bg.url) return tree;
        const blur = Number.isFinite(bg.blur) && bg.blur > 0 ? Math.round(bg.blur * 25) : 0;
        const bgColor = bg.color ? (parseThemeColor(bg.color) || {}).hex : undefined;
        return el(RN.View, {style:bgColor ? [THEME_BG_WRAP_STYLE, {backgroundColor:bgColor}] : THEME_BG_WRAP_STYLE},
            el(RN.Image, {
                pointerEvents:"none",
                source:{uri:bg.url},
                resizeMode:"cover",
                blurRadius:blur,
                fadeDuration:0,
                style:THEME_BG_LAYER_STYLE
            }),
            tree);
    }
    function customThemesPersist() {
        if (!files || !customThemes.loaded) return;
        const payload = JSON.stringify({version:1, active:customThemes.active || "", themes:customThemes.list.slice(0, THEMES_MAX)});
        if (payload.length > THEMES_MAX_BYTES) return;
        Promise.resolve().then(() => files.writeFile("documents", THEMES_FILE, payload, "utf8")).catch(() => {});
    }
    function customThemesRestore() {
        if (customThemes.loaded || customThemes.loading || !files) return;
        let constants;
        try { constants = typeof files.getConstants === "function" ? files.getConstants() : files; } catch (_) { constants = {}; }
        const dir = constants && constants.DocumentsDirPath;
        if (typeof dir !== "string") { customThemes.loaded = true; return; }
        const path = dir.replace(/\/$/, "") + "/" + THEMES_FILE;
        customThemes.loading = true;
        Promise.resolve().then(() => files.fileExists(path)).then(exists => exists ? files.readFile(path, "utf8") : null).then(text => {
            if (text && text.length <= THEMES_MAX_BYTES) {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === "object" && Array.isArray(parsed.themes)) {
                    const loadedList = [];
                    parsed.themes.slice(0, THEMES_MAX).forEach(item => {
                        try {
                            const clean = sanitizeThemeSpec(item, item && typeof item.url === "string" ? item.url : item && typeof item.id === "string" ? item.id : "");
                            if (item && typeof item.id === "string" && item.id) clean.id = item.id;
                            if (!loadedList.some(x => x.id === clean.id)) loadedList.push(clean);
                        } catch (_) {}
                    });
                    if (!customThemes.list.length) customThemes.list = loadedList;
                    if (!customThemes.active && typeof parsed.active === "string" && customThemes.list.some(t => t.id === parsed.active))
                        customThemes.active = parsed.active;
                }
            }
        }).catch(() => {}).then(() => {
            customThemes.loading = false;
            customThemes.loaded = true;
            if (enabled("customThemes")) customThemesApply();
            notify("customThemes");
        });
    }
    function customThemesInstallFromUrl(rawUrl, onDone) {
        const url = normalizeThemeUrl(rawUrl);
        if (!url) {
            customThemes.error = tr("Enter a valid https:// or http:// link to a theme .json file.");
            notify("customThemes");
            return Promise.resolve(false);
        }
        if (typeof global.fetch !== "function") {
            customThemes.error = tr("Network fetch is unavailable right now.");
            notify("customThemes");
            return Promise.resolve(false);
        }
        customThemes.installing = true;
        customThemes.error = "";
        notify("customThemes");
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = later(() => reject(new Error(tr("Theme download timed out."))), THEMES_TIMEOUT_MS, false);
        });
        return Promise.race([
            Promise.resolve().then(() => global.fetch(url, {method:"GET", headers:{Accept:"application/json, text/plain, */*"}})).then(res => {
                if (!res || !res.ok) throw new Error(tr("Couldn't download theme (HTTP {status}).", {status:res && res.status || "error"}));
                return res.text();
            }),
            timeout
        ]).then(text => {
            if (timer !== undefined && typeof global.clearTimeout === "function") global.clearTimeout(timer);
            if (typeof text !== "string" || !text.trim()) throw new Error(tr("The link returned an empty file."));
            if (text.length > THEMES_MAX_BYTES) throw new Error(tr("That theme file is too large."));
            let json;
            try { json = JSON.parse(text); } catch (_) { throw new Error(tr("That link didn't return valid JSON.")); }
            const spec = sanitizeThemeSpec(json, url);
            customThemes.loaded = true;
            customThemes.editCounter++;
            const existingIdx = customThemes.list.findIndex(t => t.id === spec.id || t.url && t.url === spec.url);
            if (existingIdx >= 0) customThemes.list[existingIdx] = spec;
            else {
                if (customThemes.list.length >= THEMES_MAX) customThemes.list.pop();
                customThemes.list.unshift(spec);
            }
            customThemes.active = spec.id;
            customThemes.installing = false;
            customThemes.error = "";
            customThemesPersist();
            customThemesApply();
            reviewToast(reviewUI(), tr("Applied {name}", {name:spec.name}), venusIcon(4793, "CircleCheckIcon"));
            if (typeof onDone === "function") onDone();
            return true;
        }).catch(err => {
            if (timer !== undefined && typeof global.clearTimeout === "function") global.clearTimeout(timer);
            customThemes.installing = false;
            customThemes.error = String(err && err.message || err);
            notify("customThemes");
            return false;
        });
    }
    function customThemesSelect(id) {
        if (!enabled("customThemes")) return;
        customThemes.loaded = true;
        customThemes.active = customThemes.active === id ? "" : id;
        customThemes.error = "";
        customThemesPersist();
        customThemesApply();
    }
    function customThemesRemove(id) {
        customThemes.loaded = true;
        const idx = customThemes.list.findIndex(t => t.id === id);
        if (idx < 0) return;
        const removed = customThemes.list[idx];
        customThemes.list.splice(idx, 1);
        if (customThemes.active === id) customThemes.active = "";
        customThemesPersist();
        customThemesApply();
        reviewToast(reviewUI(), tr("Removed {name}", {name:removed.name}), venusIcon(4791, "TrashIcon"));
    }
    function customThemesClearAll() {
        customThemes.loaded = true;
        customThemes.list = [];
        customThemes.active = "";
        customThemes.error = "";
        customThemesPersist();
        customThemesApply();
        reviewToast(reviewUI(), "Themes cleared", venusIcon(4791, "TrashIcon"));
    }
    function customThemesSummary() {
        if (!enabled("customThemes")) return tr("Turned off. Switch it on in Features to start.");
        if (customThemes.error) return customThemes.error;
        const savedCount = customThemes.list.length;
        return savedCount ? pl(savedCount, "{n} theme installed.", "{n} themes installed.") : tr("No themes installed yet. Paste a theme .json link below to add one.");
    }
    // A theme's own colors as a small round swatch: its background, its card color and its accent.
    function themeColorOf(item, keys) {
        for (const key of keys) {
            const raw = item.rawColors && item.rawColors[key], sem = item.semanticColors && item.semanticColors[key];
            const value = typeof raw === "string" ? raw : Array.isArray(sem) ? sem[0] : null;
            if (typeof value === "string" && /^#[0-9a-f]{6}/i.test(value)) return value.slice(0, 7);
        }
        return null;
    }
    function themeSwatch(item) {
        if (!RN) return undefined;
        const bg = themeColorOf(item, ["BACKGROUND_PRIMARY", "BACKGROUND_BASE_LOWER", "BG_BASE_PRIMARY", "CHAT_BACKGROUND", "PRIMARY_600"]) || "#313338";
        const card = themeColorOf(item, ["BACKGROUND_SECONDARY", "BACKGROUND_BASE_LOW", "CARD_PRIMARY_BG", "PRIMARY_630"]) || "#2b2d31";
        const accent = themeColorOf(item, ["BRAND_500", "BRAND_EXPERIMENT", "BACKGROUND_BRAND", "TEXT_BRAND", "BLURPLE_50", "BRAND_360"]) || "#5865f2";
        return el(RN.View, {style:{width:32, height:32, borderRadius:16, overflow:"hidden", flexDirection:"row", borderWidth:1, borderColor:"#ffffff1f"}},
            el(RN.View, {style:{flex:1, backgroundColor:bg}}), el(RN.View, {style:{flex:1, backgroundColor:card}}), el(RN.View, {style:{flex:1, backgroundColor:accent}}));
    }
    function CustomThemesSettings() {
        useSettings("customThemes");
        const [urlDraft, setUrlDraft] = React.useState("");
        const ui = reviewUI();
        React.useEffect(() => {
            if (enabled("customThemes")) customThemesRestore();
        }, []);
        if (!React || !RN) return null;
        const Group = ui.TableRowGroup || RN.View, Row = ui.TableRow, Switch = ui.TableSwitchRow;
        const on = enabled("customThemes");
        const canInstall = on && !customThemes.installing && /^https?:\/\/\S+/i.test(urlDraft.trim());
        const onInstall = () => {
            if (!canInstall) return;
            customThemesInstallFromUrl(urlDraft, () => setUrlDraft(""));
        };
        const onPaste = () => {
            if (!on || customThemes.installing) return;
            const clip = ui.clipboard || RN.Clipboard;
            if (!clip || typeof clip.getString !== "function") return;
            Promise.resolve().then(() => clip.getString()).then(str => {
                if (typeof str === "string" && str.trim()) setUrlDraft(str.trim());
            }).catch(() => {});
        };
        const inputProps = {
            value:urlDraft,
            autoCapitalize:"none",
            autoCorrect:false,
            keyboardType:"url",
            placeholder:tr("https://.../theme.json"),
            onSubmitEditing:onInstall,
            returnKeyType:"go",
            editable:on && !customThemes.installing,
            isDisabled:!on || customThemes.installing
        };
        // One field and one button: Paste while the box is empty, Install once it has a link.
        const empty = !urlDraft.trim();
        const urlInput = inputWithButton(ui, "input", Object.assign({label:tr("Theme JSON link")}, inputProps), text => setUrlDraft(String(text || "")),
            customThemes.installing ? "Installing..." : empty ? "Paste" : "Install", empty ? onPaste : onInstall, empty ? !on || customThemes.installing : !canInstall);
        const themeRows = customThemes.list.length ? customThemes.list.map(item => {
            if (!item || !Row) return null;
            const isSelected = customThemes.active === item.id;
            const byLine = item.authors ? tr("by {author}", {author:item.authors}) + " \u00b7 " : "";
            const descLine = item.description ? item.description + " \u00b7 " : "";
            const bgBadge = item.background && item.background.url ? tr("Background image") + " \u00b7 " : "";
            // The footnote says what a tap does; each row only says what's different about it.
            const stateLine = isSelected ? tr("In use") : "";
            return el(Row, {
                key:"theme:" + item.id,
                label:item.name,
                icon:themeSwatch(item),
                trailing:isSelected ? popIn("on:" + item.id, el(venusIcon(6555, "CheckmarkSmallIcon"), {size:"md"})) : undefined,
                subLabel:(byLine + descLine + bgBadge + stateLine).replace(/ \u00b7 $/, "") || undefined,
                disabled:!on || customThemes.installing,
                onPress:() => customThemesSelect(item.id),
                onLongPress:() => confirmAction("Remove theme?",
                    tr("Remove {name} from this phone?", {name:item.name}),
                    "Remove", () => customThemesRemove(item.id))
            });
        }) : [Row ? el(Row, {key:"empty", label:tr("No themes installed yet"), subLabel:tr("Paste a direct link to a Revenge or Vendetta .json theme below."), disabled:true}) : null];
        const groups = [
            on ? statusCard("status", customThemesSummary(), {title:customThemes.error ? tr("Couldn't install the theme") : customThemesActiveEntry() ? customThemesActiveEntry().name : tr("Discord's colors"),
                IconComponent:venusIcon(14887, "EyeDropperIcon"), leading:customThemesActiveEntry() ? themeSwatch(customThemesActiveEntry()) : null}) :
                offCard("status", venusIcon(14887, "EyeDropperIcon")),
            el(Group, {key:"saved", title:tr("Installed themes")}, themeRows),
            el(Group, {key:"install", title:tr("Add from link"), description:tr("Downloads the theme once and keeps it on this phone.")},
                el(RN.View, {key:"input", style:{padding:12}}, urlInput),
                Row ? el(Row, {key:"browse", label:tr("Browse Revenge themes"), icon:rowIcon(8041, "LinkExternalSmallIcon"),
                    subLabel:"plugins-list.pages.dev/Themes",
                    arrow:true, onPress:() => openLink("https://plugins-list.pages.dev/Themes/")}) : null),
            el(Group, {key:"display", title:tr("Display")},
                switchRow(Switch, "customThemesBackground", "Show theme background image", "Shows the wallpaper behind chat, for themes that come with one.", rowIcon(5402, "ImageIcon"))),
            el(Group, {key:"manage", title:tr("Manage")},
                actionRow(ui, "clear", "Clear installed themes",
                    customThemes.list.length ? pl(customThemes.list.length, "Removes {n} saved theme and restores Discord's default colors.", "Removes {n} saved themes and restores Discord's default colors.") : "No themes installed.",
                    () => confirmAction("Clear installed themes?", "Every installed theme will be removed from this phone and Discord's default colors will be restored.", "Clear", customThemesClearAll),
                    !customThemes.list.length, true)),
            footnote("note", "Tap the theme in use to go back to Discord's colors. Hold a theme to remove it.")];
        return settingsBody(ui, groups, {keyboardShouldPersistTaps:"handled"});
    }
    // Message highlights settings: a live chat preview, the bar width as a segmented choice, and a row of color
    // swatches per highlight, with Discord's own color picker (showCustomColorPickerActionSheet 14140) for any color.
    const HIGHLIGHT_PING_CHOICES = [["default", "Yellow", "#f0b232"], ["blurple", "Blurple", "#5865f2"], ["cyan", "Cyan", "#00a8fc"],
        ["green", "Green", "#23a55a"], ["pink", "Pink", "#eb459e"], ["purple", "Purple", "#9b59b6"]];
    const HIGHLIGHT_DELETED_CHOICES = [["default", "Red", "#f23f43"], ["orange", "Orange", "#e67e22"], ["yellow", "Yellow", "#f0b232"],
        ["pink", "Pink", "#eb459e"], ["purple", "Purple", "#9b59b6"], ["cyan", "Cyan", "#00a8fc"]];
    const HIGHLIGHT_DARK = {chat:{borderRadius:16, overflow:"hidden", backgroundColor:"#1a1a1e", borderWidth:1, borderColor:"#ffffff14", paddingVertical:8},
        name:{color:"#f2f3f5", fontSize:15, fontWeight:"600"}, text:{color:"#dbdee1", fontSize:15, lineHeight:20}, muted:{color:"#949ba4", fontSize:12},
        spine:{borderColor:"#4e5058"}, mention:{backgroundColor:"#5865f24d", color:"#c9cdfb", fontWeight:"600"},
        card:{backgroundColor:"#2b2d31", borderRadius:16, paddingHorizontal:16, paddingVertical:16, gap:16}, divider:{height:1, backgroundColor:"#ffffff14"},
        ring:{borderColor:"#f2f3f5"}, dashed:{borderColor:"#949ba4"}};
    // Discord's own color picker sheet, the one its role and profile colors use. Returns false when it can't open.
    function highlightPickColor(current, presets, onPick) {
        const show = inspectedExport(14140, "default");
        if (typeof show !== "function") return false;
        try {
            show({color:hexInt(current), suggestedColors:presets.map(choice => choice[2]), onSelect:value => {
                const hex = typeof value === "string" ? (hexInt(value) != null ? intHex(hexInt(value)) : null) : intHex(value);
                if (hex) onPick(hex);
            }});
            return true;
        } catch (_) { return false; }
    }
    // Keyed on the color and width, so it mounts again only when one of them changes. It glows only when the page
    // says that highlight just changed (props.fresh), never on the page's first draw.
    function HighlightGlow(props) {
        const A = motion(), ref = React.useRef(null);
        if (!ref.current && A) ref.current = new A.Value(props.fresh && !reduceMotion ? 1 : 0);
        React.useEffect(() => {
            const value = ref.current;
            if (!value || !props.fresh || reduceMotion) return undefined;
            const run = A.timing(value, {toValue:0, duration:900, easing:easeOut(), useNativeDriver:true});
            run.start();
            return () => run.stop();
        }, []);
        return ref.current ? el(A.View, {pointerEvents:"none", style:{position:"absolute", left:0, right:0, top:0, bottom:0, backgroundColor:props.hex + "40", opacity:ref.current}}) : null;
    }
    function highlightPreview(props) {
        const s = useThemed("highlightPreview", c => ({chat:Object.assign({}, HIGHLIGHT_DARK.chat, {backgroundColor:c.CHANNEL_BACKGROUND_DEFAULT || c.BACKGROUND_BASE_LOWER, borderColor:c.BORDER_SUBTLE}),
            name:Object.assign({}, HIGHLIGHT_DARK.name, {color:c.TEXT_STRONG}), text:Object.assign({}, HIGHLIGHT_DARK.text, {color:c.TEXT_DEFAULT}),
            muted:Object.assign({}, HIGHLIGHT_DARK.muted, {color:c.TEXT_MUTED}), spine:{borderColor:c.INTERACTIVE_MUTED || c.BORDER_STRONG},
            mention:Object.assign({}, HIGHLIGHT_DARK.mention, {backgroundColor:c.MENTION_BACKGROUND, color:c.MENTION_FOREGROUND})}), HIGHLIGHT_DARK);
        const me = props.me, myName = me && (me.globalName || me.global_name || me.username) || tr("you");
        const uri = userNotifAvatarUri(me, 80), bar = props.bar;
        const face = size => uri && RN.Image ? el(RN.Image, {source:{uri}, style:{width:size, height:size, borderRadius:size / 2}}) :
            el(RN.View, {style:{width:size, height:size, borderRadius:size / 2, backgroundColor:"#5865f2", alignItems:"center", justifyContent:"center"}},
                el(RN.Text, {style:{color:"#ffffff", fontSize:Math.round(size * 0.42), fontWeight:"700"}}, myName.slice(0, 1).toUpperCase()));
        const letter = (char, color) => el(RN.View, {style:{width:40, height:40, borderRadius:20, backgroundColor:color, alignItems:"center", justifyContent:"center"}},
            el(RN.Text, {style:{color:"#ffffff", fontSize:16, fontWeight:"700"}}, char));
        const header = (name, time) => el(RN.View, {style:{flexDirection:"row", alignItems:"baseline", marginBottom:2}},
            el(RN.Text, {style:s.name, numberOfLines:1}, name), el(RN.Text, {style:[s.muted, {marginLeft:8}]}, time));
        // A highlight that just changed glows once, like a new mention arriving, then settles to its normal tint.
        // props.count shows only the first few messages (while Watch plays), props.beats replays one's glow, props.ripple
        // marks a tap, and props.onPress makes a highlighted message tappable.
        const Press = RN.Pressable || RN.View, count = props.count == null ? 3 : props.count;
        const message = (key, hex, children) => {
            const beat = props.beats && props.beats[key] || 0;
            const body = el(RN.View, {key, style:{paddingHorizontal:12, paddingVertical:6, backgroundColor:hex ? hex + "1a" : undefined}},
                hex ? el(HighlightGlow, {key:"glow:" + hex + ":" + bar + ":" + beat, hex, fresh:!!(props.fresh && props.fresh[key])}) : null,
                hex ? el(RN.View, {style:{position:"absolute", left:0, top:0, bottom:0, width:bar, backgroundColor:hex}}) : null, children,
                props.ripple ? props.ripple(key) : null);
            return hex && props.onPress ? el(Press, {key, onPress:() => props.onPress(key), accessibilityRole:"button", accessibilityHint:tr("Tap to see it light up again")}, body) : body;
        };
        const question = tr("Did everyone see the new update?");
        return el(RN.View, {key:props.key, style:[s.chat, {paddingVertical:0}], accessible:true, accessibilityLabel:tr("Message highlight preview")},
            props.header || null,
            el(RN.View, {style:{paddingVertical:4}},
                message("plain", null, el(RN.View, {style:{flexDirection:"row", gap:12}}, face(40),
                    el(RN.View, {style:{flex:1}}, header(myName, tr("Today at 4:01 PM")), el(RN.Text, {style:s.text}, question)))),
                count < 2 ? null : message("reply", props.ping, el(RN.View, null,
                    el(RN.View, {style:{flexDirection:"row", alignItems:"center", marginBottom:4}},
                        el(RN.View, {style:[{width:28, height:10, marginLeft:19, marginRight:4, marginTop:8, borderLeftWidth:2, borderTopWidth:2, borderTopLeftRadius:6}, s.spine]}),
                        el(RN.View, {style:{marginRight:4}}, face(16)),
                        el(RN.Text, {style:[s.muted, {fontWeight:"600", marginRight:4}], numberOfLines:1}, myName),
                        el(RN.Text, {style:[s.muted, {flex:1}], numberOfLines:1}, question)),
                    el(RN.View, {style:{flexDirection:"row", gap:12}}, letter("S", "#eb459e"),
                        el(RN.View, {style:{flex:1}}, header("Sam", tr("Today at 4:03 PM")),
                            el(RN.Text, {style:s.text}, el(RN.Text, {style:s.mention}, "@" + myName), " " + tr("Yes, it looks great!")))))),
                props.deleted && count >= 3 ? el(RN.View, {style:{height:4}}) : null,
                props.deleted && count >= 3 ? message("deleted", props.pending ? null : props.deleted, el(RN.View, {style:{flexDirection:"row", gap:12}}, letter("A", "#3ba55c"),
                    el(RN.View, {style:{flex:1}}, header("Alex", tr("Today at 4:05 PM")),
                        el(RN.Text, {style:s.text}, tr("Oops, wrong chat. Deleting this."))))) : null,
                props.tip || null),
            props.caption ? previewCaption(s, props.caption) : null, props.footer || null);
    }
    // A live chat preview: your question, Sam's reply mentioning you (highlighted in your reply color), and Alex's kept
    // deleted message (highlighted in your deleted color). Changing the colors or bar width below lights up the matching message right away.
    function HighlightPreview(props) {
        useSettings("messageHighlight");
        const s = useChatPreviewStyles(), k = usePreviewChrome(), given = props.fresh || {};
        return el(RN.View, {key:"preview"},
            highlightPreview({key:"chat", me:props.me, bar:props.bar, ping:props.ping, deleted:props.deleted,
                fresh:{reply:!!given.reply, deleted:!!given.deleted},
                header:previewHeader(k, {title:"general"}),
                footer:previewInput(k, s, {placeholder:tr("Message {channel}", {channel:"#general"})})}));
    }
    // One highlight's colors: its name and current color, then a row of swatches and a last one for any color.
    function highlightColorPicker(props) {
        const s = useThemed("highlightPicker", c => ({ring:{borderColor:c.TEXT_STRONG}, dashed:{borderColor:c.TEXT_MUTED}}), HIGHLIGHT_DARK);
        const Text = inspectedExport(4833, "Text"), Press = RN.Pressable || RN.View, Check = venusIcon(6555, "CheckmarkSmallIcon"), Dropper = venusIcon(14887, "EyeDropperIcon");
        const value = props.value, on = props.on, custom = typeof value === "string" && value.startsWith("#");
        const active = props.choices.find(choice => choice[0] === value), activeHex = highlightColorHex(value, props.defaultHex);
        const activeName = active ? tr(active[1]) : activeHex.toUpperCase();
        const swatch = (key, label, hex, selected, onPress, inner) => el(RN.View, {key, style:{flex:1, alignItems:"center"}},
            el(Press, {accessible:true, accessibilityRole:"radio", accessibilityLabel:label, accessibilityState:{selected, disabled:!on}, disabled:!on, onPress,
                hitSlop:{top:4, bottom:4, left:2, right:2},
                style:[{width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center", borderWidth:2, borderColor:"transparent"}, selected ? s.ring : null, {opacity:on ? 1 : 0.4}]},
                el(RN.View, {style:[{width:30, height:30, borderRadius:15, alignItems:"center", justifyContent:"center", backgroundColor:hex || "transparent"},
                    hex ? null : [{borderWidth:2, borderStyle:"dashed"}, s.dashed]]}, inner)));
        const tick = hex => el(Check, {size:"sm", color:isLightHex(hex) ? "#000000" : "#ffffff"});
        const pickAny = () => { if (on && !highlightPickColor(activeHex, props.choices, hex => setSetting(props.setting, hex)) && props.onNoPicker) props.onNoPicker(); };
        return el(RN.View, {key:props.setting, style:{gap:12}},
            el(RN.View, {style:{flexDirection:"row", alignItems:"center", gap:8}},
                el(RN.View, {style:{flex:1}}, Text ? el(Text, {variant:"text-md/semibold", color:"text-strong"}, tr(props.title)) :
                    el(RN.Text, {style:{color:"#f2f3f5", fontSize:16, fontWeight:"600"}}, tr(props.title))),
                el(RN.View, {style:{width:10, height:10, borderRadius:5, backgroundColor:activeHex}}),
                Text ? el(Text, {variant:"text-sm/medium", color:"text-muted"}, activeName) : el(RN.Text, {style:{color:"#949ba4", fontSize:13}}, activeName)),
            el(RN.View, {style:{flexDirection:"row", alignItems:"center"}, accessibilityRole:"radiogroup"},
                props.choices.map(([choice, label, hex]) => swatch(choice, tr(label), hex, value === choice, () => { if (on) setSetting(props.setting, choice); },
                    value === choice ? popIn("tick:" + choice, tick(hex)) : null)),
                swatch("custom", tr("Any color"), custom ? value : null, custom, pickAny, custom ? popIn("tick:" + value, tick(value)) : el(Dropper, {size:"xs"}))));
    }
    function MessageHighlightSettings() {
        useSettings("messageHighlight");
        const ui = reviewUI();
        const [hexDraft, setHexDraft] = React.useState(""), [hexTarget, setHexTarget] = React.useState("");
        // What the preview last showed, so only the highlight you just changed glows.
        const shown = React.useRef(null);
        if (!React || !RN) return null;
        const s = useThemed("highlightCard", c => ({card:Object.assign({}, HIGHLIGHT_DARK.card, {backgroundColor:c.CARD_BACKGROUND_DEFAULT}),
            divider:{height:1, backgroundColor:c.BORDER_SUBTLE}}), HIGHLIGHT_DARK);
        const on = enabled("messageHighlight"), showDeleted = !!features.noDelete;
        const pingHex = on ? highlightColorHex(settings.messageHighlightPingColor, "#f0b232") : "#f0b232";
        const delHex = on ? highlightColorHex(settings.messageHighlightDeletedColor, "#f23f43") : "#f23f43";
        const barWidth = (on ? settings.messageHighlightThickness : 1) * 2, last = shown.current;
        const fresh = last ? {reply:last.ping !== pingHex || last.bar !== barWidth, deleted:last.deleted !== delHex || last.bar !== barWidth} : null;
        shown.current = {ping:pingHex, deleted:delHex, bar:barWidth};
        const changed = settings.messageHighlightThickness !== 2 || settings.messageHighlightPingColor !== "default" || settings.messageHighlightDeletedColor !== "default";
        const resetAll = () => {
            setSetting("messageHighlightThickness", 2); setSetting("messageHighlightPingColor", "default"); setSetting("messageHighlightDeletedColor", "default");
            setHexTarget(""); reviewToast(ui, "Highlights reset", venusIcon(4793,"CircleCheckIcon"));
        };
        // When Discord's color picker can't open, a hex box opens under the colors instead.
        const cleanHex = String(hexDraft || "").trim(), validHex = /^#?[0-9a-fA-F]{6}$/.test(cleanHex);
        const applyHex = () => {
            if (!on || !validHex || !hexTarget) return;
            setSetting(hexTarget, (cleanHex.startsWith("#") ? cleanHex : "#" + cleanHex).toLowerCase());
            setHexTarget(""); setHexDraft("");
        };
        const picker = (setting, title, choices, defaultHex) => highlightColorPicker({ setting, title, choices, defaultHex, on, value:settings[setting],
            onNoPicker:() => { setHexTarget(setting); setHexDraft(settings[setting].startsWith("#") ? settings[setting] : ""); }});
        const groups = [
            on ? null : offCard("status", venusIcon(16122, "PaintbrushThinIcon")),
            el(HighlightPreview, {key:"preview", on, me:currentUser(), bar:barWidth, ping:pingHex, deleted:showDeleted ? delHex : null, fresh}),
            el(RN.View, {key:"thickness", style:{gap:8}},
                groupTitle("title", "Left bar width"),
                venusSegmented({key:"choice", value:settings.messageHighlightThickness, disabled:!on, onChange:value => setSetting("messageHighlightThickness", value),
                    items:HIGHLIGHT_THICKNESSES.map(n => ({value:n, label:tr("{n} dp", {n:n * 2})}))})),
            el(RN.View, {key:"colors", style:{gap:8}},
                groupTitle("title", "Colors"),
                el(RN.View, {style:s.card},
                    picker("messageHighlightPingColor", "Replies and mentions", HIGHLIGHT_PING_CHOICES, "#f0b232"),
                    showDeleted ? el(RN.View, {style:s.divider}) : null,
                    showDeleted ? picker("messageHighlightDeletedColor", "Deleted messages", HIGHLIGHT_DELETED_CHOICES, "#f23f43") : null,
                    hexTarget ? inputWithButton(ui, "hex", {value:hexDraft, label:tr("Hex color"), autoCapitalize:"none", autoCorrect:false, maxLength:7, placeholder:"#5865f2",
                        onSubmitEditing:applyHex, returnKeyType:"done", editable:on, isDisabled:!on}, text => setHexDraft(String(text || "")), "Use", applyHex, !on || !validHex) : null)),
            el(ui.TableRowGroup || RN.View, {key:"manage", title:tr("Manage")},
                actionRow(ui, "reset", "Reset to defaults", "A 4 dp bar, yellow for replies and mentions, red for deleted messages.", resetAll, !on || !changed)),
            footnote("note", "Changes show in chat right away, with no restart.")
        ];
        return settingsBody(ui, groups, {keyboardShouldPersistTaps:"handled"});
    }
    function activatePlugins(id, exports) {
        if ((features.validUser || features.splitMessages || features.translate || features.userNotif || features.accountSwitcher || features.appIcons || features.messageHighlight) && id === 1378 && exports && exports.default) userStore = exports.default;
        if (id === 2115 && exports && exports.default && !localeStore) {
            localeStore = exports.default;
            // Following Discord's language: switching it there switches Venus too.
            try { if (typeof localeStore.addChangeListener === "function") localeStore.addChangeListener(() => {
                if (settings.language === "auto" && uiLanguage() !== i18n.shownIn) { loadLanguage(uiLanguage()); languageChanged(); }
                if (enabled("translate") && settings.translateTarget !== "phone") translateChanged();
            }); } catch (_) {}
        }
        if (features.appIcons && id === 8621) return hookAppIconConstants(exports);
        if (features.appIcons && id === 17096) return hookAppIconPremiumManager(exports);
        if (features.appIcons && (id === 15065 || id === 15066 || id === 16750)) return hookComponent(exports, appIconsScreen);
        if (features.customThemes && id === 590) return hookSemanticColorsModule(exports);
        if (features.customThemes && id === 592) return hookRawColorsModule(exports);
        if (features.customThemes && id === 1194 && exports && exports.default) customThemes.themeStore = exports.default;
        if (features.customThemes && id === 4551) return hookCreateThemedContext(exports);
        if (features.customThemes && id === 9542) return hookComponent(exports, chatViewWrapperThemeBackground);
        if (features.accountSwitcher && id === 11800) return hookMultiAccountStore(exports);
        if (features.accountSwitcher && id === 11802) return hookIsStaffForMultiAccount(exports);
        if (features.userNotif && id === 585 && exports && exports.default) userNotifInit(exports.default);
        if (features.userNotif && id === 4482 && exports && exports.default) { userNotif.relationships = exports.default; userNotifSeedStatuses(); }
        if (features.userNotif && id === 2073 && exports && exports.default) { userNotif.guilds = exports.default; userNotifSubscribeGuilds(); }
        if ((features.quests || features.userNotif) && id === 7179 && exports && exports.default) { bgKeepAlive.fg = exports.default; backgroundSync(); }
        if ((features.quests || features.userNotif) && id === 13174) return hookGatewaySocket(exports);
        if ((features.quests || features.userNotif) && id === 13212) return hookPauseGateway(exports);
        if (features.translate && id === 585 && exports && exports.default) translateInit(exports.default);
        if (features.translate && id === 11023) return hookComponent(exports, translateSheet);
        if (features.splitMessages && id === 8602) return maxLengthModule(exports);
        if ((features.youBarSettings || features.accountSwitcher) && id === 16032) return hookComponent(exports, youBarButtons);
        if (features.validUser && id === 585 && exports && exports.default) validInit(exports.default);
        // MurmurHashV3 is CommonJS (module.exports=function), not an ES default export.
        if (features.pastelize && id === 1252) pastelHash = typeof exports === "function" ? exports : exports.default;
        if (features.pastelize && id === 2111) guildMembers = exports.default;
        if ((features.pastelize || features.noDelete || features.translate || features.messageHighlight) && id === 7378 && exports.default && exports.default.prototype) hookExport(exports.default.prototype,"generate",messageRow);
        if ((features.platformIndicators || features.userNotif) && id === 4877) { presenceStore = exports.default; if (features.userNotif) userNotifSeedStatuses(); }
        if (features.platformIndicators && id === 4855) sessionsStore = exports.default;
        if (features.platformIndicators && id === 10603) {
            displayNameType=exports.DisplayName;
            exports=hookExport(exports,"DisplayName",platformName);
            return hookComponent(exports,(orig,self,args)=>wrapProfileTree(orig.apply(self,args),displayNameType,platformName,platformWrappers));
        }
        if (features.platformIndicators && id === 12845) return hookComponent(exports,platformHeader);
        if (features.platformIndicators && id === 15667) return hookComponent(exports,platformDmRow);
        // User list rows (UserRow, default export) and voice panel rows (FormComponents' named MemberRowItem).
        if (features.platformIndicators && id === 10371) return hookComponent(exports,(orig,self,args)=>platformPlacement(orig,self,args,"piUserList"));
        if (features.platformIndicators && id === 9108) return hookComponent(exports,(orig,self,args)=>platformPlacement(orig,self,args,"piUserList"),"MemberRowItem");
        // Profile "in voice" users (UserProfileActivityVoiceChannelUsers): private UserRow rows.
        if (features.platformIndicators && id === 12602) return hookComponent(exports,(orig,self,args)=>{
            const tree=orig.apply(self,args);
            if (!enabled("platformIndicators") || !settings.piUserList || !React || !tree) return tree;
            return cloneTree(tree,(node,p)=>{
                if (typeof p.renderItem!=="function" || p.__venusPlatforms) return p;
                const render=p.renderItem;
                // Same wrapper for the same renderItem, so the list doesn't redraw every row.
                let renderItem=platformRenderers.get(render);
                if (!renderItem) platformRenderers.set(render,renderItem=function(){return platformRow(render.apply(this,arguments));});
                return Object.assign({},p,{__venusPlatforms:true,renderItem});
            },0);
        });
        // Plain status dot on avatars: avatar Status (design/void/Status,
        // 13649) draws a phone badge when isMobileOnline; show the plain dot instead.
        if (features.platformIndicators && id === 13649) {
            const plain = (orig,self,args) => {
                const props = args[0];
                if (!enabled("platformIndicators") || !settings.piHideMobile || !props || !props.isMobileOnline) return orig.apply(self,args);
                const next = Array.from(args); next[0] = Object.assign({},props,{isMobileOnline:false}); return orig.apply(self,next);
            };
            return hookExport(hookExport(exports,"default",plain),"StatusWithTyping",plain);
        }
        if (features.readAll && id === 15929) return hookExport(exports,"default",readAllBarProps);
        if (features.reviewDB && id === 8510) oauthModal=exports.default;
        if (features.reviewDB && id === 5997) nativeRowGroup=exports.TableRowGroup;
        if (features.reviewDB && id === 6621) nativeSwitchRow=exports.TableSwitchRow;
        if (features.hiddenChannels && id === 15859) {
            // ChannelInfo can be consumed as default export and as named export
            // (GuildRolesAndChannelsRow reads it by name); hook both.
            exports = hookComponent(exports,hiddenInfo);
            return hookExport(exports, "ChannelInfo", hiddenInfo);
        }
        if (features.reviewDB && id === 12627) return hookComponent(exports,reviewNote);
        if (features.reviewDB && id === 13987) return hookExport(exports,"ContextMenuPopout",reviewMenu);

        if (features.reviewDB && id === 13521) return hookComponent(exports,reviewGuild);
        if (features.hideGift && (id === 11609 || id === 11817) && exports && exports.default)
            return replaceValue(exports, "default", propsComponent(exports.default, withoutGift));
        if (features.hideCall && id === 12696) return hookComponent(exports, profileButtons);
        if (features.hideQuestDock && id === 14608) return hideQuestHooks(exports);
        if (features.hideQuestDock && id === 14700) return hideQuestDock(exports);
        if (features.systemEmoji && id === 6552 && exports && exports.default)
            return replaceValue(exports, "default", propsComponent(exports.default, systemEmojiProps));
        if (id === 14130) exports.SETTING_RENDERER_CONFIG = nativeRegistry(exports.SETTING_RENDERER_CONFIG);
        if (id === 10874) return hookExport(exports, "createList", settingsSections);
        if (id === 14236) SettingsList = exports.SettingsList;
        if (features.copyBios && id === 10742) return hookComponent(exports, copyBio);
        if ((features.dashless || features.hiddenChannels) && id === 4990) {
            exports = hookExport(exports,"computeChannelName",channelLabel);
            return hookExport(exports, "default", useChannelLabel);
        }
        if (features.dashless && id === 5314) return hookExport(exports, "getChannel", mentionChannelInfo);
        if (features.dashless && id === 7099) {
            exports = hookExport(exports, "createParserState", parserStateChannels);
            if (exports && exports.default) exports = replaceValue(exports, "default", hookExport(exports.default, "createParserState", parserStateChannels));
            return exports;
        }
        if (features.favouriteAnything && id === 12524) return hookComponent(exports, favouriteButton);
        if (features.favouriteAnything && id === 9861) return hookExport(exports, "addFavoriteGIF", favouriteAdd);
        if (features.favouriteAnything && id === 9864) return hookExport(exports, "useFavoriteGIFsMobile", favouriteList);
        if (id === 2051) channelStore = exports.default;
        if (features.noTyping && id === 11348) return replaceValue(exports, "default",
            hookExport(hookExport(exports.default, "startTyping", typing), "stopTyping", typing));
        if (features.quickDelete && id === 1127) locale = exports;
        if (features.quickDelete && id === 5205) return replaceValue(exports, "default", hookExport(exports.default, "show", quickConfirm));
        if (features.noDelete && id === 5059) {messageRecords = exports; restoreDeleted();}
        if ((features.noDelete || features.reviewDB || features.platformIndicators || features.hiddenChannels) && id === 1378) {userStore = exports.default; restoreDeleted();}
        if ((features.jumpToTop || features.messageHighlight) && id === 5057) msgStore = exports.default;
        if (features.noDelete && id === 5057) {
            msgStore = exports.default;
            exports = replaceValue(exports,"default",hookExport(hookExport(msgStore,"getMessage",retainedMessage),"getMessages",retainedMessages));
            restoreDeleted(); return exports;
        }
        if (features.quests && id === 7120) questAttach(exports.default);
        if (features.quests && id === 585) questsInit(exports.default);
        if (features.messageHighlight && id === 585 && exports && exports.default && !dispatcher)
            dispatcher = exports.default.dispatch.bind(exports.default);
        if ((features.noDelete || features.reviewDB || features.hiddenChannels) && id === 585) {
            dispatcher = exports.default.dispatch.bind(exports.default);
            return replaceValue(exports, "default", hookExport(exports.default, "dispatch", dispatchEvent));
        }
        if (features.hiddenChannels && [1086,1097].includes(id) && exports.Permissions) viewPermission = exports.Permissions.VIEW_CHANNEL;
        if (features.hiddenChannels && id === 1113) {
            exports = hookExport(exports, "transitionTo", hiddenNavigation);
            exports = hookExport(exports, "replaceWith", hiddenNavigation);
            return hookExport(exports, "transitionToGuild", hiddenGuildNavigation);
        }
        if (features.hiddenChannels && id === 4472) {
            // Lioncat6 finds permissions via findByProps("getChannelPermissions","can");
            // In 348.10 PermissionStore (4472) is the only module exporting both.
            // Candidate may be default export or the exports object itself.
            const candidate = exports && exports.default && typeof exports.default.can === "function" ? exports.default :
                exports && typeof exports.can === "function" ? exports : null;
            if (candidate) permissions = candidate;
            // Globally reveal VIEW_CHANNEL so Discord builds
            // real channel records (names) instead of obfuscated "hidden" stubs.
            // Message/voice access stays blocked via hiddenFetch/hiddenNavigation guards.
            // Use hookExport so frozen/sealed singletons are still patched via clone.
            try {
                if (candidate && !permissionsCanOrig) {
                    permissionsCanOrig = candidate.can.bind(candidate);
                    permissions = hookExport(hookExport(candidate, "can", hiddenCan), "canBasicChannel", hiddenCan);
                    return candidate === exports ? permissions : replaceValue(exports, "default", permissions);
                }
            } catch (_) {}
        }
        if (features.hiddenChannels && id === 4470) {
            const store = hookExport(hookExport(exports.default, "getChannels", hiddenDirectory), "getFirstChannel", hiddenFirstChannel);
            guildChannels = store;
            return replaceValue(exports, "default", store);
        }
        if (features.hiddenChannels && id === 2102 && exports && exports.default)
            return replaceValue(exports, "default", hookExport(exports.default, "getChannelId", hiddenSelectedChannel));
        if (features.jumpToTop && id === 8838) chatHeight = exports;
        if (features.jumpToTop && id === 11643) jumpPill = exports.default;
        // 348.10's arrow is a registered image asset: Metro exports the asset id itself, not a default.
        if (features.jumpToTop && id === 11644) jumpIcon = exports && typeof exports === "object" && "default" in exports ? exports.default : exports;
        if (features.jumpToTop && id === 11642) return hookComponent(exports, jumpButton);
        if (features.gestures && id === 7414) return hookExport(exports, "handleAddDefaultDoubleTapReaction", doubleTapMessage);
        // Discord's "double-tap to react" tips, reminders and banners would point at a gesture that now replies.
        if (features.gestures && id === 11105) return hookExport(exports, "DoubleTapEmojiEditNudge", hideWhenGestures);
        if (features.gestures && id === 9652) return hookExport(exports, "maybeShowDoubleTapReminderToast", (orig, self, args) => enabled("gestures") ? undefined : orig.apply(self, args));
        if (features.gestures && id === 11666) return hookExport(exports, "DoubleTapToReactChatInputBanner", hideWhenGestures);
        if (features.gestures && id === 1378) userStore = exports.default;
        if (features.gestures && id === 10905) return hookTapHandlers(exports);
        if (id === 6880) {
            let actions = exports.default;
            if (!actions) return exports;
            if (features.noDelete) actions = hookExport(actions, "deleteMessage", deleteMessage);
            // Split Large Messages wraps FreeNitro's hook (added below), so every part still gets its emoji links.
            const splitLater = features.splitMessages;
            if (features.hiddenChannels) actions = hookExport(actions, "fetchMessages", hiddenFetch);
            if (features.freeNitro) {
                actions = hookExport(actions, "sendMessage", sendMessage);
                actions = hookExport(actions, "_sendMessage", sendMessage);
                actions = hookExport(actions, "sendStickers", sendStickers);
            }
            if (splitLater) actions = hookExport(actions, "sendMessage", splitSend);
            msgActions = actions;
            return replaceValue(exports, "default", actions);
        }
        if (!features.freeNitro && !features.appIcons) return exports;
        if (id === 1378) userStore = exports.default;
        if (id === 13528) { emojiCatalog = exports; return hookExport(exports, "canUserUse", catalogEligibility); }
        if (features.freeNitro && id === 5772) emojiStore = exports.default;
        if (features.freeNitro && id === 5815) stickerStore = exports.default;
        if (id === 4491) {
            // The pinned build exports the capabilities on a default singleton;
            // named aliases are not used by its picker. Hook the inspected object.
            let capabilities = exports.default || exports;
            function patchCapability(key, setting) {
                premiumOriginal[key] = typeof capabilities[key] === "function" ? capabilities[key].bind(capabilities) : undefined;
                capabilities = hookExport(capabilities, key, premiumOverride(key, setting));
            }
            if (features.freeNitro) {
                patchCapability("canUseEmojisEverywhere", "emojis");
                patchCapability("canUseAnimatedEmojis", "emojis");
                // Keep sticker eligibility stock: only the inspected premium-only sendability result is relaxed.
                premiumOriginal.canUseCustomStickersEverywhere = typeof capabilities.canUseCustomStickersEverywhere === "function" ? capabilities.canUseCustomStickersEverywhere.bind(capabilities) : undefined;
            }
            if (features.appIcons) {
                patchCapability("canUsePremiumAppIcons", "appIcons");
                if (typeof exports.canUsePremiumAppIcons === "function" && exports.default)
                    exports = hookExport(exports, "canUsePremiumAppIcons", premiumOverride("canUsePremiumAppIcons", "appIcons"));
            }
            if (exports.default) exports = replaceValue(exports, "default", capabilities);
            else exports = capabilities;
        }
        if (features.freeNitro && id === 6756) {
            stickerRules = exports;
            exports = hookExport(exports, "getStickerSendability", sendability);
            exports = hookExport(exports, "isSendableSticker", sendableSticker);
            stickerRules = exports;
        }
        return exports;
    }

    function instrument(exports, depth) {
        if (!exports || (typeof exports !== "object" && typeof exports !== "function")) return exports;
        if (owns(exports, "createElement") && owns(exports, "useState")) React = exports;
        if (owns(exports, "View") && owns(exports, "Text") && owns(exports, "Modal")) RN = exports;
        if (typeof data(exports, "getSize") === "function" && typeof data(exports, "readFile") === "function" &&
            typeof data(exports, "writeFile") === "function") initFiles(exports);
        if (features.voice && owns(exports, "CloudUpload")) instrumentCloudUpload(exports.CloudUpload);
        const changes = new Map();
        let proxy = exports;
        if (features.picker) {
            const patched = pickerComponent(exports);
            if (patched !== exports) return patched;
        }
        // Invocation-scoped captures also work when Hermes eval disables block scoping.
        // The binding check fails fast at hook time (caught as "Hook unavailable",
        // leaving the module stock) instead of crashing the app at call time.
        function replacementFor(operation, orig) {
            if (typeof operation !== "function" || typeof orig !== "function")
                throw new Error("Venus: unusable export binding for hook");
            return function () { return operation(orig, this === proxy ? exports : this, arguments); };
        }
        // Only read explicitly identified export keys, never enumerate or invoke unrelated getters.
        for (const key of ["getAttachmentPayload", "post"]) {
            if (!owns(exports, key)) continue;
            if (key === "getAttachmentPayload" && !features.voice) continue;
            if (key === "post" && (!features.voice || !owns(exports, "get") || !owns(exports, "put"))) continue;
            let orig;
            try { orig = exports[key]; } catch (_) { continue; }
            if (typeof orig !== "function") continue;
            const operation = key === "post" ? postRequest : attachmentPayload;
            const patched = replacementFor(operation, orig);
            changes.set(key, patched);
            if (key === "post") status.request = true;
            if (key === "getAttachmentPayload") status.attachment = true;
        }
        if (depth < 2) for (const key of ["default", "HTTP"]) {
            // Data exports only: default getters can be cyclic during module initialization.
            const candidate = data(exports, key);
            if (!candidate || candidate === exports) continue;
            const patched = instrument(candidate, depth + 1);
            if (patched !== candidate) changes.set(key, patched);
        }
        if (!changes.size) return exports;
        // Preserve module identity and cached aliases wherever descriptors allow it.
        for (const [key, patched] of Array.from(changes)) {
            const descriptor = Object.getOwnPropertyDescriptor(exports, key);
            if (descriptor && descriptor.configurable) {
                Object.defineProperty(exports, key, { value: patched, writable: true,
                    configurable: true, enumerable: descriptor.enumerable });
                changes.delete(key);
            } else if (descriptor && "value" in descriptor && descriptor.writable) {
                exports[key] = patched;
                changes.delete(key);
            }
        }
        if (!changes.size) return exports;
        // Only immutable accessor exports need a proxy; never inspect them during RN initialization.
        // Do not violate Proxy invariants on non-writable, non-configurable data properties.
        for (const key of Array.from(changes.keys())) {
            const descriptor = Object.getOwnPropertyDescriptor(exports, key);
            if (descriptor && !descriptor.configurable && "value" in descriptor && !descriptor.writable)
                changes.delete(key);
        }
        proxy = new Proxy(exports, { get(target, key, self) {
            return changes.has(key) ? changes.get(key) : Reflect.get(target, key, self);
        } });
        return changes.size ? proxy : exports;
    }
    function activateModule(id, module) {
        try {
            if (id === 1163) {
                const nativeFiles = module.exports.default;
                if (nativeFiles && typeof nativeFiles.getSize === "function" &&
                    typeof nativeFiles.readFile === "function" && typeof nativeFiles.writeFile === "function")
                    initFiles(nativeFiles);
            }
            module.exports = activatePlugins(id, module.exports);
            if ([17, 19, 414, 1163, 1283, 5440, 5442].includes(id)) module.exports = instrument(module.exports, 0);
        } catch (error) {
            status.audioError = "Hook unavailable: " + String(error);
            if (global.console && typeof global.console.warn === "function")
                global.console.warn("[Venus] Hook unavailable", String(error));
        }
    }
    function decorateDefine(define) {
        if (typeof define !== "function") return define;
        return function (factory, id, dependencies) {
            // Runs for all ~17.7k modules at startup: no arguments copy for the ones Venus leaves alone.
            if ((id !== 120 && !targetModules.has(id)) || typeof factory !== "function")
                return arguments.length === 3 ? define.call(this, factory, id, dependencies) : define.apply(this, arguments);
            const args = Array.from(arguments);
            args[0] = function () {
                const factoryArgs = Array.from(arguments);
                if (features.hiddenChannels && id === 6952) {
                    factoryArgs[1] = listImport(factoryArgs[1]);
                    factoryArgs[2] = listImport(factoryArgs[2]);
                    factoryArgs[3] = listImport(factoryArgs[3]);
                }
                const result = factory.apply(this, factoryArgs);
                const module = arguments[4]; // Verified Metro factory ABI in Discord 348.10.
                if (module && module.exports) {
                    // Before anything reads them: DraftStore keeps its length cap from the moment it loads.
                    if (features.splitMessages && id === 1086) { try { lengthConstants(module.exports); } catch (_) {} }
                    if (features.accountSwitcher && id === 11801) { try { multiAccountConstants(module.exports); } catch (_) {} }
                    if (id === 120) {
                        const initialize = module.exports.default;
                        let initializing = false;
                        if (typeof initialize === "function") module.exports.default = function () {
                            // Original errors propagate unchanged; only the outer successful init is ready.
                            if (initializing) return initialize.apply(this, arguments);
                            initializing = true;
                            let value;
                            try { value = initialize.apply(this, arguments); }
                            finally { initializing = false; }
                            environmentReady = true;
                            for (const [pendingId, pending] of deferred) activateModule(pendingId, pending);
                            deferred.clear();
                            return value;
                        };
                    } else if (!environmentReady) deferred.set(id, module);
                    else activateModule(id, module);
                }
                return result;
            };
            return define.apply(this, args);
        };
    }
    // Discord's bundle reads global __d once per module (~17.7k times at startup). Once Metro has set it,
    // it's a plain value again, so those reads aren't getter calls. Setting it again still decorates it.
    function holdDefine(value) {
        Object.defineProperty(global, "__d", { configurable: true, enumerable: true,
            get: () => value, set: next => { defineValue(decorateDefine(next)); } });
    }
    function defineValue(value) {
        Object.defineProperty(global, "__d", { configurable: true, enumerable: true, writable: true, value });
    }
    const existing = global.__d;
    if (typeof existing === "function") defineValue(decorateDefine(existing));
    else holdDefine(existing);
    // Local diagnostics/test API; not a network endpoint and no client-mod globals.
    global.__venusPatches = Object.freeze({ revision, settings, features, status, setSetting, formatSize, getSize });
})(globalThis);
