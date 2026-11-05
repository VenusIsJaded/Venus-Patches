// expandBarHeightHook(input): the message bar's height hook, runs on every chat input render.
var expandBar = {live: null};
var settings = {debugLog: false};
function realHook(input) { return {textFieldHeight: {set: function () {}}, textFieldMinHeight: 40, other: input && input.x}; }
function hookOld(orig, self, args) {
    var out = orig.apply(self, args), input = args && args[0];
    var pick = function (key) { return out && out[key] != null ? out[key] : input && input[key]; };
    var live = {textFieldHeight: pick("textFieldHeight"), textFieldMinHeight: pick("textFieldMinHeight")};
    if (live.textFieldHeight && typeof live.textFieldHeight.set === "function") expandBar.live = live;
    return out;
}
function expandBarRemember(out, input) {
    var pick = function (key) { return out && out[key] != null ? out[key] : input && input[key]; };
    var live = {textFieldHeight: pick("textFieldHeight"), textFieldMinHeight: pick("textFieldMinHeight")};
    if (live.textFieldHeight && typeof live.textFieldHeight.set === "function") expandBar.live = live;
    return out;
}
function hookNew(orig, self, args) { return expandBarRemember(orig.apply(self, args), args && args[0]); }
hookNew.call1 = function (orig, self, input) { return expandBarRemember(orig.call(self, input), input); };
function wrapOld(orig, op) { return function () { return op(orig, this, arguments); }; }
function wrapNew(orig, op) { var call1 = op.call1; return function (a) { return arguments.length === 1 ? call1(orig, this, a) : op(orig, this, arguments); }; }
var pOld = wrapOld(realHook, hookOld), pNew = wrapNew(realHook, hookNew);
var input = {x: 1};
function sweep(p) { var s = 0; for (var i = 0; i < 100; i++) { s += p(input).textFieldMinHeight; } return s; }
print("same: " + (sweep(pOld) === sweep(pNew)));
bench("expandBar old", function () { sweep(pOld); });
bench("expandBar new", function () { sweep(pNew); });
