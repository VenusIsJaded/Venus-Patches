package app.venus.accounts

import android.content.Context
import java.io.File

/**
 * Notifications from every account, while Discord is open (#152).
 *
 * NotificationClient.showNotification drops every push while Discord is in front (shouldDisplayNotification() is false),
 * because the account you're on gets its own in-app banners from the gateway. Your other saved accounts have no gateway
 * connection, so their pushes were thrown away and you missed them until you left Discord. The patched check passes
 * Discord's answer through [display] before dropping one: a push for another saved account is shown like it would be in the background,
 * with Discord's own account label in its header. Pushes for the signed-in account stay in-app, as before.
 *
 * Java/Android APIs only: the host's Kotlin helpers are obfuscated.
 */
object AccountNotifications {
    private const val PREFS = "venus-patches.json"
    private const val MAX_PREFS = 4 * 1024 * 1024
    /** Discord's NotificationCache: the account the app is signed in to, written by JS through setCurrentUser. */
    private const val CACHE = "DiscordNotificationClient"
    private const val CURRENT_USER = "CACHE_KEY_CURRENT_USER_ID"
    /** NotificationCache's saved account names, a JSON map of account id to name (setMultiAccountUsernames). */
    private const val ACCOUNT_NAMES = "CACHE_KEY_ACCOUNT_USERNAMES"

    // The settings file is read again only when it changed, so a burst of pushes costs one stat each.
    @Volatile private var stamp = Long.MIN_VALUE
    @Volatile private var allowed = false
    @Volatile private var labels = false

    /** display$1's captured account label, and Discord's getTitle(NotificationData, Context), looked up once. */
    @Volatile private var labelField: java.lang.reflect.Field? = null
    @Volatile private var titleGetter: java.lang.reflect.Method? = null

    /** NotificationData's receiving account getter (Kotlin's mangled name for a value-class result), looked up once. */
    @Volatile private var receivingGetter: java.lang.reflect.Method? = null

    /**
     * Discord's answer to "show this push?" ([shown], false while Discord is in front) and Venus' final one. While Discord
     * is in front, a push for another saved account is shown anyway. One call with no branch in the patched code: the
     * answer goes straight back into Discord's register. Any problem keeps Discord's own answer.
     */
    @JvmStatic
    fun display(shown: Boolean, context: Context?, notification: Any?): Boolean {
        if (shown) {
            try { if (context != null && notification != null && labelsOn(context)) log("push in the background for ..." + tail(receivingId(notification)) + ": shown") } catch (_: Throwable) {}
            return true
        }
        try {
            if (context == null || notification == null) return false
            if (!turnedOn(context)) { log("push while Discord is open: kept in-app (While Discord is open is off)"); return false }
            val receiving = receivingId(notification)
            val current = context.getSharedPreferences(CACHE, Context.MODE_PRIVATE).getString(CURRENT_USER, null)
            val other = receiving != null && current != null && current.length > 0 && current != receiving
            // Ids shortened: enough to tell accounts apart in a shared log, not to identify anyone.
            log("push while Discord is open for ..." + tail(receiving) + ", signed in as ..." + tail(current) +
                if (other) ": another account, shown" else ": the account you're on, kept in-app")
            return other
        } catch (_: Throwable) {
            return false
        }
    }

    /**
     * Which account a notification is for (#152). Discord puts the receiving account's name (getAccountLabel) in the
     * notification's subtext, but Android's conversation layout (Android 11 and newer, every Discord message with a
     * shortcut) never draws the subtext, so the name never showed. The patched renderer passes the conversation title
     * through here: for another saved account it becomes "#channel · account" or, in a DM, "Mika · account", which every
     * layout shows. [owner] is the renderer's coroutine, which holds the label Discord worked out ($accountLabel: null
     * for the account you're on, or with fewer than two saved accounts). Any problem keeps Discord's own title.
     */
    @JvmStatic
    fun title(title: CharSequence?, notification: Any?, context: Context?, owner: Any?): CharSequence? {
        try {
            if (context == null || notification == null || owner == null || !labelsOn(context)) return title
            val label = labelFor(notification, context, owner) ?: return title
            var base: CharSequence? = title
            if (base == null || base.length == 0) {
                var getter = titleGetter
                if (getter == null) {
                    getter = Class.forName("com.discord.notifications.renderer.utils.NotificationDataUtilsKt", false, notification.javaClass.classLoader)
                        .getMethod("getTitle", notification.javaClass, Context::class.java)
                    titleGetter = getter
                }
                base = getter!!.invoke(null, notification, context) as? CharSequence
            }
            if (base == null || base.length == 0) return label
            return StringBuilder(base.length + label.length + 3).append(base).append(" \u00b7 ").append(label).toString()
        } catch (_: Throwable) {
            return title
        }
    }

    /**
     * The conversation shortcut's label (#152). On Android 11 and newer the notification shade replaces a conversation's
     * title with its shortcut's label (SystemUI's ConversationNotificationProcessor: long label, else short label), and
     * Discord builds that label from the plain title, so "· account" from [title] never showed. Another saved account's
     * shortcut gets the same "Name · account" long label; the short label (launcher) stays Discord's. [owner] is the
     * renderer's coroutine, which holds the push, the Context and Discord's account label.
     */
    @JvmStatic
    fun shortcut(info: Any?, owner: Any?) {
        try {
            if (info == null || owner == null) return
            val notification = ownerField(owner, "\$notification") ?: return
            val context = ownerField(owner, "\$context") as? Context ?: return
            if (!labelsOn(context)) return
            val label = labelFor(notification, context, owner) ?: return
            // androidx ShortcutInfoCompat as Discord 351.11 ships it: e = short label, f = long label.
            val long = info.javaClass.getField("f")
            var base = long.get(info) as? CharSequence
            if (base == null || base.length == 0) base = info.javaClass.getField("e").get(info) as? CharSequence
            if (base == null || base.length == 0) return
            long.set(info, join(base, label))
        } catch (_: Throwable) {
        }
    }

