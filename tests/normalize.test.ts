import { describe, expect, it } from "vitest";
import { normalizePhone, normalizeText } from "../src/lib/normalize";

describe("normalização", () => {
  it("normaliza celular brasileiro para E.164", () => {
    expect(normalizePhone("(41) 98879-7301")).toBe("+5541988797301");
  });

  it("preserva telefone brasileiro já internacional", () => {
    expect(normalizePhone("+55 41 98879-7301")).toBe("+5541988797301");
  });

  it("preserva telefone internacional informado com código do país", () => {
    expect(normalizePhone("+595 982934422")).toBe("+595982934422");
  });

  it("rejeita telefone brasileiro incompleto", () => {
    expect(normalizePhone("(55) 4398-868")).toBeUndefined();
    expect(normalizePhone("+55 4398-868")).toBeUndefined();
  });

  it("normaliza textos para comparação de campos", () => {
    expect(normalizeText("Quantas unidades possui?")).toBe("quantas unidades possui");
  });
});
