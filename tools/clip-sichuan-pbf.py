"""从四川 OSM PBF 裁剪锦江区外扩范围，输出现有 build-city.mjs 使用的 JSON。"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
PBF = Path(os.environ.get("SICHUAN_PBF", ROOT / "data/source/sichuan.osm.pbf"))
OUT = ROOT / "data/raw/jinjiang"
B = {"south": 30.5493864, "west": 104.057658, "north": 30.6724867, "east": 104.1682525}
R = {"south": 30.5422, "west": 104.0493, "north": 30.6797, "east": 104.1766}
CHUNKS = [(B["west"] + (B["east"] - B["west"]) * i / 4, B["west"] + (B["east"] - B["west"]) * (i + 1) / 4) for i in range(4)]

def in_box(lon, lat, box):
    return box["west"] <= lon <= box["east"] and box["south"] <= lat <= box["north"]

def tags_of(tags):
    return {str(k): str(v) for k, v in tags}

def source(els):
    return {"version": 2, "source": {"id": "sichuan-pbf", "url": str(PBF), "license": "ODbL-1.0", "retrievedAt": datetime.now(timezone.utc).isoformat()}, "ts": datetime.fromtimestamp(PBF.stat().st_mtime, timezone.utc).isoformat(), "els": els, "n": len(els)}

class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.ways = []; self.nodes = []
    def node(self, n):
        t = tags_of(n.tags)
        if (t.get("natural") == "tree" or "tourism" in t or "historic" in t) and in_box(n.location.lon, n.location.lat, R):
            self.nodes.append({"id": int(n.id), "k": "n", "t": t, "g": [[n.location.lon, n.location.lat]]})
    def way(self, w):
        t = tags_of(w.tags)
        if not (t.get("highway") or t.get("natural") or t.get("waterway") or t.get("leisure") or t.get("landuse") or t.get("amenity") or t.get("railway") or t.get("man_made") or t.get("tourism") or t.get("historic") or t.get("building") or t.get("building:part") or t.get("place") == "square" or t.get("area:highway")): return
        pts, refs = [], []
        for n in w.nodes:
            if not n.location.valid(): continue
            refs.append(int(n.ref)); pts.append([n.lon, n.lat])
        if len(pts) < 2 or not any(in_box(p[0], p[1], R) for p in pts): return
        self.ways.append({"id": int(w.id), "k": "w", "t": t, "nodes": refs, "g": pts})

if not PBF.exists(): raise SystemExit(f"PBF not found: {PBF}")
OUT.mkdir(parents=True, exist_ok=True)
h = Handler(); h.apply_file(str(PBF), locations=True)
dedupe = lambda xs: list({f"{e['k']}:{e['id']}": e for e in xs}.values())
ways, nodes = dedupe(h.ways), dedupe(h.nodes)
def write(name, els): (OUT / name).write_text(json.dumps(source(els), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
write("roads.json", [e for e in ways if e["t"].get("highway")])
write("water.json", [e for e in ways if e["t"].get("natural") == "water" or e["t"].get("waterway")])
write("landuse.json", [e for e in ways if e["t"].get("leisure") or e["t"].get("landuse") or e["t"].get("natural") or e["t"].get("amenity") or e["t"].get("place") == "square" or e["t"].get("area:highway")])
write("misc.json", [e for e in ways + nodes if e["t"].get("railway") or e["t"].get("man_made") or e["t"].get("tourism") or e["t"].get("historic") or e["t"].get("natural") == "tree"])
write("relations.json", [])
buildings = [e for e in ways if e["t"].get("building") or e["t"].get("building:part")]
for i, (west, east) in enumerate(CHUNKS, 1):
    els = [e for e in buildings if west <= sum(p[0] for p in e["g"]) / len(e["g"]) <= east and any(B["south"] <= p[1] <= B["north"] for p in e["g"])]
    write(f"bld-{i}.json", els)
print(json.dumps({"pbf": str(PBF), "ways": len(ways), "nodes": len(nodes), "buildings": len(buildings), "roads": sum(bool(e["t"].get("highway")) for e in ways), "chunks": [sum(CHUNKS[i - 1][0] <= sum(p[0] for p in e["g"]) / len(e["g"]) <= CHUNKS[i - 1][1] for e in buildings) for i in range(1, 5)]}, ensure_ascii=False))
