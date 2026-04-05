import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAuthCallbackUrl } from "./parseAuthCallback.ts";

describe("parseAuthCallbackUrl", () => {
  it("reads implicit flow tokens from hash", () => {
    const url =
      "myapp://callback#access_token=at&refresh_token=rt&type=recovery";
    assert.deepEqual(parseAuthCallbackUrl(url), {
      access_token: "at",
      refresh_token: "rt",
    });
  });

  it("returns null when hash is missing refresh_token", () => {
    assert.equal(
      parseAuthCallbackUrl("myapp://cb#access_token=only"),
      null,
    );
  });

  it("reads PKCE code from query string", () => {
    assert.deepEqual(parseAuthCallbackUrl("myapp://cb?code=abc123"), {
      code: "abc123",
    });
  });

  it("ignores hash when reading query code", () => {
    assert.deepEqual(
      parseAuthCallbackUrl("myapp://cb?code=xyz#fragment"),
      { code: "xyz" },
    );
  });

  it("returns null when nothing matches", () => {
    assert.equal(parseAuthCallbackUrl("https://example.com/"), null);
  });
});
