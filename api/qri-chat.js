// /api/qri-chat.js  — Vercel Edge Function with CORS + friendly errors
export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors() });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ role:"assistant", content:"Use POST." }), {
      status: 405, headers: cors(),
    });
  }

  try {
    const { messages = [], meta = {} } = await request.json();
    const model = meta.escalate ? "gpt-4.1" : "gpt-4.1-mini";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({
        role: "assistant",
        content: "Sorry—my backend couldn’t complete the request. (OpenAI API error.)",
        detail: t,
      }), { status: 500, headers: cors() });
    }

    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg?.content) {
      return new Response(JSON.stringify({
        role: "assistant",
        content: "I didn’t receive a completion from the model. Try again.",
      }), { status: 200, headers: cors() });
    }

    return new Response(JSON.stringify(msg), { status: 200, headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({
      role: "assistant",
      content: "Bad request — I couldn’t parse what was sent to me.",
      detail: String(e),
    }), { status: 400, headers: cors() });
  }
}

function cors(type = "application/json") {
  return {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
