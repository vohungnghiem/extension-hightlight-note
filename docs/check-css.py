#!/usr/bin/env python3
"""Kiểm tra dấu ngoặc nhọn của mọi file .css và khối <style> trong .html trước khi phát hành.

Một dấu `}` thừa/thiếu làm trình duyệt BỎ LUÔN quy tắc CSS ngay sau nó, không báo lỗi nào
(từng làm mất toàn bộ kiểu dáng thẻ Dịch/Lưu → bấm nút "không có gì xảy ra").

Chạy:  python3 docs/check-css.py     (thoát mã 1 nếu có file lệch)
"""
import glob, os, re, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
bad = 0
for f in sorted(glob.glob("*.css")) + sorted(glob.glob("*.html")):
    s = open(f, encoding="utf-8").read()
    blocks = re.findall(r"<style[^>]*>(.*?)</style>", s, flags=re.S) if f.endswith(".html") else [s]
    for i, b in enumerate(blocks):
        b = re.sub(r"/\*.*?\*/", "", b, flags=re.S)
        depth, line = 0, 1
        for ch in b:
            if ch == "\n": line += 1
            elif ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth < 0:
                    print(f"{f} (khối {i}): dấu }} THỪA gần dòng {line}"); bad += 1; break
        else:
            if depth != 0:
                print(f"{f} (khối {i}): thiếu {depth} dấu }}"); bad += 1
if not bad:
    print("CSS: dấu ngoặc cân ở mọi file")
sys.exit(1 if bad else 0)
