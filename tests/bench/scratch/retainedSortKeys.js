// noDelete's retained view: sort keys for every message of the window, and the bounds check per kept message.
var array = []; for (var i = 0; i < 3000; i++) array.push({id: String(1100000000000000000 + i * 104729)});
var kept = []; for (var j = 0; j < 200; j++) kept.push({id: String(1100000000000000000 + j * 1500011), message: {}});
function keysOld() { var count = array.length, items = new Array(count); for (var i = 0; i < count; i++) { var text = String(array[i].id); items[i] = {message: array[i], id: /^\d+$/.test(text) ? text : null}; } return items; }
var DIGITS = /^\d+$/;
function keysNew() { var count = array.length, items = new Array(count); for (var i = 0; i < count; i++) { var text = String(array[i].id); items[i] = {message: array[i], id: DIGITS.test(text) ? text : null}; } return items; }
function boundsOld() { var n = 0, first = array[0].id; var bounded = first !== null && /^\d+$/.test(first); for (var i = 0; i < kept.length; i++) { var id = String(kept[i].id); if (bounded && /^\d+$/.test(id)) n++; } return n; }
function boundsNew() { var n = 0, first = array[0].id; var bounded = first !== null && DIGITS.test(first); for (var i = 0; i < kept.length; i++) { var id = String(kept[i].id); if (bounded && DIGITS.test(id)) n++; } return n; }
var a = keysOld(), b = keysNew(), same = boundsOld() === boundsNew();
for (var k = 0; k < a.length; k++) if (a[k].id !== b[k].id) same = false;
print("same: " + same);
bench("keys+bounds old", function () { keysOld(); boundsOld(); });
bench("keys+bounds new", function () { keysNew(); boundsNew(); });
