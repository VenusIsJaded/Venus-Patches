// staffTagKind(guildId, authorId): called for every chat row while Show owner and mod tags is on.
var guilds = ["1100000000000000001", "1100000000000000002"], authors = []; for (var i = 0; i < 40; i++) authors.push(String(1200000000000000000 + i * 7919));
var now0 = Date.now();
var cacheOld = new Map();
function kindOld(g, a) {
    var key = g + ":" + a, now = Date.now(), hit = cacheOld.get(key);
    if (hit && now - hit.at < 30000) return hit.kind;
    var kind = a.length % 3 ? null : "mod";
    if (cacheOld.size > 2000) cacheOld.clear();
    cacheOld.set(key, {kind: kind, at: now});
    return kind;
}
var cacheNew = new Map(), cacheSize = 0;
function kindNew(g, a) {
    var now = Date.now(), byAuthor = cacheNew.get(g), hit = byAuthor !== undefined ? byAuthor.get(a) : undefined;
    if (hit && now - hit.at < 30000) return hit.kind;
    var kind = a.length % 3 ? null : "mod";
    if (cacheSize > 2000) { cacheNew.clear(); cacheSize = 0; byAuthor = undefined; }
    if (byAuthor === undefined) cacheNew.set(g, byAuthor = new Map());
    if (!byAuthor.has(a)) cacheSize++;
    byAuthor.set(a, {kind: kind, at: now});
    return kind;
}
function sweep(f) { var n = 0; for (var i = 0; i < 100; i++) if (f(guilds[i & 1], authors[i % 40]) === "mod") n++; return n; }
print("same: " + (sweep(kindOld) === sweep(kindNew)));
bench("staffTag old", function () { sweep(kindOld); });
bench("staffTag new", function () { sweep(kindNew); });
