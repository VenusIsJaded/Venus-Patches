package app.venus.patches

import app.morphe.patcher.Fingerprint
import app.morphe.patcher.extensions.InstructionExtensions.addInstructions
import app.morphe.patcher.patch.bytecodePatch
import app.morphe.patcher.patch.rawResourcePatch
import app.morphe.patcher.util.proxy.mutableTypes.MutableMethod
import com.android.tools.smali.dexlib2.iface.Method

/** Native entry-point guards; interfaces, constructors, cleanup and operational network APIs stay intact. */
internal object NativePrivacy {
    enum class Result { VOID, TRUE, FALSE, NULL, SELF, EMPTY_STRING, PROMISE_NULL, PROMISE_TRUE, PROMISE_FALSE, AF_SUCCESS }
    data class Target(val owner: String, val name: String, val parameters: List<String>, val returns: String, val result: Result) {
        fun matches(method: Method) = method.definingClass == owner && method.name == name &&
            method.parameterTypes.map { it.toString() } == parameters && method.returnType == returns
        fun prefix(method: Method): String {
            require(matches(method) && method.implementation != null) { "Native privacy ABI changed: $owner->$name" }
            val registers = method.implementation!!.registerCount
            val isStatic = method.accessFlags and 8 != 0
            fun lastParameter(): Int = parameters.sumOf { if (it == "J" || it == "D") 2 else 1 } - if (isStatic) 1 else 0
            return when (result) {
                Result.VOID -> { require(returns == "V"); "return-void" }
                Result.TRUE, Result.FALSE -> {
                    require(returns == "Z" && registers >= 1)
                    "const/4 v0, ${if (result == Result.TRUE) "0x1" else "0x0"}\nreturn v0"
                }
                Result.NULL -> { require(returns.startsWith("L")); "const/4 v0, 0x0\nreturn-object v0" }
                Result.SELF -> { require(!isStatic && returns == "Lcom/appsflyer/AppsFlyerLib;"); "return-object p0" }
                Result.EMPTY_STRING -> { require(returns == "Ljava/lang/String;"); "const-string v0, \"\"\nreturn-object v0" }
                Result.PROMISE_NULL, Result.PROMISE_TRUE, Result.PROMISE_FALSE -> {
                    require(returns == "V" && parameters.last() == "Lcom/facebook/react/bridge/Promise;" && registers >= 2)
                    val value = when (result) {
                        Result.PROMISE_TRUE -> "sget-object v1, Ljava/lang/Boolean;->TRUE:Ljava/lang/Boolean;"
                        Result.PROMISE_FALSE -> "sget-object v1, Ljava/lang/Boolean;->FALSE:Ljava/lang/Boolean;"
                        else -> "const/4 v1, 0x0"
                    }
                    // Copy first, then borrow low registers: some bridges have no spare locals.
                    "move-object/from16 v0, p${lastParameter()}\n$value\n" +
                        "invoke-interface {v0, v1}, Lcom/facebook/react/bridge/Promise;->resolve(Ljava/lang/Object;)V\nreturn-void"
                }
                Result.AF_SUCCESS -> {
                    require(returns == "V" && parameters.last() == "Lcom/appsflyer/attribution/AppsFlyerRequestListener;")
                    "move-object/from16 v0, p${lastParameter()}\nif-eqz v0, :venus_privacy_done\n" +
                        "invoke-interface {v0}, Lcom/appsflyer/attribution/AppsFlyerRequestListener;->onSuccess()V\n" +
                        ":venus_privacy_done\nreturn-void"
                }
            }
        }
        fun install(method: MutableMethod) { method.addInstructions(0, prefix(method)) }
    }
    val crash = listOf(
        Target("Lcom/discord/crash_reporting/CrashReporting;", "isDisabled", listOf(), "Z", Result.TRUE),
        Target("Lio/sentry/android/core/c1;", "b", listOf("Landroid/content/Context;", "Lio/sentry/android/core/l0;", "Lio/sentry/b4;"), "V", Result.VOID),
        Target("Lio/sentry/android/core/SentryInitProvider;", "onCreate", listOf(), "Z", Result.TRUE),
        Target("Lcom/discord/crash_reporting/NativeCrashReporting\$Companion;", "initNative", listOf("Z"), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "initNativeSdk", listOf("Lcom/facebook/react/bridge/ReadableMap;", "Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_FALSE),
        Target("Lio/sentry/react/RNSentryModule;", "captureEnvelope", listOf("Ljava/lang/String;", "Lcom/facebook/react/bridge/ReadableMap;", "Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_TRUE),
        Target("Lio/sentry/react/RNSentryModule;", "captureReplay", listOf("Z", "Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "captureScreenshot", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "fetchViewHierarchy", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "fetchNativeDeviceContexts", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "fetchNativeAppStart", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "fetchNativeFrames", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "fetchNativeLogAttributes", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "initNativeReactNavigationNewFrameTracking", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lio/sentry/react/RNSentryModule;", "addBreadcrumb", listOf("Lcom/facebook/react/bridge/ReadableMap;"), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "setContext", listOf("Ljava/lang/String;", "Lcom/facebook/react/bridge/ReadableMap;"), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "setExtra", listOf("Ljava/lang/String;", "Ljava/lang/String;"), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "setTag", listOf("Ljava/lang/String;", "Ljava/lang/String;"), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "setUser", listOf("Lcom/facebook/react/bridge/ReadableMap;", "Lcom/facebook/react/bridge/ReadableMap;"), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "enableNativeFramesTracking", listOf(), "V", Result.VOID),
        Target("Lio/sentry/react/RNSentryModule;", "startProfiling", listOf("Z"), "Lcom/facebook/react/bridge/WritableMap;", Result.NULL),
        Target("Lio/sentry/react/RNSentryModule;", "stopProfiling", listOf(), "Lcom/facebook/react/bridge/WritableMap;", Result.NULL),
        Target("Lio/sentry/react/RNSentryModule;", "getCurrentReplayId", listOf(), "Ljava/lang/String;", Result.NULL),
        Target("Lio/sentry/react/RNSentryModule;", "setActiveSpanId", listOf("Ljava/lang/String;"), "Z", Result.FALSE),
        Target("Lcom/discord/crash_reporting/PerformanceTracing;", "start", listOf(), "V", Result.VOID),
    )
    val telemetry = listOf(
        Target("Lcom/discord/analytics/touch/TouchEventAnalyticsModule;", "enableTouchLogging", listOf(), "V", Result.VOID),
        Target("Lcom/discord/analytics/touch/TouchEventAnalyticsModule;", "onEventRecognized", listOf("Lcom/discord/analytics/touch/TouchEventDetails;"), "V", Result.VOID),
        Target("Lcom/discord/analytics/touch/TouchLogger;", "enable", listOf("Landroid/app/Activity;"), "V", Result.VOID),
        Target("Lcom/discord/analytics/touch/TouchLogger;", "handleTouchEvent", listOf("Landroid/view/MotionEvent;", "Landroid/view/ViewGroup;", "Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/discord/analytics/touch/TouchLogger;", "registerListener", listOf("Lcom/discord/analytics/touch/OnEventRecognizedListener;"), "V", Result.VOID),
        Target("Lcom/discord/crash_reporting/TelemetryRing;", "init", listOf("Landroid/content/Context;", "Lcom/discord/crash_reporting/TelemetryRingTypes\$Budget;"), "V", Result.VOID),
        Target("Lcom/discord/crash_reporting/TelemetryRing;", "append", listOf("Ljava/lang/String;", "J", "Ljava/lang/String;", "Ljava/util/Map;", "Ljava/util/List;"), "V", Result.VOID),
        Target("Lcom/discord/crash_reporting/TelemetryRing;", "enqueueWrite", listOf("Lcom/discord/crash_reporting/TelemetryRingSqliteStore\$EntryPayload;"), "V", Result.VOID),
        Target("Lcom/discord/crash_reporting/TelemetryRingModule;", "append", listOf("Ljava/lang/String;", "D", "Ljava/lang/String;", "Lcom/facebook/react/bridge/ReadableMap;", "Lcom/facebook/react/bridge/ReadableArray;"), "V", Result.VOID),
    )
    val attribution = listOf(
        Target("Lcom/discord/analytics/InstallReferrerModule;", "get", listOf("Lcom/facebook/react/bridge/Promise;"), "V", Result.PROMISE_NULL),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "init", listOf("Ljava/lang/String;", "Lcom/appsflyer/AppsFlyerConversionListener;", "Landroid/content/Context;"), "Lcom/appsflyer/AppsFlyerLib;", Result.SELF),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "isStopped", listOf(), "Z", Result.TRUE),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "start", listOf("Landroid/content/Context;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "start", listOf("Landroid/content/Context;", "Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "start", listOf("Landroid/content/Context;", "Ljava/lang/String;", "Lcom/appsflyer/attribution/AppsFlyerRequestListener;"), "V", Result.AF_SUCCESS),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "logEvent", listOf("Landroid/content/Context;", "Ljava/lang/String;", "Ljava/util/Map;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "logEvent", listOf("Landroid/content/Context;", "Ljava/lang/String;", "Ljava/util/Map;", "Lcom/appsflyer/attribution/AppsFlyerRequestListener;"), "V", Result.AF_SUCCESS),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "logSession", listOf("Landroid/content/Context;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "logLocation", listOf("Landroid/content/Context;", "D", "D"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "logAdRevenue", listOf("Lcom/appsflyer/AFAdRevenueData;", "Ljava/util/Map;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setCustomerIdAndLogSession", listOf("Ljava/lang/String;", "Landroid/content/Context;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "updateServerUninstallToken", listOf("Landroid/content/Context;", "Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "performOnAppAttribution", listOf("Landroid/content/Context;", "Ljava/net/URI;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "performOnDeepLinking", listOf("Landroid/content/Intent;", "Landroid/content/Context;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setAdditionalData", listOf("Ljava/util/Map;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setAndroidIdData", listOf("Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setImeiData", listOf("Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setOaidData", listOf("Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setInstallId", listOf("Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setCustomerUserId", listOf("Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setPhoneNumber", listOf("Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setUserEmails", listOf("Lcom/appsflyer/AppsFlyerProperties\$EmailsCryptType;", "[Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setUserEmails", listOf("[Ljava/lang/String;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "setPartnerData", listOf("Ljava/lang/String;", "Ljava/util/Map;"), "V", Result.VOID),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "getAppsFlyerUID", listOf("Landroid/content/Context;"), "Ljava/lang/String;", Result.EMPTY_STRING),
        Target("Lcom/appsflyer/internal/AFa1uSDK;", "getAttributionId", listOf("Landroid/content/Context;"), "Ljava/lang/String;", Result.EMPTY_STRING),
    )
}

@Suppress("unused")
val disableAnalytics = rawResourcePatch(
    name = "Disable analytics",
    description = "APK-level Hermes bytecode guards disable Discord analytics recording, tracking, queue draining, immediate event uploads and CLIENT_TELEMETRY. No in-app switch."
) {
    compatibleWith(discord)
    dependsOn(discordBundleGuard)
    execute { HbcPrivacy.apply(get("assets/index.android.bundle"), HbcPrivacy.analytics) }
}

private val crashTransport = rawResourcePatch {
    dependsOn(discordBundleGuard)
    execute { HbcPrivacy.apply(get("assets/index.android.bundle"), HbcPrivacy.crash) }
}
private val telemetryProducers = rawResourcePatch {
    dependsOn(discordBundleGuard)
    execute { HbcPrivacy.apply(get("assets/index.android.bundle"), HbcPrivacy.telemetry) }
}

@Suppress("unused")
val disableCrashReporting = bytecodePatch(
    name = "Disable crash reporting",
    description = "APK-level guards disable Discord/Sentry native initialization, Rust reporter installation, JavaScript Sentry transports, envelopes, breadcrumbs, replay, screenshots, profiling and device-context collection. No in-app switch."
) {
    compatibleWith(discord)
    dependsOn(crashTransport)
    execute {
        for (target in NativePrivacy.crash) target.install(Fingerprint(
            definingClass = target.owner, name = target.name, parameters = target.parameters, returnType = target.returns
        ).method)
    }
}

@Suppress("unused")
val disableTelemetry = bytecodePatch(
    name = "Disable telemetry and touch logging",
    description = "APK-level guards stop touch/view-hierarchy logging and JavaScript/native telemetry-ring collection, initialization and writes. No in-app switch; existing local files are not erased."
) {
    compatibleWith(discord)
    dependsOn(telemetryProducers)
    execute {
        for (target in NativePrivacy.telemetry) target.install(Fingerprint(
            definingClass = target.owner, name = target.name, parameters = target.parameters, returnType = target.returns
        ).method)
    }
}

@Suppress("unused")
val disableAttribution = bytecodePatch(
    name = "Disable install attribution",
    description = "APK-level guards disable install-referrer lookup, AppsFlyer initialization, starts, event/location reporting, attribution identifiers and personal-data setters. Attribution/deferred deep links may no longer work. No in-app switch."
) {
    compatibleWith(discord)
    dependsOn(discordBundleGuard)
    execute {
        for (target in NativePrivacy.attribution) target.install(Fingerprint(
            definingClass = target.owner, name = target.name, parameters = target.parameters, returnType = target.returns
        ).method)
    }
}
