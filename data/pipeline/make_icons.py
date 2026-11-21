"""Uygulama ikonlarını (PNG) çizer: mor degrade zemin + konuşma balonu maskot."""
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
for size in (192, 512):
    s = size / 100
    img = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):  # degrade
        t = y / size
        c = (int(107 + (176 - 107) * t), int(91 + (97 - 91) * t), 255)
        d.line([(0, y), (size, y)], fill=c)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(24 * s), fill=255)
    img.putalpha(mask)
    d = ImageDraw.Draw(img)
    d.ellipse([18 * s, 18 * s, 82 * s, 70 * s], fill="white")
    d.polygon([(30 * s, 62 * s), (26 * s, 80 * s), (44 * s, 68 * s)], fill="white")
    d.ellipse([35 * s, 38 * s, 45 * s, 48 * s], fill="#15132b")
    d.ellipse([55 * s, 38 * s, 65 * s, 48 * s], fill="#15132b")
    d.arc([40 * s, 46 * s, 60 * s, 60 * s], 20, 160, fill="#15132b", width=max(2, int(4 * s)))
    d.ellipse([74 * s, 14 * s, 86 * s, 26 * s], fill="#ffb02e")
    img.save(f"{out}/icon-{size}.png")
print("ok")
