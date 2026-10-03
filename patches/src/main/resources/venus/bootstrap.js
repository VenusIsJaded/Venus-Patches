/* Venus Patches: bundled, offline runtime. No remote code or full client mod required. */
(function (global) {
    "use strict";
    if (global.__venusPatches) return;
    const features = /*__FEATURES__*/;
    // Inspected Metro IDs for the SHA-256-pinned 347.12 bundle. Only these eight factories are wrapped.
    const targetModules = new Set([17, 19, 245, 414, 1151, 1271, 5375, 5377]);
    const revision = "1.0.0-dev.2 / single-load";
    // Module 120 owns setUpDefaltReactNativeEnvironment in this exact asset.
    // Defer every feature hook until that initializer returns successfully.
    let environmentReady = false;
    const deferredModules = new Map();
    const settings = { picker: true, voice: false };
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
    const enabled = key => features[key] && settings[key];

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
        if ((key !== "picker" && key !== "voice") || !features[key]) return false;
        value = !!value;
        if (key === "voice" && !value) activeJobs.forEach(job => {
            job.cancelled = true;
            nativeVoice("cancel", job.id).catch(() => {});
        });
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
                for (const key of ["picker", "voice"])
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
    function drainSizes() {
        if (!files) return;
        while (activeReads < 4 && sizeQueue.length) {
            const entry = sizeQueue.shift();
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
                    const result = Object.assign({}, component, { [key]: replacement });
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

    function Menu() {
        useSettings();
        const [open, setOpen] = React.useState(false);
        const h = React.createElement;
        const label = (text, style) => h(RN.Text, { style: Object.assign({ color: "#f2f3f5", fontSize: 15 }, style) }, text);
        const toggle = (key, title, hint) => features[key] ? h(RN.View, { key, style: { marginVertical: 12 } },
            h(RN.View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } },
                label(title, { flex: 1 }), h(RN.Switch, { value: settings[key],
                    accessibilityLabel: title, onValueChange: value => setSetting(key, value) })),
            label(hint, { color: "#b5bac1", fontSize: 12, marginTop: 4 })) : null;
        return h(React.Fragment, null,
            h(RN.View, { pointerEvents: "box-none", style: {
                position: "absolute", right: 12, bottom: 90, zIndex: 10000
            } }, h(RN.Pressable, { accessibilityRole: "button", accessibilityLabel: "Open Venus patch settings",
                onPress: () => setOpen(true),
                style: { backgroundColor: "#5865f2", padding: 10, borderRadius: 20, elevation: 6 }
            }, label("Venus", { fontWeight: "700", fontSize: 12 }))),
            h(RN.Modal, { visible: open, transparent: true, animationType: "fade", onRequestClose: () => setOpen(false) },
                h(RN.View, { style: { flex: 1, backgroundColor: "#0009", justifyContent: "center", padding: 20 } },
                    h(RN.ScrollView, { style: { flexGrow: 0, maxHeight: "85%", backgroundColor: "#232428", borderRadius: 16 },
                        contentContainerStyle: { padding: 20 } },
                        label("Venus Patches", { fontSize: 24, fontWeight: "700" }),
                        label("Discord attachment tools - " + revision, { color: "#b5bac1", marginTop: 4 }),
                        toggle("picker", "File sizes in picker", "Local metadata only; at most four reads at once."),
                        toggle("voice", "Send audio as voice messages", "Real Ogg/Opus, duration and waveform. Android 10+, one audio file without text."),
                        features.voice ? label("Uses one background codec worker. Unsupported audio stays an ordinary attachment; original files are never changed.",
                            { fontSize: 12, color: "#b5bac1", marginTop: 6 }) : null,
                        label("Diagnostics (hooks load as needed)", { marginTop: 20, fontWeight: "700" }),
                        label((features.picker ? "Picker: " + (status.picker ? "hooked" : "not loaded yet") + "\n" : "") +
                            (features.voice ? "Attachment: " + (status.attachment ? "hooked" : "not loaded yet") +
                                "\nConversion: " + (status.conversion ? "hooked" : "not loaded yet") + "\nRequest: " + (status.request ? "hooked" : "not loaded yet") + "\n" : "") +
                            "Preferences: " + status.storage + (status.audioError ? "\nLast audio error: " + status.audioError : ""), { color: "#b5bac1", fontSize: 12, marginVertical: 8 }),
                        h(RN.Pressable, { onPress: () => setOpen(false), accessibilityRole: "button",
                            style: { backgroundColor: "#5865f2", padding: 12, borderRadius: 8, marginTop: 12 }
                        }, label("Done", { textAlign: "center", fontWeight: "700" }))))));
    }
    function registerRoot(original, receiver, args) {
        const next = Array.from(args);
        const provider = next[1];
        if (typeof provider !== "function" || args[0] !== "Discord") return original.apply(receiver, args);
        next[1] = function () {
            const Component = provider.apply(this, arguments);
            return function VenusRoot(props) {
                if (!React || !RN) return React ? React.createElement(Component, props) : Component(props);
                return React.createElement(RN.View, { style: { flex: 1 } },
                    React.createElement(Component, props), React.createElement(Menu));
            };
        };
        status.menu = true;
        return original.apply(receiver, next);
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
        // Only read explicitly identified export keys, never enumerate or invoke unrelated getters.
        for (const key of ["registerComponent", "getAttachmentPayload", "post"]) {
            if (!owns(exports, key)) continue;
            if (key === "getAttachmentPayload" && !features.voice) continue;
            if (key === "post" && (!features.voice || !owns(exports, "get") || !owns(exports, "put"))) continue;
            let original;
            try { original = exports[key]; } catch (_) { continue; }
            if (typeof original !== "function") continue;
            const operation = key === "registerComponent" ? registerRoot : key === "post" ? postRequest : attachmentPayload;
            const replacement = function () { return operation(original, this === proxy ? exports : this, arguments); };
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
            module.exports = instrument(module.exports, 0);
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
