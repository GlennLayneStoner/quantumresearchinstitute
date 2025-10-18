// /api/qri-chat.js — Vercel Edge Function
export const config = { runtime: "edge" };

export default async function handler(request) {
  // --- CORS / preflight ---
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors() });
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
        "You are the QRI Theory Guide for the **Quantum Research Institute** (QRI). " +
        "In this conversation, 'QRI' ALWAYS refers to the **Quantum Research Institute** (this website), " +
        "not to the Qualia Research Institute or any other group. If the user mentions that other group, " +
        "briefly clarify it's a different organization and continue with the Quantum Research Institute workflow."
    }];

    // Remove any client system prompts; prepend our identity
    const finalMessages = identity.concat(messages.filter(m => m.role !== "system"));

    // ---- Model routing (cheap default, escalate on demand) ----
    const model = meta.escalate ? "gpt-4o" : "gpt-4o-mini";

    // ---- Call OpenAI ----
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    // ---- Handle OpenAI errors clearly ----
    if (!r.ok) {
      const detail = await tryReadText(r);
      return new Response(JSON.stringify({
        role: "assistant",
        content: "Sorry — my backend couldn’t complete the request (OpenAI API error).",
        detail,
      }), { status: 500, headers: cors() });
    }

    // ---- Success ----
    const data = await r.json();
    const msg = data?.choices?.[0]?.message ?? {
      role: "assistant",
      content: "I didn’t receive a completion from the model. Please try again."
    };

    return new Response(JSON.stringify(msg), { status: 200, headers: cors() });

  } catch (e) {
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
async function tryReadText(res) {
  try { return await res.text(); } catch { return "(no error body)"; }
}
