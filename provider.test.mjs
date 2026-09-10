import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("AI env contract", () => {
  it("does not require XAI_API_KEY or OPENAI_API_KEY", async () => {
    const fs = await import("node:fs");
    const example = fs.readFileSync(
      new URL("../.env.example", import.meta.url),
      "utf8"
    );
    assert.match(example, /GEMINI_API_KEY/);
    assert.match(example, /GROQ_API_KEY/);
    assert.doesNotMatch(example, /XAI_API_KEY/);
    assert.doesNotMatch(example, /OPENAI_API_KEY=/);
  });
});
