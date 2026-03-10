import { describe, it, expect, vi } from "vitest";
import { logger } from "../logger.js";

describe("logger", () => {
  it("logs info as JSON to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test message", { key: "value" });
    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe("info");
    expect(logged.msg).toBe("test message");
    expect(logged.key).toBe("value");
    expect(logged.timestamp).toBeDefined();
    spy.mockRestore();
  });

  it("logs warn as JSON to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.warn("warning");
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe("warn");
    expect(logged.msg).toBe("warning");
    spy.mockRestore();
  });

  it("logs error as JSON to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("bad thing", { code: 500 });
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe("error");
    expect(logged.msg).toBe("bad thing");
    expect(logged.code).toBe(500);
    spy.mockRestore();
  });

  it("logs debug as JSON to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.debug("debug info");
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe("debug");
    spy.mockRestore();
  });

  it("includes ISO timestamp", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("time check");
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    // Should be a valid ISO date
    expect(new Date(logged.timestamp).toISOString()).toBe(logged.timestamp);
    spy.mockRestore();
  });

  it("works without extra data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("no data");
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(Object.keys(logged)).toEqual(
      expect.arrayContaining(["level", "msg", "timestamp"])
    );
    spy.mockRestore();
  });
});
