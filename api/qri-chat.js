import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  const body = await req.json();
  const { messages, meta } = body;

  const model = meta?.escalate ? "gpt-4.1" : "gpt-4.1-mini";

  const completion = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 800,
    temperature: 0.3,
  });

  res.status(200).json(completion.choices[0].message);
}
