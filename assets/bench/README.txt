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

The corpus is generated from a fixed random seed, so a second run produces
byte-identical inputs and comparable numbers. Different library builds will move
individual figures by a few percent; the rankings do not change.

Published result files
----------------------
    study-a-format.csv        one row per test image: PNG / JPG / WebP sizes
    study-b-jpeg-quality.csv  quality 40-95: size, PSNR, SSIM, bits per pixel
    study-b2-subsampling.csv  4:4:4 vs 4:2:2 vs 4:2:0 at fixed quality
    study-c-resize.csv        resampling methods vs a box-filter reference

Corrections, or a reproduction that disagrees with ours, are welcome through the
contact page.
