#!/usr/bin/env python3
"""将 JPEG 压到不超过 max_bytes（默认 180KB，适配 CloudBase HTTP body 上限）。"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow: pip3 install Pillow", file=sys.stderr)
    sys.exit(1)


def compress(src: Path, dest: Path, max_bytes: int) -> None:
    im = Image.open(src).convert("RGB")
    dest.parent.mkdir(parents=True, exist_ok=True)
    for q in range(88, 42, -4):
        im.save(dest, "JPEG", quality=q, optimize=True, progressive=True)
        if dest.stat().st_size <= max_bytes:
            return
    w, h = im.size
    scaled = im.resize((max(1, int(w * 0.85)), max(1, int(h * 0.85))), Image.Resampling.LANCZOS)
    for q in range(82, 42, -4):
        scaled.save(dest, "JPEG", quality=q, optimize=True, progressive=True)
        if dest.stat().st_size <= max_bytes:
            return


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <输入> <输出.jpg> [max_bytes]", file=sys.stderr)
        sys.exit(1)
    max_b = int(sys.argv[3]) if len(sys.argv) > 3 else 180 * 1024
    compress(Path(sys.argv[1]), Path(sys.argv[2]), max_b)
