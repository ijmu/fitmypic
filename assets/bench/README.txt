Reproduction kit — PNGToolbox and FitMyPic measurements
=========================================================

Everything published in our format, JPEG-quality and resampling studies comes
out of bench_kit.py. Plain Python with Pillow, NumPy and SciPy: no network
access, no third-party images, nothing to install beyond those three.

    python3 bench_kit.py all          # corpus + all three studies + charts

Individual stages:

    python3 bench_kit.py corpus       # writes corpus/*.png  (~30 seconds)
    python3 bench_kit.py formats      # study A: PNG / JPG / WebP output sizes
    python3 bench_kit.py quality      # study B: JPEG quality sweep, subsampling
    python3 bench_kit.py resize       # study C: nearest/bilinear/bicubic/lanczos
    python3 bench_kit.py charts       # the SVG charts used in the articles

Environment used for the published numbers
------------------------------------------
    Pillow  11.0.0   (libwebp, libjpeg-turbo, zlib)
    NumPy   2.1.3
    SciPy   1.13.1
    Date    22 October 2026

corpus.zip contains the exact six test images the published numbers were
measured on. Unzip it next to this file and the script will use those images
instead of regenerating them, which is what makes a byte-for-byte reproduction
possible. The generator is included as well (bench_kit.py corpus --force) for
anyone who wants to rebuild the corpus from scratch: it is deterministic, and
an independently generated corpus produces the same rankings with small
per-file differences.

Timing columns in study-c-resize.csv are the one exception to reproducibility:
milliseconds depend on the machine and its current load, so treat them as
indicative. Sizes, PSNR and SSIM reproduce exactly.

Published result files
----------------------
    study-a-format.csv        one row per test image: PNG / JPG / WebP sizes
    study-b-jpeg-quality.csv  quality 40-95: size, PSNR, SSIM, bits per pixel
    study-b2-subsampling.csv  4:4:4 vs 4:2:2 vs 4:2:0 at fixed quality
    study-c-resize.csv        resampling methods vs a box-filter reference

Corrections, or a reproduction that disagrees with ours, are welcome through the
contact page.
