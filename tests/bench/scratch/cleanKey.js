// cleanFormat(): runs for every channel row on every channel list render while Clean channel names is on.
var settings = {cleanChannels: true, cleanChannelsEmoji: true, cleanChannelsSymbols: true, cleanChannelsFonts: false, cleanChannelsSpaces: true};
var cleanNames = new Map(), cleanVersion = "";
function optionsKey() { return (settings.cleanChannelsEmoji ? "e" : "") + (settings.cleanChannelsSymbols ? "s" : "") + (settings.cleanChannelsFonts ? "f" : "") + (settings.cleanChannelsSpaces ? "d" : ""); }
var names = []; for (var i = 0; i < 60; i++) names.push("channel-" + i);
function formatOld(name) {
    var version = optionsKey();
    if (!version) return name;
    if (version !== cleanVersion) { cleanNames.clear(); cleanVersion = version; }
    var cached = cleanNames.get(name);
    if (cached !== undefined) return cached;
    cleanNames.set(name, name + "!"); return name + "!";
}
var seenE, seenS, seenF, seenD, cleanNames2 = new Map(), haveKey = false;
function formatNew(name) {
    var e = settings.cleanChannelsEmoji, s = settings.cleanChannelsSymbols, f = settings.cleanChannelsFonts, d = settings.cleanChannelsSpaces;
    if (!e && !s && !f && !d) return name;
    if (!haveKey || e !== seenE || s !== seenS || f !== seenF || d !== seenD) { cleanNames2.clear(); seenE = e; seenS = s; seenF = f; seenD = d; haveKey = true; }
    var cached = cleanNames2.get(name);
    if (cached !== undefined) return cached;
    cleanNames2.set(name, name + "!"); return name + "!";
}
function sweep(f) { var n = 0; for (var i = 0; i < 60; i++) n += f(names[i]).length; return n; }
print("same: " + (sweep(formatOld) === sweep(formatNew)));
bench("cleanFormat old", function () { sweep(formatOld); });
bench("cleanFormat new", function () { sweep(formatNew); });
