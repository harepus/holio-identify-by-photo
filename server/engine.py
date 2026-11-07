"""The pain 3 engine from holio-arena entries/opus/recognise.py, kept for a long-lived server.

Stage 1 (local): macOS Vision OCR of the photos plus CLIP image similarity order the candidates and,
above 8, shortlist 8. Stage 2: Claude Sonnet reads the photos, a lettered contact sheet of the
shortlisted product images and their rows, and picks one or says none, with a confidence and two
self-checks. The prompt, contact sheet, stage-1 weights and JSON repair are the arena's, unchanged,
because those are what the numbers measured.
"""
import base64
import binascii
import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import unicodedata
import urllib.request
import warnings
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from decide import Judgement, Locale

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
ARENA_JIT = Path("/Users/sh/dev-env/holio-arena/pains/p3-no-barcode/entries/opus/cache/clip-vitb32-laion2b-visual.jit.pt")
JIT = CACHE / ARENA_JIT.name
SHORTLIST = 8
JUDGE_TIMEOUT_S = 22.0
FETCH_TIMEOUT_S = 10.0
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """An allowed host must not bounce the fetch to another one."""

    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)
CLI_MODEL = "sonnet"
API_MODEL = "claude-sonnet-5-5"
LANGS = ["en-US", "fr-FR", "de-DE", "it-IT", "es-ES", "pt-BR"]
LETTERS = "ABCDEFGH"
NB_SENTENCE = "Write the evidence sentence in Norwegian bokmål."


@dataclass(frozen=True)
class Candidate:
    sku: str
    name: str
    brand: str
    size: str
    image: str


@dataclass(frozen=True)
class EngineResult:
    judgement: Judgement | None
    stage1: tuple[str, ...]
    read_text: tuple[str, ...]


class ModelUnavailable(Exception):
    pass


class ModelTimeout(Exception):
    pass


class ImageFetchFailed(Exception):
    def __init__(self, sku: str):
        super().__init__(sku)
        self.sku = sku


# ---------- OCR and text ----------

def ocr(path: Path) -> str:
    import Vision
    from Foundation import NSURL
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(0)
    req.setUsesLanguageCorrection_(False)
    req.setRecognitionLanguages_(LANGS)
    h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(str(path)), None)
    h.performRequests_error_([req], None)
    return "\n".join(str(r.topCandidates_(1)[0].string()) for r in (req.results() or []))


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


SIZE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l|ltr)\b")


def sizes(s: str) -> set[str]:
    out = set()
    for num, unit in SIZE_RE.findall(norm(s)):
        v = float(num.replace(",", "."))
        mult = {"kg": 1000, "g": 1, "gr": 1, "l": 1000, "ltr": 1000, "cl": 10, "ml": 1}[unit]
        kind = "g" if unit in ("kg", "g", "gr") else "ml"
        out.add(f"{round(v * mult)}{kind}")
    return out


def tokens(s: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", norm(s)) if len(t) >= 3 and not t.isdigit()]


def text_scores(items: Sequence[Candidate], reg_ocr: Sequence[str], query: str) -> tuple[np.ndarray, np.ndarray]:
    """IDF-weighted share of each item's name tokens found in the query OCR (fuzzy), and a size match flag."""
    from rapidfuzz import fuzz, process
    qtok = set(tokens(query))
    qsizes = sizes(query)
    docs = [set(tokens(f"{it.name} {it.brand}")) for it in items]
    df: dict[str, int] = {}
    for d in docs:
        for t in d:
            df[t] = df.get(t, 0) + 1
    n = len(items)
    qlist = list(qtok)
    cache: dict[str, float] = {}

    def hit(t: str) -> float:
        if t in cache:
            return cache[t]
        if t in qtok:
            v = 1.0
        elif len(t) >= 4 and qlist:
            v = 0.8 if process.extractOne(t, qlist, scorer=fuzz.ratio, score_cutoff=80) else 0.0
        else:
            v = 0.0
        cache[t] = v
        return v

    name_s = np.zeros(n)
    for i, d in enumerate(docs):
        if d:
            w = {t: math.log(1 + n / df[t]) for t in d}
            name_s[i] = sum(w[t] * hit(t) for t in d) / sum(w.values())
    ocr_s = np.zeros(n)
    for i, txt in enumerate(reg_ocr):
        rt = set(tokens(txt))
        if len(rt) >= 2:
            ocr_s[i] = sum(hit(t) for t in rt) / (len(rt) + 2)
    size_s = np.array([1.0 if sizes(it.size) & qsizes else 0.0 for it in items])
    return name_s + 0.5 * ocr_s, size_s


# ---------- CLIP ----------

CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)


