// segmentedState / searchTabsState / memberListAction / messagesSpecs: one-argument hooks, Hide anything built in but off.
var settings = {hideAnything: false}, features = {hideAnything: true};
function enabled(k) { return !!settings[k] && !!features[k]; }
var React = {useMemo: function (f) { return f(); }};
function useSettings() {}
function copyStatics() {}
function profileTabItems(items) { return Array.isArray(items) && items.length > 0 && !!items[0] && items[0].id === "main" && "page" in items[0]; }
function spotHidden() { return false; }
function hideEditing() { return false; }
// ---- the shared logic, written once (as in the patch)
function segmentedBody(orig, self, args, options) {
    if (!options || typeof options !== "object" || !profileTabItems(options.items)) return orig.apply(self, args);
    useSettings("hideAnything");
    if (!settings.hideAnythingSpots || !enabled("hideAnything")) return orig.apply(self, args);
    return orig.apply(self, args);
}
function searchBody(orig, self, args, options) {
    useSettings("hideAnything");
    if (!options || typeof options !== "object" || !Array.isArray(options.items) || !settings.hideAnythingSpots || !enabled("hideAnything")) return orig.apply(self, args);
    return orig.apply(self, args);
}
function memberBody(out, options) {
    useSettings("hideAnything");
    var channel = options && options.channel, dm = false;
    try { dm = !!channel && typeof channel.isDM === "function" && channel.isDM(); } catch (_) {}
    var mode = !out || !dm || !enabled("hideAnything") ? null : spotHidden("details.newGroup") ? "gone" : hideEditing() ? "edit" : null;
    return React.useMemo(function () { return out; }, [out, mode]);
}
var segmentedOld = function (orig, self, args) { return segmentedBody(orig, self, args, args[0]); };
var searchOld = function (orig, self, args) { return searchBody(orig, self, args, args[0]); };
var memberOld = function (orig, self, args) { var out = orig.apply(self, args); return memberBody(out, args[0]); };
// new: call1 variants
var segmentedNew = segmentedOld, searchNew = searchOld, memberNew = memberOld;
segmentedNew = function (orig, self, args) { return segmentedBody(orig, self, args, args[0]); };
segmentedNew.call1 = function (orig, self, options) {
    if (!options || typeof options !== "object" || !profileTabItems(options.items)) return orig.call(self, options);
    useSettings("hideAnything");
    if (!settings.hideAnythingSpots || !enabled("hideAnything")) return orig.call(self, options);
    return orig.call(self, options);
};
searchNew = function (orig, self, args) { return searchBody(orig, self, args, args[0]); };
searchNew.call1 = function (orig, self, options) {
    useSettings("hideAnything");
    if (!options || typeof options !== "object" || !Array.isArray(options.items) || !settings.hideAnythingSpots || !enabled("hideAnything")) return orig.call(self, options);
    return orig.call(self, options);
};
memberNew = function (orig, self, args) { return memberBody(orig.apply(self, args), args[0]); };
memberNew.call1 = function (orig, self, options) { return memberBody(orig.call(self, options), options); };
function wrapOld(orig, op) { return function () { return op(orig, this, arguments); }; }
function wrapNew(orig, op) { var c = op.call1; return function (a) { return arguments.length === 1 ? c(orig, this, a) : op(orig, this, arguments); }; }
function real(o) { return {tabs: o && o.items}; }
var opts = {items: [{id: "main", page: 1}, {id: "activity", page: 2}], channel: {isDM: function () { return true; }}};
var P = [[segmentedOld, segmentedNew], [searchOld, searchNew], [memberOld, memberNew]];
var oldF = P.map(function (p) { return wrapOld(real, p[0]); }), newF = P.map(function (p) { return wrapNew(real, p[1]); });
function sweep(fs) { var s = 0; for (var i = 0; i < 100; i++) for (var j = 0; j < fs.length; j++) s += fs[j](opts) ? 1 : 0; return s; }
print("same: " + (sweep(oldF) === sweep(newF)));
bench("3 hooks old", function () { sweep(oldF); });
bench("3 hooks new", function () { sweep(newF); });
