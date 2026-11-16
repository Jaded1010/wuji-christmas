"""把上传的原图切成网站用的透明 PNG 素材。运行: python tools/make_assets.py"""
from PIL import Image
from collections import deque
import os

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
BG = (251, 243, 241)  # 原图米色背景


def load(n):
    return Image.open(os.path.join(A, n)).convert("RGBA")


def cut_bg_raw(im, tol=34, ref=BG):
    """从四周洪水填充,把米色背景变透明(封闭轮廓内部不受影响)"""
    w, h = im.size
    px = im.load()

    def near(c):
        return sum(abs(c[i] - ref[i]) for i in range(3)) <= tol * 3 // 2

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        if not near(px[x, y]):
            continue
        seen[y * w + x] = 1
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def label_comps(im):
    """返回所有不透明连通块(像素列表)"""
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    res = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and not seen[y][x]:
                st = [(x, y)]
                seen[y][x] = True
                pts = []
                while st:
                    cx, cy = st.pop()
                    pts.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            st.append((nx, ny))
                res.append(pts)
    return res


def drop_fragments(im):
    """保留最大连通块,清掉碰到边缘的碎片和噪点"""
    w, h = im.size
    px = im.load()
    comps = label_comps(im)
    if not comps:
        return im
    big = max(range(len(comps)), key=lambda i: len(comps[i]))
    for i, pts in enumerate(comps):
        if i == big:
            continue
        edge = any(x in (0, w - 1) or y in (0, h - 1) for x, y in pts)
        if edge or len(pts) < 25:
            for x, y in pts:
                px[x, y] = (0, 0, 0, 0)
    return im


def cut_bg(im, tol=34, ref=BG):
    return drop_fragments(cut_bg_raw(im, tol, ref))


def trim(im, pad=6):
    bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    l, t, r, b = bb
    return im.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, im.width), min(b + pad, im.height)))


def save(im, name, maxw=520):
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(os.path.join(A, name), optimize=True)
    print("saved", name, im.size)


# 1) 主形象
save(trim(cut_bg(load("_mascot.jpg"))), "wuji.png")

# 2) 表情表 3x2: 整张只抠一次背景, 再按“连通块重心落在哪个格子”分配给各表情
sp = cut_bg_raw(load("_sprites.jpg"))
W, H = sp.size
comps = label_comps(sp)
names = [["wave", "think", "happy"], ["cry", "unbox", "hang"]]
for r in range(2):
    for c in range(3):
        box = (c * W // 3, r * H // 2, (c + 1) * W // 3, (r + 1) * H // 2)
        out = Image.new("RGBA", sp.size, (0, 0, 0, 0))
        po, ps = out.load(), sp.load()
        for pts in comps:
            if len(pts) < 25:
                continue
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            if box[0] <= cx < box[2] and box[1] <= cy < box[3]:
                for x, y in pts:
                    po[x, y] = ps[x, y]
        save(trim(out), f"wuji-{names[r][c]}.png", 420)

# 3) 礼盒: 取自 assets/_boxes.jpg(按设计稿画风重绘的三个完整礼盒), 三等分后各自抠图
bx = load("_boxes.jpg")
bg = bx.getpixel((6, 6))[:3]
bw, bh = bx.size
for i, n in enumerate(["box-pudding", "box-pig", "box-xmas"]):
    cell = bx.crop((i * bw // 3, 0, (i + 1) * bw // 3, bh))
    save(trim(cut_bg(cell, 30, bg), 8), n + ".png", 300)
# 5) 圣诞树
tree = Image.open(os.path.join(A, "_tree.jpg")).convert("RGB")
tree.save(os.path.join(A, "tree.jpg"), quality=88, optimize=True)
print("saved tree.jpg", tree.size)

