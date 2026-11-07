import { describe, expect, it } from "vitest";
import { receive, receiptStatus, undoReceipt, type Receiving } from "./receiving";
const state = (): Receiving => ({ lines: [{ sku: "a", lineId: "1", name: "Pack", brand: "Brand", size: "140 g", image: "img/a.jpg", barcode: "123", expected: 2, received: 0, location: "A" }, { sku: "b", lineId: "2", name: "Other", brand: "Brand", size: "65 g", image: "img/b.jpg", barcode: "456", expected: 1, received: 0 }], links: {}, last: null });
const request = { sku: "a", quantity: 1, location: "B" };
describe("receiving", () => {
  it("counts one scan and keeps its location", () => { const next = receive(state(), request); expect(next.lines[0]?.received).toBe(1); expect(next.lines[0]?.location).toBe("B"); });
  it("requires confirmation for excess and preserves the order", () => { expect(() => receive(state(), { ...request, quantity: 3 })).toThrow("exceeds"); const next = receive(state(), { ...request, quantity: 3, allowOver: true }); expect(next.lines[0]?.expected).toBe(2); expect(receiptStatus(3, 2)).toBe("Over received"); });
  it("undoes the last batch once, restoring location but keeping extra barcode", () => { const next = receive(state(), { ...request, quantity: 2, code: "789" }); const undone = undoReceipt(next); expect(undone.lines[0]?.received).toBe(0); expect(undone.lines[0]?.location).toBe("A"); expect(undone.links["789"]).toBe("a"); expect(undoReceipt(undone)).toBe(undone); });
  it("links an additional code without replacing the primary", () => { const next = receive(state(), { ...request, code: "789" }); expect(next.links["789"]).toBe("a"); expect(next.lines[0]?.barcode).toBe("123"); });
  it("rejects primary and extra barcode conflicts atomically", () => { const original = state(); expect(() => receive(original, { ...request, code: "456" })).toThrow("another product"); expect(() => receive({ ...original, links: { "789": "b" } }, { ...request, code: "789" })).toThrow("another product"); expect(original.lines[0]?.received).toBe(0); });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid quantity %s", (quantity) => { expect(() => receive(state(), { ...request, quantity })).toThrow("whole number"); });
  it("requires a location and refuses off-order products", () => { expect(() => receive(state(), { ...request, location: " " })).toThrow("location"); expect(() => receive(state(), { ...request, sku: "missing", allowOver: true })).toThrow("not on the order"); });
  it.each([[0, 2, "Pending"], [1, 2, "Under received"], [2, 2, "Received"], [3, 2, "Over received"]])("reports status %s/%s", (received, expected, status) => { expect(receiptStatus(Number(received), Number(expected))).toBe(status); });
});
