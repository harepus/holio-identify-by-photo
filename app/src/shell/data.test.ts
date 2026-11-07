import { describe, expect, it } from "vitest";
import { totals } from "./PurchaseOrderPage";
import { ean13, lineBarcode } from "./data";

describe("order barcodes", () => {
  it("uses the real pack's barcode ahead of the synthetic SKU code", () => {
    expect(lineBarcode({ sku: "SKU-6764", barcode: "7050122114607" })).toBe("7050122114607");
  });
  it("keeps older orders without barcode data scannable", () => {
    expect(lineBarcode({ sku: "SKU-6764" })).toBe(ean13("SKU-6764"));
  });
});

it("does not count extra units toward completing the order", () => {
  const line = { sku: "extra", lineId: "extra", name: "Chocolate", brand: "Freia", size: "200 g", image: "", expected: 0, received: 3 };
  expect(totals({ id: "1", supplier: "", warehouse: "", company: "", date: "2026-11-07", notOnOrder: [], lines: [
    line, { ...line, sku: "ordered", expected: 24, received: 1 },
  ] })).toEqual({ expected: 24, received: 1 });
});
