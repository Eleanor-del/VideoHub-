# -*- coding: utf-8 -*-
"""生成 VideoHub 应用图标（PNG + ICO），纯标准库实现，无需第三方依赖。"""
import os
import struct
import zlib

SIZE = 256
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")


def rounded_rect_cov(x, y, w, h, r):
    """返回点 (x, y) 在圆角矩形内的覆盖判定（布尔）"""
    if x < 0 or y < 0 or x > w or y > h:
        return False
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def in_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def build_pixels():
    pad = 8
    w = h = SIZE - pad * 2
    radius = 58
    tri = ((104, 76), (104, 180), (182, 128))
    rows = []
    ss = 3  # 超采样系数，用于抗锯齿
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            cov = 0
            tri_cov = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x - pad + (sx + 0.5) / ss
                    py = y - pad + (sy + 0.5) / ss
                    if rounded_rect_cov(px, py, w, h, radius):
                        cov += 1
                        if in_triangle(px, py, *tri):
                            tri_cov += 1
            total = ss * ss
            if cov == 0:
                row += b"\x00\x00\x00\x00"
                continue
            alpha = int(255 * cov / total)
            if tri_cov:
                # 白色播放三角
                rr = gg = bb = 255
                a2 = int(alpha * tri_cov / cov)
                row += bytes((rr, gg, bb, a2))
            else:
                t = y / SIZE
                r0, g0, b0 = 0x3B, 0x5B, 0xDB
                r1, g1, b1 = 0x7B, 0x3D, 0xFF
                rr = int(r0 + (r1 - r0) * t)
                gg = int(g0 + (g1 - g0) * t)
                bb = int(b0 + (b1 - b0) * t)
                row += bytes((rr, gg, bb, alpha))
        rows.append(bytes(row))
    return rows


def make_png(rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def make_ico(png_bytes):
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png_bytes), 22)
    return header + entry + png_bytes


def main():
    os.makedirs(ASSETS, exist_ok=True)
    rows = build_pixels()
    png = make_png(rows)
    with open(os.path.join(ASSETS, "icon.png"), "wb") as f:
        f.write(png)
    with open(os.path.join(ASSETS, "icon.ico"), "wb") as f:
        f.write(make_ico(png))
    print("icon.png", len(png), "bytes")
    print("icon.ico", len(make_ico(png)), "bytes")


if __name__ == "__main__":
    main()
