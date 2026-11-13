# SVG を headless Chromium で PNG にし、確認用の一覧画像を作る
# py -3 render.py <svgフォルダ> <png出力フォルダ> <一覧画像>
import os, subprocess, sys
from PIL import Image

SHELL = os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1148\chrome-win\headless_shell.exe")
svg_dir, out_dir, sheet = sys.argv[1], sys.argv[2], sys.argv[3]
big_dir = os.path.join(out_dir, "512")
os.makedirs(big_dir, exist_ok=True)
names = sorted(f[:-4] for f in os.listdir(svg_dir) if f.endswith(".svg"))
tmp = os.path.join(out_dir, "_tmp.png")
for n in names:
    url = "file:///" + os.path.abspath(os.path.join(svg_dir, n + ".svg")).replace("\\", "/")
    subprocess.run([SHELL, "--headless", "--disable-gpu", f"--screenshot={tmp}", "--window-size=512,512",
                    "--force-device-scale-factor=2", "--default-background-color=00000000", "--hide-scrollbars", url],
                   check=True, capture_output=True)
    im = Image.open(tmp).convert("RGBA")
    im.resize((512, 512), Image.LANCZOS).save(os.path.join(big_dir, n + ".png"), optimize=True)
    im.resize((256, 256), Image.LANCZOS).save(os.path.join(out_dir, n + ".png"), optimize=True)
os.remove(tmp)

# 一覧（インベントリに近い暗い背景で、100px 表示も並べる）
cols = 5
cell = 256
rows = (len(names) + cols - 1) // cols
sh = Image.new("RGBA", (cols * cell, rows * (cell + 110)), (28, 31, 36, 255))
for i, n in enumerate(names):
    im = Image.open(os.path.join(out_dir, n + ".png"))
    x, y = (i % cols) * cell, (i // cols) * (cell + 110)
    sh.alpha_composite(im, (x, y))
    sm = im.resize((100, 100), Image.LANCZOS)
    sh.alpha_composite(sm, (x + 78, y + cell + 5))
sh.save(sheet)
print("ok", len(names))
