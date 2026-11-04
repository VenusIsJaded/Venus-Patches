package app.venus.accounts

import android.content.Context
import java.io.File

/**
 * Notifications from every account, while Discord is open (#152).
 *
 * NotificationClient.showNotification drops every push while Discord is in front (shouldDisplayNotification() is false),
 * because the account you're on gets its own in-app banners from the gateway. Your other saved accounts have no gateway
 * connection, so their pushes were thrown away and you missed them until you left Discord. The patched check asks
 * [showWhileOpen] before dropping one: a push for another saved account is shown like it would be in the background,
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

    // The settings file is read again only when it changed, so a burst of pushes costs one stat each.
    @Volatile private var stamp = Long.MIN_VALUE
    @Volatile private var allowed = false

    /**
     * Whether a push Discord is about to drop because it is in front should be shown anyway. [receivingUserId] is the
     * push's UserId (or null); any problem keeps Discord's own answer (drop it).
     */
    @JvmStatic
    fun showWhileOpen(context: Context?, receivingUserId: Any?): Boolean {
        try {
            if (context == null || receivingUserId == null) return false
            val receiving = receivingUserId.toString()
            if (receiving.length == 0 || !turnedOn(context)) return false
            val current = context.getSharedPreferences(CACHE, Context.MODE_PRIVATE).getString(CURRENT_USER, null)
            return current != null && current.length > 0 && current != receiving
        } catch (_: Throwable) {
            return false
        }
    }

    /** Account switcher on, Notifications from every account on and While Discord is open on, in Venus' saved settings. */
    private fun turnedOn(context: Context): Boolean {
        val file = File(context.filesDir, PREFS)
        if (!file.isFile) return false
        val length = file.length()
        if (length > MAX_PREFS) return false
        val now = file.lastModified() * 31 + length
        if (now == stamp) return allowed
        val json = org.json.JSONObject(String(java.nio.file.Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8))
        val on = json.optBoolean("accountSwitcher", false) && json.optBoolean("accountSwitcherNotify", true) &&
            json.optBoolean("accountSwitcherNotifyOpen", true)
        allowed = on
        stamp = now
        return on
    }
}
