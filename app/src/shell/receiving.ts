import type { PoLine } from "./data";

export function receiptStatus(received: number, expected: number) {
  if (received > expected) return "Over received";
  if (received === expected && expected > 0) return "Received";
  return received > 0 ? "Under received" : "Pending";
}

export type Receipt = { sku: string; quantity: number; location: string; previousLocation: string | undefined };
export type Receiving = { lines: PoLine[]; links: Record<string, string>; last: Receipt | null };
export type ReceiptRequest = { sku: string; quantity: number; location: string; code?: string; allowOver?: boolean };
export function receive(state: Receiving, request: ReceiptRequest): Receiving {
  const line = state.lines.find((item) => item.sku === request.sku);
  if (!line) throw new Error("Product not on the order");
  if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || !Number.isSafeInteger(line.received + request.quantity)) throw new Error("Positive whole number required");
  const location = request.location.trim();
  if (!location) throw new Error("Choose a location");
  if (line.received + request.quantity > line.expected && !request.allowOver) throw new Error("Quantity exceeds order");
  const owner = request.code && (state.lines.find((item) => item.barcode === request.code)?.sku ?? state.links[request.code]);
  if (owner && owner !== line.sku) throw new Error("Barcode belongs to another product");
  return {
    lines: state.lines.map((item) => item.sku === line.sku ? { ...item, received: item.received + request.quantity, location } : item),
    links: request.code ? { ...state.links, [request.code]: line.sku } : state.links,
    last: { sku: line.sku, quantity: request.quantity, location, previousLocation: line.location },
  };
}

export function undoReceipt(state: Receiving): Receiving {
  const last = state.last;
  if (!last) return state;
  return { ...state, last: null, lines: state.lines.map((line) => line.sku === last.sku ? { ...line, received: line.received - last.quantity, location: last.previousLocation } : line) };
}
