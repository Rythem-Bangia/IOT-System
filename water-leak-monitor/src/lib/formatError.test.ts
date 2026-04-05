import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  formatEdgeFunctionInvokeError,
  formatError,
  formatFunctionsInvokeCatch,
} from "./formatError.ts";

describe("formatError", () => {
  it("returns Error.message for Error instances", () => {
    assert.equal(formatError(new Error("boom")), "boom");
  });

  it("reads message from plain objects", () => {
    assert.equal(formatError({ message: "from object" }), "from object");
  });

  it("joins code, details, hint when no message", () => {
    assert.equal(
      formatError({ code: "E1", details: "d", hint: "h" }),
      "[E1] d h",
    );
  });

  it("passes through strings", () => {
    assert.equal(formatError("plain"), "plain");
  });
});

describe("formatEdgeFunctionInvokeError", () => {
  it("parses JSON body with error fields", async () => {
    const res = new Response(
      JSON.stringify({ error: "bad", detail: "more" }),
      { status: 422 },
    );
    const msg = await formatEdgeFunctionInvokeError(new Error("x"), res);
    assert.match(msg, /bad — more/);
    assert.match(msg, /422/);
  });

  it("uses generic hint when body is empty", async () => {
    const res = new Response("", { status: 500 });
    const msg = await formatEdgeFunctionInvokeError(new Error("x"), res);
    assert.match(msg, /no response body/i);
    assert.match(msg, /500/);
  });

  it("appends deploy instructions for NOT_FOUND-style responses", async () => {
    const res = new Response(
      JSON.stringify({
        code: "NOT_FOUND",
        message: "Function not found",
      }),
      { status: 404 },
    );
    const msg = await formatEdgeFunctionInvokeError(new Error("x"), res);
    assert.match(msg, /send-leak-alert/);
    assert.match(msg, /supabase functions deploy/);
  });
});

describe("formatFunctionsInvokeCatch", () => {
  it("uses response from FunctionsHttpError.context", async () => {
    const res = new Response(JSON.stringify({ error: "edge fail" }), {
      status: 400,
    });
    const err = new FunctionsHttpError(res);
    const msg = await formatFunctionsInvokeCatch(err);
    assert.match(msg, /edge fail/);
    assert.match(msg, /400/);
  });
});
