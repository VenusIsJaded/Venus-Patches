// formatSize(): drawn once per media-picker tile (and per compression toast), with Math.log + two Math.pow calls.
function o_formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unit = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    let value = Number((bytes / Math.pow(1024, unit)).toFixed(unit ? 2 : 0));
    if (value >= 1024 && unit < units.length - 1) { unit++; value = Number((bytes / Math.pow(1024, unit)).toFixed(2)); }
    return value + " " + units[unit];
}
// Same five units, chosen by comparisons: no transcendental calls and no array indexing per call.
const UNITS = ["B", "KB", "MB", "GB", "TB"];
function n_formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes === 0) return "0 B";
    let unit = 0, scale = 1;
    while (unit < 4 && bytes >= scale * 1024) { scale *= 1024; unit++; }
    let value = Number((bytes / scale).toFixed(unit ? 2 : 0));
    if (value >= 1024 && unit < 4) { unit++; scale *= 1024; value = Number((bytes / scale).toFixed(2)); }
    return value + " " + UNITS[unit];
}
// A realistic spread: photos, videos, zero-length and odd values, all inside the picker's range.
var SIZES = [];
for (var i = 1; i <= 200; i++) SIZES.push(i * 137 + 1);
for (var j = 1; j <= 100; j++) SIZES.push(j * 3000000 + 7);
for (var k = 0; k < 50; k++) SIZES.push(k * 1048576);
for (var m = 0; m < 20; m++) SIZES.push(m * 1073741824 + 512);
SIZES.push(0, 1, 1023, 1024, 1048575, 1073741824, 1099511627776, -1, NaN, Infinity);
function sweep(fn) { var s = 0; for (var i = 0; i < SIZES.length; i++) s += fn(SIZES[i]).length; return s; }
// Correctness first: a mismatch is a bug, not a slower answer.
var bad = 0;
for (var q = 0; q < SIZES.length; q++) if (o_formatSize(SIZES[q]) !== n_formatSize(SIZES[q])) { bad++; print("MISMATCH " + SIZES[q] + ": " + o_formatSize(SIZES[q]) + " vs " + n_formatSize(SIZES[q])); }
print("mismatches: " + bad + " of " + SIZES.length);
bench("formatSize old", function () { sweep(o_formatSize); });
bench("formatSize new", function () { sweep(n_formatSize); });
