// /api/qri-chat.js — Vercel Edge Function (SSE streaming)
export const config = { runtime: "edge" };

export default async function handler(request) {
  // --- CORS / preflight ---
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors("text/plain") });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ role: "assistant", content: "Use POST." }), {
      status: 405,
      headers: cors(),
    });
  }

  try {
    // ---- Read body ----
    const { messages = [], meta = {} } = await request.json();

    // ---- Identity guard: QRI = Quantum Research Institute ----
    const identity = [{
      role: "system",
      content:
        "You are **Quari**, the QRIgpt Theory Assistant for the **Quantum Research Institute** (QRI). " +
        "You guide users through the theory-building process at the Quantum Research Institute — " +
        "helping them clarify ideas, identify principles, and refine hypotheses into coherent structures. " +
        "Always maintain a warm, professional tone that reflects curiosity and respect for open inquiry."
    }];

    // Remove any client system prompts; prepend our identity
    const cleaned = messages.filter(m => m && typeof m.role === "string" && typeof m.content === "string" && m.role !== "system");
    // Trim: keep last N pairs
    const N = 6;
    const recent = cleaned.slice(-N * 2);
    const finalMessages = identity.concat(recent);

    // ---- Model routing (cheap default, escalate on demand) ----
    const model = meta?.escalate ? "gpt-4o" : "gpt-4o-mini";
    const maxTokens = 500;

    // ---- Create an SSE stream ----
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();

        // send an immediate keepalive/preamble so TTFB < 1s
        controller.enqueue(enc.encode("event: ping\ndata: ok\n\n"));

        // Upstream guard: abort if no progress within ~24s
        const ctrl = new AbortController();
        const guard = setTimeout(() => ctrl.abort(), 24000);

        let upstream;
        try {
          upstream = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              stream: true,
              messages: finalMessages,
              temperature: 0.3,
              max_tokens: maxTokens,
            }),
            signal: ctrl.signal
          });
        } catch (err) {
          clearTimeout(guard);
          // Emit a short staged fallback message as SSE, then close
          const fallback = { content: "Network hiccup upstream. I’ll answer in short stages instead." };
          controller.enqueue(enc.encode(`data: ${JSON.stringify(fallback)}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        clearTimeout(guard);

        // If OpenAI returned an error, forward a concise SSE message
        if (!upstream.ok || !upstream.body) {
          const detail = await tryReadText(upstream);
          const msg = { content: "OpenAI API error. Please try again.", detail };
          controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // Pipe OpenAI's SSE straight through (already "data: ...\n\n" formatted)
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: sseHeaders()
    });

  } catch (e) {
    // For JSON errors (malformed body) return JSON, your client handles it
    return new Response(JSON.stringify({
      role: "assistant",
      content: "Bad request — I couldn’t parse what was sent to me.",
      detail: String(e),
    }), { status: 400, headers: cors() });
  }
}

/* ---------- helpers ---------- */
function cors(type = "application/json") {
  return {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function sseHeaders() {
  return {
    ...cors("text/event-stream"),
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  };
}
async function tryReadText(res) {
  try { return await res.text(); } catch { return "(no error body)"; }
}
