#!/usr/bin/env python3
"""Published measurement kit for PNGToolbox and FitMyPic.

    python3 bench_kit.py all       # corpus + all studies + charts
    python3 bench_kit.py corpus    # regenerate the test images
    python3 bench_kit.py formats   # study A  -> study-a-format.csv
    python3 bench_kit.py quality   # study B  -> study-b-*.csv
    python3 bench_kit.py resize    # study C  -> study-c-*.csv
    python3 bench_kit.py charts    # SVG charts used in the articles

Requires Pillow, NumPy and SciPy. No network access, no third-party images: the
corpus is generated from a fixed seed so anyone can rebuild identical inputs.
The published numbers were produced with Pillow 11.0.0, NumPy 2.1.3 and
SciPy 1.13.1 on 22 October 2026.
"""
import csv, json, os, re, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "corpus")
DATA = os.path.join(HERE, "data")
WEBP_Q, JPG_Q = 80, 85
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _fonts():
    for f in (FONT, "/usr/share/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf"):
        if os.path.exists(f):
            return f, f.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
    return None, None


# ---------------------------------------------------------------- corpus ----
def photo(w=1600, h=1200, seed=20261022):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    base = np.zeros((h, w, 3), np.float64)
    base[..., 0] = 120 + 90 * np.sin(xx / 220.0) * np.cos(yy / 310.0)
    base[..., 1] = 110 + 70 * np.sin((xx + yy) / 260.0)
    base[..., 2] = 100 + 80 * np.cos(xx / 180.0) * np.sin(yy / 240.0)
    for _ in range(240):
        cx, cy, r = int(rng.integers(0, w)), int(rng.integers(0, h)), int(rng.integers(6, 26))
        yy2, xx2 = np.mgrid[max(0, cy - r):min(h, cy + r), max(0, cx - r):min(w, cx + r)]
        m = (xx2 - cx) ** 2 + (yy2 - cy) ** 2 <= r * r
        base[max(0, cy - r):min(h, cy + r), max(0, cx - r):min(w, cx + r)][m] += rng.normal(0, 22, 3)
    base += rng.normal(0, 4.2, base.shape)
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def screenshot(w=1920, h=1080):
    f, fb = _fonts()
    if not f:
        raise SystemExit("A DejaVu font is needed for the screenshot fixture")
    f9, f13, f20 = (ImageFont.truetype(f, s) for s in (13, 18, 26))
    im = Image.new("RGB", (w, h), (246, 247, 249))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, 64], fill=(28, 30, 36))
    d.text((24, 20), "PNGToolbox", font=f20, fill=(240, 240, 240))
    for i, t in enumerate(["Converter", "Features", "FAQ", "Guides", "About"]):
        d.text((420 + i * 130, 24), t, font=f13, fill=(186, 190, 196))
    d.rectangle([40, 100, 520, h - 40], fill=(255, 255, 255), outline=(219, 222, 228))
    for i, t in enumerate(["WebP to PNG", "Batch ZIP export", "Keep transparency", "Pick JPG quality",
                           "Resize on convert", "Measured report", "No upload", "No account"] * 2):
        d.text((64, 128 + i * 28), f"\u2022 {t}", font=f9, fill=(72, 76, 84))
    thumb = photo(262, 90)
    for r in range(5):
        for c in range(4):
            x, y = 580 + c * 320, 120 + r * 180
            d.rectangle([x, y, x + 290, y + 150], fill=(255, 255, 255), outline=(224, 226, 232))
            im.paste(thumb, (x + 14, y + 14))
            d.text((x + 14, y + 116), f"image_{r * 4 + c}.png", font=f9, fill=(70, 74, 82))
            d.text((x + 200, y + 116), "convert", font=f9, fill=(31, 111, 92))
    d.text((580, 1030), "\u00a9 2026 \u2014 all conversion runs on your device", font=f9, fill=(140, 144, 152))
    return im


