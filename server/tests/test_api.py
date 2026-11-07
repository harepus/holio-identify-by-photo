import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app as server
import engine as eng
from decide import Judgement


def b64_image(fmt="JPEG", size=(32, 32)) -> str:
    buf = io.BytesIO()
    Image.new("RGB", size, "red").save(buf, fmt)
    return base64.b64encode(buf.getvalue()).decode()


PHOTO = b64_image()
ROW = {"sku": "SKU-1203", "name": "Superchips sourcream & onion", "brand": "Maarud", "size": "140g",
       "image": "/demo/img/SKU-1203.jpg"}


def body(**over):
    b = {"photos": [PHOTO], "candidates": [ROW, {**ROW, "sku": "SKU-6764", "image": "/demo/img/SKU-6764.jpg"}],
         "context": "receiving", "locale": "en"}
    b.update(over)
    return b


class StubEngine:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    def identify(self, photos, cands, locale):
        self.calls.append((photos, cands, locale))
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def client(monkeypatch):
    stub = StubEngine(eng.EngineResult(
        Judgement("SKU-1203", 0.92, ("SKU-1203", "SKU-6764"), True, True, "The pack says 'Sour Cream & Onion'."),
        ("SKU-6764", "SKU-1203"), ("SUPERCHIPS", "SOURCREAM & ONION")))
    monkeypatch.setattr(server, "ENGINE", stub)
    c = TestClient(server.app)
    c.stub = stub
    return c


def post(client, b):
    return client.post("/v1/identify", json=b)


@pytest.mark.parametrize("over, field", [
    ({"photos": []}, "photos"),
    ({"photos": [PHOTO, PHOTO, PHOTO]}, "photos"),
    ({"photos": ["not base64!"]}, "photos[0]"),
    ({"photos": [base64.b64encode(b"hello").decode()]}, "photos[0]"),
    ({"photos": [PHOTO, b64_image("GIF")]}, "photos[1]"),
    ({"candidates": []}, "candidates"),
    ({"candidates": [ROW] * 2}, "candidates[1].sku"),
    ({"candidates": [{**ROW, "sku": f"SKU-{i}"} for i in range(501)]}, "candidates"),
    ({"candidates": [{k: v for k, v in ROW.items() if k != "image"}]}, "candidates[0].image"),
    ({"candidates": [{**ROW, "image": "img/SKU-1203.jpg"}]}, "candidates[0].image"),
    ({"candidates": [{**ROW, "name": ""}]}, "candidates[0].name"),
    ({"context": "picking"}, "context"),
    ({"locale": "sv"}, "locale"),
    ({"locale": None}, "locale"),
])
def test_rule_breaks_are_400_naming_the_field(client, over, field):
    r = post(client, body(**over))
    assert r.status_code == 400, r.text
    assert r.json()["error"] == "invalid_request"
    assert r.json()["detail"].startswith(f"{field}:"), r.json()["detail"]
    assert client.stub.calls == []


def test_oversized_photo_is_400(client):
    big = base64.b64encode(b"\xff\xd8" + b"0" * (6 * 1024 * 1024)).decode()
    r = post(client, body(photos=[big]))
    assert r.status_code == 400
    assert "limit" in r.json()["detail"]


def test_malformed_json_is_400(client):
    r = client.post("/v1/identify", content=b"{", headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_request"
    assert r.json()["detail"].startswith("body:")


def test_valid_request_returns_the_contract_shape(client):
    r = post(client, body(photos=[f"data:image/jpeg;base64,{PHOTO}", b64_image("PNG")], scannedCode="7031234567890"))
    assert r.status_code == 200, r.text
    j = r.json()
    assert set(j) == {"status", "candidates", "evidence", "readText", "ms"}
    assert j["status"] == "match"
    assert j["candidates"] == [{"sku": "SKU-1203", "likelihood": "most_likely"},
                               {"sku": "SKU-6764", "likelihood": "possible"}]
    assert j["readText"] == ["SUPERCHIPS", "SOURCREAM & ONION"]
    assert isinstance(j["ms"], int)
    photos, cands, locale = client.stub.calls[0]
    assert len(photos) == 2 and photos[0].startswith(b"\xff\xd8") and photos[1].startswith(b"\x89PNG")
    assert [c.sku for c in cands] == ["SKU-1203", "SKU-6764"]


@pytest.mark.parametrize("error, status, payload", [
    (eng.ImageFetchFailed("SKU-6764"), 502, {"error": "image_fetch_failed", "sku": "SKU-6764"}),
    (eng.ModelUnavailable(), 503, {"error": "model_unavailable"}),
    (eng.ModelTimeout(), 504, {"error": "model_timeout"}),
])
def test_engine_failures_map_to_contract_errors(client, error, status, payload):
    client.stub.error = error
    r = post(client, body())
    assert r.status_code == status
    assert r.json() == payload


def test_unreadable_candidate_image_is_502_with_its_sku():
    e = eng.Engine(static_root=server.DEMO, static_prefix="/demo/")
    for image in ("/demo/img/missing.jpg", "/demo/../server/app.py", "/etc/hosts", "data:image/png;base64,AAAA"):
        with pytest.raises(eng.ImageFetchFailed) as info:
            e.fetch(eng.Candidate("SKU-X", "x", "", "", image))
        assert info.value.sku == "SKU-X"


def test_demo_files_are_served(client):
    r = client.get("/demo/purchase-order.json")
    assert r.status_code == 200
    assert r.json()["id"] == "500004701"


def test_remote_image_from_a_host_not_allowed_is_400(client):
    row = {**ROW, "image": "http://169.254.169.254/latest/meta-data/x.jpg"}
    r = client.post("/v1/identify", json=body(candidates=[row]))
    assert r.status_code == 400
    assert "HPI_IMAGE_HOSTS" in r.json()["detail"]
