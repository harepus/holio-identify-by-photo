"""Real engine, real judge backend. Run with `-m live -s` to see each response and its time."""
import base64
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as server

pytestmark = pytest.mark.live

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def photos(case: str) -> list[str]:
    return [base64.b64encode((FIXTURES / "photos" / case / f"photo{i}.jpg").read_bytes()).decode() for i in (1, 2)]


def po_lines() -> list[dict]:
    po = json.loads((server.DEMO / "purchase-order.json").read_text())
    return [{**{k: line[k] for k in ("sku", "name", "brand", "size")}, "image": f"/demo/{line['image']}"}
            for line in po["lines"]]


def register_rows() -> list[dict]:
    items = json.loads((server.DEMO / "register" / "register.json").read_text())["items"]
    return [{**{k: it[k] for k in ("sku", "name", "brand", "size")}, "image": f"/demo/register/{it['image']}"}
            for it in items]


def order(name: str) -> list[dict]:
    return json.loads((FIXTURES / "orders" / f"{name}.json").read_text())["candidates"]


@pytest.fixture(scope="module")
def client():
    t0 = time.monotonic()
    server.warm_up()
    print(f"\nwarm-up: {(time.monotonic() - t0):.1f} s, {server.ENGINE.indexed} images indexed")
    return TestClient(server.app)


def identify(client, case: str, candidates: list[dict], context: str, locale="en") -> dict:
    t0 = time.monotonic()
    r = client.post("/v1/identify", json={"photos": photos(case), "candidates": candidates,
                                          "context": context, "locale": locale})
    wall = round((time.monotonic() - t0) * 1000)
    assert r.status_code == 200, r.text
    j = r.json()
    print(f"\n{case} {context} n={len(candidates)} wall={wall} ms\n{json.dumps(j, ensure_ascii=False, indent=1)}")
    return j


def test_h016_milk_chocolate_is_not_on_the_purchase_order(client):
    j = identify(client, "h016", po_lines(), "receiving")
    assert j["status"] == "none"


def test_h016_lookup_over_the_whole_register_puts_the_truth_first(client):
    j = identify(client, "h016", register_rows(), "lookup")
    assert j["candidates"][0]["sku"] == "SKU-1254"


def test_h006_dipmix_matches_among_seven_maarud_products(client):
    j = identify(client, "h006", order("h006-maarud"), "receiving")
    assert (j["status"], j["candidates"][0]["sku"]) == ("match", "SKU-8423")


def test_h024_caramel_sauce_leads_among_seven_freia_products(client):
    j = identify(client, "h024", order("h024-freia"), "receiving")
    assert j["status"] in ("match", "choose")
    assert j["candidates"][0]["sku"] == "SKU-3084"
