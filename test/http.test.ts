import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchText, HttpError } from "../src/http.js";

describe("fetchText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes a bounded, redacted response body in HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "invalid request",
            token: "secret-token",
          }),
          { status: 400 },
        ),
      ),
    );

    const error = await fetchText("https://example.test", {}, 1000).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(HttpError);
    expect((error as Error).message).toContain("invalid request");
    expect((error as Error).message).not.toContain("secret-token");
  });
});
