"""Score the arena pain 3 engine when the candidates are a purchase order, not the whole register.

Each holdout case becomes up to two cases with an 8-item register built like a PO from one supplier:
  in  : the true product plus 7 products of the same brand (then same category, then any)
  out : 8 such products without the true product, so "not on this order" (abstain) is right
"""
import json
import random
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOLD = Path("/Users/sh/dev-env/holio-arena-holdout/p3-no-barcode")
ROOT = Path(__file__).resolve().parent
ENTRY = ROOT / "entry" / "run"
CASES = ROOT / "cases"
N = 8

reg_path = HOLD / "holdout" / "register" / "register.json"
register = json.loads(reg_path.read_text())["items"]
by_sku = {it["sku"]: it for it in register}
labels = json.loads((HOLD / "labels.json").read_text())

STOP = {"as", "sa", "asa", "a/s", "o.", "industri", "industrier", "norge", "foods", "hovedlager", "dagligvare"}


def brand_key(s: str) -> str:
    words = [w for w in re.findall(r"[a-zæøåé0-9!]+", (s or "").lower()) if w not in STOP]
    return words[0] if words else ""


def name_tokens(it: dict) -> set[str]:
    brand = set(re.findall(r"[a-zæøåé0-9!]+", (it.get("brand") or "").lower()))
    words = re.findall(r"[a-zæøåé]+", (it.get("name") or "").lower())
    return {w for w in words if w not in STOP and w not in brand and len(w) > 1}


def size_of(it: dict) -> str:
    return re.sub(r"\s+", "", ((it.get("variant") or {}).get("size") or "").lower())


def crowd_duplicate(a: dict, b: dict) -> bool:
    """Same product listed twice by the crowd. A store's own register never holds both rows."""
    return name_tokens(a) == name_tokens(b) and (size_of(a) == size_of(b) or not size_of(a) or not size_of(b))


def same_line(truth: dict, it: dict) -> bool:
    """Most of the true product's name words appear, so it may be the same product under another row."""
    t = name_tokens(truth)
    return bool(t) and len(t & name_tokens(it)) / len(t) >= 0.5


def pick(case_id: str, exclude: set[str], brand: str, category: str | None, family: str | None,
         drop=lambda it: False) -> list[dict]:
    rng = random.Random(case_id)
    pool = [it for it in register if it["sku"] not in exclude and not drop(it)]
    same_brand = [it for it in pool if brand and brand_key(it["brand"]) == brand]
    if family:
        same_brand += [it for it in pool if family in (it["brand"] + " " + it["name"]).lower() and it not in same_brand]
    same_cat = [it for it in pool if category and it.get("category") == category and it not in same_brand]
    rest = [it for it in pool if it not in same_brand and it not in same_cat]
    out: list[dict] = []
    for group in (same_brand, same_cat, rest):
        group = group[:]
        rng.shuffle(group)
        for it in group:
            if len(out) < N:
                out.append(it)
    return out


def write_case(name: str, src: Path, items: list[dict]) -> None:
    d = CASES / name
    d.mkdir(parents=True, exist_ok=True)
    inp = json.loads((src / "input.json").read_text())
    for p in inp["photos"]:
        target = d / p
        if not target.exists():
            target.symlink_to(src / p)
    rows = []
    for it in items:
        row = dict(it)
        row["images"] = [str((reg_path.parent / it["images"][0]).resolve())]
        rows.append(row)
    random.Random(name).shuffle(rows)
    (d / "register.json").write_text(json.dumps({"items": rows}, ensure_ascii=False))
    (d / "input.json").write_text(json.dumps({"case_id": name, "photos": inp["photos"], "register": "register.json"}))


def build() -> dict[str, dict]:
    truth: dict[str, dict] = {}
    for cid, lab in sorted(labels.items()):
        src = HOLD / "holdout" / "cases" / cid
        accept = set(lab.get("accept") or [lab["sku"]])
        if lab["kind"] == "in_register":
            t = by_sku[lab["sku"]]
            others = pick(cid, accept, brand_key(t["brand"]), t.get("category"), lab.get("family"),
                          drop=lambda it, t=t: crowd_duplicate(t, it))
            write_case(f"{cid}-in", src, [t] + others[: N - 1])
            truth[f"{cid}-in"] = {"variant": "in", "accept": sorted(accept)}
            write_case(f"{cid}-out", src, pick(cid + "o", accept, brand_key(t["brand"]), t.get("category"), lab.get("family"),
                                              drop=lambda it, t=t: same_line(t, it)))
            truth[f"{cid}-out"] = {"variant": "out", "accept": []}
        else:
            pseudo = {"brand": lab.get("family") or "", "name": lab.get("name") or ""}
            write_case(f"{cid}-out", src, pick(cid + "o", accept, "", None, lab.get("family"),
                                              drop=lambda it, t=pseudo: same_line(t, it)))
            truth[f"{cid}-out"] = {"variant": "out", "accept": [], "kind": lab["kind"]}
    return truth


def run_one(name: str) -> dict:
    t0 = time.time()
    try:
        p = subprocess.run([str(ENTRY), str(CASES / name)], capture_output=True, text=True, timeout=150)
        out = json.loads(p.stdout.strip().splitlines()[-1])
        return {"case": name, "out": out, "secs": round(time.time() - t0, 2)}
    except Exception as e:  # noqa: BLE001
        return {"case": name, "error": repr(e)[:300], "secs": round(time.time() - t0, 2)}


def score(truth: dict, results: list[dict]) -> dict:
    s = {"in": {"n": 0, "top1": 0, "wrong_confident": 0, "abstain": 0, "top3": 0, "crash": 0},
         "out": {"n": 0, "correct_abstain": 0, "wrong_confident": 0, "crash": 0}}
    for r in results:
        t = truth[r["case"]]
        b = s[t["variant"]]
        b["n"] += 1
        if "error" in r:
            b["crash"] += 1
            continue
        o = r["out"]
        skus = [c["sku"] for c in o.get("candidates", [])]
        if t["variant"] == "in":
            if o.get("abstain"):
                b["abstain"] += 1
            elif skus and skus[0] in t["accept"]:
                b["top1"] += 1
            else:
                b["wrong_confident"] += 1
            b["top3"] += int(any(k in t["accept"] for k in skus))
        else:
            b["correct_abstain" if o.get("abstain") else "wrong_confident"] += 1
    secs = sorted(r["secs"] for r in results)
    s["latency_p50_s"] = secs[len(secs) // 2]
    s["latency_p90_s"] = secs[int(len(secs) * 0.9)]
    return s


if __name__ == "__main__":
    truth = build()
    names = sorted(truth)
    if len(sys.argv) > 1:
        names = names[: int(sys.argv[1])]
    print(f"[ok] built {len(truth)} cases, running {len(names)}", flush=True)
    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(run_one, names))
    (ROOT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    (ROOT / "truth.json").write_text(json.dumps(truth, indent=1))
    print(json.dumps(score(truth, results), indent=1))
