import type { Candidate } from "../identify";

export type PoLine = { lineId: string; sku: string; name: string; brand: string; size: string; expected: number; received: number; image: string };
export type PurchaseOrder = { id: string; supplier: string; warehouse: string; company: string; date: string; lines: PoLine[] };

type RawProduct = { sku: string; name: string; brand?: string; size?: string; image: string };

/** "140g" reads "140 g", as Holio prints sizes. */
export const formatSize = (size: string) => size.replace(/(\d)\s*([a-zA-Z])/g, "$1 $2");

const toCandidate = (p: RawProduct, base: string): Candidate => ({
  sku: p.sku,
  name: p.name,
  brand: p.brand || undefined,
  size: p.size ? formatSize(p.size) : undefined,
  image: `${base}${p.image}`,
});

export const productLabel = (c: Candidate) => [c.name, c.size?.replace(/ /g, "\u00a0")].filter(Boolean).join(" ");

export const lineCandidate = (line: PoLine) => toCandidate(line, "/demo/");

export async function loadPurchaseOrder(): Promise<PurchaseOrder> {
  const res = await fetch("/demo/purchase-order.json");
  if (!res.ok) throw new Error(`purchase order ${res.status}`);
  const po = (await res.json()) as PurchaseOrder;
  return { ...po, lines: po.lines.map((l) => ({ ...l, size: formatSize(l.size) })) };
}

let register: Promise<Candidate[]> | null = null;

/** Every row of the demo register. The server shortlists them. */
export function searchRegister(): Promise<Candidate[]> {
  register ??= fetch("/demo/register/register.json")
    .then((res) => {
      if (!res.ok) throw new Error(`register ${res.status}`);
      return res.json() as Promise<{ items: RawProduct[] }>;
    })
    .then(({ items }) => items.map((p) => toCandidate(p, "/demo/register/")))
    .catch((e: unknown) => {
      register = null;
      throw e;
    });
  return register;
}

/** A stable fake EAN-13 per SKU, with a valid check digit. */
export function ean13(sku: string): string {
  const body = `703800${sku.replace(/\D/g, "").padStart(6, "0").slice(-6)}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

export const UNKNOWN_CODE = "7031234567890";

const LINKS_KEY = "holio-demo-linked-barcodes";

export function readLinks(): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

export function writeLinks(links: Record<string, string>) {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // Private mode: links last for this page only.
  }
}