def ensure_jit() -> Path:
    """The TorchScript image tower is 350 MB, so it lives in the gitignored cache, copied or exported once."""
    if JIT.exists():
        return JIT
    CACHE.mkdir(exist_ok=True)
    tmp = JIT.with_suffix(".tmp")
    if ARENA_JIT.exists():
        shutil.copyfile(ARENA_JIT, tmp)
    else:
        import open_clip
        import torch
        model = open_clip.create_model("ViT-B-32", pretrained="laion2b_s34b_b79k").visual.eval()
        with torch.no_grad():
            torch.jit.trace(model, torch.zeros(1, 3, 224, 224)).save(str(tmp))
    os.replace(tmp, JIT)
    return JIT


def prep(im: Image.Image) -> np.ndarray:
    w, h = im.size
    s = 224 / min(w, h)
    im = im.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = im.size
    left, top = (w - 224) // 2, (h - 224) // 2
    a = np.asarray(im.crop((left, top, left + 224, top + 224)), dtype=np.float32) / 255.0
    return ((a - CLIP_MEAN) / CLIP_STD).transpose(2, 0, 1)


def embed(model, images: list[Image.Image]) -> np.ndarray:
    import torch
    out = []
    with torch.no_grad():
        for i in range(0, len(images), 32):
            x = torch.from_numpy(np.stack([prep(im) for im in images[i:i + 32]]))
            out.append(torch.nn.functional.normalize(model(x), dim=-1).numpy())
    return np.concatenate(out)


def image_ext(data: bytes) -> str:
    return ".png" if data.startswith(b"\x89PNG") else ".jpg"


def open_rgb(p: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(p)).convert("RGB")


# ---------- judge ----------

