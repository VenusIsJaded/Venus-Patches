#!/usr/bin/env python3
"""Draw Venus's own device glyphs for Device badges and print them as a JS object.

Developer-only. The glyphs are white shapes on a transparent background; the runtime tints
them with the status color. Run it and paste the output over `const platformPngs = ...`.
"""
import base64
import io
import json
from PIL import Image, ImageDraw

SIZE, SCALE = 48, 8          # final pixels, supersampling factor
W = SIZE * SCALE
INK = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def u(v):  # 0..48 design units -> supersampled pixels
    return round(v * SCALE)


def box(d, x0, y0, x1, y1, r, fill=INK):
    d.rounded_rectangle([u(x0), u(y0), u(x1), u(y1)], radius=u(r), fill=fill)


def desktop(d):
    box(d, 3, 7, 45, 35, 4)
    box(d, 7, 11, 41, 31, 1.5, fill=CLEAR)
    box(d, 21, 35, 27, 40, 0)
    box(d, 13, 39, 35, 43, 2)


def mobile(d):
    box(d, 12, 2, 36, 46, 5)
    box(d, 15.5, 7, 32.5, 37, 1.5, fill=CLEAR)
    d.ellipse([u(21.5), u(39), u(26.5), u(44)], fill=CLEAR)


def web(d):
    d.ellipse([u(3), u(3), u(45), u(45)], fill=INK)
    d.ellipse([u(7), u(7), u(41), u(41)], fill=CLEAR)
    d.ellipse([u(15), u(5), u(33), u(43)], outline=INK, width=u(3.5))
    d.rectangle([u(5), u(22.25), u(43), u(25.75)], fill=INK)


def embedded(d):  # console controller
    box(d, 3, 12, 45, 38, 12)
    box(d, 10, 23, 20, 27, 1, fill=CLEAR)
    box(d, 13, 20, 17, 30, 1, fill=CLEAR)
    d.ellipse([u(29), u(19), u(34), u(24)], fill=CLEAR)
    d.ellipse([u(34), u(25), u(39), u(30)], fill=CLEAR)


def vr(d):  # headset
    box(d, 3, 13, 45, 37, 9)
    box(d, 8, 18, 21, 31, 5, fill=CLEAR)
    box(d, 27, 18, 40, 31, 5, fill=CLEAR)
    d.pieslice([u(19), u(29), u(29), u(41)], 180, 360, fill=CLEAR)


def render(draw):
    image = Image.new("RGBA", (W, W), CLEAR)
    draw(ImageDraw.Draw(image))
    alpha = image.getchannel("A").resize((SIZE, SIZE), Image.LANCZOS)
    out = Image.new("LA", (SIZE, SIZE), 255)
    out.putalpha(alpha)
    buffer = io.BytesIO()
    out.save(buffer, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


if __name__ == "__main__":
    glyphs = {"desktop": desktop, "web": web, "mobile": mobile, "embedded": embedded, "vr": vr}
    print("const platformPngs = " + json.dumps({k: render(v) for k, v in glyphs.items()}) + ";")
