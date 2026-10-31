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
        out.append("Venus crash report\n==================\n")