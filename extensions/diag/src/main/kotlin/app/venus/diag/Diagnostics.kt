@file:Suppress("PLATFORM_CLASS_MAPPED_TO_KOTLIN", "DEPRECATION")

package app.venus.diag

import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.os.Debug
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.StatFs
import android.provider.MediaStore
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.facebook.react.bridge.Promise
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.PrintWriter
import java.io.StringWriter
import java.lang.ref.WeakReference
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Crash screen and troubleshooting logs.
 *
 * When Discord crashes (a Java/Kotlin exception, a fatal JavaScript error React Native rethrows as one, and on Android 11
 * or newer also native crashes and "isn't responding"), a report is written to Discord's private files: what was
 * thrown, every cause, every thread, the device, memory, the Venus settings that are on, Venus's own debug log and
 * this process's logcat. The next time Discord opens, it's shown on a full-screen page with Copy, Share and Export.
 *
 * Venus settings reaches the same reports, the device details and logcat through FileModule.clearFolder with a private
 * prefix (Discord only ever passes "cache" or "documents" as the folder). Only Java/Android APIs: the host's Kotlin
 * helpers are obfuscated.
 */
object Diagnostics {
    private const val PREFS = "venus-patches.json"
    private const val FOLDER = "venus-files"
    private const val PENDING = "crash-pending.txt"
    private const val LAST = "crash-last.txt"
    private const val SEEN = "crash-exit-seen.txt"
    private const val STRINGS = "venus-crash-strings.json"
    private const val JS_LOG = "venus-log.txt"
    private const val PREFIX = "venus-diag-v1:"
    private const val MAX_REPORT = 768 * 1024
    private const val MAX_SHOWN = 160 * 1024
    private const val MAX_SHARED = 180 * 1024
    private const val MAX_CLIP = 700 * 1024

    private const val BG = 0xFF1A1A1E.toInt()
    private const val CARD = 0xFF242429.toInt()
    private const val CARD_EDGE = 0x14FFFFFF
    private const val TEXT = 0xFFF2F3F5.toInt()
    private const val MUTED = 0xFF949BA4.toInt()
    private const val MONO = 0xFFDBDEE1.toInt()
    private const val RED = 0xFFF23F43.toInt()
    private const val BRAND = 0xFF5865F2.toInt()
    private const val NEUTRAL = 0xFF4E5058.toInt()

    @Volatile private var app: Context? = null
    @Volatile private var startedAt = 0L
    @Volatile private var screenOn = true
    @Volatile private var recording = false
    @Volatile private var showing = false
    @Volatile private var current: WeakReference<Activity>? = null
    private val main = Handler(Looper.getMainLooper())

    /** Right after Application.onCreate's super call. Any problem here leaves Discord exactly as it was. */
    @JvmStatic
    fun init(context: Context?) {
        try {
            val c = context?.applicationContext ?: context ?: return
            if (app != null) return
            app = c
            startedAt = System.currentTimeMillis()
            screenOn = crashScreenSetting(c)
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            if (previous !is Catcher) Thread.setDefaultUncaughtExceptionHandler(Catcher(previous))
            if (c is Application) c.registerActivityLifecycleCallbacks(Lifecycle())
            // Android 11+ remembers why the last process ended: native crashes and ANRs never reach a Java handler.
            if (Build.VERSION.SDK_INT >= 30) Thread(object : Runnable { override fun run() { checkExitReasons(c) } }, "venus-exit-reasons").start()
        } catch (_: Throwable) { }
    }

