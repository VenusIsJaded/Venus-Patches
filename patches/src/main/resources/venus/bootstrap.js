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
    if (features.hiddenChannels) selectModules([1074, 1085, 1101, 2041, 2096, 7802, 4427, 4941, 7730, 573, 1372, 16569, 5345]);
    if (features.pastelize) selectModules([8222, 1240, 2105]);
    if (features.platformIndicators) selectModules([4828, 4806, 1372, 2041, 11448, 7235, 9200, 9380, 11159, 13603, 16377, 9970]);
    if (features.reviewDB) selectModules([11502, 14273, 4645, 9358, 5854, 5936, 7477, 1372, 573, 4505]);
    const revision = "1.2.3";
    // Module 120 owns setUpDefaltReactNativeEnvironment in this exact asset.
    // Defer every feature hook until that initializer returns successfully.
    let environmentReady = false;
    const deferred = new Map();
    const settings = { picker: true, voice: false, copyBios: true, dashless: true, favouriteAnything: true, emojis: true, stickers: true, hyperlinks: true, forceLinks: false,
        noTyping: true, quickDelete: false, quickDeleteEmbeds: false, noDelete: false, noDeleteSave: false,
        jumpToTop: true, hiddenChannels: false, pastelize:true, pastelAll:false, pastelWebhookName:true, pastelContent:false, platformIndicators:true, reviewDB:false };
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
        nextSave = JSON.stringify(settings);
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
    function setSetting(key, value) {
        if (!owns(settings, key) || !features[featureFor(key)]) return false;
        if (settings[key] === !!value && status.storage !== "loading" && status.storage !== "waiting") return true;
        value = !!value;
        if (key === "reviewDB" && !value) clearReviewAuth();
        if (key === "voice" && !value) activeJobs.forEach(job => {
            job.cancelled = true;
            nativeVoice("cancel", job.id).catch(() => {});
        });
        if (key === "noDelete" && !value) clearDeleted(true);
        if (key === "hiddenChannels") {hiddenViews.clear();if (!value) hiddenNames.clear();}
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
                    if (!dirty.has(key) && typeof loaded[key] === "boolean") settings[key] = loaded[key];
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
    const featureFor = key => key === "emojis" || key === "stickers" || key === "hyperlinks" || key === "forceLinks" ? "freeNitro" : key === "quickDeleteEmbeds" ? "quickDelete" : key === "noDeleteSave" ? "noDelete" : ["pastelAll","pastelWebhookName","pastelContent"].includes(key) ? "pastelize" : key;
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
        plugin("noDelete", "NoDelete", "Retain deleted messages independently of chat updates until app restart. Maximum 512; disabling clears them.");
        plugin("noDeleteSave", "Save deleted messages", "Opt-in local archive across restarts, scoped to your account. Turning this off erases the archive. Attachments are links, not downloaded files.");
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
        plugin("platformIndicators", "PlatformIndicators", "Status-colored monitor, phone, web and console icons on profiles, DM headers/lists, friends and voice-member rows. Uses sessions for your own profile.");
        if (features.reviewDB) {
            plugins.push("VENUS_REVIEWDB");
            route("VENUS_REVIEWDB", "ReviewDB", [section("ReviewDB", ["VENUS_REVIEWDB_ENABLED"])], "VENUS_PLUGINS");
            next.VENUS_REVIEWDB_ENABLED = settingNode("reviewDB", "Enable ReviewDB", "User and server reviews from manti.vendicated.dev. Opening reviews shares that user/server ID. Sign-in is account-scoped and lasts until Discord closes; no credentials are saved.", "VENUS_REVIEWDB");
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
    let deletedRevision = 0, archiveRestored = false, archiveLoading = false, archiveWriting = false, archivePending;
    const deletedViews = new Map();
    const ARCHIVE = "venus-deleted-messages.json";
    const deleted = new Map();
    const hiddenViews = new Map(), hiddenNames = new Map();
    let hiddenAccount;
    function receivedName(channel) {
        return channel && typeof channel.name === "string" && channel.name.trim() && channel.name !== "__hidden__" ? channel.name : null;
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
        }
        if (event.type === "CHANNEL_DELETE") hiddenNames.delete(event.channel && event.channel.id || event.channelId || event.id);
        if (event.type === "GUILD_DELETE") {
            const guild = event.guild && event.guild.id || event.guildId;
            for (const [id,entry] of hiddenNames) if (entry.guild === guild) hiddenNames.delete(id);
        }
        if (!enabled("hiddenChannels")) return;
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
    function persistDeleted() {
        if (!files || status.storage === "loading") return;
        const user = userStore && userStore.getCurrentUser && userStore.getCurrentUser();
        if (settings.noDeleteSave && (!user || !archiveRestored)) return;
        try {
            archivePending = JSON.stringify({version:1, accountId:settings.noDeleteSave && user ? user.id : null,
                messages:settings.noDeleteSave ? Array.from(deleted.values()).map(entry => ({channelId:entry.channelId,id:entry.id,message:entry.raw})) : []});
            if (archivePending.length > 8 * 1024 * 1024) throw new Error("Deleted message archive exceeds 8 MiB");
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
                if (text.length > 8 * 1024 * 1024) throw new Error("Archive too large");
                const saved = JSON.parse(text);
                if (saved.version !== 1 || !Array.isArray(saved.messages) || saved.messages.length > 512) throw new Error("Invalid archive");
                if (saved.accountId === accountId) saved.messages.forEach(entry => {
                    if (!entry || typeof entry.id !== "string" || typeof entry.channelId !== "string" || !entry.message || entry.message.id !== entry.id || entry.message.channel_id !== entry.channelId || !entry.message.author) return;
                    const key = deletedKey(entry.channelId,entry.id);
                    if (deleted.size < 512 && !deleted.has(key)) {
                        try { entry.message = Object.assign({},entry.message); deleted.set(key,{type:"MESSAGE_DELETE",channelId:entry.channelId,id:entry.id,raw:entry.message,message:markDeleted(messageRecords.createMessageRecord(entry.message))}); }
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
        return Object.create(Object.getPrototypeOf(message),Object.getOwnPropertyDescriptors(message));
    }
    function rawDeleted(message, event) {
        // Retain content/metadata only; no tokens, downloaded attachments or remote fetches.
        const raw = {id:event.id,channel_id:event.channelId,content:message.content || "",author:message.author,
            timestamp:message.timestamp && typeof message.timestamp.toISOString === "function" ? message.timestamp.toISOString() : message.timestamp,
            type:message.type || 0,flags:message.flags || 0,attachments:message.attachments || [],embeds:message.embeds || [],
            mentions:message.mentions || [],mention_roles:message.mentionRoles || [],referenced_message:null};
        return JSON.parse(JSON.stringify(raw));
    }
    function clearDeleted(remove) {
        const events = Array.from(deleted.values());
        deleted.clear(); invalidateDeleted();
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
        const records = Array.from(deleted.values()).filter(entry => entry.channelId === channelId).map(entry => entry.message);
        if (!records.length || typeof result.merge !== "function") return result;
        const cached = deletedViews.get(channelId);
        if (cached && cached.orig === result && cached.revision === deletedRevision) return cached.value;
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
        if (!message) return false;
        if (deleted.size >= 512) {
            const oldest = deleted.keys().next().value, pending = deleted.get(oldest);
            deleted.delete(oldest);
            orig.call(self,{type:"MESSAGE_DELETE",channelId:pending.channelId,id:pending.id});
        }
        let raw;
        try { raw = rawDeleted(message,event); } catch (_) { raw = null; }
        deleted.set(key,{type:"MESSAGE_DELETE",channelId:event.channelId,id:event.id,message:markDeleted(message),raw});
        invalidateDeleted(); persistDeleted();
        // Update the underlying collection too: native row diffing compares record identity.
        // The retained view supplies a new record; do not corrupt content to force a diff.
        orig.call(self,{type:"MESSAGE_UPDATE",message:{id:event.id,channel_id:event.channelId,content:message.content || ""}});
        if (msgStore && typeof msgStore.emitChange === "function") msgStore.emitChange();
        return true;
    }
    function dispatchEvent(orig, self, args) {
        const event = args[0];
        if (!event) return orig.apply(self, args);
        if (features.hiddenChannels) channelMetadataEvent(event);
        if (event.type === "LOGOUT") { clearDeleted(false); archiveRestored = false; clearReviewAuth(); }
        if (["CONNECTION_OPEN", "CACHE_LOADED"].includes(event.type)) Promise.resolve().then(restoreDeleted);
        if (deleted.size && event.type !== "MESSAGE_DELETE") deletedViews.clear();
        if (event.type === "CHANNEL_DELETE") {
            const id = event.channel && event.channel.id || event.channelId || event.id;
            for (const [key, entry] of deleted) if (entry.channelId === id) deleted.delete(key);
            invalidateDeleted(); persistDeleted();
        }
        if (!enabled("noDelete")) return orig.apply(self, args);
        if (event.type === "MESSAGE_DELETE" && event.channelId && event.id && rememberDeleted(event, orig, self)) return;
        if (event.type === "MESSAGE_DELETE_BULK" && event.channelId && Array.isArray(event.ids)) {
            const remaining = event.ids.filter(id => !rememberDeleted({channelId:event.channelId,id}, orig, self));
            if (!remaining.length) return;
            const next = Array.from(args); next[0] = Object.assign({}, event, {ids:remaining});
            return orig.apply(self, next);
        }
        return orig.apply(self, args);
    }
    function deleteMessage(orig, self, args) {
        const key = deletedKey(args[0], args[1]), event = deleted.get(key);
        if (event && dispatcher) {
            deleted.delete(key); invalidateDeleted(); persistDeleted(); dispatcher({type:"MESSAGE_DELETE",channelId:event.channelId,id:event.id});
            return Promise.resolve(); // Dismiss locally; never DELETE an already-deleted message on the server.
        }
        return orig.apply(self, args);
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
    // The mobile list has a second VIEW_CHANNEL filter. Give ONLY that factory a
    // metadata-list facade; the real permission store and all other callers stay stock.
    function listImport(importer) {
        if (typeof importer !== "function") return importer;
        return function () {
            const result = importer.apply(this,arguments);
            if (!result || ![2041,4427].includes(arguments[0])) return result;
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
    function hiddenMetadata(value) {
        if (!enabled("hiddenChannels")) return false;
        const channel = typeof value === "string" ? receivedChannel(value) : value;
        return !!(channel && channel.guild_id && ![1,3].includes(channel.type) &&
            permissions && viewPermission != null && typeof permissions.can === "function" && !permissions.can(viewPermission, channel));
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
    function hiddenFetch(orig, self, args) {
        const channelId = typeof args[0] === "string" ? args[0] : args[0] && args[0].channelId;
        if (!hiddenChannel(channelId)) return orig.apply(self, args);
        const channel = receivedChannel(channelId);
        showHidden(channel);
        return Promise.resolve();
    }
    function showHidden(channel) {
        if (!channel || !RN || !RN.Alert) return;
        function snowflakeDate(id) {
            if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return "Unavailable";
            const date = new Date(Number(BigInt(id) >> BigInt(22)) + 1420070400000);
            return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unavailable";
        }
        const parent = receivedChannel(channel.parent_id);
        const pin = channel.lastPinTimestamp || channel.last_pin_timestamp;
        const pinDate = pin && new Date(pin);
        RN.Alert.alert("This channel is hidden", "#" + hiddenName(channel) +
            (parent ? "\nCategory: " + hiddenName(parent) : "") +
            "\nTopic: " + (channel.topic || "No topic.") +
            "\nCreated: " + snowflakeDate(channel.id) +
            "\nLast message: " + snowflakeDate(channel.lastMessageId || channel.last_message_id) +
            "\nLast pin: " + (pinDate && Number.isFinite(pinDate.getTime()) ? pinDate.toLocaleString() : "No pins.") +
            "\nMetadata only. You do not have permission to read messages or join voice here.");
    }
    function hiddenNavigation(orig, self, args) {
        const route = args[0];
        const match = typeof route === "string" && /^\/channels\/(?:@me|[^/]+)\/([^/?#]+)(?:[/?#]|$)/.exec(route);
        if (!match || !hiddenChannel(match[1])) return orig.apply(self, args);
        showHidden(receivedChannel(match[1]));
        return; // Metadata-only. Never navigate into a locked chat/voice channel.
    }
    function hiddenGuildNavigation(orig, self, args) {
        if (!hiddenChannel(args[1])) return orig.apply(self, args);
        showHidden(receivedChannel(args[1]));
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
    let pastelHash, guildMembers, presenceStore, sessionsStore, displayNameType, nativeRows, nativeRowGroup, nativeSwitchRow, nativeLock, nativeModals, oauthModal, themeContext;
    const platformIcons = {}, platformIconModules = {mobile:[7235,"MobilePhoneIcon"],web:[9200,"GlobeEarthIcon"],embedded:[9380,"GameControllerIcon"]};
    function DesktopIndicator(props) {
        // Independent monitor silhouette: screen, centered stem and foot, matching
        // upstream PlatformIndicators rather than Discord's filled ScreenIcon.
        const color = props.color;
        return el(RN.View,{pointerEvents:"none",style:{width:16,height:16,alignItems:"center",justifyContent:"center"}},
            el(RN.View,{style:{width:15,height:10,borderWidth:1.5,borderColor:color,borderRadius:1}}),
            el(RN.View,{style:{width:2,height:2,backgroundColor:color}}),
            el(RN.View,{style:{width:8,height:1.5,backgroundColor:color,borderRadius:1}}));
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
        const labels = {desktop:"Desktop",mobile:"Mobile",web:"Web",embedded:"Console"};
        const icons = Object.keys(labels).filter(key => colors[clients[key]]).map(key => {
            const spec = platformIconModules[key];
            const icon = key === "desktop" ? DesktopIndicator : platformIcons[key] || inspectedExport(spec[0],spec[1]);
            if (!icon) return null;
            platformIcons[key] = icon;
            return el(RN.View,{key,accessible:true,accessibilityRole:"image",accessibilityLabel:labels[key]+": "+clients[key]},
                el(icon,{color:colors[clients[key]],style:{width:16,height:16}}));
        }).filter(Boolean);
        return icons.length ? el(RN.View,{key:"venus-platforms",style:{flexDirection:"row",gap:6,alignItems:"center"}},icons) : null;
    }
    function platformName(orig, self, args) {
        if (React) useSettings("platformIndicators");
        const tree = orig.apply(self,args), user = args[0] && args[0].user;
        if (!enabled("platformIndicators") || !React || !RN || !tree || !user) return tree;
        return el(RN.View,{style:{flexDirection:"row",flexWrap:"wrap",gap:6,alignItems:"center"}},tree,el(PlatformBadges,{userId:user.id}));
    }
    function platformPlacement(orig,self,args) {
        if (React) useSettings("platformIndicators");
        const tree = orig.apply(self,args), props = args[0] || {};
        if (!enabled("platformIndicators") || !React || !RN || !tree) return tree;
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
            const title = children.find(child => child && child.props && (child.type === RN.Text && typeof child.props.children === "string" || typeof child.props.variant === "string" && /(?:channel-title|heading|semibold)/.test(child.props.variant)));
            // A React Native Text must not contain a View.
            if (!title || node.type === RN.Text) return p;
            added = true;
            return Object.assign({},p,{children:children.map(child => child !== title ? child : el(RN.View,{key:"venus-platform-title",style:{flexDirection:"row",alignItems:"center",gap:6,flexShrink:1}},child,el(PlatformBadges,{userId})))});
        },0);
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
        return el(RN.View,{style:{flexDirection:"row",alignItems:"center",gap:4},accessibilityLabel:hiddenName(channel)+", locked"},
            el(icon,{color:"#80848e",style:{width:16,height:16}}),tree);
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
    async function reviewJson(url,options) {
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
            if (global.setTimeout) timer = global.setTimeout(() => {reject(new Error("Authorization timed out"));if (controller) controller.abort();},15000);
        });
        try {return await Promise.race([task,timeout]);}
        finally {if (timer !== undefined && global.clearTimeout) global.clearTimeout(timer);}
    }
    async function reviewRequest(path, method, body) {
        if (!enabled("reviewDB") || typeof global.fetch !== "function") throw new Error("ReviewDB is disabled or networking is unavailable");
        if (!/^\/(users(?:\/\d{17,20}\/reviews)?|reports)(?:\?|$)/.test(path)) throw new Error("Invalid ReviewDB request");
        return reviewJson(REVIEW_API+path,{method:method || "GET",...(body ? {body:JSON.stringify(body)} : {})});
    }
    function clearReviewAuth() {
        reviewAuthAttempt++;reviewToken="";reviewAccount=null;reviewAuthState="idle";reviewAuthError="";
        reviewCache.clear();notify("reviewDB");
    }
    function reviewSettingsRow(label,onPress,disabled,subLabel) {
        if (!nativeRows) {
            const TableRow = inspectedExport(5854,"TableRow");
            if (TableRow) nativeRows = {TableRow};
        }
        return nativeRows && el(nativeRows.TableRow,{label,onPress,disabled,subLabel});
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
    function ReviewSettings() {
        useReviews();
        if (!React || !RN) return null;
        const authenticated = !!reviewAuth(), pending = ["authorizing","exchanging"].includes(reviewAuthState);
        const group = nativeRowGroup || inspectedExport(5936,"TableRowGroup") || RN.View;
        const SwitchRow=nativeSwitchRow || inspectedExport(7477,"TableSwitchRow");
        return el(RN.ScrollView || RN.View,{contentContainerStyle:{padding:16,gap:16}},
            el(group,{title:"ReviewDB"},SwitchRow ? el(SwitchRow,{label:"Enable ReviewDB",value:settings.reviewDB,onValueChange:value=>setSetting("reviewDB",value),
                subLabel:"User and server reviews from manti.vendicated.dev. Opening a list shares that user/server ID. Community reviews are not verified facts."}) :
                reviewSettingsRow(settings.reviewDB ? "Disable ReviewDB" : "Enable ReviewDB",()=>setSetting("reviewDB",!settings.reviewDB),false)),
            el(group,{title:"Authentication"},
                reviewSettingsRow(authenticated ? "Authenticated with ReviewDB" : pending ? "Authenticating with ReviewDB…" : "Authenticate with ReviewDB",
                    authenticateReviews,!enabled("reviewDB") || authenticated || pending,
                    reviewAuthError || (reviewAuthState === "exchanging" ? "Finishing sign-in with ReviewDB. Closing Discord's OAuth window does not cancel this exchange." : "Sign-in is shared by user and server reviews for this Discord account. Session only; no Discord account token is used.")),
                reviewSettingsRow("Log out of ReviewDB",clearReviewAuth,!authenticated && !pending,"Clears the local ReviewDB session, not Discord's OAuth grant.")));
    }
    function authenticateReviews() {
        if (!enabled("reviewDB") || ["authorizing","exchanging"].includes(reviewAuthState)) return;
        if (!nativeModals) {
            const pushModal = inspectedExport(4645,"pushModal"), popModal = inspectedExport(4645,"popModal");
            if (pushModal && popModal) nativeModals = {pushModal,popModal};
        }
        const modal = oauthModal || inspectedExport(9358,"default");
        if (!nativeModals || typeof nativeModals.pushModal!=="function" || typeof nativeModals.popModal!=="function" || !modal) {RN.Alert.alert("ReviewDB","Native OAuth is unavailable. Reopen these plugin settings and try again.");return;}
        const current = userStore && userStore.getCurrentUser();
        if (!current) {RN.Alert.alert("ReviewDB","Discord account unavailable");return;}
        const accountId = current.id, attempt = ++reviewAuthAttempt, key = "venus-reviewdb-auth";
        let exchanging = false, dismissed = false;
        reviewAccount=accountId;reviewAuthState="authorizing";reviewAuthError="";notify("reviewDB");
        function live() { const user = userStore && userStore.getCurrentUser(); return enabled("reviewDB") && attempt === reviewAuthAttempt && user && user.id === accountId; }
        function close() {if (!dismissed) {dismissed=true;nativeModals.popModal(key);}}
        nativeModals.pushModal({key,modal:{key,modal,animation:"slide-up",shouldPersistUnderModals:false,closable:true,
            props:{clientId:"915703782174752809",redirectUri:REVIEW_API+"/auth",scopes:["identify"],responseType:"code",permissions:BigInt(0),prompt:"consent",cancelCompletesFlow:false,
                dismissOAuthModal:()=>{
                    if (!live()) return;
                    // HBC98 success generator #124513 invokes callback without awaiting
                    // its Promise, then dismissOAuthModal. That is completion, NOT cancel.
                    if (!exchanging) {reviewAuthAttempt++;reviewAuthState="idle";notify("reviewDB");}
                    close();
                },callback:async result => {
                    if (!live()) return;
                    if (result && result.canceled === true) {reviewAuthAttempt++;reviewAuthState="idle";reviewAuthError="";close();notify("reviewDB");return;}
                    if (exchanging) return;
                    try {
                        const url = authorizationUrl(result);
                        exchanging=true;reviewAuthState="exchanging";reviewAuthError="";notify("reviewDB");
                        const auth = await reviewJson(url,{method:"GET"});
                        if (!live()) return;
                        if (auth.success !== true || typeof auth.token !== "string" || !auth.token.trim() || auth.token.length>8192) throw new Error("ReviewDB did not return an authorization token. Try signing in again from plugin settings.");
                        reviewToken=auth.token;reviewAccount=accountId;reviewAuthState="authenticated";reviewAuthAttempt++;
                        close();notify("reviewDB");
                    } catch (error) {
                        if (live()) {reviewAuthState="idle";reviewAuthError=String(error.message || error);notify("reviewDB");RN.Alert.alert("ReviewDB authentication",reviewAuthError);}
                    } finally {exchanging=false;}
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
        const current=userStore && userStore.getCurrentUser();
        if (reviewAccount && (!current || current.id!==reviewAccount)) {
            // This may run during React rendering; do not synchronously set state
            // in other mounted panels. Store subscriptions handle their re-render.
            reviewAuthAttempt++;reviewToken="";reviewAccount=null;reviewAuthState="idle";reviewAuthError="";reviewCache.clear();
        }
        return reviewToken;
    }
    function ReviewCard(props) {
        const review = props.review, sender = review.sender, fg = props.color;
        const group = nativeRowGroup || inspectedExport(5936,"TableRowGroup") || RN.View;
        const image = uri => typeof uri === "string" && /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|manti\.vendicated\.dev)\//.test(uri);
        const date = review.type !== 3 && Number.isFinite(review.timestamp) && new Date(review.timestamp*1000);
        const label = el(RN.View,{style:{flexDirection:"row",alignItems:"center",gap:4,flexWrap:"wrap"}},
            el(RN.Text,{style:{color:fg,fontWeight:"700"}},String(sender.username || "Unknown")),
            (Array.isArray(sender.badges) ? sender.badges.slice(0,8) : []).filter(badge => badge && image(badge.icon)).map((badge,index) =>
                el(RN.Image,{key:String(index),source:{uri:badge.icon},style:{width:16,height:16},accessibilityLabel:String(badge.name || "Reviewer badge")})),
            date && Number.isFinite(date.getTime()) ? el(RN.Text,{style:{color:fg,fontSize:12,opacity:0.65}},date.toLocaleDateString()) : null);
        return el(group,{style:{marginBottom:8,borderRadius:12,overflow:"hidden"}},
            el(nativeRows.TableRow,{label,subLabel:el(RN.Text,{selectable:true,style:{color:fg,fontSize:14}},review.comment.slice(0,4000)),subLabelLineClamp:0,
                icon:RN.Image && image(sender.profilePhoto) ? el(RN.Image,{source:{uri:sender.profilePhoto},style:{width:36,height:36,borderRadius:18},accessibilityIgnoresInvertColors:true}) : undefined}),
            props.actions);
    }
    function ReviewsPanel(props) {
        useReviews();
        const [open,setOpen]=React.useState(false), [reviews,setReviews]=React.useState([]), [error,setError]=React.useState(""),
            [busy,setBusy]=React.useState(false), [comment,setComment]=React.useState(""), [generation,reload]=React.useState(0);
        const context = themeContext && themeContext.useThemeContext && themeContext.useThemeContext();
        const light = context && context.theme === "light";
        const fg=light ? "#202127" : "#f2f3f5", bg=light ? "#f2f3f5" : "#202127";
        React.useEffect(()=>{
            let live=true;
            if (!open || !enabled("reviewDB")) return;
            setBusy(true);setError("");
            reviewsFor(props.userId,generation>0).then(list=>{if(live)setReviews(list);},reason=>{if(live)setError(String(reason.message || reason));})
                .finally(()=>{if(live)setBusy(false);});
            return ()=>{live=false;};
        },[open,props.userId,generation,settings.reviewDB]);
        if (enabled("reviewDB") && !nativeRows) {
            const TableRow = inspectedExport(5854,"TableRow");
            if (TableRow) nativeRows = {TableRow};
        }
        if (!enabled("reviewDB") || !RN || !nativeRows || !nativeRows.TableRow) return null;
        function row(label,onPress) {return el(nativeRows.TableRow,{key:label,label,onPress,disabled:busy});}
        function mutate(path,method,body) {
            if (busy || !reviewAuth()) return;
            setBusy(true);setError("");
            const account = reviewAccount, token = reviewToken;
            const live = () => enabled("reviewDB") && reviewAuth() === token && reviewAccount === account;
            reviewRequest(path,method,Object.assign({},body,{token})).then(()=>{if(live()){setComment("");reviewCache.delete(props.userId);reload(n=>n+1);}},reason=>{if(live())setError(String(reason.message || reason));})
                .finally(()=>{if(live())setBusy(false);});
        }
        const current=userStore && userStore.getCurrentUser();
        return el(RN.View,{key:"venus-reviews",style:{marginVertical:8,borderRadius:12,backgroundColor:bg}},
            row(open ? "Reviews · "+reviews.filter(review=>review.type!==3).length : props.server ? "Server reviews (ReviewDB)" : "Reviews (ReviewDB)",()=>setOpen(value=>!value)),
            !open ? null : el(RN.View,{style:{padding:12,gap:8}},
                el(RN.Text,{style:{color:fg}},"Community reviews, not verified facts. Be respectful. Opening this list shares the profile ID with ReviewDB."),
                error ? el(RN.Text,{accessibilityRole:"alert",style:{color:"#f23f43"}},error) : null,
                busy ? el(RN.ActivityIndicator,null) : null,
                !busy && !error && !reviews.length ? el(RN.Text,{style:{color:fg,opacity:0.65}},"No reviews yet. Be the first to leave one.") : null,
                el(RN.ScrollView,{style:{maxHeight:360},nestedScrollEnabled:true},reviews.map((review,index)=>el(ReviewCard,{key:String(review.id == null ? index : review.id),review,color:fg,
                    actions:reviewAuth() && review.type!==3 && review.id != null ? el(RN.View,{style:{flexDirection:"row"}},
                        current && review.sender.discordID===current.id ? row("Delete your review",()=>RN.Alert.alert("Delete review?","This removes your review from ReviewDB.",[{text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>mutate("/users/"+props.userId+"/reviews","DELETE",{reviewid:review.id})}])) : null,
                        row("Report review",()=>RN.Alert.alert("Report review?","Send this review to ReviewDB moderators?",[{text:"Cancel",style:"cancel"},{text:"Report",onPress:()=>mutate("/reports","PUT",{reviewid:review.id})}]))) : null}))),
                row("Refresh reviews",()=>reload(n=>n+1)),
                el(RN.View,null,
                    el(RN.TextInput,{value:comment,onChangeText:setComment,maxLength:2000,multiline:true,editable:!busy && !!reviewAuth(),placeholder:reviewAuth() ? "Tap to add or edit your review" : "Sign in from ReviewDB plugin settings to write a review",placeholderTextColor:light?"#666":"#aaa",style:{color:fg,padding:12,borderRadius:12,backgroundColor:light?"#e3e5e8":"#111214",minHeight:48}}),
                    reviewAuth() ? row("Post / update review",()=>{const text=comment.trim();if(text)mutate("/users/"+props.userId+"/reviews","PUT",{comment:text});}) : null)) );
    }
    function reviewAbout(orig,self,args) {
        if (React) useReviews();
        const tree=orig.apply(self,args), props=args[0] || {}, userId=props.userId;
        if (!enabled("reviewDB") || !React || !RN || !/^\d{17,20}$/.test(userId) || typeof props.pendingBio === "string") return tree;
        // HBC98 module 11502 is shared by normal, bot, compact and About-tab
        // profiles. The parent mounts it in the actual card stack, not the name
        // heading. Hooking the parent heading missed deferred/tabbed content.
        return el(RN.View,null,tree,el(ReviewsPanel,{key:"venus-reviews:"+userId,userId}));
    }
    function reviewGuild(orig,self,args) {
        if (React) useReviews();
        const tree=orig.apply(self,args), guild=args[0] && args[0].guild;
        if (!enabled("reviewDB") || !React || !RN || !guild || !/^\d{17,20}$/.test(guild.id)) return tree;
        // Native GuildActionSheetProgress can be null for ordinary members.
        // Preserve any onboarding/progress card, then add reviews for the guild ID.
        return el(RN.View,null,tree,el(ReviewsPanel,{key:guild.id,userId:guild.id,server:true}));
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
        if (features.platformIndicators) Object.keys(platformIconModules).forEach(key => {
            const spec = platformIconModules[key];if (id === spec[0]) platformIcons[key] = exports[spec[1]];
        });
        if (features.platformIndicators && id === 11448) {
            displayNameType=exports.DisplayName;
            exports=hookExport(exports,"DisplayName",platformName);
            return hookComponent(exports,(orig,self,args)=>wrapProfileTree(orig.apply(self,args),displayNameType,platformName,platformWrappers));
        }
        if (features.platformIndicators && [11159,13603,16377,9970].includes(id)) return hookComponent(exports,platformPlacement);
        if (features.reviewDB && id === 4645) nativeModals=exports;
        if (features.reviewDB && id === 9358) oauthModal=exports.default;
        if (features.reviewDB && id === 5854) nativeRows=exports;
        if (features.reviewDB && id === 5936) nativeRowGroup=exports.TableRowGroup;
        if (features.reviewDB && id === 7477) nativeSwitchRow=exports.TableSwitchRow;
        if (features.hiddenChannels && id === 5345) nativeLock=exports.LockIcon;
        if (features.hiddenChannels && id === 16569) return hookComponent(exports,hiddenInfo);
        if (features.reviewDB && id === 4505) themeContext=exports;
        if (features.reviewDB && id === 11502) return hookComponent(exports,reviewAbout);

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
        if (features.hiddenChannels && id === 4427) permissions = exports.default;
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