    /**
     * The sender of a DM from another saved account (#152). A one-to-one conversation hides the sender's name only when
     * it matches the title, so with "Mika · account" on top, "Mika" was repeated above every message. The sender gets the
     * same name as the title, which keeps Android's normal DM look (their picture, one name) with the account added.
     * Group DMs and servers keep each sender's own name.
     */
    @JvmStatic
    fun sender(person: Any?, owner: Any?) {
        try {
            if (person == null || owner == null) return
            val notification = ownerField(owner, "\$notification") ?: return
            val context = ownerField(owner, "\$context") as? Context ?: return
            if (!labelsOn(context) || isGroup(notification)) return
            val label = labelFor(notification, context, owner) ?: return
            // androidx Person as Discord 351.11 ships it: a = name.
            val name = person.javaClass.getDeclaredField("a")
            name.isAccessible = true
            val base = name.get(person) as? CharSequence ?: return
            name.set(person, join(base, label))
        } catch (_: Throwable) {
        }
    }

    // Java's String.endsWith on purpose: Kotlin's compiles to kotlin.text.StringsKt, which the build refuses (host helpers are obfuscated).
    private fun join(base: CharSequence, label: String): CharSequence {
        val tail = " \u00b7 " + label
        if ((base.toString() as java.lang.String).endsWith(tail)) return base
        return StringBuilder(base.length + tail.length).append(base).append(tail).toString()
    }

    private fun ownerField(owner: Any, name: String): Any? {
        val field = owner.javaClass.getDeclaredField(name)
        field.isAccessible = true
        return field.get(owner)
    }

    @Volatile private var groupCheck: java.lang.reflect.Method? = null

    private fun isGroup(notification: Any): Boolean {
        var check = groupCheck
        if (check == null) {
            check = Class.forName("com.discord.notifications.renderer.utils.NotificationDataUtilsKt", false, notification.javaClass.classLoader)
                .getMethod("isGroupConversation", notification.javaClass)
            groupCheck = check
        }
        return check!!.invoke(null, notification) == true
    }

    /** The receiving account's name for another saved account's push: Discord's own label, else its saved name. */
    private fun labelFor(notification: Any, context: Context, owner: Any): String? {
        var field = labelField
        if (field == null || field.declaringClass != owner.javaClass) {
            field = owner.javaClass.getDeclaredField("\$accountLabel")
            field!!.isAccessible = true
            labelField = field
        }
        val own = field!!.get(owner) as? String
        return if (own != null && own.length > 0) own else savedName(context, notification)
    }

    private fun tail(id: String?): String = if (id == null || id.length == 0) "?" else (id as java.lang.String).substring(Math.max(0, id.length - 4))

    /** One line in Discord's logcat, which Venus' Copy logs includes, so a report shows what happened to each push. */
    private fun log(text: String) {
        try { android.util.Log.i("VenusAccounts", text) } catch (_: Throwable) {}
    }

    /** The account a push was sent to, from NotificationData's receiving-user getter, or null. */
    private fun receivingId(notification: Any): String? {
        var getter = receivingGetter
        if (getter == null || getter.declaringClass != notification.javaClass) {
            getter = notification.javaClass.getMethod("getReceivingUserId-wUX8bhU")
            receivingGetter = getter
        }
        val id = getter!!.invoke(notification)?.toString()
        return if (id == null || id.length == 0) null else id
    }

    /**
     * The receiving account's name from Discord's own NotificationCache, when it isn't the account you're on. Discord's
     * getAccountLabel gives up unless that cache already lists two or more accounts, which it only fills after a sync;
     * this reads the same names without that condition, so a push from another account is never left unlabelled.
     */
    private fun savedName(context: Context, notification: Any): String? {
        val receiving = receivingId(notification) ?: return null
        val prefs = context.getSharedPreferences(CACHE, Context.MODE_PRIVATE)
        val current = prefs.getString(CURRENT_USER, null)
        if (current == null || current.length == 0 || current == receiving) return null
        val names = prefs.getString(ACCOUNT_NAMES, null) ?: return null
        val name = org.json.JSONObject(names).optString(receiving, "")
        return if (name.length == 0) null else name
    }

    /** Account switcher on, Notifications from every account on and While Discord is open on, in Venus' saved settings. */
    private fun turnedOn(context: Context): Boolean = refresh(context) && allowed

    /** Account switcher and Notifications from every account on: other accounts' notifications say which account they're for. */
    private fun labelsOn(context: Context): Boolean = refresh(context) && labels

    /** Reads Venus' saved settings again when the file changed; false when there's no file to read. */
    private fun refresh(context: Context): Boolean {
        val file = File(context.filesDir, PREFS)
        if (!file.isFile) return false
        val length = file.length()
        if (length > MAX_PREFS) return false
        val now = file.lastModified() * 31 + length
        if (now == stamp) return true
        val json = org.json.JSONObject(String(java.nio.file.Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8))
        val every = json.optBoolean("accountSwitcher", false) && json.optBoolean("accountSwitcherNotify", true)
        labels = every
        allowed = every && json.optBoolean("accountSwitcherNotifyOpen", true)
        stamp = now
        return true
    }
}
