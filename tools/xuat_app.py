"""Lấy bộ đề từ trang Ngai Vàng Tiếng Việt (bản đọc bằng Artifact read) ghi ra data.json cho app.
Dùng: python3 tools/xuat_app.py TRANG.html   (chạy ở thư mục gốc của kho)"""
import json, re, sys
s = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'const DATA = (.*?);\nconst ', s, re.S)
data = json.loads(m.group(1))
# App công khai chỉ chứa đề tự soạn (khóa soNN); bỏ đề phát sóng mùa 3 vì là nội dung của chương trình
data = {k: v for k, v in data.items() if k.startswith('_') or (k.startswith('so') and k[2:].isdigit())}
json.dump(data, open('data.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
n = [k for k in data if not k.startswith('_')]
print(f'OK: data.json có {len(n)} bộ đề, mới nhất: {data[n[0]]["name"]}')