    private class Catcher(private val next: Thread.UncaughtExceptionHandler?) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(thread: Thread, error: Throwable) {
            if (!recording) {
                recording = true
                try { save(javaReport(thread, error)) } catch (_: Throwable) { }
            }
            if (next != null) next.uncaughtException(thread, error)
            else { Process.killProcess(Process.myPid()); System.exit(10) }
        }
    }

    private class Lifecycle : Application.ActivityLifecycleCallbacks {
        override fun onActivityCreated(activity: Activity, state: Bundle?) { }
        override fun onActivityStarted(activity: Activity) { }
        override fun onActivityResumed(activity: Activity) {
            current = WeakReference(activity)
            // After Discord's first frames, so the page lands on top of its splash instead of under it.
            main.postDelayed(object : Runnable { override fun run() { showPending() } }, 700)
        }
        override fun onActivityPaused(activity: Activity) { }
        override fun onActivityStopped(activity: Activity) { }
        override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) { }
        override fun onActivityDestroyed(activity: Activity) {
            if (current?.get() === activity) current = null
        }
    }

    // ---------------------------------------------------------------- reports

    private fun folder(c: Context): File {
        val dir = File(c.filesDir, FOLDER)
        if (!dir.isDirectory) dir.mkdirs()
        return dir
    }

    private fun save(report: String) {
        val c = app ?: return
        val text = cap(report, MAX_REPORT)
        write(File(folder(c), LAST), text)
        if (screenOn) write(File(folder(c), PENDING), text)
    }

    private fun javaReport(thread: Thread, error: Throwable): String {
        var root = error
        var depth = 0
        while (root.cause != null && root.cause !== root && depth < 20) { root = root.cause!!; depth++ }
        val where = if (root.stackTrace.isNotEmpty()) root.stackTrace[0].toString() else ""
        val out = java.lang.StringBuilder(64 * 1024)
        header(out, if (isJavaScript(error)) "JavaScript error" else "Java crash")
        section(out, "What went wrong")
        out.append(firstLine(root.toString())).append('\n')
        if (where.length > 0) out.append("  at ").append(where).append('\n')
        if (root !== error) out.append("Thrown as: ").append(firstLine(error.toString())).append('\n')
        out.append("Thread: ").append(thread.name).append(" (id ").append(thread.id).append(", priority ").append(thread.priority).append(")\n")
        section(out, "Stack trace")
        val trace = StringWriter()
        error.printStackTrace(PrintWriter(trace))
        out.append(trace.toString())
        details(out)
        threads(out, thread)
        val log = logcat(1500)
        section(out, "Logcat (this process, last 1500 lines)")
        out.append(if (log.length > 0) log else "(unavailable)\n")
        return out.toString()
    }

    private fun isJavaScript(error: Throwable): Boolean {
        var e: Throwable? = error
        var depth = 0
        while (e != null && depth < 20) {
            val name = e.javaClass.name as java.lang.String
            if (name.indexOf("JavascriptException") >= 0 || name.indexOf("JSException") >= 0) return true
            e = e.cause; depth++
        }
        return false
    }

    private fun header(out: java.lang.StringBuilder, kind: String) {
        val now = System.currentTimeMillis()
        out.append("Venus crash report\n==================\n")        line(out, "Kind", kind)
        line(out, "When", stamp(now) + " (" + zone() + ")")
        line(out, "Discord open for", duration(now - startedAt))
        val c = app
        if (c != null) {
            line(out, "Venus Patches", venusRevision(c))
            line(out, "Discord", discordVersion(c))
        }
    }

    private fun section(out: java.lang.StringBuilder, title: String) {
        out.append("\n--- ").append(title).append(" ---\n")
    }

    private fun line(out: java.lang.StringBuilder, key: String, value: Any?) {
        out.append(key).append(": ").append(value?.toString() ?: "unknown").append('\n')
    }

    /** Everything about the phone, Discord and Venus that can matter: shared by crash reports and Venus's log export. */
    private fun details(out: java.lang.StringBuilder) {
        val c = app ?: return
        section(out, "Discord and Venus")
        line(out, "Venus Patches", venusRevision(c))
        line(out, "Discord", discordVersion(c))
        line(out, "Package", c.packageName)
        line(out, "Installed by", try { installer(c) } catch (_: Throwable) { null })
        line(out, "Process", processName())
        line(out, "Crash screen", if (screenOn) "on" else "off")
        section(out, "Device")
        line(out, "Model", Build.MANUFACTURER + " " + Build.MODEL + " (" + Build.DEVICE + ", " + Build.PRODUCT + ")")
        line(out, "Brand", Build.BRAND)
        line(out, "Hardware", Build.HARDWARE + ", board " + Build.BOARD)
        if (Build.VERSION.SDK_INT >= 31) line(out, "Chip", Build.SOC_MANUFACTURER + " " + Build.SOC_MODEL)
        line(out, "Android", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + "), security patch " + Build.VERSION.SECURITY_PATCH)
        line(out, "Build", Build.DISPLAY)
        line(out, "Fingerprint", Build.FINGERPRINT)
        line(out, "ABIs", TextUtils.join(", ", Build.SUPPORTED_ABIS))
        line(out, "Kernel", System.getProperty("os.version"))
        val props = props()
        if (props.length > 0) out.append(props)
        section(out, "Display")
        try {
            val m = c.resources.displayMetrics
            val conf = c.resources.configuration
            line(out, "Density", m.density.toString() + " (" + m.densityDpi + " dpi)" + (if (m.density * 4f != Math.round(m.density * 4f).toFloat() || m.density != Math.round(m.density).toFloat()) ", not a whole number" else ""))
            line(out, "Font scale", conf.fontScale.toString() + " (scaled density " + m.scaledDensity + ")")
            if (Build.VERSION.SDK_INT >= 31) line(out, "Bold text adjustment", conf.fontWeightAdjustment)
            line(out, "Screen", m.widthPixels.toString() + " x " + m.heightPixels + " px, " + conf.screenWidthDp + " x " + conf.screenHeightDp + " dp, smallest " + conf.smallestScreenWidthDp + " dp")
            line(out, "Dark mode", if ((conf.uiMode and 0x30) == 0x20) "on" else "off")
            line(out, "Language", if (Build.VERSION.SDK_INT >= 24) conf.locales.toLanguageTags() else Locale.getDefault().toLanguageTag())
            line(out, "Layout direction", if (conf.layoutDirection == View.LAYOUT_DIRECTION_RTL) "right to left" else "left to right")
            val activity = current?.get()
            if (activity != null && Build.VERSION.SDK_INT >= 30) line(out, "Refresh rate", activity.display?.refreshRate)
        } catch (_: Throwable) { }
        section(out, "Memory and storage")
        try {
            val am = c.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mi = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mi)
            line(out, "Phone memory", mb(mi.availMem) + " free of " + mb(mi.totalMem) + (if (mi.lowMemory) ", LOW" else "") + ", low at " + mb(mi.threshold))
            line(out, "Low-RAM device", am.isLowRamDevice)
            line(out, "App memory class", am.memoryClass.toString() + " MB (large " + am.largeMemoryClass + " MB)")
            val r = Runtime.getRuntime()
            line(out, "Java heap", mb(r.totalMemory() - r.freeMemory()) + " used, " + mb(r.maxMemory()) + " max")
            line(out, "Native heap", mb(Debug.getNativeHeapAllocatedSize()) + " used of " + mb(Debug.getNativeHeapSize()))
            val pss = Debug.MemoryInfo()
            Debug.getMemoryInfo(pss)
            line(out, "Total PSS", mb(pss.totalPss * 1024L))
            val fs = StatFs(c.filesDir.path)
            line(out, "Storage", mb(fs.availableBytes) + " free of " + mb(fs.totalBytes))
        } catch (_: Throwable) { }
        section(out, "System settings")
        try {
            val power = c.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            line(out, "Battery saver", power.isPowerSaveMode)
            line(out, "Ignores battery optimization", power.isIgnoringBatteryOptimizations(c.packageName))
            line(out, "Animation scale", android.provider.Settings.Global.getFloat(c.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f))
            val net = c.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            line(out, "Data saver", when (net.restrictBackgroundStatus) { 3 -> "on"; 2 -> "on, Discord allowed"; else -> "off" })
            line(out, "Time zone", zone())
        } catch (_: Throwable) { }
        section(out, "Venus settings")
        out.append(venusSettings(c))
        section(out, "Venus log (most recent " + logSize() + " lines)")
        out.append(logText(c))
    }

    private fun threads(out: java.lang.StringBuilder, crashed: Thread?) {
        section(out, "Threads")
        try {
            val all = Thread.getAllStackTraces()
            val mainThread = Looper.getMainLooper().thread
            val order = java.util.ArrayList<Thread>()
            if (all.containsKey(mainThread)) order.add(mainThread)
            if (crashed != null && crashed !== mainThread && all.containsKey(crashed)) order.add(crashed)
            for (t in all.keys) if (t !== mainThread && t !== crashed) order.add(t)
            var shown = 0
            for (t in order) {
                if (shown++ >= 80) { out.append("... ").append(order.size - 80).append(" more threads\n"); break }
                val frames = all.get(t) ?: continue
                out.append('"').append(t.name).append("\" ").append(t.state).append(if (t.isDaemon) " daemon" else "")
                    .append(if (t === crashed) "  <- crashed" else "").append('\n')
                var i = 0
                while (i < frames.size && i < 30) { out.append("    at ").append(frames[i]).append('\n'); i++ }
                if (frames.size > 30) out.append("    ... ").append(frames.size - 30).append(" more\n")
            }
        } catch (_: Throwable) { out.append("(unavailable)\n") }
    }

    /** Discord's own lines from Android's log. An app can only ever read the lines from its own user id. */
    private fun logcat(lines: Int, onlyThisProcess: Boolean = true): String {
        val args = java.util.ArrayList<String>()
        args.add("logcat"); args.add("-d"); args.add("-v"); args.add("threadtime"); args.add("-b"); args.add("main,system,crash")
        args.add("-t"); args.add(lines.toString())
        if (onlyThisProcess) { args.add("--pid"); args.add(Process.myPid().toString()) }
        return run(args.toArray(arrayOfNulls<String>(0)), 2 * 1024 * 1024)
    }

    private fun run(command: Array<String?>, limit: Int): String = try {
        val p = Runtime.getRuntime().exec(command)
        val text = readAll(p.inputStream, limit)
        try { p.destroy() } catch (_: Throwable) { }
        text
    } catch (_: Throwable) { "" }

    private val PROPS = arrayOf("ro.product.marketname", "ro.miui.ui.version.name", "ro.mi.os.version.name", "ro.mi.os.version.incremental",
        "ro.build.version.oneui", "ro.build.version.emui", "ro.build.version.opporom", "ro.vivo.os.version", "ro.board.platform",
        "ro.hardware.egl", "ro.hardware.vulkan", "debug.hwui.renderer", "ro.sf.lcd_density", "persist.sys.font", "ro.build.characteristics")

    /** ROM details Android's Build doesn't have (MIUI/HyperOS, One UI, the GPU driver), from getprop. */
    private fun props(): String {
        val all = run(arrayOf("getprop"), 512 * 1024) as java.lang.String
        val out = java.lang.StringBuilder()
        for (key in PROPS) {
            val at = all.indexOf("[" + key + "]: [")
            if (at < 0) continue
            val start = at + key.length + 6
            val end = all.indexOf("]", start)
            if (end > start) out.append(key).append(": ").append(all.substring(start, end)).append('\n')
        }
        return out.toString()
    }
