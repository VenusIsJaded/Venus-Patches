/* Venus Patches: bundled, offline runtime. No remote code or full client mod required. */
(function (global) {
    "use strict";
    if (global.__venusPatches) return;
    const features = /*__FEATURES__*/;
    // Inspected Metro IDs for the SHA-256-pinned 347.12 bundle; never scan or eagerly require modules.
    const targetModules = new Set([17, 19, 1151, 11754, 14892, 14993]);
    function selectModules(ids) { ids.forEach(id => targetModules.add(id)); }
    if (features.picker) selectModules([414]);
    if (features.voice) selectModules([1271, 5375, 5377]);
    if (features.copyBios) selectModules([11503]);
    if (features.dashless) selectModules([4941]);
    if (features.favouriteAnything) selectModules([13288, 10661, 10664]);
    if (features.freeNitro) selectModules([1372, 2041, 5708, 5751, 4446, 14280, 7611, 7730]);
    if (features.noTyping) selectModules([12272]);
    if (features.quickDelete) selectModules([5141, 1115]);
    if (features.noDelete) selectModules([573, 5008, 5010, 1372, 7730, 8222]);
    if (features.jumpToTop) selectModules([12549, 12550, 12551, 9686, 10518, 11207, 7730, 2041]);
    if (features.hiddenChannels) selectModules([1074, 1085, 1101, 2041, 2096, 7802, 4427, 4428, 4941, 7730, 573, 1372, 16569, 5345]);
    if (features.pastelize) selectModules([8222, 1240, 2105]);
    if (features.platformIndicators) selectModules([4828, 4806, 1372, 2041, 11448, 11159, 13603, 16377, 9970, 14405, 13348]);
    if (features.reviewDB) selectModules([13373, 14273, 14479, 9358, 5936, 7477, 1372, 573]);
    const revision = "1.3.1";
    // Module 120 owns setUpDefaltReactNativeEnvironment in this exact asset.
    // Defer every feature hook until that initializer returns successfully.
    let environmentReady = false;
    const deferred = new Map();
    const settings = { picker: true, voice: false, copyBios: true, dashless: true, favouriteAnything: true, emojis: true, stickers: true, hyperlinks: true, forceLinks: false,
        noTyping: true, quickDelete: false, quickDeleteEmbeds: false, noDelete: false, noDeleteSave: false, noDeleteLimit: 512,
        jumpToTop: true, hiddenChannels: false, pastelize:true, pastelAll:false, pastelWebhookName:true, pastelContent:false, platformIndicators:true, piDmHeader:true, piUserList:true, piProfile:true, piHideMobile:true, reviewDB:false, reviewThemedSend:true, reviewWarning:true };
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
    const notify = key => listeners.forEach(entry => {
        if (!entry.key || key === "*" || entry.key === key) entry.fn();
    });
    const data = (obj, key) => {
        const descriptor = obj && Object.getOwnPropertyDescriptor(obj, key);
        return descriptor && "value" in descriptor ? descriptor.value : undefined;
    };
    const owns = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
    const enabled = key => features[featureFor(key)] && settings[key];

    function save() {
        if (!files || status.storage === "loading") return;
        // Keep only the newest waiting snapshot, not one Promise/string per toggle.
        nextSave = JSON.stringify(features.reviewDB && reviewToken && reviewAccount ? Object.assign({}, settings, {reviewAuth:{account:reviewAccount, token:reviewToken}}) : settings);
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
    function deleteLimit(value) { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? Math.min(MAX_DELETED, n) : 512; }
    function setSetting(key, value) {
        if (!owns(settings, key) || !features[featureFor(key)]) return false;
        if (key === "noDeleteLimit") {
            settings.noDeleteLimit = deleteLimit(value); dirty.add(key); trimDeleted(); save(); notify(key); return true;
        }
        if (settings[key] === !!value && status.storage !== "loading" && status.storage !== "waiting") return true;
        value = !!value;
        if (key === "reviewDB" && !value) { reviewAuthAttempt++; reviewCache.clear(); }
        if (key === "voice" && !value) activeJobs.forEach(job => {
            job.cancelled = true;
            nativeVoice("cancel", job.id).catch(() => {});
        });
        if (key === "noDelete" && !value) clearDeleted(true);
        if (key === "hiddenChannels") {hiddenViews.clear();}
        settings[key] = value;
        if (key === "noDeleteSave") { if (value) restoreDeleted(); else archiveRestored = false; persistDeleted(); }
        dirty.add(key);
        if (key === "picker" && !value) {
            clearSizes();
        }
        save();
        notify(key);
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
                    if (!dirty.has(key) && typeof loaded[key] === typeof settings[key]) settings[key] = key === "noDeleteLimit" ? deleteLimit(loaded[key]) : loaded[key];
                const auth = loaded.reviewAuth;
                // Restore a saved ReviewDB sign-in (a ReviewDB token, never the Discord token).
                if (features.reviewDB && !reviewToken && auth && typeof auth.token === "string" && auth.token.length <= 8192 &&
                    typeof auth.account === "string" && /^\d{17,20}$/.test(auth.account)) { reviewToken = auth.token; reviewAccount = auth.account; }
            }
            status.storage = "ready";
            if (!enabled("picker")) clearSizes();
            // Persist edits made while the asynchronous restore was in flight.
            if (dirty.size) save();
            restoreDeleted();
            notify("*");
        }).catch(() => { status.storage = "read failed (defaults)"; if (dirty.size) save(); notify("*"); });
    }

    function formatSize(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return "";
        if (bytes === 0) return "0 B";
        const units = ["B", "KiB", "MiB", "GiB", "TiB"];
        const unit = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
        return Number((bytes / Math.pow(1024, unit)).toFixed(2)) + " " + units[unit];
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
    function SizeBadge(props) {
        useSettings("picker");
        const [bytes, update] = React.useState(null);
        React.useEffect(() => {
            let live = true;
            update(null);
            if (enabled("picker")) getSize(props.uri).then(value => { if (live) update(value); });
            return () => { live = false; };
        }, [props.uri, settings.picker]);
        if (!enabled("picker") || bytes === null || !RN) return null;
        return el(RN.View, {
            pointerEvents: "none",
            style: { position: "absolute", top: 3, left: 3, borderRadius: 4,
                backgroundColor: "#17181ccc", paddingHorizontal: 4, paddingVertical: 2 }
        }, el(RN.Text, {
            style: { color: "white", fontSize: 10, fontWeight: "700", includeFontPadding: false }
        }, formatSize(bytes)));
    }
    function pickerProps(props) {
        if (!enabled("picker") || !React || !RN || !props) return props;
        const first = Array.isArray(props.children) ? props.children[0] : props.children;
        const uri = first && first.props && first.props.localImageSource && first.props.localImageSource.uri;
        if (typeof uri !== "string") return props;
        return Object.assign({}, props, { children: el(RN.View, {
            style: { position: "relative" }, pointerEvents: "box-none"
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
    function isAudio(upload) {
        if (!upload || upload.spoiler) return false;
        const item = upload.item || {};
        const mime = upload.mimeType || item.mimeType || "";
        if (mime.startsWith("audio/") || ["application/ogg","application/x-ogg","application/x-flac"].includes(mime.toLowerCase())) return true;
        if (mime && mime !== "application/octet-stream") return false;
        return /\.(mp3|mp2|mpga|m4a|m4b|aac|wav|wave|flac|ogg|oga|opus|amr|awb|3ga|3gp|3gpp|aif|aiff|aifc|wma|ac3|eac3|caf|weba|alac)$/i.test(upload.filename || item.filename || "");
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
                !Number.isSafeInteger(result.size) || !(result.size > 0) || typeof result.waveform !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.waveform) || !result.waveform || result.waveform.length > 344)
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
            if (!job.cancelled && RN && RN.Alert) RN.Alert.alert("Voice conversion unavailable",
                status.audioError + "\nThis file will be uploaded normally instead.");
            return orig.apply(upload, args);
        }).finally(() => { activeJobs.delete(upload); });
        job.promise = promise;
        conversions.set(upload, job);
        return promise;
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
        for (const key of ["cancel", "delete"]) {
            const method = prototype[key];
            if (typeof method !== "function") continue;
            prototype[key] = function () {
                const job = conversions.get(this);
                if (job) {
                    job.cancelled = true;
                    nativeVoice("cancel", job.id).catch(() => {});
                }
                return method.apply(this, arguments);
            };
        }
        status.conversion = true;
    }
    function attachmentPayload(orig, self, args) {
        const result = orig.apply(self, args);
        const metadata = readyUploads.get(args[0]);
        if (!enabled("voice") || !metadata || !result || typeof result !== "object") return result;
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
        if (!request || typeof request.url !== "string" || !/^\/channels\/\d+\/messages$/.test(request.url))
            return orig.apply(self, args);
        const body = request.body;
        if (!body || !Array.isArray(body.attachments) || ((Number(body.flags) || 0) & 8192))
            return orig.apply(self, args);
        const markers = body.attachments.map(attachment => attachment &&
            (markedPayloads.get(attachment) || pendingVoice.get(attachment.uploaded_filename)));
        if (!markers.some(Boolean)) return orig.apply(self, args);
        const eligible = enabled("voice") && body.attachments.length === 1 && markers[0] &&
            !body.content && !(body.sticker_ids && body.sticker_ids.length) &&
            !(body.embeds && body.embeds.length) && !body.poll;
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
    const featureFor = key => key === "reviewThemedSend" || key === "reviewWarning" ? "reviewDB" : key === "emojis" || key === "stickers" || key === "hyperlinks" || key === "forceLinks" ? "freeNitro" : key === "quickDeleteEmbeds" ? "quickDelete" : key === "noDeleteSave" || key === "noDeleteLimit" ? "noDelete" : /^pi[A-Z]/.test(key) ? "platformIndicators" : ["pastelAll","pastelWebhookName","pastelContent"].includes(key) ? "pastelize" : key;
    function section(label, keys) { return { label, settings: keys }; }
    function settingsPage(sections) {
        const node = { type: "list", sections };
        return function VenusSettingsPage() {
            return React && SettingsList ? el(SettingsList, { node }) : null;
        };
    }
    function settingNode(key, title, description, parent) {
        return { type: "toggle", parent, useTitle: () => title, useDescription: () => description,
            useValue: function () { useSettings(key); return settings[key]; },
            onValueChange: value => setSetting(key, value) };
    }
    function nativeRegistry(registry) {
        if (!registry || !registry.ACCOUNT || registry.VENUS_GENERAL) return registry;
        const next = Object.assign({}, registry);
        const icon = registry.ACCOUNT.IconComponent;
        function route(key, title, sections, parent) {
            const page = settingsPage(sections);
            next[key] = { type: "route", parent, useTitle: () => title, IconComponent: icon,
                screen: { route: key, getComponent: () => page } };
        }
        next.VENUS_VERSION = { type: "static", parent: "VENUS_GENERAL", useTitle: () => "Venus " + revision,
            useDescription: function () { useSettings(); return "Preferences: " + status.storage + (status.archive ? "\nDeleted archive: " + status.archive : "") + (status.audioError ? "\n" + status.audioError : ""); } };
        route("VENUS_GENERAL", "General", [section("About", ["VENUS_VERSION"])]);
        const plugins = [];
        function plugin(key, title, hint) {
            if (!features[key]) return;
            const id = "VENUS_" + key.toUpperCase(); plugins.push(id);
            next[id] = settingNode(key, title, hint, "VENUS_PLUGINS");
        }
        plugin("picker", "FileSizeOnPicker", "Show cached local file sizes on media-picker thumbnails.");
        plugin("voice", "Custom voice messages", "Convert one audio attachment to Ogg/Opus. Android 10+; no accompanying text.");
        plugin("noTyping", "No typing", "Hide your outgoing typing status. Incoming indicators remain unchanged.");
        if (features.noDelete) {
            plugins.push("VENUS_NODELETE");
            route("VENUS_NODELETE", "NoDelete", [section("NoDelete", [])], "VENUS_PLUGINS");
            next.VENUS_NODELETE.screen.getComponent = () => NoDeleteSettings;
        }
        plugin("jumpToTop", "JumpToTop", "Add a button to jump to the start of the current chat.");
        plugin("hiddenChannels", "Hidden Channels", "Show received channel/category names with native locks. Server-redacted names are unavailable; never grants message or voice access.");
        if (features.quickDelete) {
            plugins.push("VENUS_QUICKDELETE");
            route("VENUS_QUICKDELETE", "QuickDelete", [section("Confirmation", ["VENUS_QUICKDELETE_MESSAGES", "VENUS_QUICKDELETE_EMBEDS"])], "VENUS_PLUGINS");
            next.VENUS_QUICKDELETE_MESSAGES = settingNode("quickDelete", "Delete messages without confirmation", "Off by default. Deletion cannot be undone.", "VENUS_QUICKDELETE");
            next.VENUS_QUICKDELETE_EMBEDS = settingNode("quickDeleteEmbeds", "Remove embeds without confirmation", "Only the embed-removal confirmation is skipped.", "VENUS_QUICKDELETE");
        }
        plugin("pastelize", "Pastelize", "Stable pastel colors for uncolored chat names and mentions. Existing role colors are preserved.");
        plugin("pastelAll", "Pastelize all names", "Override role name colors with pastel colors.");
        plugin("pastelWebhookName", "Pastelize webhooks by name", "Use the display name instead of the webhook ID.");
        plugin("pastelContent", "Pastelize message content", "Color rendered text as well as the author name.");
        if (features.platformIndicators) {
            const P = "VENUS_PLATFORMINDICATORS"; plugins.push(P);
            route(P, "PlatformIndicators", [section("PlatformIndicators", ["VENUS_PI_ENABLED"]),
                section("Show icons", ["VENUS_PI_DM", "VENUS_PI_LIST", "VENUS_PI_PROFILE"]), section("Options", ["VENUS_PI_MOBILE"])], "VENUS_PLUGINS");
            next.VENUS_PI_ENABLED = settingNode("platformIndicators", "Enable PlatformIndicators", "Desktop, mobile, web, console and VR status icons, like the original plugin.", P);
            next.VENUS_PI_DM = settingNode("piDmHeader", "Show icons on the DM top bar", "", P);
            next.VENUS_PI_LIST = settingNode("piUserList", "Show icons on the users and DMs list", "Members, friends, DMs and voice users.", P);
            next.VENUS_PI_PROFILE = settingNode("piProfile", "Show icons on user profiles", "", P);
            next.VENUS_PI_MOBILE = settingNode("piHideMobile", "Hide mobile status from the normal indicator", "Plain status dot instead of Discord's phone badge on avatars.", P);
        }
        if (features.reviewDB) {
            plugins.push("VENUS_REVIEWDB");
            route("VENUS_REVIEWDB", "ReviewDB", [section("ReviewDB", ["VENUS_REVIEWDB_ENABLED"])], "VENUS_PLUGINS");
            next.VENUS_REVIEWDB_ENABLED = settingNode("reviewDB", "Enable ReviewDB", "Show community reviews on profiles and servers. Opening a list shares that ID with manti.vendicated.dev.", "VENUS_REVIEWDB");
            next.VENUS_REVIEWDB.screen.getComponent = () => ReviewSettings;
        }
        plugin("copyBios", "CopyBios", "Select and copy text from profile bios.");
        plugin("dashless", "Dashless", "Display spaces instead of dashes in text channel names.");
        plugin("favouriteAnything", "FavouriteAnything", "Favourite images and videos from the media viewer.");
        if (features.freeNitro) {
            plugins.push("VENUS_FREENITRO");
            route("VENUS_FREENITRO", "FreeNitro", [section("Sharing", ["VENUS_EMOJIS", "VENUS_STICKERS"]),
                section("Options", ["VENUS_HYPERLINKS", "VENUS_FORCELINKS"])], "VENUS_PLUGINS");
            next.VENUS_EMOJIS = settingNode("emojis", "FreeMoji / Free emojis", "Share unavailable custom emojis as image links, not native emojis.", "VENUS_FREENITRO");
            next.VENUS_STICKERS = settingNode("stickers", "Free stickers", "Share external PNG/APNG/GIF stickers as links. APNG previews may be static; Lottie is not converted.", "VENUS_FREENITRO");
            next.VENUS_HYPERLINKS = settingNode("hyperlinks", "Compact links", "Use the emoji or sticker name as link text.", "VENUS_FREENITRO");
            next.VENUS_FORCELINKS = settingNode("forceLinks", "Always use links", "Use links even when the item can be sent natively.", "VENUS_FREENITRO");
        }
        route("VENUS_PLUGINS", "Plugins", [section("Installed", plugins)]);
        status.menu = true;
        return next;
    }
    function settingsSections(orig, self, args) {
        const config = args[0];
        if (!status.menu || !config || !Array.isArray(config.sections)) return orig.apply(self, args);
        const index = config.sections.findIndex(s => s && Array.isArray(s.settings) && s.settings.includes("ACCOUNT"));
        if (index < 0 || config.sections.some(s => s && s.label === "Venus")) return orig.apply(self, args);
        const sections = config.sections.slice();
        sections.splice(index + 1, 0, section("Venus", ["VENUS_GENERAL", "VENUS_PLUGINS"]));
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
    function channelLabel(orig, self, args) {
        const channel=args[0], locked=hiddenMetadata(channel), next=Array.from(args);
        if (locked) {
            // Formatter-only facade avoids Discord's OBFUSCATED label branch while
            // preserving its escaping, category casing and the real model/flags.
            next[0]=cloneWith(cloneWith(channel,"name",hiddenName(channel)),"isObfuscated",()=>false);
        }
        const name=orig.apply(self,next);
        return enabled("dashless") && channel && [0, 5, 15, 16].includes(channel.type) && typeof name === "string" ? name.replace(/-/g, " ") : name;
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
        if (!nativeCapabilities && enabled("emojis") && user && args[1] && args[1].id === user.id &&
            (feature === emojiCatalog.EMOJIS_EVERYWHERE || feature === emojiCatalog.ANIMATED_EMOJIS)) return true;
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
        return settings.hyperlinks && name ? "[" + String(name).replace(/([\\\[\]()*_`<>@])/g, "\\$1").replace(/[\r\n]/g, " ") + "](" + uri + ")" : uri;
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
            if (!settings.forceLinks && (everywhere || emoji.guildId === channel.guild_id) && (!(animation || emoji.animated) || animated)) return match;
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
        return !settings.forceLinks && sticker && sticker.available !== false &&
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
    let permissionsCanOrig = null, permissionsCanBasicOrig = null;
    let deletedRevision = 0, archiveRestored = false, archiveLoading = false, archiveWriting = false, archivePending;
    const deletedViews = new Map();
    const ARCHIVE = "venus-deleted-messages.json";
    const deleted = new Map(), deletedByChannel = new Map(), ownDeletes = new Map();
    let archiveTimer;
    const hiddenViews = new Map(), hiddenNames = new Map();
    let hiddenAccount;
    function receivedName(channel) {
        if (!channel || typeof channel.name !== "string") return null;
        const trimmed = channel.name.trim();
        if (!trimmed) return null;
        // Server redactions: "hidden", "__hidden__", "_hidden" and underscore variants (HBC string 34016).
        // Strip surrounding underscores and compare case-insensitively so redacted stubs never pollute the cache.
        if (trimmed.replace(/^_+|_+$/g, "").toLowerCase() === "hidden") return null;
        // Never cache our own unavailable facades as if they were real names.
        if (trimmed === "Hidden channel (name unavailable)" || trimmed === "Hidden category (name unavailable)") return null;
        return channel.name;
    }
    function rememberChannelName(channel, accountId) {
        const current = userStore && userStore.getCurrentUser(), owner = typeof accountId === "string" ? accountId : current && current.id;
        if (hiddenAccount !== owner) {hiddenNames.clear();hiddenAccount = owner;}
        const name = receivedName(channel);
        if (!channel || !channel.guild_id || !channel.id || !name) return;
        if (hiddenNames.size >= 4096 && !hiddenNames.has(channel.id)) hiddenNames.delete(hiddenNames.keys().next().value);
        hiddenNames.set(channel.id,{guild:channel.guild_id,name});
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
        if (name) {rememberChannelName(Object.assign({},channel,{name}));return name;}
        const cached = hiddenNames.get(channel.id);
        return cached && cached.guild === channel.guild_id ? cached.name : channel.type === 4 ? "Hidden category (name unavailable)" : "Hidden channel (name unavailable)";
    }
    function channelMetadataEvent(event) {
        const current = userStore && userStore.getCurrentUser();
        // This hook runs BEFORE UserStore handles READY. Scope its metadata to
        // the incoming user, otherwise the first post-READY lookup erases it.
        const owner = event.type === "CONNECTION_OPEN" && event.user && event.user.id || current && current.id;
        if (event.type === "LOGOUT" || hiddenAccount !== owner) {
            hiddenNames.clear();hiddenViews.clear();hiddenAccount = owner;
            try { hiddenConfirmed.clear(); hiddenPrompts.clear(); } catch (_) {}
        }
        if (event.type === "CHANNEL_DELETE") hiddenNames.delete(event.channel && event.channel.id || event.channelId || event.id);
        if (event.type === "GUILD_DELETE") {
            const guild = event.guild && event.guild.id || event.guildId;
            for (const [id,entry] of hiddenNames) if (entry.guild === guild) hiddenNames.delete(id);
        }
        if (!features.hiddenChannels) return;
        // Cache even while the toggle is off so enabling later still has READY names.
        if (["CHANNEL_CREATE","CHANNEL_UPDATE"].includes(event.type)) rememberChannelName(event.channel,owner);
        function rememberGuild(guild) {
            if (!guild || !guild.id) return;
            for (const key of ["channels","threads"]) if (Array.isArray(guild[key]))
                guild[key].forEach(channel => rememberChannelName(Object.assign({guild_id:guild.id},channel),owner));
        }
        if (["GUILD_CREATE","GUILD_UPDATE"].includes(event.type)) rememberGuild(event.guild);
        if (["CONNECTION_OPEN","CONNECTION_OPEN_SUPPLEMENTAL"].includes(event.type) && Array.isArray(event.guilds)) event.guilds.forEach(rememberGuild);
        if (["CHANNEL_UPDATES","THREAD_LIST_SYNC"].includes(event.type)) {
            for (const key of ["channels","threads"]) if (Array.isArray(event[key]))
                event[key].forEach(channel => rememberChannelName(Object.assign({guild_id:event.guildId},channel),owner));
        }
        // Real unobfuscated names arrive inside message mention_channels (fn34524/fn35281):
        // harvest them so mentioned hidden channels resolve even when stores are redacted.
        if (["MESSAGE_CREATE","MESSAGE_UPDATE"].includes(event.type)) {
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
        if (enabled("quickDelete") && matches("AMvpS4") || enabled("quickDeleteEmbeds") && matches("vXZ+Fo"))
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
        // Your own sent messages are kept too (red outline), like the original NoDelete.
        if (!message) return false;
        if (message.state != null && message.state !== "SENT") return false;
        return !((Number(message.flags) || 0) & 64);
    }
    function persistDeleted() {
        // Coalesce bursts (raids, purges) into one archive write instead of one full
        // serialization per deleted message.
        if (!files || status.storage === "loading" || !(settings.noDeleteSave || archiveRestored || status.archive)) return;
        if (archiveTimer !== undefined) return;
        archiveTimer = later(() => { archiveTimer = undefined; writeArchive(); }, 750);
    }
    function writeArchive() {
        if (!files || status.storage === "loading") return;
        const user = userStore && userStore.getCurrentUser && userStore.getCurrentUser();
        if (settings.noDeleteSave && (!user || !archiveRestored)) return;
        try {
            archivePending = JSON.stringify({version:1, accountId:settings.noDeleteSave && user ? user.id : null,
                messages:settings.noDeleteSave ? Array.from(deleted.values()).map(entry => ({channelId:entry.channelId,id:entry.id,message:entry.raw})) : []});
            if (archivePending.length > ARCHIVE_BYTES) throw new Error("Deleted message archive exceeds 8 MiB");
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
        if (!enabled("noDeleteSave") || !files || !messageRecords || archiveRestored || archiveLoading || status.storage === "loading") return;
        const user = userStore && userStore.getCurrentUser && userStore.getCurrentUser();
        const constants = files.getConstants && files.getConstants();
        if (!user || !constants || typeof constants.DocumentsDirPath !== "string") return;
        const accountId = user.id, path = constants.DocumentsDirPath.replace(/\/$/, "") + "/" + ARCHIVE;
        archiveLoading = true;
        Promise.resolve().then(() => files.fileExists(path)).then(exists => exists ? files.readFile(path,"utf8") : null).then(text => {
            const current = userStore.getCurrentUser();
            if (!enabled("noDeleteSave") || !current || current.id !== accountId) return;
            if (text) {
                if (text.length > ARCHIVE_BYTES) throw new Error("Archive too large");
                const saved = JSON.parse(text);
                if (saved.version !== 1 || !Array.isArray(saved.messages) || saved.messages.length > MAX_DELETED) throw new Error("Invalid archive");
                if (saved.accountId === accountId) saved.messages.forEach(entry => {
                    if (!entry || typeof entry.id !== "string" || typeof entry.channelId !== "string" || !entry.message || entry.message.id !== entry.id || entry.message.channel_id !== entry.channelId || !entry.message.author) return;
                    const key = deletedKey(entry.channelId,entry.id);
                    if (deleted.size < settings.noDeleteLimit && !deleted.has(key)) {
                        try { entry.message = Object.assign({},entry.message); keepDeleted(key,{type:"MESSAGE_DELETE",channelId:entry.channelId,id:entry.id,raw:entry.message,message:markDeleted(messageRecords.createMessageRecord(entry.message))}); }
                        catch (_) { /* Invalid individual records do not poison the archive. */ }
                    }
                });
            }
            archiveRestored = true; invalidateDeleted(); persistDeleted();
            if (msgStore && typeof msgStore.emitChange === "function") msgStore.emitChange();
        }).catch(() => {status.archive = "restore failed"; notify();}).finally(() => {archiveLoading = false;});
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
    function rawDeleted(message, event) {
        // Retain content/metadata only; no tokens, downloaded attachments or remote fetches.
        const raw = {id:event.id,channel_id:event.channelId,content:message.content || "",author:message.author,
            timestamp:message.timestamp && typeof message.timestamp.toISOString === "function" ? message.timestamp.toISOString() : message.timestamp,
            type:message.type || 0,flags:message.flags || 0,attachments:message.attachments || [],embeds:message.embeds || [],
            mentions:message.mentions || [],mention_roles:message.mentionRoles || [],referenced_message:null};
        return JSON.parse(JSON.stringify(raw));
    }
    function trimDeleted() {
        let changed = false;
        while (deleted.size > settings.noDeleteLimit) {
            const pending = dropDeleted(deleted.keys().next().value);
            if (!pending) break;
            changed = true;
            if (dispatcher) dispatcher({type:"MESSAGE_DELETE",channelId:pending.channelId,id:pending.id});
        }
        if (changed) { invalidateDeleted(); persistDeleted(); }
    }
    function clearDeleted(remove) {
        const events = Array.from(deleted.values());
        deleted.clear(); deletedByChannel.clear(); invalidateDeleted();
        if (remove && dispatcher) events.forEach(entry => dispatcher({type:"MESSAGE_DELETE",channelId:entry.channelId,id:entry.id}));
        if (remove) persistDeleted();
    }
    function retainedMessage(orig, self, args) {
        const result = orig.apply(self,args);
        const entry = enabled("noDelete") && deleted.get(deletedKey(args[0],args[1]));
        return entry ? entry.message : result;
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
        // Never paste a retained message into a window that doesn't contain its position;
        // that produced out-of-place rows above unloaded history or below an older jump.
        const records = [];
        bucket.forEach(entry => {
            const id = String(entry.id);
            if (first !== null && /^\d+$/.test(id) && /^\d+$/.test(first)) {
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
            copy._array.sort((a,b) => {
                const left = String(a.id), right = String(b.id);
                if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) return 0;
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
        let raw;
        try { raw = rawDeleted(message,event); } catch (_) { raw = null; }
        keepDeleted(key,{type:"MESSAGE_DELETE",channelId:event.channelId,id:event.id,message:markDeleted(message),raw});
        invalidateDeleted(); persistDeleted();
        // Update the underlying collection too: native row diffing compares record identity.
        // The retained view supplies a new record; do not corrupt content to force a diff.
        // The store's own MESSAGE_UPDATE change re-renders; never emitChange mid-dispatch.
        return orig.call(self,{type:"MESSAGE_UPDATE",message:{id:event.id,channel_id:event.channelId,content:message.content || ""}}) || true;
    }
    function dispatchEvent(orig, self, args) {
        const event = args[0];
        if (!event) return orig.apply(self, args);
        if (features.hiddenChannels) channelMetadataEvent(event);
        if (event.type === "LOGOUT") { clearDeleted(false); archiveRestored = false; clearReviewAuth(); }
        if (["CONNECTION_OPEN", "CACHE_LOADED"].includes(event.type)) Promise.resolve().then(restoreDeleted);
        // Views are keyed by the store's own ChannelMessages identity, so unrelated events
        // (typing, presence, reactions) no longer force a re-merge and re-sort of every chat.
        if (event.type === "CHANNEL_DELETE") {
            const id = event.channel && event.channel.id || event.channelId || event.id, bucket = deletedByChannel.get(id);
            if (bucket) { Array.from(bucket.keys()).forEach(dropDeleted); invalidateDeleted(); persistDeleted(); }
        }
        if (!enabled("noDelete")) return orig.apply(self, args);
        if (event.type === "MESSAGE_DELETE" && event.channelId && event.id) {
            const key = deletedKey(event.channelId, event.id);
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
    function deleteMessage(orig, self, args) {
        const key = deletedKey(args[0], args[1]), event = deleted.get(key);
        if (event && dispatcher) {
            dropDeleted(key); invalidateDeleted(); persistDeleted(); dispatcher({type:"MESSAGE_DELETE",channelId:event.channelId,id:event.id});
            return Promise.resolve(); // Dismiss locally; never DELETE an already-deleted message on the server.
        }
        // The gateway echo of your own deletion can arrive before the HTTP response.
        if (ownDeletes.size >= 64) ownDeletes.delete(ownDeletes.keys().next().value);
        ownDeletes.set(key, Date.now());
        const forget = () => later(() => ownDeletes.delete(key), 30000, false); // bounded to 64 keys without timers
        let result;
        try { result = orig.apply(self, args); } catch (error) { ownDeletes.delete(key); throw error; }
        if (result && typeof result.then === "function") result.then(forget, () => ownDeletes.delete(key)); else forget();
        return result;
    }
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
        const onPress = () => msgActions.jumpToMessage({channelId, messageId:channelId, flash:true, jumpType:"ANIMATED"});
        const child = result && result.props && result.props.children;
        if (child && child.props && typeof child.props.onPress === "function") {
            const top = React.cloneElement(child, {key:"venus-jump-top", onPress, accessibilityLabel:"Jump to top"});
            return React.cloneElement(result, {children:el(RN.View, {style:{gap:8}},
                el(RN.View, {style:{transform:[{scaleY:-1}]}}, top), child)});
        }
        if (result || !jumpPill || !jumpIcon) return result;
        // Never render bare black text over chat/media. Use Discord's themed native pill.
        const bottom = Math.max(0,Number.isFinite(inputHeight) ? inputHeight : 64) + Math.max(0,Number(suggestionHeight) || 0) + 12;
        return el(RN.View, {pointerEvents:"box-none", style:{position:"absolute",bottom,right:16}},
            el(RN.View,{style:{transform:[{scaleY:-1}]}},
                el(jumpPill,{icon:jumpIcon,onPress,accessibilityLabel:"Jump to top"})));
    }
    function hiddenCan(orig, self, args) {
        const bit = args && args[0], channel = args && args[1];
        if (!enabled("hiddenChannels")) return orig.apply(self, args);
        // Original plugin's escape hatch: realCheck asks for the true result.
        if (channel && channel.realCheck) return orig.apply(self, args);
        // Loose equality: VIEW_CHANNEL can be BigInt/object across module copies.
        if (viewPermission != null && bit == viewPermission && channel && channel.guild_id && ![1,3].includes(channel.type)) {
            let hidden = false;
            try { hidden = !realCan(bit, channel); } catch (_) { hidden = false; }
            if (hidden) return true;
        }
        return orig.apply(self, args);
    }
    // The mobile list has a second VIEW_CHANNEL filter. Give ONLY that factory a
    // metadata-list facade; the real permission store and all other callers stay stock.
    function listImport(importer) {
        if (typeof importer !== "function") return importer;
        return function () {
            const result = importer.apply(this,arguments);
            if (!result || ![2041,4427,4428].includes(arguments[0])) return result;
            const real = result.default || result;
            if (arguments[0] === 2041) {
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
                if (bit === viewPermission && hiddenMetadata(channel)) return true;
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
        // Supports the original plugin's realCheck escape hatch.
        if (channel && channel.realCheck) {
            const clone = Object.assign({}, channel);
            delete clone.realCheck;
            try {
                if (permissionsCanOrig) return permissionsCanOrig(bit, clone);
                if (permissions && typeof permissions.can === "function") return permissions.can.call(permissions, bit, clone);
            } catch (_) { return false; }
            return false;
        }
        try {
            if (permissionsCanOrig) return permissionsCanOrig(bit, channel);
            if (permissions && typeof permissions.can === "function") return permissions.can.call(permissions, bit, channel);
        } catch (_) { return false; }
        return false;
    }
    function hiddenMetadata(value) {
        if (!enabled("hiddenChannels")) return false;
        const channel = typeof value === "string" ? receivedChannel(value) : value;
        return !!(channel && channel.guild_id && ![1,3].includes(channel.type) &&
            permissions && viewPermission != null && !realCan(viewPermission, channel));
    }
    function hiddenChannel(value) {
        const channel = typeof value === "string" ? receivedChannel(value) : value;
        return !!(channel && channel.type !== 4 && hiddenMetadata(channel));
    }
    function displayChannel(channel) {
        if (!hiddenMetadata(channel)) return channel;
        const name = hiddenName(channel);
        return name === channel.name ? channel : cloneWith(channel,"name",name);
    }
    function hiddenDirectory(orig, self, args) {
        const result = orig.apply(self, args), guild = args[0];
        // Always cache names from the current store even while the toggle is off,
        // so enabling later still resolves. This read-only scan never changes permissions.
        try {
            if (guild && channelStore && typeof channelStore.getMutableGuildChannelsForGuild === "function") {
                const fullCache = channelStore.getMutableGuildChannelsForGuild(guild);
                if (fullCache) {
                    const basicCache = typeof channelStore.getMutableBasicGuildChannelsForGuild === "function" && channelStore.getMutableBasicGuildChannelsForGuild(guild);
                    const src = basicCache ? Object.assign({},basicCache,fullCache) : fullCache;
                    if (basicCache) Object.values(basicCache).forEach(rememberChannelName);
                    Object.values(src).forEach(rememberChannelName);
                }
            }
        } catch (_) {}
        if (!enabled("hiddenChannels") || !result || !guild || !channelStore || !permissions ||
            typeof channelStore.getMutableGuildChannelsForGuild !== "function") return result;
        const full = channelStore.getMutableGuildChannelsForGuild(guild);
        if (!full) return result;
        const basic = typeof channelStore.getMutableBasicGuildChannelsForGuild === "function" && channelStore.getMutableBasicGuildChannelsForGuild(guild);
        // Native lazy caching keeps basic metadata for channels with no full record.
        // Merge by ID, with full records retaining their richer native prototype.
        const source = basic ? Object.assign({},basic,full) : full;
        if (basic) Object.values(basic).forEach(rememberChannelName);
        Object.values(source).forEach(rememberChannelName);
        const extra = Object.values(source).filter(channel => hiddenMetadata(channel));
        // Recheck permissions and metadata on each directory lookup; retain stable
        // array identity for unchanged inputs and bound the cache to 16 guilds.
        const signature = extra.map(c => [c.id,c.position,c.type,c.parent_id,hiddenName(c)].join(":")).join("|");
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
                added.push({channel:displayChannel(channel),comparator:channel.position || 0});
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
    function hiddenFetch(orig, self, args) {
        const channelId = typeof args[0] === "string" ? args[0] : args[0] && args[0].channelId;
        if (!hiddenChannel(channelId) || hiddenConfirmed.has(channelId)) return orig.apply(self, args);
        const channel = receivedChannel(channelId);
        showHidden(channel, () => { hiddenConfirmed.add(channelId); return orig.apply(self, args); });
        return Promise.resolve();
    }
    function preciseAgo(ms) {
        // Precise relative durations like the original popup, but exact:
        // "8 days, 7 hours and 7 minutes ago". Three largest nonzero units.
        if (!Number.isFinite(ms)) return null;
        let diff = Date.now() - ms;
        if (diff < 0) diff = 0;
        const minute = 60000, hour = 60 * minute, day = 24 * hour, month = 30 * day, year = 365 * day;
        const parts = [];
        function take(unit, singular, plural) {
            const value = Math.floor(diff / unit);
            if (value > 0) { parts.push(value + " " + (value === 1 ? singular : plural)); diff -= value * unit; }
        }
        if (diff < 45 * 1000) {
            const secs = Math.floor(diff / 1000);
            return secs <= 5 ? "just now" : secs + " seconds ago";
        }
        take(year, "year", "years"); take(month, "month", "months"); take(day, "day", "days");
        take(hour, "hour", "hours"); take(minute, "minute", "minutes");
        const shown = parts.slice(0, 3);
        if (!shown.length) return "just now";
        if (shown.length === 1) return shown[0] + " ago";
        return shown.slice(0, -1).join(", ") + " and " + shown[shown.length - 1] + " ago";
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
            ["Created", hiddenStamp(channel.id, "Unavailable")],
            ["Last message", last ? hiddenStamp(last, "No messages yet") : {relative:"No messages yet", absolute:null}],
            ["Last pin", pin ? hiddenStamp(pin, "No pins yet") : {relative:"No pins yet", absolute:null}]
        ];
    }
    function HiddenDetails(props) {
        // Rendered inside Discord's own AlertModal (HBC98 module 5146) as extraContent:
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
        const title = channel.type === 2 || channel.type === 13 ? "Locked voice channel" : "Locked channel";
        const body = "You don't have permission to view this channel. These details come from what Discord already sent your client.";
        // Discord's native alert (the "Delete Message" dialog): blurred backdrop,
        // themed card, Discord buttons. String title/body/confirmText + children
        // selects the modern AlertModal path in AlertActionCreators.show (module 5141).
        // Demand-loaded at tap time: no extra Metro factories are wrapped at startup.
        const alerts = inspectedExport(5141, "default");
        const Text = inspectedExport(4784, "Text");
        if (React && alerts && typeof alerts.show === "function" && Text) {
            try {
                alerts.show({title, body, children:el(HiddenDetails, {rows, Text}),
                    confirmText:"View Anyway", cancelText:"Cancel", onConfirm:confirm, onCancel:settle});
                return;
            } catch (_) { /* fall through to the platform alert */ }
        }
        if (!RN.Alert) {settle();return;}
        const message = rows.map(([label, stamp]) => label + ": " + stamp.relative + (stamp.absolute ? " (" + stamp.absolute + ")" : "")).join("\n");
        try {
            RN.Alert.alert(title, message, [
                {text:"Cancel", style:"cancel", onPress:settle},
                {text:"View Anyway", onPress:confirm}
            ], {cancelable:true, onDismiss:settle});
        } catch (_) { settle(); }
    }
    function hiddenNavigation(orig, self, args) {
        const route = args[0];
        const match = typeof route === "string" && /^\/channels\/(?:@me|[^/]+)\/([^/?#]+)(?:[/?#]|$)/.exec(route);
        if (!match || !hiddenChannel(match[1]) || hiddenConfirmed.has(match[1])) return orig.apply(self, args);
        const id = match[1];
        showHidden(receivedChannel(id), () => { hiddenConfirmed.add(id); return orig.apply(self, args); });
        return; // Wait for user choice; View Anyway navigates like the original plugin.
    }
    function hiddenGuildNavigation(orig, self, args) {
        if (!hiddenChannel(args[1]) || hiddenConfirmed.has(args[1])) return orig.apply(self, args);
        const id = args[1];
        showHidden(receivedChannel(id), () => { hiddenConfirmed.add(id); return orig.apply(self, args); });
    }
    function sheetComponent(component, channel, onClose) {
        if (!component || !React) return component;
        function transform(orig, self, args) {
            const tree = orig.apply(self, args);
            return addJumpRow(tree, channel, onClose);
        }
        if (typeof component === "function") return function () { return transform(component, this, arguments); };
        if (component.$$typeof) {
            const key = component.type ? "type" : "render";
            const child = sheetComponent(component[key], channel, onClose);
            return child === component[key] ? component : cloneWith(component, key, child);
        }
        return component;
    }
    function addJumpRow(tree, channel, onClose) {
        let added = false;
        return cloneTree(tree, function (node, props) {
            if (added || !Array.isArray(props.children)) return props;
            const template = props.children.find(child => child && child.props && typeof child.props.label === "string" && typeof child.props.onPress === "function");
            if (!template || props.children.some(child => child && child.key === "venus-jump-top")) return props;
            added = true;
            const row = React.cloneElement(template, {key:"venus-jump-top",label:"Jump to top",icon:undefined,
                onPress:function () {
                    if (typeof onClose === "function") onClose();
                    msgActions.jumpToMessage({channelId:channel.id,messageId:channel.id,flash:true,jumpType:"ANIMATED"});
                }});
            return Object.assign({}, props, {children:[row].concat(props.children)});
        }, 0);
    }
    function jumpSheet(orig, self, args) {
        const tree = orig.apply(self, args), props = args[0];
        if (!enabled("jumpToTop") || !React || !tree || !props || !msgActions) return tree;
        const channel = props.thread || props.channel || channelStore && channelStore.getChannel(props.channelId);
        if (!channel || ![0,1,3,5,10,11,12].includes(channel.type) || hiddenChannel(channel)) return tree;
        // ChannelLongPressActionSheet returns a connected component. Preserve its
        // React tags and patch its render, not the exports object or frozen element.
        const transformed = addJumpRow(tree, channel, props.onClose);
        if (transformed !== tree) return transformed;
        const type = sheetComponent(tree.type, channel, props.onClose);
        return type === tree.type ? tree : el(type, tree.props);
    }
    let pastelHash, guildMembers, presenceStore, sessionsStore, displayNameType, nativeRowGroup, nativeSwitchRow, nativeLock, oauthModal;
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
    function pastelColor(seed, saturation, lightness) {
        if (!pastelHash || !RN || typeof RN.processColor !== "function") return null;
        const hue = ((pastelHash(String(seed)) >>> 0) % 360) / 360;
        function component(offset) {
            const k = (offset + hue * 12) % 12;
            return Math.round(255 * (lightness - saturation * Math.min(lightness,1-lightness) * Math.max(-1,Math.min(k-3,9-k,1))));
        }
        const hex = "#" + [component(0),component(8),component(4)].map(value => value.toString(16).padStart(2,"0")).join("");
        return {hex, value:RN.processColor(hex)};
    }
    function pastelMentions(content, guildId) {
        if (!Array.isArray(content)) return content;
        let changed = false;
        const next = content.map(node => {
            if (!node || typeof node !== "object") return node;
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
            if (result !== node) changed = true;
            return result;
        });
        return changed ? next : content;
    }
    function pastelMessage(message, source) {
        if (!message || !message.authorId) return message;
        if (message.guildId && (!guildMembers || !guildMembers.getMember(message.guildId,message.authorId)) && !(source && source.webhookId)) return message;
        let next = Object.assign({},message,{shouldShowRoleOnName:true}), seed;
        if (source && source.webhookId) seed = settings.pastelWebhookName ? message.username : source.webhookId;
        else if (!(source && source.colorString != null ? source.colorString : message.roleColor) || settings.pastelAll) seed = message.authorId;
        const color = seed && pastelColor(seed,0.75,0.6);
        if (color) next = Object.assign({},message,{roleColor:color.value,usernameColor:color.value,colorString:color.value,shouldShowRoleOnName:true});
        const content = pastelMentions(message.content,message.guildId);
        if (content !== message.content) next = Object.assign({},next,{content});
        if (color && settings.pastelContent && Array.isArray(next.content)) next = Object.assign({},next,{content:[{
            type:"link",target:"usernameOnClick",content:next.content,context:{username:1,medium:true,
                usernameOnClick:{action:"0",userId:"0",messageChannelId:"0",linkColor:pastelColor(seed,0.85,0.75).value}}}]});
        return next;
    }
    function messageRow(orig, self, args) {
        const result = orig.apply(self,args), row = args[0];
        if (!result || !row || row.rowType !== 1 || !result.message) return result;
        let message = result.message;
        if (enabled("pastelize")) {
            message = pastelMessage(message,row.message);
            if (message.referencedMessage && message.referencedMessage.message) message = Object.assign({},message,{referencedMessage:
                Object.assign({},message.referencedMessage,{message:pastelMessage(message.referencedMessage.message,null)})});
        }
        let next = message === result.message ? result : Object.assign({},result,{message});
        const source = row.message || message;
        const channelId = source.channel_id || source.channelId || message.channelId;
        const id = source.id || message.id;
        if (enabled("noDelete") && deleted.has(deletedKey(channelId,id)) && RN && typeof RN.processColor === "function") {
            // Native row highlight schema from 8227. No injected notice, altered
            // message content, or AutoMod state. Only retained local rows are tinted.
            const red = RN.processColor("#f23f43");
            next = Object.assign({},next,{backgroundHighlight:{backgroundColor:RN.processColor("#f23f431a"),gutterColor:red}});
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
    function PlatformBadges(props) {
        useSettings("platformIndicators");
        const [,update] = React.useState(0);
        // SessionsStore is the upstream source for the current user's own clients.
        if (enabled("platformIndicators")) {
            if (!sessionsStore) sessionsStore = inspectedExport(4806,"default");
            if (!presenceStore) presenceStore = inspectedExport(4828,"default");
            if (!userStore) userStore = inspectedExport(1372,"default");
        }
        React.useEffect(() => {
            const change = () => update(n => n+1);
            const stores = [presenceStore,sessionsStore].filter(store => store && typeof store.addChangeListener === "function" && typeof store.removeChangeListener === "function");
            stores.forEach(store => store.addChangeListener(change));
            return () => stores.forEach(store => store.removeChangeListener(change));
        },[presenceStore,sessionsStore]);
        if (!enabled("platformIndicators") || !presenceStore || !RN) return null;
        let clients = presenceStore.getClientStatus(props.userId);
        const current = userStore && userStore.getCurrentUser();
        if (current && current.id === props.userId && sessionsStore && typeof sessionsStore.getSessions === "function") {
            clients = {};
            Object.values(sessionsStore.getSessions() || {}).forEach(session => {
                const client = session.clientInfo && session.clientInfo.client;
                if (client && client !== "unknown") clients[client] = session.status;
            });
        }
        if (!clients) return null;
        const colors = {online:"#23a55a",idle:"#f0b232",dnd:"#f23f43"};
        const labels = {desktop:"Desktop",mobile:"Mobile",web:"Web",embedded:"Console",vr:"VR"};
        // Like the original: one icon per reported client, in presence order.
        const icons = Object.keys(clients).filter(key => key !== "unknown" && colors[clients[key]]).map(key =>
            el(RN.View,{key,accessible:true,accessibilityRole:"image",accessibilityLabel:(labels[key] || key)+": "+clients[key]},
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
    const platformTitleTypes = new WeakMap();
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
                let type = platformTitleTypes.get(node.type);
                if (!type) { const target = node.type; type = function () { return platformPlacement(target,this,arguments,"piDmHeader"); }; platformTitleTypes.set(target,type); }
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
    const platformRowTypes = new WeakMap();
    function platformRow(row) {
        // Swap a list row's private UserRow for a cached wrapper adding badges after its label.
        if (!row || typeof row !== "object" || typeof row.type !== "function" || !React) return row;
        let type = platformRowTypes.get(row.type);
        if (!type) { const orig = row.type; type = function () { return platformPlacement(orig,this,arguments,"piUserList"); }; platformRowTypes.set(orig,type); }
        return el(type,Object.assign({},row.props,{key:row.key}));
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
        const icon = nativeLock || inspectedExport(5345,"LockIcon");
        if (!icon) return tree;
        // Lock next to hidden names, like the original plugin (20px lock, right margin).
        return el(RN.View,{style:{flexDirection:"row",alignItems:"center"},accessibilityLabel:hiddenName(channel)+", locked"},
            el(icon,{color:"#80848e",style:{width:20,height:20,marginRight:4}}),tree);
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
        // Credentials go in the Authorization header like current Vencord, never in
        // JSON bodies (which proxies and error reporters are more likely to log).
        const token = method && method !== "GET" ? reviewAuth() : "";
        const headers = {accept:"application/json","content-type":"application/json",...(token ? {authorization:token} : {})};
        return reviewJson(REVIEW_API+path,{method:method || "GET",headers,...(body ? {body:JSON.stringify(body)} : {})});
    }
    function clearReviewAuth() {
        reviewAuthAttempt++;reviewToken="";reviewAccount=null;reviewAuthState="idle";reviewAuthError="";
        reviewCache.clear();save();notify("reviewDB");
    }
    function useReviews() {
        useSettings("reviewDB");
        React.useEffect(() => {
            const store=userStore;
            if (!store || typeof store.addChangeListener!=="function") return;
            function changed() {reviewAuth();notify("reviewDB");}
            store.addChangeListener(changed);
            return () => {if (typeof store.removeChangeListener==="function") store.removeChangeListener(changed);};
        },[userStore]);
    }
    function currentId() { const user=userStore && userStore.getCurrentUser(); return user && user.id; }
    // Discord design-system parts traced in the pinned HBC98 bundle. Demand-loaded at
    // render/action time only; no extra Metro factories are wrapped for them.
    const reviewExports=new Map();
    function reviewUI() {
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
        try { const t=typeof global.__r==="function" && global.__r(576); tokens=t && (t.default || t); } catch (_) {}
        const parts={TableRow:x(5854,"TableRow"),TableRowGroup:nativeRowGroup || x(5936,"TableRowGroup"),TableSwitchRow:nativeSwitchRow || x(7477,"TableSwitchRow"),
            Stack:x(5216,"Stack"),Card:x(7484,"default"),FormRow:x(8903,"FormRow"),FormLabel:x(8903,"FormLabel"),FormSubLabel:x(8903,"FormSubLabel"),
            TextInput:x(6880,"TextInput"),Send:x(4732,"SendMessageIcon"),ActionSheet:x(7474,"ActionSheet"),Header:x(7426,"BottomSheetTitleHeader"),
            Close:x(7475,"ActionSheetCloseButton"),sheets:x(4755,"default"),showSheet:x(4755,"showActionSheet"),simpleSheet:x(7472,"showSimpleActionSheet"),clipboard:x(7469,"Clipboard"),
            alerts:x(5141,"default"),toasts:x(4486,"default"),pushModal:x(4645,"pushModal"),popModal:x(4645,"popModal"),OAuth:oauthModal || x(9358,"default"),
            createStyles:x(4788,"createStyles"),theme:x(4505,"useThemeContext"),colors:tokens && tokens.colors};
        return parts;
    }
    function reviewToast(ui,content) {
        try { if (ui.toasts && typeof ui.toasts.open==="function") ui.toasts.open({key:"venus-reviewdb",content}); } catch (_) {}
    }
    function hideReviewSheet(ui,key) { try { if (ui.sheets && typeof ui.sheets.hideActionSheet==="function") ui.sheets.hideActionSheet(key); } catch (_) {} }
    // Styles from Discord's createStyles, as the original plugin: semantic tokens resolve
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
        const authenticated=!!reviewAuth(), pending=reviewAuthState==="exchanging";
        const Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow;
        const toggle=(key,label,subLabel) => Switch ? el(Switch,{key,label,subLabel,value:settings[key],onValueChange:value=>setSetting(key,value)}) : null;
        const groups=[
            el(Group,{key:"plugin",title:"ReviewDB"},toggle("reviewDB","Enable ReviewDB","Show community reviews on profiles and servers. Viewing one shares its ID with manti.vendicated.dev.")),
            el(Group,{key:"auth",title:"Authentication"},
                el(ui.TableRow,{key:"login",label:pending ? "Authenticating with ReviewDB..." : authenticated ? "Authenticated with ReviewDB" : "Authenticate with ReviewDB",
                    arrow:true,disabled:!enabled("reviewDB") || authenticated || pending,onPress:authenticateReviews,subLabel:reviewAuthError || undefined}),
                el(ui.TableRow,{key:"logout",label:"Log out of ReviewDB",variant:authenticated ? "danger" : undefined,disabled:!authenticated,onPress:clearReviewAuth,
                    subLabel:"Note that this does not remove ReviewDB from your Authorized Apps page in Discord."})),
            el(Group,{key:"settings",title:"Settings"},
                toggle("reviewThemedSend","Use profile-themed send button","Controls whether the review send button should attempt to match the user's profile colors."),
                toggle("reviewWarning","Show Warning","Show the warning to be respectful at the top of the reviews list."))];
        const body=ui.Stack ? el(ui.Stack,{style:{paddingVertical:24,paddingHorizontal:12},spacing:24},groups) :
            el(RN.View,{style:{paddingVertical:24,paddingHorizontal:12,gap:24}},groups);
        return RN.ScrollView ? el(RN.ScrollView,null,body) : body;
    }
    function NoDeleteSettings() {
        useSettings();
        const ui=reviewUI();
        const [draft,setDraft]=React.useState(String(settings.noDeleteLimit));
        if (!React || !RN) return null;
        const Group=ui.TableRowGroup || RN.View, Switch=ui.TableSwitchRow;
        const toggle=(key,label,subLabel) => Switch ? el(Switch,{key,label,subLabel,value:settings[key],onValueChange:value=>setSetting(key,value)}) : null;
        const commit=() => { setSetting("noDeleteLimit",draft); setDraft(String(settings.noDeleteLimit)); };
        const onText=text => setDraft(String(text).replace(/[^0-9]/g,"").slice(0,4));
        const inputProps={value:draft,keyboardType:"number-pad",maxLength:4,placeholder:"512",onBlur:commit,onSubmitEditing:commit,returnKeyType:"done"};
        // Discord's TextInput reports text via onChange(text); RN's via onChangeText.
        const input=ui.TextInput ? el(ui.TextInput,Object.assign({label:"Maximum saved messages",onChange:onText},inputProps)) :
            el(RN.TextInput,Object.assign({onChangeText:onText,style:{fontSize:16,padding:12}},inputProps));
        const groups=[
            el(Group,{key:"plugin",title:"NoDelete"},toggle("noDelete","Enable NoDelete","Keep deleted messages, including your own, with a red outline until you dismiss them.")),
            el(Group,{key:"save",title:"Saving"},toggle("noDeleteSave","Save permanently","On: kept messages survive restarts, stored locally for your account. Off: kept until Discord restarts; the saved archive is erased.")),
            el(Group,{key:"limit",title:"Maximum saved messages"},el(RN.View,{style:{padding:12,gap:8}},input,
                el(RN.Text,{style:{color:"#949ba4",fontSize:12}},"Type 1 to "+MAX_DELETED+", then press done. Current: "+settings.noDeleteLimit+". When full, the oldest is removed.")))];
        const body=ui.Stack ? el(ui.Stack,{style:{paddingVertical:24,paddingHorizontal:12},spacing:24},groups) :
            el(RN.View,{style:{paddingVertical:24,paddingHorizontal:12,gap:24}},groups);
        return RN.ScrollView ? el(RN.ScrollView,{keyboardShouldPersistTaps:"handled"},body) : body;
    }
    function authenticateReviews() {
        if (!enabled("reviewDB") || reviewAuthState==="exchanging") return;
        const ui=reviewUI();
        if (typeof ui.pushModal!=="function" || typeof ui.popModal!=="function" || !ui.OAuth) {RN.Alert.alert("ReviewDB","Discord's authorization screen is unavailable. Reopen this page and try again.");return;}
        const accountId=currentId();
        if (!accountId) {RN.Alert.alert("ReviewDB","Discord account unavailable");return;}
        const attempt=++reviewAuthAttempt, key="oauth2-authorize";
        let closed=false;
        reviewAuthError="";notify("reviewDB");
        const live=() => enabled("reviewDB") && attempt===reviewAuthAttempt && currentId()===accountId;
        const close=() => { if (closed) return; closed=true; try { ui.popModal(key); } catch (_) {} };
        function fail(error) {
            if (!live()) return;
            reviewAuthState="idle";reviewAuthError=String(error && error.message || error);notify("reviewDB");
            reviewToast(ui,"Authorization failed! "+reviewAuthError);
        }
        ui.pushModal({key,modal:{key,modal:ui.OAuth,animation:"slide-up",shouldPersistUnderModals:false,closable:true,props:{
            clientId:"915703782174752809",redirectUri:REVIEW_API+"/auth",scopes:["identify"],responseType:"code",permissions:BigInt(0),cancelCompletesFlow:false,
            // Traced in 347.12 (useOAuth2AuthorizeForm, fn124513): after Authorize the form calls
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
                    save();notify("reviewDB");reviewToast(ui,"Successfully authenticated with ReviewDB");
                }).catch(fail);
            }}}});
    }
    function reviewsFor(userId, refresh) {
        if (!/^\d{17,20}$/.test(userId)) return Promise.reject(new Error("Invalid profile ID"));
        const cached = reviewCache.get(userId);
        if (!refresh && cached && cached.expires>Date.now()) return cached.promise;
        if (reviewCache.size>=32) reviewCache.delete(reviewCache.keys().next().value);
        const promise=reviewRequest("/users/"+userId+"/reviews").then(result=>{
            if (!Array.isArray(result.reviews)) throw new Error("Invalid review list");
            return result.reviews.slice(0,100).filter(review=>review && review.sender && typeof review.comment==="string");
        }).catch(error=>{reviewCache.delete(userId);throw error;});
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
            if (ui.alerts && typeof ui.alerts.show==="function") try { ui.alerts.show({title,body:content,confirmText:"Yes",cancelText:"No",onConfirm}); return; } catch (_) {}
            RN.Alert.alert(title,content,[{text:"No",style:"cancel"},{text:"Yes",style:"destructive",onPress:onConfirm}]);
        }
        function mutate(path, method, body, done) {
            reviewRequest(path,method,body).then(result => {reviewCache.delete(owner);refetch();reviewToast(ui,result && result.message || done);},
                error => reviewToast(ui,String(error && error.message || error)));
        }
        const options=[{label:"Copy Text",onPress:() => {
            try { (ui.clipboard || RN.Clipboard).setString(review.comment); } catch (_) {}
            reviewToast(ui,"Copied Review Text");
        }}];
        if (reviewAuth() && !system) {
            if (sender.discordID===me || owner===me || reviewAdmins.has(me)) options.push({label:"Delete Review",isDestructive:true,
                onPress:() => confirm("Delete Review","Are you sure you want to delete this review?",() => mutate("/users/"+owner+"/reviews","DELETE",{reviewid:review.id},"Review deleted"))});
            options.push({label:"Report Review",isDestructive:true,
                onPress:() => confirm("Report Review","Are you sure you want to report this review?",() => mutate("/reports","PUT",{reviewid:review.id},"Review reported"))});
        }
        const title=system ? "ReviewDB System Message" : "Review by "+String(sender.username || "Unknown");
        if (typeof ui.simpleSheet==="function") try {
            ui.simpleSheet({key:"ReviewOverflow",header:{title,onClose:() => hideReviewSheet(ui)},options});return;
        } catch (_) {}
        RN.Alert.alert(title,undefined,options.map(option => ({text:option.label,style:option.isDestructive ? "destructive" : "default",onPress:option.onPress}))
            .concat([{text:"Cancel",style:"cancel"}]));
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
        const theme=reviewThemeHook ? reviewThemeHook() : null;
        const authenticated=!!reviewAuth(), canSend=authenticated && !busy && text.length>0;
        const placeholder=!authenticated ? "You must be authenticated to add a review." : "Tap to "+(props.shouldEdit ? "edit your" : "add a")+" review";
        function send() {
            if (!canSend || !text.trim()) return;
            setBusy(true);
            reviewRequest("/users/"+props.userId+"/reviews","PUT",{comment:text.trim()}).then(result => {
                setText("");props.refetch();reviewToast(ui,result && result.message || "Review posted");
            },error => reviewToast(ui,String(error && error.message || error))).then(() => setBusy(false));
        }
        const input=ui.TextInput ?
            el(ui.TextInput,{style:[{flex:1,fontSize:16},styles.text],isDisabled:!authenticated,placeholder,placeholderTextColor:styles.placeholder.color,
                value:text,onChange:setText,maxLength:1000}) :
            el(RN.TextInput,{style:[{flex:1,fontSize:16},styles.text],editable:authenticated,placeholder,placeholderTextColor:styles.placeholder.color,
                value:text,onChangeText:setText,maxLength:1000});
        const color=settings.reviewThemedSend && theme && theme.primaryColor || "#5865f2";
        return el(RN.View,{style:{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:8,paddingVertical:4}},
            el(RN.View,{style:{flex:1}},input),
            el(RN.Pressable,{accessibilityRole:"button",accessibilityLabel:props.shouldEdit ? "Update review" : "Send review",disabled:!canSend,onPress:send,
                style:{minHeight:40,minWidth:40,borderRadius:999,alignItems:"center",justifyContent:"center",backgroundColor:color,opacity:canSend ? 1 : 0.25}},
                ui.Send ? el(ui.Send,{size:"sm",color:"#ffffff"}) : el(RN.Text,{style:{color:"#ffffff",fontWeight:"700"}},">")));
    }
    function ReviewSection(props) {
        useReviews();
        const ui=reviewUI(), styles=useReviewStyles(ui), userId=props.userId;
        const [reviews,setReviews]=React.useState(null), [generation,reload]=React.useState(0);
        const valid=typeof userId==="string" && /^\d{17,20}$/.test(userId);
        React.useEffect(() => {
            let live=true;
            if (!enabled("reviewDB") || !valid) return;
            loadReviewAdmins();
            reviewsFor(userId,generation>0).then(list => {if (live) setReviews(list);},() => {if (live) setReviews(null);});
            return () => {live=false;};
        },[userId,generation,settings.reviewDB]);
        if (!enabled("reviewDB") || !valid || !RN || !ui.Card || !ui.FormRow) return null;
        const list=reviews || [], me=currentId();
        const shown=settings.reviewWarning ? list : list.filter(review => review.type!==3);
        const refetch=() => {reviewCache.delete(userId);reload(n => n+1);};
        return el(RN.View,{style:[styles.card]},
            el(ui.Card,{title:"Reviews"},
                el(RN.View,{style:{gap:8}},shown.map((review,index) => el(ReviewRow,{key:(review.id==null ? "" : String(review.id))+":"+index,review,owner:userId,ui,styles,refetch}))),
                el(ReviewInput,{userId,ui,styles,refetch,shouldEdit:list.some(review => review.type!==3 && review.sender.discordID===me)})));
    }
    function ReviewSheet(props) {
        const ui=reviewUI();
        return el(ui.ActionSheet,{header:ui.Header ? el(ui.Header,{title:"Reviews",trailing:ui.Close ? el(ui.Close,{onPress:() => hideReviewSheet(ui,props.sheetKey)}) : undefined}) : undefined},
            el(RN.View,null,el(RN.ScrollView,{style:{gap:12,marginBottom:12}},el(ReviewSection,{userId:props.userId}))));
    }
    function openReviewSheet(userId) {
        if (!enabled("reviewDB") || !React || !RN || typeof userId!=="string" || !/^\d{17,20}$/.test(userId)) return;
        const ui=reviewUI();
        if (!ui.ActionSheet || typeof ui.showSheet!=="function") { reviewToast(ui,"Reviews are unavailable. Reopen the server menu and try again."); return; }
        // 4755's NAMED showActionSheet (HBC fn32121) takes an already-created
        // element, then schedules SHOW_ACTION_SHEET through Dispatcher.wait.
        // Reviews are bundled, not lazy imports: avoid openLazy's detached Promise
        // chain entirely. The inspected store (fn31181) accepts "stack".
        const key="VenusReviews:"+userId;
        try { ui.showSheet({key,content:el(ReviewSheet,{userId,sheetKey:key}),stackingBehavior:"stack"}); }
        catch (error) { reviewToast(ui,"Couldn't open reviews: "+String(error && error.message || error)); }
    }
    // Profiles: the original appends ReviewSection as the LAST card of the profile card stack
    // (after the note). In 347.12 UserProfileNote (13373) is that last card in the normal, bot,
    // tabbed and You-screen layouts, so reviews render directly beneath it.
    function reviewNote(orig,self,args) {
        const tree=orig.apply(self,args), userId=args[0] && args[0].userId;
        if (!React || !RN || !features.reviewDB || typeof userId!=="string") return tree;
        return el(React.Fragment,null,tree,el(ReviewSection,{key:"venus-reviews:"+userId,userId}));
    }
    // Servers: like the original, the guild sheet's progress slot becomes a single "Reviews"
    // row that opens the reviews in an action sheet. Rendered as a child so hook order is stable.
    function reviewGuild(orig,self,args) {
        if (React) useSettings("reviewDB");
        const props=args[0] || {}, guild=props.guild, ui=reviewUI();
        if (!enabled("reviewDB") || !React || !RN || !guild || !/^\d{17,20}$/.test(guild.id) || !ui.TableRow) return React ? el(orig,props) : orig.apply(self,args);
        return el(ui.TableRowGroup || RN.View,null,el(ui.TableRow,{label:"Reviews",onPress:() => openReviewSheet(guild.id)}));
    }
    // User long-press context menu gets a "Reviews" item, as in the original plugin.
    function reviewMenu(orig,self,args) {
        const props=args[0], menu=props && props.menu, id=menu && menu.key;
        if (!enabled("reviewDB") || !menu || !Array.isArray(menu.items) || menu.items.length!==3 || typeof id!=="string" || !/^\d{17,20}$/.test(id)) return orig.apply(self,args);
        const next=Array.from(args);
        next[0]=Object.assign({},props,{menu:Object.assign({},menu,{items:menu.items.concat([{label:"Reviews",action:() => openReviewSheet(id)}])})});
        return orig.apply(self,next);
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
    function hookComponent(exports, operation) {
        const component = exports.default;
        if (component && typeof component === "object" && component.$$typeof) {
            const key = typeof component.type === "function" ? "type" : typeof component.render === "function" ? "render" : null;
            if (!key) return exports;
            const orig = component[key];
            const patched = function () { return operation(orig, this, arguments); };
            return replaceValue(exports, "default", cloneWith(component, key, patched));
        }
        return hookExport(exports, "default", operation);
    }
    function activatePlugins(id, exports) {
        // MurmurHashV3 is CommonJS (module.exports=function), not an ES default export.
        if (features.pastelize && id === 1240) pastelHash = typeof exports === "function" ? exports : exports.default;
        if (features.pastelize && id === 2105) guildMembers = exports.default;
        if ((features.pastelize || features.noDelete) && id === 8222 && exports.default && exports.default.prototype) hookExport(exports.default.prototype,"generate",messageRow);
        if (features.platformIndicators && id === 4828) presenceStore = exports.default;
        if (features.platformIndicators && id === 4806) sessionsStore = exports.default;
        if (features.platformIndicators && id === 11448) {
            displayNameType=exports.DisplayName;
            exports=hookExport(exports,"DisplayName",platformName);
            return hookComponent(exports,(orig,self,args)=>wrapProfileTree(orig.apply(self,args),displayNameType,platformName,platformWrappers));
        }
        if (features.platformIndicators && id === 13603) return hookComponent(exports,platformHeader);
        if (features.platformIndicators && id === 16377) return hookComponent(exports,platformDmRow);
        if (features.platformIndicators && [11159,9970].includes(id)) {
            const option = id === 13603 ? "piDmHeader" : "piUserList";
            return hookComponent(exports,(orig,self,args)=>platformPlacement(orig,self,args,option));
        }
        // Profile "in voice" users (UserProfileActivityVoiceChannelUsers): private UserRow rows.
        if (features.platformIndicators && id === 13348) return hookComponent(exports,(orig,self,args)=>{
            const tree=orig.apply(self,args);
            if (!enabled("platformIndicators") || !settings.piUserList || !React || !tree) return tree;
            return cloneTree(tree,(node,p)=>{
                if (typeof p.renderItem!=="function" || p.__venusPlatforms) return p;
                const render=p.renderItem;
                return Object.assign({},p,{__venusPlatforms:true,renderItem:function(){return platformRow(render.apply(this,arguments));}});
            },0);
        });
        // Original "Hide mobile status from the normal indicator": avatar Status (design/void/Status,
        // 14405) draws a phone badge when isMobileOnline; show the plain dot instead.
        if (features.platformIndicators && id === 14405) {
            const plain = (orig,self,args) => {
                const props = args[0];
                if (!enabled("platformIndicators") || !settings.piHideMobile || !props || !props.isMobileOnline) return orig.apply(self,args);
                const next = Array.from(args); next[0] = Object.assign({},props,{isMobileOnline:false}); return orig.apply(self,next);
            };
            return hookExport(hookExport(exports,"default",plain),"StatusWithTyping",plain);
        }
        if (features.reviewDB && id === 9358) oauthModal=exports.default;
        if (features.reviewDB && id === 5936) nativeRowGroup=exports.TableRowGroup;
        if (features.reviewDB && id === 7477) nativeSwitchRow=exports.TableSwitchRow;
        if (features.hiddenChannels && id === 5345) nativeLock=exports.LockIcon;
        if (features.hiddenChannels && id === 16569) {
            // ChannelInfo can be consumed as default export and as named export
            // (GuildRolesAndChannelsRow reads it by name); hook both.
            exports = hookComponent(exports,hiddenInfo);
            return hookExport(exports, "ChannelInfo", hiddenInfo);
        }
        if (features.reviewDB && id === 13373) return hookComponent(exports,reviewNote);
        if (features.reviewDB && id === 14479) return hookExport(exports,"ContextMenuPopout",reviewMenu);

        if (features.reviewDB && id === 14273) return hookComponent(exports,reviewGuild);
        if (id === 14892) exports.SETTING_RENDERER_CONFIG = nativeRegistry(exports.SETTING_RENDERER_CONFIG);
        if (id === 11754) return hookExport(exports, "createList", settingsSections);
        if (id === 14993) SettingsList = exports.SettingsList;
        if (features.copyBios && id === 11503) return hookComponent(exports, copyBio);
        if ((features.dashless || features.hiddenChannels) && id === 4941) {
            exports = hookExport(exports,"computeChannelName",channelLabel);
            return hookExport(exports, "default", channelLabel);
        }
        if (features.favouriteAnything && id === 13288) return hookComponent(exports, favouriteButton);
        if (features.favouriteAnything && id === 10661) return hookExport(exports, "addFavoriteGIF", favouriteAdd);
        if (features.favouriteAnything && id === 10664) return hookExport(exports, "useFavoriteGIFsMobile", favouriteList);
        if (id === 2041) channelStore = exports.default;
        if (features.noTyping && id === 12272) return replaceValue(exports, "default",
            hookExport(hookExport(exports.default, "startTyping", typing), "stopTyping", typing));
        if (features.quickDelete && id === 1115) locale = exports;
        if (features.quickDelete && id === 5141) return replaceValue(exports, "default", hookExport(exports.default, "show", quickConfirm));
        if (features.noDelete && id === 5010) {messageRecords = exports; restoreDeleted();}
        if ((features.noDelete || features.reviewDB || features.platformIndicators || features.hiddenChannels) && id === 1372) {userStore = exports.default; restoreDeleted();}
        if (features.noDelete && id === 5008) {
            msgStore = exports.default;
            exports = replaceValue(exports,"default",hookExport(hookExport(msgStore,"getMessage",retainedMessage),"getMessages",retainedMessages));
            restoreDeleted(); return exports;
        }
        if ((features.noDelete || features.reviewDB || features.hiddenChannels) && id === 573) {
            dispatcher = exports.default.dispatch.bind(exports.default);
            return replaceValue(exports, "default", hookExport(exports.default, "dispatch", dispatchEvent));
        }
        if (features.hiddenChannels && [1074,1085].includes(id) && exports.Permissions) viewPermission = exports.Permissions.VIEW_CHANNEL;
        if (features.hiddenChannels && id === 1101) {
            exports = hookExport(exports, "transitionTo", hiddenNavigation);
            exports = hookExport(exports, "replaceWith", hiddenNavigation);
            return hookExport(exports, "transitionToGuild", hiddenGuildNavigation);
        }
        if (features.hiddenChannels && (id === 4427 || id === 4428)) {
            // Lioncat6 finds permissions via findByProps("getChannelPermissions","can");
            // HBC fn4428 references both strings, so hook 4428 as well as 4427.
            // Candidate may be default export or the exports object itself.
            const candidate = exports && exports.default && typeof exports.default.can === "function" ? exports.default :
                exports && typeof exports.can === "function" ? exports : null;
            if (candidate) permissions = candidate;
            // Like the original plugin: globally reveal VIEW_CHANNEL so Discord builds
            // real channel records (names) instead of obfuscated "hidden" stubs.
            // Message/voice access stays blocked via hiddenFetch/hiddenNavigation guards.
            // Use hookExport so frozen/sealed singletons are still patched via clone.
            try {
                if (permissions && typeof permissions.can === "function" && !permissionsCanOrig) {
                    permissionsCanOrig = permissions.can.bind(permissions);
                    if (typeof permissions.canBasicChannel === "function") permissionsCanBasicOrig = permissions.canBasicChannel.bind(permissions);
                    const patched = hookExport(hookExport(permissions, "can", hiddenCan), "canBasicChannel", hiddenCan);
                    permissions = patched;
                    if (candidate === exports.default || (exports && exports.default && candidate === permissions)) {
                        exports = replaceValue(exports, "default", patched);
                    } else if (candidate === exports) {
                        exports = patched;
                    }
                    return exports;
                } else if (candidate && candidate !== permissions && typeof candidate.can === "function") {
                    // Second permission object (4428 vs 4427): patch it too with same bypass.
                    const patched2 = hookExport(hookExport(candidate, "can", hiddenCan), "canBasicChannel", hiddenCan);
                    if (candidate === exports.default) exports = replaceValue(exports, "default", patched2);
                    else if (candidate === exports) exports = patched2;
                    return exports;
                }
            } catch (_) {}
        }
        if (features.hiddenChannels && id === 2096) return replaceValue(exports, "default", hookExport(exports.default, "getChannels", hiddenDirectory));
        if (features.jumpToTop && id === 9686) chatHeight = exports;
        if (features.jumpToTop && id === 12550) jumpPill = exports.default;
        if (features.jumpToTop && id === 12551) jumpIcon = exports.default;
        if (features.jumpToTop && id === 12549) return hookComponent(exports, jumpButton);
        if (features.jumpToTop && [10518,11207].includes(id)) return hookComponent(exports, jumpSheet);
        if (id === 7730) {
            let actions = exports.default;
            if (!actions) return exports;
            if (features.noDelete) actions = hookExport(actions, "deleteMessage", deleteMessage);
            if (features.hiddenChannels) actions = hookExport(actions, "fetchMessages", hiddenFetch);
            if (features.freeNitro) {
                actions = hookExport(actions, "sendMessage", sendMessage);
                actions = hookExport(actions, "_sendMessage", sendMessage);
                actions = hookExport(actions, "sendStickers", sendStickers);
            }
            msgActions = actions;
            return replaceValue(exports, "default", actions);
        }
        if (!features.freeNitro) return exports;
        if (id === 1372) userStore = exports.default;
        if (id === 14280) { emojiCatalog = exports; return hookExport(exports, "canUserUse", catalogEligibility); }
        if (id === 5708) emojiStore = exports.default;
        if (id === 5751) stickerStore = exports.default;
        if (id === 4446) {
            // The pinned build exports the capabilities on a default singleton;
            // named aliases are not used by its picker. Hook the inspected object.
            let capabilities = exports.default || exports;
            function patchCapability(key, setting) {
                premiumOriginal[key] = typeof capabilities[key] === "function" ? capabilities[key].bind(capabilities) : undefined;
                capabilities = hookExport(capabilities, key, premiumOverride(key, setting));
            }
            patchCapability("canUseEmojisEverywhere", "emojis");
            patchCapability("canUseAnimatedEmojis", "emojis");
            // Keep sticker eligibility stock: only the inspected premium-only sendability result is relaxed.
            premiumOriginal.canUseCustomStickersEverywhere = typeof capabilities.canUseCustomStickersEverywhere === "function" ? capabilities.canUseCustomStickersEverywhere.bind(capabilities) : undefined;
            if (exports.default) exports = replaceValue(exports, "default", capabilities);
            else exports = capabilities;
        }
        if (id === 7611) {
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
            if (id === 1151) {
                const nativeFiles = module.exports.default;
                if (nativeFiles && typeof nativeFiles.getSize === "function" &&
                    typeof nativeFiles.readFile === "function" && typeof nativeFiles.writeFile === "function")
                    initFiles(nativeFiles);
            }
            module.exports = activatePlugins(id, module.exports);
            if ([17, 19, 414, 1151, 1271, 5375, 5377].includes(id)) module.exports = instrument(module.exports, 0);
        } catch (error) {
            status.audioError = "Hook unavailable: " + String(error);
            if (global.console && typeof global.console.warn === "function")
                global.console.warn("[Venus] Hook unavailable", String(error));
        }
    }
    function decorateDefine(define) {
        if (typeof define !== "function") return define;
        return function (factory, id, dependencies) {
            if (typeof factory !== "function" || (!targetModules.has(id) && id !== 120)) return define.apply(this, arguments);
            const args = Array.from(arguments);
            args[0] = function () {
                const factoryArgs = Array.from(arguments);
                if (features.hiddenChannels && id === 7802) {
                    factoryArgs[1] = listImport(factoryArgs[1]);
                    factoryArgs[2] = listImport(factoryArgs[2]);
                    factoryArgs[3] = listImport(factoryArgs[3]);
                }
                const result = factory.apply(this, factoryArgs);
                const module = arguments[4]; // Verified Metro factory ABI in Discord 347.12.
                if (module && module.exports) {
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
    const existing = global.__d;
    let define = decorateDefine(existing);
    Object.defineProperty(global, "__d", { configurable: true, enumerable: true,
        get: () => define, set: value => { define = decorateDefine(value); } });
    // Local diagnostics/test API; not a network endpoint or a dependency on Vendetta globals.
    global.__venusPatches = Object.freeze({ revision, settings, features, status, setSetting, formatSize, getSize });
})(globalThis);
