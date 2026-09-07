import {describe, it, expect} from "vitest";
import {nextLibrarySong} from "./libraryQueue";
describe("library queue", () => {
  const ids = ["a", "b", "c"];
  it("advances in order and stops unless repeating", () => {
    expect(nextLibrarySong(ids, "a", false, [], "off")).toBe("b");
    expect(nextLibrarySong(ids, "c", false, [], "off")).toBeNull();
    expect(nextLibrarySong(ids, "c", false, [], "all")).toBe("a");
    expect(nextLibrarySong(ids, "b", false, [], "one")).toBe("b");
    expect(nextLibrarySong(ids, "b", false, [], "one", true)).toBe("c");
  });
  it("shuffles through unplayed songs before repeating", () => {
    expect(nextLibrarySong(ids, "a", true, ["a", "b"], "off")).toBe("c");
    expect(nextLibrarySong(ids, "c", true, ids, "off")).toBeNull();
    expect(nextLibrarySong(ids, "c", true, ids, "all", false, () => 0)).toBe("a");
    expect(nextLibrarySong(["a"], "a", true, ["a"], "off")).toBeNull();
    expect(nextLibrarySong(["a"], "a", true, ["a"], "all")).toBe("a");
  });
});
