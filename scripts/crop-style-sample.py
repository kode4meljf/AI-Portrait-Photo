#!/usr/bin/env python3
"""将任意图片居中裁为 3:4 并缩放到 540×720，无黑边填充。"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow: pip3 install Pillow", file=sys.stderr)
    sys.exit(1)

TARGET_W, TARGET_H = 540, 720
RATIO = TARGET_W / TARGET_H


def crop_to_34(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if w / h > RATIO:
        crop_w = int(h * RATIO)
        left = (w - crop_w) // 2
        im = im.crop((left, 0, left + crop_w, h))
    elif w / h < RATIO:
        crop_h = int(w / RATIO)
        top = (h - crop_h) // 2
        im = im.crop((0, top, w, top + crop_h))
    im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=82, optimize=True, progressive=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"用法: {sys.argv[0]} <输入> <输出.jpg>", file=sys.stderr)
        sys.exit(1)
    crop_to_34(Path(sys.argv[1]), Path(sys.argv[2]))