def logo(w=800, h=800):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([40, 40, w - 40, h - 40], fill=(28, 122, 92, 255))
    d.polygon([(240, 560), (400, 240), (560, 560)], fill=(255, 255, 255, 255))
    d.ellipse([330, 330, 470, 470], fill=(255, 214, 102, 255))
    d.rectangle([100, 620, 700, 660], fill=(255, 255, 255, 255))
    return im


def flat_art(w=1200, h=1200, seed=7):
    rng = np.random.default_rng(seed)
    im = Image.new("RGB", (w, h), (250, 246, 238))
    d = ImageDraw.Draw(im)
    pal = [(232, 93, 76), (58, 108, 176), (247, 190, 76), (46, 134, 108), (34, 34, 40), (214, 208, 196)]
    for i in range(28):
        c = pal[i % len(pal)]
        x, y, s = int(rng.integers(0, w)), int(rng.integers(0, h)), int(rng.integers(80, 340))
        if i % 3 == 0:
            d.rectangle([x, y, x + s, y + s], fill=c)
        elif i % 3 == 1:
            d.ellipse([x, y, x + s, y + s], fill=c)
        else:
            d.polygon([(x, y), (x + s, y + s // 3), (x + s // 2, y + s)], fill=c)
    return im


def product_cutout(w=1400, h=1400):
    bg = photo(w, h).filter(ImageFilter.GaussianBlur(1.2))
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([260, 180, w - 260, h - 220], radius=70, fill=255)
    d.ellipse([160, 120, 420, 380], fill=255)
    out = bg.convert("RGBA")
    out.putalpha(mask)
    return out


def gradient(w=1600, h=900):
    yy, xx = np.mgrid[0:h, 0:w]
    t = xx / w
    arr = np.stack([255 * t, 255 * (1 - abs(t - 0.5) * 2), 255 * (1 - t)], -1)
    arr = arr + 6 * np.sin(xx / 9.0)[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def make_corpus():
    os.makedirs(CORPUS, exist_ok=True)
    items = {"photo": photo(), "screenshot": screenshot(), "logo": logo(),
             "flat-art": flat_art(), "product-cutout": product_cutout(), "gradient": gradient()}
    for name, im in items.items():
        p = os.path.join(CORPUS, name + ".png")
        im.save(p, optimize=True)
        print(f"  {name:16} {im.mode:5} {im.size[0]}x{im.size[1]}  {os.path.getsize(p)/1024:8.1f} KB")


# --------------------------------------------------------------- metrics ----
def to_gray(a):
    a = a.astype(np.float64)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2] if a.ndim == 3 else a


def psnr(ref, test):
    mse = float(np.mean((to_gray(np.asarray(ref)) - to_gray(np.asarray(test))) ** 2))
    return 99.0 if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)


def ssim(ref, test):
    from scipy.ndimage import uniform_filter
    r, t = to_gray(np.asarray(ref)), to_gray(np.asarray(test))
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu1, mu2 = uniform_filter(r, 8), uniform_filter(t, 8)
    s1, s2 = uniform_filter(r * r, 8) - mu1 * mu1, uniform_filter(t * t, 8) - mu2 * mu2
    s12 = uniform_filter(r * t, 8) - mu1 * mu2
    return float((((2 * mu1 * mu2 + C1) * (2 * s12 + C2)) /
                  ((mu1 ** 2 + mu2 ** 2 + C1) * (s1 + s2 + C2))).mean())


def flatten(im, bg=(255, 255, 255)):
    if im.mode in ("RGBA", "LA"):
        base = Image.new("RGB", im.size, bg)
        base.paste(im, mask=im.getchannel("A"))
        return base
    return im.convert("RGB")


def kb(path):
    return os.path.getsize(path) / 1024.0


# --------------------------------------------------------------- study A ----
def study_formats():
    os.makedirs(DATA, exist_ok=True)
    rows = []
    for name in ["photo", "screenshot", "logo", "flat-art", "product-cutout", "gradient"]:
        src = Image.open(f"{CORPUS}/{name}.png")
        alpha = src.mode in ("RGBA", "LA")
        src.save(f"{DATA}/{name}.webp", quality=WEBP_Q, method=4)
        decoded = Image.open(f"{DATA}/{name}.webp")
        decoded.load()
        webp_kb = kb(f"{DATA}/{name}.webp")
        decoded.convert("RGBA" if alpha else "RGB").save(f"{DATA}/{name}-out.png", optimize=True)
        rgb = flatten(decoded)
        rgb.save(f"{DATA}/{name}-out.jpg", quality=JPG_Q, optimize=True, subsampling=0)
        rgb.save(f"{DATA}/{name}-out-q92.jpg", quality=92, optimize=True, subsampling=0)
        rgb.save(f"{DATA}/{name}-out.webp", quality=WEBP_Q, method=4)
        row = {"image": name, "pixels": src.size[0] * src.size[1], "alpha": alpha,
               "png_source_kb": round(kb(f"{CORPUS}/{name}.png"), 1), "webp_source_kb": round(webp_kb, 1),
               "png_kb": round(kb(f"{DATA}/{name}-out.png"), 1), "jpg85_kb": round(kb(f"{DATA}/{name}-out.jpg"), 1),
               "jpg92_kb": round(kb(f"{DATA}/{name}-out-q92.jpg"), 1), "webp80_kb": round(kb(f"{DATA}/{name}-out.webp"), 1)}
        row["png_vs_webp"] = round(row["png_kb"] / webp_kb, 2)
        row["jpg85_vs_webp"] = round(row["jpg85_kb"] / webp_kb, 2)
        if alpha:
            a_src = np.asarray(src.getchannel("A")).astype(int)
            a_out = np.asarray(Image.open(f"{DATA}/{name}-out.png").getchannel("A")).astype(int)
            row["alpha_px"] = int((a_src == 0).sum())
            row["alpha_zero_out"] = int((a_out == 0).sum())
            row["alpha_within_1"] = round(100.0 * float((np.abs(a_src - a_out) <= 1).mean()), 2)
        rows.append(row)
    with open(f"{DATA}/study-a-format.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in rows for k in r}))
        w.writeheader()
        w.writerows(rows)
    print(f"  study A: {len(rows)} rows -> study-a-format.csv")
    return rows


# --------------------------------------------------------------- study B ----
def study_quality():
    quals = [40, 50, 60, 65, 70, 75, 80, 85, 90, 95]
    rows, subs = [], []
    for name in ["photo", "screenshot", "product-cutout", "gradient", "flat-art"]:
        ref_img = flatten(Image.open(f"{CORPUS}/{name}.png"))
        ref = np.asarray(ref_img)
        for q in quals:
            p = f"{DATA}/q-{name}-{q}.jpg"
            ref_img.save(p, quality=q, optimize=True, subsampling=0)
            arr = np.asarray(Image.open(p).convert("RGB"))
            rows.append({"image": name, "quality": q, "kb": round(kb(p), 1),
                         "psnr_db": round(psnr(ref, arr), 2), "ssim": round(ssim(ref, arr), 4),
                         "bpp": round(kb(p) * 8192 / (ref.shape[0] * ref.shape[1]), 3)})
    for name in ["screenshot", "photo"]:
        ref_img = flatten(Image.open(f"{CORPUS}/{name}.png"))
        ref = np.asarray(ref_img)
        for mode_name, mode in [("4:4:4", 0), ("4:2:2", 1), ("4:2:0", 2)]:
            for q in [75, 85]:
                p = f"{DATA}/sub-{name}-{mode_name.replace(':', '')}-{q}.jpg"
                ref_img.save(p, quality=q, optimize=True, subsampling=mode)
                arr = np.asarray(Image.open(p).convert("RGB"))
                subs.append({"image": name, "subsampling": mode_name, "quality": q, "kb": round(kb(p), 1),
                             "psnr_db": round(psnr(ref, arr), 2), "ssim": round(ssim(ref, arr), 4)})
    with open(f"{DATA}/study-b-jpeg-quality.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["image", "quality", "kb", "psnr_db", "ssim", "bpp"])
        w.writeheader()
        w.writerows(rows)
    with open(f"{DATA}/study-b2-subsampling.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["image", "subsampling", "quality", "kb", "psnr_db", "ssim"])
        w.writeheader()
        w.writerows(subs)
    print(f"  study B: {len(rows)} quality rows + {len(subs)} subsampling rows")
    return rows


# --------------------------------------------------------------- study C ----
def study_resize():
    w = h = 2000
    rng = np.random.default_rng(7)
    v = np.where(np.mgrid[0:h, 0:w][1] < w // 2, 60, 200).astype(np.int16)
    v += (rng.integers(0, 8, (h, w)) - 4) * 3
    noisy = Image.fromarray(np.stack([np.clip(v, 0, 255).astype(np.uint8)] * 3, -1), "RGB")
    arr = np.zeros((400, 400), np.uint8)
    arr[:, :200], arr[:, 200:] = 90, 220
    edge = Image.fromarray(np.stack([arr] * 3, -1), "RGB")
    methods = {"NEAREST": Image.NEAREST, "BILINEAR": Image.BILINEAR,
               "BICUBIC": Image.BICUBIC, "LANCZOS": Image.LANCZOS}
    rows, box = [], noisy.resize((500, 500), Image.BOX)
    for name, m in methods.items():
        t = time.time()
        out = noisy.resize((500, 500), m)
        ms = (time.time() - t) * 1000
        g = to_gray(np.asarray(out))[:200, :200]
        rows.append({"test": "downscale 2000->500 (4x)", "method": name,
                     "psnr_vs_box": round(psnr(box, out), 2), "ssim_vs_box": round(ssim(box, out), 4),
                     "halftone_std": round(float(g.std()), 2), "ms": round(ms)})
    for name, m in methods.items():
        out = np.asarray(edge.resize((1600, 1600), m))
        prof = to_gray(out)[200:1400, :].mean(axis=0)
        over, under = max(0.0, float(prof.max() - 220.0)), max(0.0, float(90.0 - prof.min()))
        rows.append({"test": "upscale 400->1600 (4x)", "method": name, "ringing_over": round(over, 2),
                     "ringing_under": round(under, 2), "ringing_total": round(over + under, 2)})
    img = Image.open(f"{CORPUS}/photo.png").convert("RGB")
    ref800 = img.resize((800, 600), Image.BOX)
    for name, m in methods.items():
        out = img.resize((800, 600), m)
        out.save(f"{DATA}/resize-{name}.jpg", quality=85, optimize=True, subsampling=0)
        rows.append({"test": "photo 1600->800", "method": name, "psnr_vs_box": round(psnr(ref800, out), 2),
                     "ssim_vs_box": round(ssim(ref800, out), 4),
                     "jpg85_kb": round(kb(f"{DATA}/resize-{name}.jpg"), 1)})
    with open(f"{DATA}/study-c-resize.csv", "w", newline="") as f:
        keys = sorted({k for r in rows for k in r})
        w2 = csv.DictWriter(f, fieldnames=keys, restval="")
        w2.writeheader()
        w2.writerows(rows)
    json.dump(rows, open(f"{DATA}/study-c2-resize.json", "w"), indent=1)
    print(f"  study C: {len(rows)} rows -> study-c-resize.csv")
    return rows


# ---------------------------------------------------------------- charts ----
def bar_chart(labels, series, title, out, unit="KB", w=720, h=380):
    pad_l, pad_b, pad_t, pad_r = 58, 92, 44, 16
    pw, ph = w - pad_l - pad_r, h - pad_b - pad_t
    vmax = max(max(max(s[2]) for s in series) * 1.12, 1.0)
    n, g = len(labels), len(series)
    bw = pw / n / (g + 0.6)
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" font-family="ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial" aria-label="{title}">',
         f'<text x="4" y="20" font-size="15" font-weight="700" fill="#17181c">{title}</text>']
    for i in range(5):
        y = pad_t + ph - ph * i / 4
        p.append(f'<line x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}" stroke="#e7e4de"/>')
        p.append(f'<text x="{pad_l-8}" y="{y+4:.1f}" font-size="11" text-anchor="end" fill="#8b8e98">{vmax*i/4:,.0f}</text>')
    for li, lab in enumerate(labels):
        x0 = pad_l + pw * li / n
        for si, (sname, colour, values) in enumerate(series):
            bh = ph * values[li] / vmax
            x, y = x0 + pw / n * 0.18 + si * bw, pad_t + ph - bh
            p.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw*0.92:.1f}" height="{bh:.1f}" rx="3" fill="{colour}"/>')
            p.append(f'<text x="{x+bw*0.46:.1f}" y="{y-5:.1f}" font-size="10.5" text-anchor="middle" fill="#4c4f58">{values[li]:,.0f}</text>')
        p.append(f'<text x="{x0+pw/n/2:.1f}" y="{pad_t+ph+18:.1f}" font-size="11.5" text-anchor="middle" fill="#17181c">{lab}</text>')
    ly, lx = h - 26, pad_l
    for sname, colour, _ in series:
        p.append(f'<rect x="{lx}" y="{ly-9}" width="11" height="11" rx="2" fill="{colour}"/>')
        p.append(f'<text x="{lx+16}" y="{ly}" font-size="11.5" fill="#4c4f58">{sname}</text>')
        lx += 22 + 7 * len(sname)
    p.append(f'<text x="{w-pad_r}" y="{ly}" font-size="11" text-anchor="end" fill="#8b8e98">{unit}</text></svg>')
    open(out, "w").write("\n".join(p))


def line_chart(xs, series, title, out, xlabel, ylabel, w=720, h=380, ymax=None, unit=""):
    pad_l, pad_b, pad_t, pad_r = 62, 74, 44, 70
    pw, ph = w - pad_l - pad_r, h - pad_b - pad_t
    vmax = ymax or max(max(s[1]) for s in series) * 1.1
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" font-family="ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial" aria-label="{title}">',
         f'<text x="4" y="20" font-size="15" font-weight="700" fill="#17181c">{title}</text>']
    for i in range(5):
        y = pad_t + ph - ph * i / 4
        p.append(f'<line x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}" stroke="#e7e4de"/>')
        p.append(f'<text x="{pad_l-8}" y="{y+4:.1f}" font-size="11" text-anchor="end" fill="#8b8e98">{vmax*i/4:,.1f}</text>')
    x0v, x1v = min(xs), max(xs)
    for xv in xs:
        p.append(f'<text x="{pad_l+pw*(xv-x0v)/(x1v-x0v):.1f}" y="{pad_t+ph+18:.1f}" font-size="11" text-anchor="middle" fill="#8b8e98">{xv}</text>')
    for sname, ys, colour, dash in series:
        pts = " ".join(f"{pad_l+pw*(x-x0v)/(x1v-x0v):.1f},{pad_t+ph-ph*y/vmax:.1f}" for x, y in zip(xs, ys))
        p.append(f'<polyline points="{pts}" fill="none" stroke="{colour}" stroke-width="2.4" stroke-dasharray="{dash}"/>')
        for x, y in zip(xs, ys):
            p.append(f'<circle cx="{pad_l+pw*(x-x0v)/(x1v-x0v):.1f}" cy="{pad_t+ph-ph*y/vmax:.1f}" r="3" fill="{colour}"/>')
    lx, ly = pad_l + 4, pad_t - 12
    for sname, ys, colour, dash in series:
        p.append(f'<line x1="{lx}" y1="{ly-4}" x2="{lx+20}" y2="{ly-4}" stroke="{colour}" stroke-width="2.4" stroke-dasharray="{dash}"/>')
        p.append(f'<text x="{lx+25}" y="{ly}" font-size="11.5" fill="#4c4f58">{sname}</text>')
        lx += 30 + 7.2 * len(sname)
    p.append(f'<text x="{pad_l+pw/2:.1f}" y="{h-30}" font-size="11.5" text-anchor="middle" fill="#4c4f58">{xlabel}</text>')
    p.append(f'<text x="{w-pad_r}" y="{ly}" font-size="11" text-anchor="end" fill="#8b8e98">{unit}</text></svg>')
    open(out, "w").write("\n".join(p))


def charts():
    A = list(csv.DictReader(open(f"{DATA}/study-a-format.csv")))
    B = list(csv.DictReader(open(f"{DATA}/study-b-jpeg-quality.csv")))
    C = json.load(open(f"{DATA}/study-c2-resize.json"))
    bar_chart([r["image"] for r in A],
              [("PNG output", "#1d7a5c", [float(r["png_kb"]) for r in A]),
               ("JPG q85", "#c98a3c", [float(r["jpg85_kb"]) for r in A]),
               ("WebP q80 source", "#3f63c4", [float(r["webp_source_kb"]) for r in A])],
              "Same images, three formats: output size", f"{DATA}/chart-format-sizes.svg")
    qs = sorted({int(r["quality"]) for r in B})

    def series_for(img, key):
        return [float(next(r[key] for r in B if r["image"] == img and int(r["quality"]) == q)) for q in qs]
    line_chart(qs, [("photo - SSIM", series_for("photo", "ssim"), "#1d7a5c", "none"),
                    ("screenshot - SSIM", series_for("screenshot", "ssim"), "#3f63c4", "none")],
               "SSIM vs JPEG quality (higher is better)", f"{DATA}/chart-quality-ssim.svg",
               "JPEG quality setting", "SSIM", ymax=1.0)
    line_chart(qs, [("photo - KB", series_for("photo", "kb"), "#1d7a5c", "none"),
                    ("screenshot - KB", series_for("screenshot", "kb"), "#c98a3c", "none")],
               "JPEG file size vs quality", f"{DATA}/chart-quality-size.svg",
               "JPEG quality setting", "KB", ymax=800, unit="KB")
    dn = [r for r in C if r["test"].startswith("downscale")]
    bar_chart([r["method"] for r in dn],
              [("PSNR vs box reference (dB)", "#1d7a5c", [r["psnr_vs_box"] for r in dn]),
               ("halftone noise left behind", "#c2453c", [r["halftone_std"] for r in dn])],
              "Downscaling 2000 to 500 px: method vs result", f"{DATA}/chart-resize-down.svg", "")
    up = [r for r in C if r["test"].startswith("upscale")]
    bar_chart([r["method"] for r in up],
              [("ringing overshoot beyond the edge", "#c2453c", [r["ringing_total"] for r in up])],
              "Upscaling a hard edge 4x: ringing per method", f"{DATA}/chart-resize-up.svg", "levels")
    print("  charts: 5 SVG files written")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    os.makedirs(DATA, exist_ok=True)
    t0 = time.time()
    if cmd in ("all", "corpus"):
        print("corpus:"); make_corpus()
    if cmd in ("all", "formats"):
        study_formats()
    if cmd in ("all", "quality"):
        study_quality()
    if cmd in ("all", "resize"):
        study_resize()
    if cmd in ("all", "charts"):
        charts()
    print(f"done in {time.time()-t0:.0f}s")