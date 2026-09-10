import type {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  Message,
  ToolCall,
} from "./types";

/**
 * Provider-agnostic AI layer.
 * Default: Gemini. Fallback: Groq.
 * Additional providers can implement AIProvider without changing the orchestrator.
 */

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  try {
    const s = schema as { shape?: () => Record<string, unknown> };
    if (s && typeof s.shape === "function") {
      const shape = s.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = { type: "string" };
        const optional =
          typeof (val as { isOptional?: () => boolean }).isOptional ===
          "function"
            ? (val as { isOptional: () => boolean }).isOptional()
            : false;
        if (!optional) required.push(key);
      }
      return { type: "object", properties, required };
    }
  } catch {
    // fall through
  }
  return { type: "object", properties: {}, additionalProperties: true };
}

function toOpenAIMessage(m: Message): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls) {
    out.tool_calls = m.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }
  if (m.toolCallId) out.tool_call_id = m.toolCallId;
  if (m.name) out.name = m.name;
  return out;
}

async function chatOpenAICompatible(
  opts: {
    apiKey: string;
    baseUrl: string;
    model: string;
    label: string;
  },
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: request.messages.map(toOpenAIMessage),
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 4096,
  };

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.inputSchema),
      },
    }));
    body.tool_choice = "auto";
  }

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${opts.label} API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error(`${opts.label}: no completion choice returned`);

  const msg = choice.message;
  const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParseJson(tc.function.arguments),
    })
  );

  return {
    id: data.id,
    message: {
      role: "assistant",
      content: msg.content ?? null,
      toolCalls,
    },
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
    finishReason:
      choice.finish_reason === "tool_calls"
        ? "tool_calls"
        : choice.finish_reason === "length"
          ? "length"
          : "stop",
  };
}

export class GeminiProvider implements AIProvider {
  id = "gemini";
  name = "Google Gemini";
  private apiKey: string;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const key = opts?.apiKey ?? env("GEMINI_API_KEY");
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    this.apiKey = key;
    this.model =
      opts?.model ?? env("GEMINI_MODEL") ?? env("AI_MODEL") ?? "gemini-2.0-flash";
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const contents: Array<Record<string, unknown>> = [];
    let systemInstruction: string | undefined;

    for (const m of request.messages) {
      if (m.role === "system") {
        systemInstruction = [systemInstruction, m.content]
          .filter(Boolean)
          .join("\n");
        continue;
      }
      const role = m.role === "assistant" ? "model" : "user";
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      if (m.role === "tool" && m.content) {
        parts.push({ text: `Tool result (${m.name ?? "tool"}): ${m.content}` });
      }
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          parts.push({
            functionCall: { name: tc.name, args: tc.arguments },
          });
        }
      }
      if (parts.length === 0) parts.push({ text: "" });
      contents.push({ role, parts });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 4096,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.inputSchema),
          })),
        },
      ];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const textParts = parts
      .filter((p: { text?: string }) => typeof p.text === "string")
      .map((p: { text: string }) => p.text);
    const functionCalls = parts.filter(
      (p: { functionCall?: { name: string; args?: Record<string, unknown> } }) =>
        p.functionCall
    );

    const toolCalls: ToolCall[] | undefined =
      functionCalls.length > 0
        ? functionCalls.map(
            (
              p: {
                functionCall: { name: string; args?: Record<string, unknown> };
              },
              i: number
            ) => ({
              id: `call_${i}_${p.functionCall.name}`,
              name: p.functionCall.name,
              arguments: p.functionCall.args ?? {},
            })
          )
        : undefined;

    return {
      id: data.responseId ?? "gemini",
      message: {
        role: "assistant",
        content: textParts.join("\n") || null,
        toolCalls,
      },
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount ?? 0,
            completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: data.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
      finishReason: toolCalls?.length ? "tool_calls" : "stop",
    };
  }
}

export class GroqProvider implements AIProvider {
  id = "groq";
  name = "Groq";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    const key = opts?.apiKey ?? env("GROQ_API_KEY");
    if (!key) throw new Error("GROQ_API_KEY is not set");
    this.apiKey = key;
    this.model =
      opts?.model ?? env("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
    this.baseUrl = opts?.baseUrl ?? "https://api.groq.com/openai/v1";
  }

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return chatOpenAICompatible(
      {
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model,
        label: "Groq",
      },
      request
    );
  }
}

/** Optional extension point — not used unless AI_PROVIDER is set explicitly. */
export class OpenAICompatibleProvider implements AIProvider {
  id = "openai-compatible";
  name = "OpenAI Compatible";
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? env("OPENAI_API_KEY") ?? "";
    this.baseUrl =
      opts?.baseUrl ?? env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
    this.model = opts?.model ?? env("AI_MODEL") ?? "gpt-4o";
  }

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");
    return chatOpenAICompatible(
      {
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model,
        label: "OpenAI-compatible",
      },
      request
    );
  }
}

export class FallbackProvider implements AIProvider {
  id = "gemini+groq";
  name = "Gemini with Groq fallback";
  private primary: AIProvider;
  private fallback?: AIProvider;

  constructor(primary: AIProvider, fallback?: AIProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      return await this.primary.chat(request);
    } catch (err) {
      if (!this.fallback) throw err;
      return await this.fallback.chat(request);
    }
  }
}

export function isAIConfigured(): boolean {
  return Boolean(env("GEMINI_API_KEY") || env("GROQ_API_KEY"));
}

export function createAIProvider(): AIProvider {
  const explicit = (env("AI_PROVIDER") ?? "gemini").toLowerCase();

  if (explicit === "groq") {
    return new GroqProvider();
  }
  if (explicit === "openai" || explicit === "openai-compatible") {
    return new OpenAICompatibleProvider();
  }

  const geminiKey = env("GEMINI_API_KEY");
  const groqKey = env("GROQ_API_KEY");

  if (explicit === "gemini" || explicit === "auto" || !explicit) {
    if (geminiKey && groqKey) {
      return new FallbackProvider(new GeminiProvider(), new GroqProvider());
    }
    if (geminiKey) return new GeminiProvider();
    if (groqKey) return new GroqProvider();
    throw new Error(
      "No AI provider configured. Set GEMINI_API_KEY (primary) and/or GROQ_API_KEY (fallback)."
    );
  }

  if (geminiKey) return new GeminiProvider();
  if (groqKey) return new GroqProvider();
  throw new Error(
    "No AI provider configured. Set GEMINI_API_KEY and/or GROQ_API_KEY."
  );
}
