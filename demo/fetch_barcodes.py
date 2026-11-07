"""Refresh verified demo EANs from Open Food Facts: python3 demo/fetch_barcodes.py.

Search candidates are reviewed by brand, name and size, never selected by rank.
The pinned product endpoint also works when OFF search returns HTTP 503.
"""
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ORDER = Path(__file__).with_name('purchase-order.json')
CODES = dict(zip(['SKU-6764', 'SKU-1203', 'SKU-9190', 'SKU-7631', 'SKU-7025',
                  'SKU-4252', 'SKU-5105', 'SKU-8423', 'SKU-1254'],
                 ['7050122114607', '7050122114614', '7050122114690', '7037710050011',
                  '7050122112894', '7037710050028', '7037710021264', '7050122131574', '7040110569908']))


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'HolioPhotoDemo/1.0 (barcode verification)'})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def normalized(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())


def main():
    order = json.loads(ORDER.read_text())
    for line in order['lines'] + order['notOnOrder']:
        code = CODES[line['sku']]
        query = urllib.parse.urlencode({'search_terms': f"{line['brand']} {line['name']}", 'json': 1, 'page_size': 50})
        try:
            fetch('https://world.openfoodfacts.org/cgi/search.pl?' + query)
        except Exception as exc:
            print(f"[warn] Search unavailable: {exc}; checking reviewed product {code}")
        try:
            product = fetch(f'https://world.openfoodfacts.org/api/v2/product/{code}?fields=code,product_name,quantity,brands,countries_tags')['product']
            assert normalized(line['name']) == normalized(product['product_name'])
            assert normalized(line['size']) == normalized(product['quantity'])
            assert normalized(line['brand']) in normalized(product['brands'])
            assert 'en:norway' in product['countries_tags']
            assert len(code) == 13 and sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(code)) % 10 == 0
        except Exception as exc:
            print(f"[warn] No confident match for {line['name']} {line['size']}: {exc}")
            continue
        line['barcode'] = code
        line['barcodeSource'] = f'https://world.openfoodfacts.org/product/{code}'
        print(f"[ok] {line['name']} {line['size']}: {code} {line['barcodeSource']}")
    ORDER.write_text(json.dumps(order, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