def contact_sheet(paths: list[Path], labels: list[str]) -> bytes:
    tile = 260
    cols = 4
    rows = math.ceil(len(paths) / cols)
    sheet = Image.new("RGB", (cols * tile, rows * (tile + 30)), "white")
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 26)
    except OSError:
        font = ImageFont.load_default()
    for k, (p, lab) in enumerate(zip(paths, labels)):
        im = open_rgb(p)
        im.thumbnail((tile - 10, tile - 10))
        x, y = (k % cols) * tile, (k // cols) * (tile + 30)
        sheet.paste(im, (x + (tile - im.width) // 2, y + 30 + (tile - 10 - im.height) // 2))
        d.text((x + 8, y + 2), lab, fill="red", font=font)
    buf = io.BytesIO()
    sheet.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def jpeg(p: Path, maxside=1280) -> bytes:
    im = open_rgb(p)
    im.thumbnail((maxside, maxside))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return buf.getvalue()


PROMPT = """You identify a grocery item for a warehouse worker. The item has no usable barcode.

The first image(s) are phone photos of ONE physical item: photo 1 is the front, photo 2 (if given) another side such as ingredients. The last image is a contact sheet of register product photos labelled with letters. The register rows for those letters are:

{rows}

Text read from the photos by OCR (may contain errors):
{ocr}

Decide which register row is exactly this item: same brand, same product line and same flavour or variant. Register names can be in another language than the pack; translate in your head. Register photos may be older pack designs, so trust printed text over artwork details.

Register sizes come from a crowd-sourced database and are sometimes missing or wrong. If the product name and flavour match exactly one row, pick it even when its register size disagrees with the pack. If two or more rows are the same product in different sizes, choose by the size or pack count printed on the photos and by the pack format (small single bottle versus large bottle, single bar versus multipack); if nothing on the photos settles which size it is, confidence must be at most 0.6.

If the item is a different flavour or variant than every row, or a product not listed, answer "none". A wrong answer is much worse than "none", but do not answer "none" when one row clearly matches.

Reply with only a JSON object:
{{"pick": "<letter or none>", "confidence": <0..1 that pick is exactly right>, "ranking": ["<best letter>", "<second>", "<third>"], "name_words_on_pack": <true if every flavour, variant, line or number word in the picked row's name is printed on the pack or clearly implied by it, false if the row names a variant the pack does not show>, "size_settled": <true if no other size of the picked product is listed, or the photos show the size or pack format clearly enough to rule the other sizes out>, "evidence": "<one sentence for the worker naming the printed text, colour, shape or size that decided it; name products, never the letters>"}}"""


def build_prompt(rows: str, ocr_text: str, locale: Locale) -> str:
    text = PROMPT.format(rows=rows, ocr=ocr_text[:2500])
    return f"{text}\n\n{NB_SENTENCE}" if locale == "nb" else text


def salvage(text: str) -> dict | None:
    """Read the fields one by one when the model's JSON is slightly broken, e.g. a stray ', "' before the brace."""
    def field(name: str, pat: str):
        m = re.search(rf'"{name}"\s*:\s*{pat}', text, re.S)
        return m.group(1) if m else None
    pick = field("pick", r'"([^"]*)"')
    if pick is None:
        return None
    out = {"pick": pick, "confidence": float(field("confidence", r"([0-9.]+)") or 0),
           "ranking": re.findall(r'"([A-L])"', field("ranking", r"\[([^\]]*)\]") or ""),
           "evidence": (field("evidence", r'"((?:[^"\\]|\\.)*)"') or "").replace('\\"', '"')}
    for k in ("name_words_on_pack", "size_settled"):
        v = field(k, r"(true|false)")
        if v is not None:
            out[k] = v == "true"
    return out


def parse_answer(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    try:
        return json.loads(m.group(0))
    except (AttributeError, json.JSONDecodeError):
        return salvage(text)


def to_judgement(ans: dict | None, shortlist: Sequence[str]) -> Judgement | None:
    """Map letters back to SKUs. A pick that is neither 'none' nor a shown letter counts as unreadable."""
    if not ans:
        return None
    by_letter = dict(zip(LETTERS, shortlist))
    raw_pick = str(ans.get("pick", "none")).strip().upper()
    if raw_pick != "NONE" and raw_pick not in by_letter:
        return None
    try:
        conf = min(max(float(ans.get("confidence", 0) or 0), 0.0), 1.0)
    except (TypeError, ValueError):
        conf = 0.0
    ranking = tuple(by_letter[x] for x in (str(r).strip().upper() for r in ans.get("ranking") or []) if x in by_letter)
    checks = [ans.get(k) if isinstance(ans.get(k), bool) else None for k in ("name_words_on_pack", "size_settled")]
    return Judgement(pick=by_letter.get(raw_pick), confidence=conf, ranking=ranking,
                     name_words_on_pack=checks[0], size_settled=checks[1],
                     evidence=str(ans.get("evidence") or "").strip())


def claude_cli() -> str | None:
    found = shutil.which("claude")
    if found:
        return found
    fallback = Path.home() / ".local/bin/claude"
    return str(fallback) if fallback.exists() else None


def judge_backend() -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic-api"
    return "claude-cli" if claude_cli() else "none"


class CliJudge:
    """Starts the CLI at once so its boot overlaps stage 1; the message goes to stdin later."""

    def __init__(self, path: str, deadline: float):
        self.deadline = deadline
        CACHE.mkdir(exist_ok=True)
        cmd = [path, "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
               "--model", CLI_MODEL, "--tools", "", "--no-session-persistence", "--strict-mcp-config",
               "--setting-sources", ""]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, cwd=str(CACHE))

    def ask(self, content: list[dict]) -> str:
        msg = {"type": "user", "message": {"role": "user", "content": content}}
        try:
            out, _ = self.proc.communicate(json.dumps(msg) + "\n", timeout=max(0.5, self.deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            self.close()
            raise ModelTimeout() from None
        result = None
        for line in out.splitlines():
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("type") == "result" and not ev.get("is_error"):
                result = ev.get("result")
        if not result:
            raise ModelUnavailable()
        return result

    def close(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()
            self.proc.communicate()


class ApiJudge:
    """Same prompt and images through the Messages API. Unverified: no key existed where this was built."""

    def __init__(self, deadline: float):
        self.deadline = deadline

    def ask(self, content: list[dict]) -> str:
        import anthropic
        client = anthropic.Anthropic(timeout=max(0.5, self.deadline - time.monotonic()), max_retries=0)
        try:
            resp = client.messages.create(model=API_MODEL, max_tokens=16000,
                                          messages=[{"role": "user", "content": content}])
        except anthropic.APITimeoutError:
            raise ModelTimeout() from None
        except anthropic.APIError:
            raise ModelUnavailable() from None
        text = "".join(b.text for b in resp.content if b.type == "text")
        if not text:
            raise ModelUnavailable()
        return text

    def close(self) -> None:
        pass


def start_judge() -> CliJudge | ApiJudge:
    deadline = time.monotonic() + JUDGE_TIMEOUT_S
    match judge_backend():
        case "anthropic-api":
            return ApiJudge(deadline)
        case "claude-cli":
            return CliJudge(claude_cli(), deadline)
        case _:
            raise ModelUnavailable()


def image_part(data: bytes) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                        "data": base64.b64encode(data).decode()}}


# ---------- engine ----------

@dataclass(frozen=True)
class IndexEntry:
    emb: np.ndarray
    ocr: str


class Engine:
    """Process-wide state: the CLIP model, fetched candidate images and their CLIP and OCR index."""

    def __init__(self, static_root: Path, static_prefix: str):
        self.static_root = static_root.resolve()
        self.static_prefix = static_prefix
        self._clip = None
        self._clip_lock = threading.Lock()
        self._lock = threading.Lock()
        self._images: dict[str, tuple[Path, str]] = {}
        self._index: dict[str, IndexEntry] = {}
        self._pool = ThreadPoolExecutor(8)

    @property
    def clip_warm(self) -> bool:
        return self._clip is not None

    @property
    def indexed(self) -> int:
        return len(self._index)

    def clip(self):
        if self._clip is None:
            with self._clip_lock:
                if self._clip is None:
                    import torch
                    torch.set_num_threads(4)
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", FutureWarning)
                        self._clip = torch.jit.load(str(ensure_jit())).eval()
        return self._clip

    def fetch(self, c: Candidate) -> tuple[Path, str]:
        """Path and content hash of a candidate's image, cached by reference."""
        key = c.image if not c.image.startswith("data:") else "data:" + hashlib.sha1(c.image.encode()).hexdigest()
        with self._lock:
            hit = self._images.get(key)
        if hit:
            return hit
        try:
            if c.image.startswith("/"):
                path = (self.static_root / c.image.removeprefix(self.static_prefix)).resolve()
                if not c.image.startswith(self.static_prefix) or not path.is_relative_to(self.static_root):
                    raise ValueError("outside the static root")
                data = path.read_bytes()
            else:
                if c.image.startswith("data:"):
                    data = base64.b64decode(c.image.partition(",")[2], validate=True)
                    if len(data) > MAX_IMAGE_BYTES:
                        raise ValueError("image larger than MAX_IMAGE_BYTES")
                else:
                    with _OPENER.open(c.image, timeout=FETCH_TIMEOUT_S) as r:
                        data = r.read(MAX_IMAGE_BYTES + 1)
                    if len(data) > MAX_IMAGE_BYTES:
                        raise ValueError("image larger than MAX_IMAGE_BYTES")
                path = None
            with Image.open(io.BytesIO(data)) as im:
                im.verify()
        except (OSError, ValueError, binascii.Error):
            raise ImageFetchFailed(c.sku) from None
        digest = hashlib.sha1(data).hexdigest()
        if path is None:
            path = CACHE / "img" / f"{digest}{image_ext(data)}"
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_bytes(data)
        with self._lock:
            self._images[key] = (path, digest)
        return path, digest

    def index(self, cands: Sequence[Candidate]) -> list[IndexEntry]:
        """CLIP embedding and register-image OCR per candidate, computed once per distinct image."""
        fetched = list(self._pool.map(self.fetch, cands))
        with self._lock:
            missing = {d: p for p, d in fetched if d not in self._index}
        if missing:
            digests, paths = list(missing), list(missing.values())
            ocr_f = self._pool.map(ocr, paths)
            emb = embed(self.clip(), [open_rgb(p) for p in paths])
            entries = dict(zip(digests, (IndexEntry(e, t) for e, t in zip(emb, ocr_f))))
            with self._lock:
                self._index.update(entries)
        with self._lock:
            return [self._index[d] for _, d in fetched]

    def identify(self, photos: Sequence[bytes], cands: Sequence[Candidate], locale: Locale) -> EngineResult:
        judge = start_judge()
        try:
            with tempfile.TemporaryDirectory(prefix="hpi-") as tmp:
                photo_paths = []
                for i, data in enumerate(photos, 1):
                    p = Path(tmp) / f"photo{i}{image_ext(data)}"
                    p.write_bytes(data)
                    photo_paths.append(p)
                ocr_f = self._pool.submit(lambda: [ocr(p) for p in photo_paths])
                entries = self.index(cands)
                q = embed(self.clip(), [open_rgb(photo_paths[0])])[0]
                query = "\n".join(ocr_f.result())

                clip = np.stack([e.emb for e in entries]) @ q
                clip_z = (clip - clip.mean()) / (clip.std() + 1e-6)
                txt, size_s = text_scores(cands, [e.ocr for e in entries], query)
                score = 0.25 * clip_z + 2.0 * txt + 0.3 * size_s
                order = [int(i) for i in np.argsort(-score, kind="stable")]
                stage1 = tuple(cands[i].sku for i in order)
                short = order[:SHORTLIST]

                rows = "\n".join(f"{l}: brand={cands[i].brand!r}; name={cands[i].name!r}; size={cands[i].size!r}"
                                 for l, i in zip(LETTERS, short))
                sheet = contact_sheet([self.fetch(cands[i])[0] for i in short], list(LETTERS[:len(short)]))
                content = [*(image_part(jpeg(p)) for p in photo_paths), image_part(sheet),
                           {"type": "text", "text": build_prompt(rows, query, locale)}]
                answer = judge.ask(content)
        finally:
            judge.close()
        judgement = to_judgement(parse_answer(answer), [cands[i].sku for i in short])
        read_text = tuple(line.strip() for line in query.splitlines() if line.strip())
        return EngineResult(judgement, stage1, read_text)
