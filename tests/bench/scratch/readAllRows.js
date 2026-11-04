// Read all: itemSize(section) and renderItem(section, ...) wrap every row of the server bar list.
var settings = {readAll: true, debugLog: false}, features = {readAll: true};
function enabled(k) { return !!settings[k] && !!features[k]; }
var READ_ALL_HEIGHT = 40, separator = 6;
var real = {
    itemSize: function (section) { return section === 6 ? 20 : 48; },
    renderItem: function (section, index) { return {type: "row", section: section, index: index}; }
};
var itemSize = real.itemSize, renderItem = real.renderItem;
var oldData = {
    itemSize: function (section) { var size = itemSize.apply(this, arguments); return section === separator && enabled("readAll") ? size + READ_ALL_HEIGHT : size; },
    renderItem: function (section) {
        var node = renderItem.apply(this, arguments);
        if (section !== separator || !enabled("readAll")) return node;
        return {wrap: node};
    }
};
var newData = {
    itemSize: function (section, a) {
        var n = arguments.length, size = n === 1 ? itemSize.call(this, section) : n === 2 ? itemSize.call(this, section, a) : itemSize.apply(this, arguments);
        return section === separator && enabled("readAll") ? size + READ_ALL_HEIGHT : size;
    },
    renderItem: function (section, a) {
        var n = arguments.length, node = n === 1 ? renderItem.call(this, section) : n === 2 ? renderItem.call(this, section, a) : renderItem.apply(this, arguments);
        if (section !== separator || !enabled("readAll")) return node;
        return {wrap: node};
    }
};
function sweep(d) { var s = 0; for (var i = 0; i < 100; i++) { s += d.itemSize(i % 8); var r = d.renderItem(i % 8, i); s += r.index === undefined ? 0 : 1; } return s; }
function sig(d) { var out = []; for (var i = 0; i < 12; i++) { out.push(d.itemSize(i % 8), JSON.stringify(d.renderItem(i % 8, i)), JSON.stringify(d.renderItem(i % 8, i, 1, 2))); } return out.join("|"); }
print("same output: " + (sig(oldData) === sig(newData)));
bench("rows old", function () { sweep(oldData); });
bench("rows new", function () { sweep(newData); });
