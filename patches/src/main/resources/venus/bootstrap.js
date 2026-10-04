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
    if (features.noDelete) selectModules([573, 5008, 7730]);
    if (features.jumpToTop) selectModules([12549, 10518, 11207, 7730, 2041]);
    if (features.hiddenChannels) selectModules([1074, 1101, 2041, 2096, 4427, 4941, 7730]);
    const revision = "1.1.0";
    // Module 120 owns setUpDefaltReactNativeEnvironment in this exact asset.
    // Defer every feature hook until that initializer returns successfully.
    let environmentReady = false;
    const deferredModules = new Map();
    const settings = { picker: true, voice: false, copyBios: true, dashless: true, favouriteAnything: true, emojis: true, stickers: true, hyperlinks: true, forceLinks: false,
        noTyping: true, quickDelete: false, quickDeleteEmbeds: false, noDelete: false,
        jumpToTop: true, hiddenChannels: false };
    const status = { picker: false, attachment: false, request: false, menu: false, conversion: false, audioError: "", storage: "waiting" };
    const listeners = new Set();
    const dirty = new Set();
    const sizeCache = new Map();
    const sizeQueue = [];
    const pendingVoice = new Map();
    const markedPayloads = new WeakMap();
    const wrapped = new WeakMap();
    // React Native installs Promise during its polyfill phase; no Promise use in this prelude.
    let React, RN, files, activeReads = 0, writeQueue;
    const conversions = new WeakMap();
    const convertedUploads = new WeakMap();
    const activeJobs = new Map();
    let jobCounter = 0;
    const PREFS = "venus-patches.json";
    const notify = () => listeners.forEach(fn => fn());
    const data = (obj, key) => {
        const descriptor = obj && Object.getOwnPropertyDescriptor(obj, key);
        return descriptor && "value" in descriptor ? descriptor.value : undefined;
    };
    const owns = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
    const enabled = key => features[featureFor(key)] && settings[key];

    function save() {
        if (!files || status.storage === "loading") return;
        const snapshot = JSON.stringify(settings);
        writeQueue = (writeQueue || Promise.resolve()).catch(() => {}).then(() =>
            files.writeFile("documents", PREFS, snapshot, "utf8")
        ).then(() => { status.storage = "saved"; notify(); }, () => {
            status.storage = "save failed (session only)"; notify();
        });
    }
    function setSetting(key, value) {
        if (!owns(settings, key) || !features[featureFor(key)]) return false;
        if (settings[key] === !!value && status.storage !== "loading" && status.storage !== "waiting") return true;
        value = !!value;
        if (key === "voice" && !value) activeJobs.forEach(job => {
            job.cancelled = true;
            nativeVoice("cancel", job.id).catch(() => {});
        });
        if (key === "noDelete" && !value) clearDeleted(true);
        if (key === "hiddenChannels") hiddenViews.clear();
        settings[key] = value;
        dirty.add(key);
        if (key === "picker" && !value) {
            sizeCache.clear();
            sizeQueue.splice(0).forEach(entry => entry.resolve(null));
        }
        save();
        notify();
        return true;
    }
    function initFiles(module) {
        if (files) return;
        files = module;
        status.storage = "loading";
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
                for (const key of Object.keys(settings))
                    if (!dirty.has(key) && typeof loaded[key] === "boolean") settings[key] = loaded[key];
            }
            status.storage = "ready";
            // Persist edits made while the asynchronous restore was in flight.
            if (dirty.size) save();
            notify();
        }).catch(() => { status.storage = "read failed (defaults)"; if (dirty.size) save(); notify(); });
        drainSizes();
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
            const bytes = Number(value);
            entry.value = Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
        }, () => { entry.value = null; }).then(() => {
            entry.expires = Date.now() + (entry.value === null ? 30000 : 300000);
            entry.done = true;
            entry.resolve(entry.value);
            activeReads--;
            drainSizes();
        });
    }
    function drainSizes() {
        if (!files) return;
        while (activeReads < 4 && sizeQueue.length) readSize(sizeQueue.shift());
    }
    function getSize(uri) {
        if (!enabled("picker") || typeof uri !== "string" || !/^(content|file):\/\//.test(uri))
            return Promise.resolve(null);
        const existing = sizeCache.get(uri);
        if (existing && (!existing.done || existing.expires > Date.now())) return existing.promise;
        if (existing) sizeCache.delete(uri);
        if (sizeCache.size >= 256) {
            const removable = Array.from(sizeCache).find(pair => pair[1].done);
            if (!removable) return Promise.resolve(null);
            sizeCache.delete(removable[0]);
        }
        const entry = { uri, done: false };
        entry.promise = new Promise(resolve => { entry.resolve = resolve; });
        sizeCache.set(uri, entry);
        sizeQueue.push(entry);
        drainSizes();
        return entry.promise;
    }
    function useSettings() {
        const [, update] = React.useState(0);
        React.useEffect(() => {
            const fn = () => update(n => n + 1);
            listeners.add(fn);
            return () => listeners.delete(fn);
        }, []);
    }
    function SizeBadge(props) {
        useSettings();
        const [bytes, update] = React.useState(null);
        React.useEffect(() => {
            let live = true;
            update(null);
            if (enabled("picker")) getSize(props.uri).then(value => { if (live) update(value); });
            return () => { live = false; };
        }, [props.uri, settings.picker]);
        if (!enabled("picker") || bytes === null || !RN) return null;
        return React.createElement(RN.View, {
            pointerEvents: "none",
            style: { position: "absolute", top: 3, left: 3, borderRadius: 4,
                backgroundColor: "#17181ccc", paddingHorizontal: 4, paddingVertical: 2 }
        }, React.createElement(RN.Text, {
            style: { color: "white", fontSize: 10, fontWeight: "700", includeFontPadding: false }
        }, formatSize(bytes)));
    }
    function pickerProps(props) {
        if (!enabled("picker") || !React || !RN || !props) return props;
        const first = Array.isArray(props.children) ? props.children[0] : props.children;
        const uri = first && first.props && first.props.localImageSource && first.props.localImageSource.uri;
        if (typeof uri !== "string") return props;
        return Object.assign({}, props, { children: React.createElement(RN.View, {
            style: { position: "relative" }, pointerEvents: "box-none"
        }, props.children, React.createElement(SizeBadge, { uri })) });
    }
    function pickerComponent(component) {
        if (!component || wrapped.has(component)) return wrapped.get(component) || component;
        if (typeof component === "function" && (component.displayName || component.name) === "Pressable") {
            const original = component;
            const result = function () {
                const args = Array.from(arguments);
                args[0] = pickerProps(args[0]);
                return original.apply(this, args);
            };
            result.displayName = "Pressable";
            wrapped.set(component, result);
            status.picker = true;
            return result;
        }
        if (typeof component === "object") {
            for (const key of ["type", "render"]) {
                const original = data(component, key);
                if (!original) continue;
                const replacement = pickerComponent(original);
                if (replacement !== original) {
                    const result = cloneWith(component, key, replacement);
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
        if (mime.startsWith("audio/")) return true;
        if (mime && mime !== "application/octet-stream") return false;
        return /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|amr|aif|aiff|wma|ac3|caf)$/i.test(upload.filename || item.filename || "");
    }
    function prepareUpload(original, upload, args) {
        if (!enabled("voice") || !isAudio(upload)) return original.apply(upload, args);
        const old = conversions.get(upload);
        if (old) return old.promise;
        const item = upload.item || {};
        const uri = item.uri || upload.uri;
        if (typeof uri !== "string" || !/^(content|file):\/\//.test(uri)) return original.apply(upload, args);
        const job = { id: Date.now().toString(36) + "-" + (++jobCounter), cancelled: false };
        activeJobs.set(upload, job);
        const promise = Promise.resolve().then(() => nativeVoice("prepare", job.id, uri)).then(text => {
            const result = JSON.parse(text);
            if (!result || typeof result.uri !== "string" || !result.uri.startsWith("file://") ||
                result.mimeType !== "audio/ogg" || !(result.durationSecs > 0) ||
                !(result.size > 0) || typeof result.waveform !== "string" || !result.waveform)
                throw new Error("Native audio conversion returned invalid metadata");
            if (job.cancelled || !enabled("voice") || (typeof upload.isCancelled === "function" && upload.isCancelled())) {
                nativeVoice("release", job.id).catch(() => {});
                if (typeof upload.isCancelled === "function" && upload.isCancelled()) throw new Error("Audio upload cancelled");
                return original.apply(upload, args);
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
            convertedUploads.set(upload, result);
            status.audioError = "";
            notify();
            return upload;
        }).catch(error => {
            if (typeof upload.isCancelled === "function" && upload.isCancelled()) throw error;
            // Unsupported codecs/devices remain ordinary original attachments, never spoofed voice files.
            status.audioError = String(error && error.message || error);
            notify();
            if (!job.cancelled && RN && RN.Alert) RN.Alert.alert("Voice conversion unavailable",
                status.audioError + "\nThis file will be uploaded normally instead.");
            return original.apply(upload, args);
        }).finally(() => { activeJobs.delete(upload); });
        job.promise = promise;
        conversions.set(upload, job);
        return promise;
    }
    function instrumentCloudUpload(CloudUpload) {
        if (!features.voice || typeof CloudUpload !== "function" || !CloudUpload.prototype) return;
        const prototype = CloudUpload.prototype;
        const original = prototype.reactNativeCompressAndExtractData;
        if (typeof original !== "function" || wrapped.has(original)) return;
        const replacement = function () { return prepareUpload(original, this, arguments); };
        prototype.reactNativeCompressAndExtractData = replacement;
        wrapped.set(original, replacement);
        wrapped.set(replacement, replacement);
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
    function attachmentPayload(original, receiver, args) {
        const result = original.apply(receiver, args);
        const metadata = convertedUploads.get(args[0]);
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
    function postRequest(original, receiver, args) {
        const request = args[0];
        // Fast path for all other API traffic; no fetch/XMLHttpRequest interception.
        if (!request || typeof request.url !== "string" || !/^\/channels\/\d+\/messages$/.test(request.url))
            return original.apply(receiver, args);
        const body = request.body;
        if (!body || !Array.isArray(body.attachments) || ((Number(body.flags) || 0) & 8192))
            return original.apply(receiver, args);
        const markers = body.attachments.map(attachment => attachment &&
            (markedPayloads.get(attachment) || pendingVoice.get(attachment.uploaded_filename)));
        if (!markers.some(Boolean)) return original.apply(receiver, args);
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
        return original.apply(receiver, nextArgs);
    }

    // Native setting nodes use Discord's own themed rows, navigation and back stack.
    let SettingsList;
    const featureFor = key => key === "emojis" || key === "stickers" || key === "hyperlinks" || key === "forceLinks" ? "freeNitro" : key === "quickDeleteEmbeds" ? "quickDelete" : key;
    function section(label, keys) { return { label, settings: keys }; }
    function settingsPage(sections) {
        const node = { type: "list", sections };
        return function VenusSettingsPage() {
            return React && SettingsList ? React.createElement(SettingsList, { node }) : null;
        };
    }
    function settingNode(key, title, description, parent) {
        return { type: "toggle", parent, useTitle: () => title, useDescription: () => description,
            useValue: function () { useSettings(); return settings[key]; },
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
            useDescription: function () { useSettings(); return "Preferences: " + status.storage + (status.audioError ? "\n" + status.audioError : ""); } };
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
        plugin("noDelete", "NoDelete", "Keep cached deleted messages for this session, marked as deleted. Off by default; disabling clears them. Maximum 512.");
        plugin("jumpToTop", "JumpToTop", "Add a button to jump to the start of the current chat.");
        plugin("hiddenChannels", "Hidden Channels", "Show already-received channel metadata with a locked label. Does not grant access to messages or voice.");
        if (features.quickDelete) {
            plugins.push("VENUS_QUICKDELETE");
            route("VENUS_QUICKDELETE", "QuickDelete", [section("Confirmation", ["VENUS_QUICKDELETE_MESSAGES", "VENUS_QUICKDELETE_EMBEDS"])], "VENUS_PLUGINS");
            next.VENUS_QUICKDELETE_MESSAGES = settingNode("quickDelete", "Delete messages without confirmation", "Off by default. Deletion cannot be undone.", "VENUS_QUICKDELETE");
            next.VENUS_QUICKDELETE_EMBEDS = settingNode("quickDeleteEmbeds", "Remove embeds without confirmation", "Only the embed-removal confirmation is skipped.", "VENUS_QUICKDELETE");
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
    function settingsSections(original, receiver, args) {
        const config = args[0];
        if (!status.menu || !config || !Array.isArray(config.sections)) return original.apply(receiver, args);
        const index = config.sections.findIndex(s => s && Array.isArray(s.settings) && s.settings.includes("ACCOUNT"));
        if (index < 0 || config.sections.some(s => s && s.label === "Venus")) return original.apply(receiver, args);
        const sections = config.sections.slice();
        sections.splice(index + 1, 0, section("Venus", ["VENUS_GENERAL", "VENUS_PLUGINS"]));
        const next = Array.from(args); next[0] = Object.assign({}, config, { sections });
        return original.apply(receiver, next);
    }

    function cloneTree(node, change, depth) {
        if (!node || typeof node !== "object" || depth > 24) return node;
        if (Array.isArray(node)) {
            const children = node.map(child => cloneTree(child, change, depth + 1));
            return children.some((child, i) => child !== node[i]) ? children : node;
        }
        if (!node.props) return node;
        const children = cloneTree(node.props.children, change, depth + 1);
        let props = children !== node.props.children ? Object.assign({}, node.props, { children }) : node.props;
        props = change(node, props);
        return props === node.props ? node : React.cloneElement(node, props);
    }
    function copyBio(original, receiver, args) {
        const result = original.apply(receiver, args);
        if (!enabled("copyBios") || !React || !RN) return result;
        return cloneTree(result, function (node, props) {
            // Preserve clickable links and handlers, never mutate React's frozen elements.
            if (node !== result && node.type !== RN.Text && typeof props.children !== "string") return props;
            return props.selectable === true ? props : Object.assign({}, props, { selectable: true });
        }, 0);
    }
    function channelLabel(original, receiver, args) {
        const result = original.apply(receiver, args);
        const channel = args[0];
        const label = enabled("dashless") && channel && [0, 5, 15, 16].includes(channel.type) && typeof result === "string" ? result.replace(/-/g, " ") : result;
        return typeof label === "string" && hiddenChannel(channel) ? label + " [locked]" : label;
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
    function favouriteButton(original, receiver, args) {
        const props = args[0], source = props && props.source;
        if (!enabled("favouriteAnything") || !source || source.isGIFV || typeof source.uri !== "string" || !/^https?:\/\//i.test(source.uri)) return original.apply(receiver, args);
        const next = Array.from(args);
        next[0] = Object.assign({}, props, { source: Object.assign({}, source, { isGIFV: true,
            embedURI: source.embedURI || source.sourceURI || source.uri, videoURI: source.videoURI || source.uri,
            embedProviderName: source.embedProviderName || "" }) });
        return original.apply(receiver, next);
    }
    function favouriteAdd(original, receiver, args) {
        const item = args[0];
        if (!enabled("favouriteAnything") || !item || typeof item !== "object") return original.apply(receiver, args);
        const isVideo = video(item.url) || video(item.gifSrc);
        const isImage = typeof item.url === "string" && /\.(png|jpe?g|gif|webp|avif|heic|heif)(?:[?#]|$)/i.test(item.url);
        // Preserve native formats for opaque provider URLs instead of misclassifying videos as images.
        if (!isVideo && !isImage) return original.apply(receiver, args);
        const format = isVideo ? 2 : 1;
        if (item.format === format) return original.apply(receiver, args);
        const next = Array.from(args); next[0] = Object.assign({}, item, { format });
        return original.apply(receiver, next);
    }
    const favouriteViews = new WeakMap();
    function favouriteList(original, receiver, args) {
        const result = original.apply(receiver, args);
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
        // The original capability delegates to canUserUse. Conversion must see real
        // eligibility, not the picker override, or a non-Nitro send stays an invalid token.
        nativeCapabilities++;
        try { return typeof premiumOriginal[key] === "function" && premiumOriginal[key](user); }
        finally { nativeCapabilities--; }
    }
    function catalogEligibility(original, receiver, args) {
        const user = currentUser(), feature = args[0];
        if (!nativeCapabilities && enabled("emojis") && user && args[1] && args[1].id === user.id &&
            (feature === emojiCatalog.EMOJIS_EVERYWHERE || feature === emojiCatalog.ANIMATED_EMOJIS)) return true;
        return original.apply(receiver, args);
    }
    function premiumOverride(key, setting) {
        return function (original, receiver, args) {
            const user = currentUser();
            return enabled(setting) && user && args[0] && args[0].id === user.id ? true : original.apply(receiver, args);
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
    function sendMessage(original, receiver, args) {
        const message = emojiMessage(args[1], args[0]);
        if (message === args[1]) return original.apply(receiver, args);
        const next = Array.from(args); next[1] = message;
        return original.apply(receiver, next);
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
    function sendStickers(original, receiver, args) {
        if (!enabled("stickers") || !Array.isArray(args[1]) || !stickerStore || !channelStore) return original.apply(receiver, args);
        const user = currentUser(), channel = channelStore.getChannel(args[0]);
        if (!user || !channel) return original.apply(receiver, args);
        const keep = [], links = [];
        for (const id of args[1]) {
            const sticker = stickerStore.getStickerById(id);
            if (!sticker) return original.apply(receiver, args);
            if (nativeSticker(sticker, channel, user)) { keep.push(id); continue; }
            const link = stickerLink(sticker);
            // Fail closed as a whole: never drop an unknown/unsupported sticker from a mixed send.
            if (!link) return original.apply(receiver, args);
            links.push(link);
        }
        if (!links.length) return original.apply(receiver, args);
        const message = args[2], content = typeof message === "string" ? message : message && message.content || "";
        const combined = (content ? content + "\n" : "") + links.join("\n");
        if (combined.length > (user.premiumType === 2 ? 4000 : 2000)) return original.apply(receiver, args);
        const next = Array.from(args); next[1] = keep;
        next[2] = emojiMessage(Object.assign({}, typeof message === "object" ? message : null, { content: combined }), args[0]);
        // Original sendStickers preserves replies, TTS, nonce, permissions and native stickers in one message.
        return original.apply(receiver, next);
    }
    function sendability(original, receiver, args) {
        const result = original.apply(receiver, args), sticker = args[0];
        return enabled("stickers") && stickerRules && result === stickerRules.StickerSendability.SENDABLE_WITH_PREMIUM && stickerLink(sticker) ? stickerRules.StickerSendability.SENDABLE : result;
    }
    function sendableSticker(original, receiver, args) {
        const result = original.apply(receiver, args);
        if (result || !enabled("stickers") || !stickerRules) return result;
        const code = stickerRules.getStickerSendability.apply(stickerRules, args);
        return code === stickerRules.StickerSendability.SENDABLE;
    }
    let messageStore, messageActions, permissions, viewPermission, locale, dispatcher;
    const deleted = new Map();
    const hiddenViews = new Map();
    function typing(original, receiver, args) {
        return enabled("noTyping") ? undefined : original.apply(receiver, args);
    }
    function quickConfirm(original, receiver, args) {
        const popup = args[0];
        if (!popup || typeof popup.onConfirm !== "function" || !locale || !locale.intl || !locale.t)
            return original.apply(receiver, args);
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
        return original.apply(receiver, args);
    }
    function deletedKey(channelId, id) { return channelId + ":" + id; }
    function clearDeleted(remove) {
        const events = Array.from(deleted.values());
        deleted.clear();
        if (remove && dispatcher) events.forEach(event => dispatcher(event));
    }
    function rememberDeleted(event, original, receiver) {
        const key = deletedKey(event.channelId, event.id);
        if (deleted.has(key)) return true; // Replayed gateway deletion is not a dismissal.
        if (!messageStore || !messageStore.getMessage(event.channelId, event.id)) return false;
        if (deleted.size >= 512) {
            const oldest = deleted.keys().next().value, pending = deleted.get(oldest);
            deleted.delete(oldest);
            original.call(receiver, pending); // Actually release the oldest cached message.
        }
        deleted.set(key, {type:"MESSAGE_DELETE", channelId:event.channelId, id:event.id});
        original.call(receiver, {type:"MESSAGE_EDIT_FAILED_AUTOMOD",
            messageData:{type:1, message:{channelId:event.channelId, messageId:event.id}},
            errorResponseBody:{code:200000, message:"This message was deleted (kept locally by NoDelete)."}});
        return true;
    }
    function dispatchEvent(original, receiver, args) {
        const event = args[0];
        if (!event) return original.apply(receiver, args);
        if (["LOGOUT", "CONNECTION_OPEN", "CACHE_LOADED"].includes(event.type)) clearDeleted(false);
        if (event.type === "CHANNEL_DELETE") {
            const id = event.channel && event.channel.id || event.channelId || event.id;
            for (const [key, entry] of deleted) if (entry.channelId === id) deleted.delete(key);
        }
        if (!enabled("noDelete")) return original.apply(receiver, args);
        if (event.type === "MESSAGE_DELETE" && event.channelId && event.id && rememberDeleted(event, original, receiver)) return;
        if (event.type === "MESSAGE_DELETE_BULK" && event.channelId && Array.isArray(event.ids)) {
            const remaining = event.ids.filter(id => !rememberDeleted({channelId:event.channelId,id}, original, receiver));
            if (!remaining.length) return;
            const next = Array.from(args); next[0] = Object.assign({}, event, {ids:remaining});
            return original.apply(receiver, next);
        }
        return original.apply(receiver, args);
    }
    function deleteMessage(original, receiver, args) {
        const key = deletedKey(args[0], args[1]), event = deleted.get(key);
        if (event && dispatcher) {
            deleted.delete(key); dispatcher(event);
            return Promise.resolve(); // Dismiss locally; never DELETE an already-deleted message on the server.
        }
        return original.apply(receiver, args);
    }
    function jumpButton(original, receiver, args) {
        if (React) useSettings();
        const result = original.apply(receiver, args), props = args[0];
        if (!enabled("jumpToTop") || !React || !RN || !props || !props.channelId || !messageActions) return result;
        const channelId = props.channelId;
        if (hiddenChannel(channelId)) return result;
        const onPress = () => messageActions.jumpToMessage({channelId, messageId:channelId, flash:true, jumpType:"ANIMATED"});
        const child = result && result.props && result.props.children;
        if (child && child.props && typeof child.props.onPress === "function") {
            const top = React.cloneElement(child, {key:"venus-jump-top", onPress, accessibilityLabel:"Jump to top"});
            return React.cloneElement(result, {children:React.createElement(RN.View, null,
                React.createElement(RN.View, {style:{transform:[{scaleY:-1}]}}, top), child)});
        }
        if (result) return result; // Voice-panel dismissal is not a jump button.
        // Keep the entry point available when Discord's Jump to Present is hidden.
        return React.createElement(RN.View, {pointerEvents:"box-none", style:{position:"absolute",bottom:48,right:16}},
            React.createElement(RN.Pressable, {onPress, accessibilityRole:"button", accessibilityLabel:"Jump to top"},
                React.createElement(RN.Text, {style:{padding:12}}, "Jump to top")));
    }
    function hiddenChannel(value) {
        const channel = typeof value === "string" ? channelStore && channelStore.getChannel(value) : value;
        return !!(enabled("hiddenChannels") && channel && channel.guild_id && ![1,3,4].includes(channel.type) &&
            permissions && viewPermission != null && typeof permissions.can === "function" && !permissions.can(viewPermission, channel));
    }
    function hiddenDirectory(original, receiver, args) {
        const result = original.apply(receiver, args), guild = args[0];
        if (!enabled("hiddenChannels") || !result || !guild || !channelStore || !permissions ||
            typeof channelStore.getMutableGuildChannelsForGuild !== "function") return result;
        const source = channelStore.getMutableGuildChannelsForGuild(guild);
        if (!source) return result;
        const extra = Object.values(source).filter(channel => hiddenChannel(channel));
        // Recheck permissions and metadata on each directory lookup; retain stable
        // array identity for unchanged inputs and bound the cache to 16 guilds.
        const signature = extra.map(c => [c.id,c.position,c.type,c.parent_id,c.name].join(":")).join("|");
        const references = extra.concat(extra.map(c => source[c.parent_id]).filter(Boolean));
        const cached = hiddenViews.get(guild);
        if (cached && cached.original === result && cached.source === source && cached.signature === signature &&
            references.length === cached.references.length && references.every((c,i) => c === cached.references[i])) return cached.value;
        let next = result;
        function append(key, channels) {
            if (!Array.isArray(result[key])) return;
            const ids = new Set(result[key].map(entry => entry.channel && entry.channel.id));
            const added = [];
            channels.forEach(channel => {
                if (ids.has(channel.id)) return;
                ids.add(channel.id);
                added.push({channel,comparator:channel.position || 0});
            });
            if (!added.length) return;
            if (next === result) next = Object.assign({}, result);
            next[key] = result[key].concat(added).sort((a,b) => a.comparator - b.comparator);
        }
        append("SELECTABLE", extra.filter(c => ![2,13].includes(c.type)));
        append("VOCAL", extra.filter(c => [2,13].includes(c.type)));
        append(4, extra.map(c => source[c.parent_id]).filter(c => c && c.type === 4));
        if (hiddenViews.size >= 16 && !hiddenViews.has(guild)) hiddenViews.delete(hiddenViews.keys().next().value);
        hiddenViews.set(guild, {original:result,source,signature,references,value:next});
        return next;
    }
    function hiddenFetch(original, receiver, args) {
        const channelId = typeof args[0] === "string" ? args[0] : args[0] && args[0].channelId;
        if (!hiddenChannel(channelId)) return original.apply(receiver, args);
        const channel = channelStore.getChannel(channelId);
        showHidden(channel);
        return Promise.resolve();
    }
    function showHidden(channel) {
        if (RN && RN.Alert) RN.Alert.alert("This channel is hidden", "#" + channel.name +
            "\n" + (channel.topic || "No topic.") + "\nYou do not have permission to read messages or join voice here.");
    }
    function hiddenNavigation(original, receiver, args) {
        const route = args[0];
        const match = typeof route === "string" && /^\/channels\/(?:@me|[^/]+)\/([^/?#]+)(?:[/?#]|$)/.exec(route);
        if (!match || !hiddenChannel(match[1])) return original.apply(receiver, args);
        showHidden(channelStore.getChannel(match[1]));
        return; // Metadata-only. Never navigate into a locked chat/voice channel.
    }
    function hiddenGuildNavigation(original, receiver, args) {
        if (!hiddenChannel(args[1])) return original.apply(receiver, args);
        showHidden(channelStore.getChannel(args[1]));
    }
    function sheetComponent(component, channel, onClose) {
        if (!component || !React) return component;
        function transform(original, receiver, args) {
            const tree = original.apply(receiver, args);
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
                    messageActions.jumpToMessage({channelId:channel.id,messageId:channel.id,flash:true,jumpType:"ANIMATED"});
                }});
            return Object.assign({}, props, {children:[row].concat(props.children)});
        }, 0);
    }
    function jumpSheet(original, receiver, args) {
        const tree = original.apply(receiver, args), props = args[0];
        if (!enabled("jumpToTop") || !React || !tree || !props || !messageActions) return tree;
        const channel = props.thread || props.channel || channelStore && channelStore.getChannel(props.channelId);
        if (!channel || ![0,1,3,5,10,11,12].includes(channel.type) || hiddenChannel(channel)) return tree;
        // ChannelLongPressActionSheet returns a connected component. Preserve its
        // React tags and patch its render, not the exports object or frozen element.
        const transformed = addJumpRow(tree, channel, props.onClose);
        if (transformed !== tree) return transformed;
        const type = sheetComponent(tree.type, channel, props.onClose);
        return type === tree.type ? tree : React.createElement(type, tree.props);
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
        const original = exports && exports[key];
        if (typeof original !== "function") return exports;
        const replacement = function () { return operation(original, this, arguments); };
        return replaceValue(exports, key, replacement);
    }
    function hookComponent(exports, operation) {
        const component = exports.default;
        if (component && typeof component === "object" && component.$$typeof) {
            const key = typeof component.type === "function" ? "type" : typeof component.render === "function" ? "render" : null;
            if (!key) return exports;
            const original = component[key];
            const replacement = function () { return operation(original, this, arguments); };
            return replaceValue(exports, "default", cloneWith(component, key, replacement));
        }
        return hookExport(exports, "default", operation);
    }
    function activatePlugins(id, exports) {
        if (id === 14892) exports.SETTING_RENDERER_CONFIG = nativeRegistry(exports.SETTING_RENDERER_CONFIG);
        if (id === 11754) return hookExport(exports, "createList", settingsSections);
        if (id === 14993) SettingsList = exports.SettingsList;
        if (features.copyBios && id === 11503) return hookComponent(exports, copyBio);
        if ((features.dashless || features.hiddenChannels) && id === 4941) return hookExport(exports, "default", channelLabel);
        if (features.favouriteAnything && id === 13288) return hookComponent(exports, favouriteButton);
        if (features.favouriteAnything && id === 10661) return hookExport(exports, "addFavoriteGIF", favouriteAdd);
        if (features.favouriteAnything && id === 10664) return hookExport(exports, "useFavoriteGIFsMobile", favouriteList);
        if (id === 2041) channelStore = exports.default;
        if (features.noTyping && id === 12272) return replaceValue(exports, "default",
            hookExport(hookExport(exports.default, "startTyping", typing), "stopTyping", typing));
        if (features.quickDelete && id === 1115) locale = exports;
        if (features.quickDelete && id === 5141) return replaceValue(exports, "default", hookExport(exports.default, "show", quickConfirm));
        if (features.noDelete && id === 5008) messageStore = exports.default;
        if (features.noDelete && id === 573) {
            dispatcher = exports.default.dispatch.bind(exports.default);
            return replaceValue(exports, "default", hookExport(exports.default, "dispatch", dispatchEvent));
        }
        if (features.hiddenChannels && id === 1074) viewPermission = exports.Permissions && exports.Permissions.VIEW_CHANNEL;
        if (features.hiddenChannels && id === 1101) {
            exports = hookExport(exports, "transitionTo", hiddenNavigation);
            exports = hookExport(exports, "replaceWith", hiddenNavigation);
            return hookExport(exports, "transitionToGuild", hiddenGuildNavigation);
        }
        if (features.hiddenChannels && id === 4427) permissions = exports.default;
        if (features.hiddenChannels && id === 2096) return replaceValue(exports, "default", hookExport(exports.default, "getChannels", hiddenDirectory));
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
            messageActions = actions;
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
        const replacements = new Map();
        let proxy = exports;
        if (features.picker) {
            const patched = pickerComponent(exports);
            if (patched !== exports) return patched;
        }
        // Invocation-scoped captures also work when Hermes eval disables block scoping.
        // The binding check fails fast at hook time (caught as "Hook unavailable",
        // leaving the module stock) instead of crashing the app at call time.
        function replacementFor(operation, original) {
            if (typeof operation !== "function" || typeof original !== "function")
                throw new Error("Venus: unusable export binding for hook");
            return function () { return operation(original, this === proxy ? exports : this, arguments); };
        }
        // Only read explicitly identified export keys, never enumerate or invoke unrelated getters.
        for (const key of ["getAttachmentPayload", "post"]) {
            if (!owns(exports, key)) continue;
            if (key === "getAttachmentPayload" && !features.voice) continue;
            if (key === "post" && (!features.voice || !owns(exports, "get") || !owns(exports, "put"))) continue;
            let original;
            try { original = exports[key]; } catch (_) { continue; }
            if (typeof original !== "function") continue;
            const operation = key === "post" ? postRequest : attachmentPayload;
            const replacement = replacementFor(operation, original);
            replacements.set(key, replacement);
            if (key === "post") status.request = true;
            if (key === "getAttachmentPayload") status.attachment = true;
        }
        if (depth < 2) for (const key of ["default", "HTTP"]) {
            // Data exports only: default getters can be cyclic during module initialization.
            const candidate = data(exports, key);
            if (!candidate || candidate === exports) continue;
            const replacement = instrument(candidate, depth + 1);
            if (replacement !== candidate) replacements.set(key, replacement);
        }
        if (!replacements.size) return exports;
        // Preserve module identity and cached aliases wherever descriptors allow it.
        for (const [key, replacement] of Array.from(replacements)) {
            const descriptor = Object.getOwnPropertyDescriptor(exports, key);
            if (descriptor && descriptor.configurable) {
                Object.defineProperty(exports, key, { value: replacement, writable: true,
                    configurable: true, enumerable: descriptor.enumerable });
                replacements.delete(key);
            } else if (descriptor && "value" in descriptor && descriptor.writable) {
                exports[key] = replacement;
                replacements.delete(key);
            }
        }
        if (!replacements.size) return exports;
        // Only immutable accessor exports need a proxy; never inspect them during RN initialization.
        // Do not violate Proxy invariants on non-writable, non-configurable data properties.
        for (const key of Array.from(replacements.keys())) {
            const descriptor = Object.getOwnPropertyDescriptor(exports, key);
            if (descriptor && !descriptor.configurable && "value" in descriptor && !descriptor.writable)
                replacements.delete(key);
        }
        proxy = new Proxy(exports, { get(target, key, receiver) {
            return replacements.has(key) ? replacements.get(key) : Reflect.get(target, key, receiver);
        } });
        return replacements.size ? proxy : exports;
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
                const result = factory.apply(this, arguments);
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
                            for (const [pendingId, pending] of deferredModules) activateModule(pendingId, pending);
                            deferredModules.clear();
                            return value;
                        };
                    } else if (!environmentReady) deferredModules.set(id, module);
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
