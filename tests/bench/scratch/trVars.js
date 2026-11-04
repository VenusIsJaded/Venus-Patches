// tr(text, vars) and pl(): a {name} placeholder fill, called for every Venus text with a value in it.
var texts = ["Read {n} of {total} servers", "{name} joined {guild}", "Deleted {count} messages", "Saved {size} to {place}"];
var vars = [{n: 3, total: 10}, {name: "Sam", guild: "Venus"}, {count: 42}, {size: "1.2 MB", place: "Downloads"}];
function oldFill(out, v) { return v ? out.replace(/\{(\w+)\}/g, function (match, name) { return v[name] != null ? String(v[name]) : match; }) : out; }
var FILL = /\{(\w+)\}/g;
function newFill(out, v) { return v ? out.replace(FILL, function (match, name) { return v[name] != null ? String(v[name]) : match; }) : out; }
function sweep(f) { var s = 0; for (var i = 0; i < 100; i++) s += f(texts[i & 3], vars[i & 3]).length; return s; }
var same = true; for (var i = 0; i < 4; i++) if (oldFill(texts[i], vars[i]) !== newFill(texts[i], vars[i]) || oldFill(texts[i], vars[i]) !== newFill(texts[i], vars[i])) same = false;
print("same: " + same + " " + newFill("{a}{b}", {a: 1}));
bench("fill old", function () { sweep(oldFill); });
bench("fill new", function () { sweep(newFill); });
