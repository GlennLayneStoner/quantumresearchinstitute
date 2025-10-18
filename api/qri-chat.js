// Vercel Edge Function with CORS + OPTIONS support
export const config = { runtime: "edge" };

export default async function handler(request) {
  // 1) Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors() });
  }

  // 2) Only allow POST for the real call
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: cors(),
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
      const t = await r.text(); // helpful for debugging in Vercel logs
      return new Response(JSON.stringify({ error: "OpenAI error", detail: t }), {
        status: 500,
        headers: cors(),
      });
    }

    const data = await r.json();
    return new Response(JSON.stringify(data.choices[0].message), {
      status: 200,
      headers: cors(),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Bad request", detail: String(e) }), {
      status: 400,
      headers: cors(),
    });
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
