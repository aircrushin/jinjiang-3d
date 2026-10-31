"""从四川 OSM PBF 裁剪锦江区外扩范围，输出现有 build-city.mjs 使用的 JSON。"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
PBF = Path(os.environ.get("SICHUAN_PBF", ROOT / "data/source/sichuan.osm.pbf"))
OUT = Path(os.environ.get("CLIP_OUT", ROOT / "data/raw/jinjiang"))
B = {"south": 30.5493864, "west": 104.057658, "north": 30.6724867, "east": 104.1682525}
R = {"south": 30.5422, "west": 104.0493, "north": 30.6797, "east": 104.1766}
CHUNKS = [(B["west"] + (B["east"] - B["west"]) * i / 4, B["west"] + (B["east"] - B["west"]) * (i + 1) / 4) for i in range(4)]

def in_box(lon, lat, box):
    return box["west"] <= lon <= box["east"] and box["south"] <= lat <= box["north"]

def tags_of(tags):
    return {str(k): str(v) for k, v in tags}

def source(els):
    return {"version": 2, "source": {"id": "sichuan-pbf", "url": str(PBF), "license": "ODbL-1.0", "retrievedAt": datetime.now(timezone.utc).isoformat()}, "ts": datetime.fromtimestamp(PBF.stat().st_mtime, timezone.utc).isoformat(), "els": els, "n": len(els)}

def is_area_relation(t):
    """多边形关系：标签在关系上、成员 way 本身没有标签的水体、绿地和建筑（如白鹭湾）。"""
    if t.get("type") not in ("multipolygon", "boundary"): return False
    return bool(t.get("natural") or t.get("landuse") or t.get("leisure") or t.get("amenity") or t.get("building") or t.get("building:part"))

class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.ways = []; self.nodes = []; self.rels = []
        self.member_ids = set(); self.member_geo = {}
    def node(self, n):
        t = tags_of(n.tags)
        if (t.get("natural") == "tree" or "tourism" in t or "historic" in t) and in_box(n.location.lon, n.location.lat, R):
            self.nodes.append({"id": int(n.id), "k": "n", "t": t, "g": [[n.location.lon, n.location.lat]]})
    def relation(self, r):
        t = tags_of(r.tags)
        if is_area_relation(t):
            self.rels.append({"id": int(r.id), "k": "r", "t": t, "m": [{"k": "w", "ref": int(m.ref), "r": m.role} for m in r.members if m.type == "w"]})
    def way(self, w):
        t = tags_of(w.tags)
        if int(w.id) in self.member_ids:
            self.member_geo[int(w.id)] = [[n.lon, n.lat] for n in w.nodes if n.location.valid()]
        if not (t.get("highway") or t.get("natural") or t.get("waterway") or t.get("leisure") or t.get("landuse") or t.get("amenity") or t.get("railway") or t.get("man_made") or t.get("tourism") or t.get("historic") or t.get("building") or t.get("building:part") or t.get("place") == "square" or t.get("area:highway")): return
        pts, refs = [], []
        for n in w.nodes:
            if not n.location.valid(): continue
            refs.append(int(n.ref)); pts.append([n.lon, n.lat])
        if len(pts) < 2 or not any(in_box(p[0], p[1], R) for p in pts): return
        self.ways.append({"id": int(w.id), "k": "w", "t": t, "nodes": refs, "g": pts})

if not PBF.exists(): raise SystemExit(f"PBF not found: {PBF}")
OUT.mkdir(parents=True, exist_ok=True)
# 第一遍只读关系，得到需要补几何的成员 way；第二遍读 way 并带上这些成员的坐标。
pre = Handler(); pre.apply_file(str(PBF))
member_ids = {m["ref"] for r in pre.rels for m in r["m"]}
h = Handler(); h.member_ids = member_ids
h.apply_file(str(PBF), locations=True)
def finish_relation(r):
    """成员带上坐标；整条关系没有任何一段落进抓取范围的丢掉。"""
    members = []
    for m in r["m"]:
        g = h.member_geo.get(m["ref"])
        if g and len(g) >= 2: members.append({**m, "g": g})
    if not any(in_box(x, y, R) for m in members for x, y in m["g"]): return None
    return {**r, "m": members}
relations = [x for x in (finish_relation(r) for r in pre.rels) if x]
dedupe = lambda xs: list({f"{e['k']}:{e['id']}": e for e in xs}.values())
ways, nodes = dedupe(h.ways), dedupe(h.nodes)
def write(name, els): (OUT / name).write_text(json.dumps(source(els), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
write("roads.json", [e for e in ways if e["t"].get("highway")])
# 水体多边形关系（如白鹭湾）要和 way 一起进 water.json，build-city.mjs 只从这里读水域
# 河流关系不收：锦江主航道已由 way 表达，再加一遍会让桥梁识别多出两千多座“跨河桥”
is_lake_rel = lambda e: e["t"].get("natural") == "water" and e["t"].get("water") != "river" and not e["t"].get("waterway")
write("water.json", [e for e in ways if e["t"].get("natural") == "water" or e["t"].get("waterway")] + [e for e in relations if is_lake_rel(e)])
write("landuse.json", [e for e in ways if e["t"].get("leisure") or e["t"].get("landuse") or e["t"].get("natural") or e["t"].get("amenity") or e["t"].get("place") == "square" or e["t"].get("area:highway")])
write("misc.json", [e for e in ways + nodes if e["t"].get("railway") or e["t"].get("man_made") or e["t"].get("tourism") or e["t"].get("historic") or e["t"].get("natural") == "tree"])
write("relations.json", relations)
buildings = [e for e in ways if e["t"].get("building") or e["t"].get("building:part")]
for i, (west, east) in enumerate(CHUNKS, 1):
    els = [e for e in buildings if west <= sum(p[0] for p in e["g"]) / len(e["g"]) <= east and any(B["south"] <= p[1] <= B["north"] for p in e["g"])]
    write(f"bld-{i}.json", els)
print(json.dumps({"pbf": str(PBF), "relations": len(relations), "ways": len(ways), "nodes": len(nodes), "buildings": len(buildings), "roads": sum(bool(e["t"].get("highway")) for e in ways), "chunks": [sum(CHUNKS[i - 1][0] <= sum(p[0] for p in e["g"]) / len(e["g"]) <= CHUNKS[i - 1][1] for e in buildings) for i in range(1, 5)]}, ensure_ascii=False))
