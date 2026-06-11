const MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    numbers: {
      type: 'ARRAY',
      items: { type: 'INTEGER' },
    },
    bonus: { type: 'INTEGER' },
    fortuneSummary: { type: 'STRING' },
    explanation: { type: 'STRING' },
    reply: { type: 'STRING' },
  },
  required: ['numbers', 'bonus', 'fortuneSummary', 'explanation', 'reply'],
};

function getTodayInSeoul() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'long',
  }).format(now);
  return { date, weekday };
}

function normalizeLottoNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const int = Math.round(num);
  if (int < 1 || int > 45) return null;
  return int;
}

function validateLottoRecommendation(data) {
  if (!data || typeof data !== 'object') return null;

  if (!Array.isArray(data.numbers) || data.numbers.length !== 6) return null;

  const numbers = data.numbers.map(normalizeLottoNumber);
  if (numbers.some(n => n === null)) return null;

  const bonus = normalizeLottoNumber(data.bonus);
  if (bonus === null) return null;

  const unique = new Set(numbers);
  if (unique.size !== 6) return null;
  if (numbers.includes(bonus)) return null;

  return {
    numbers: [...numbers].sort((a, b) => a - b),
    bonus,
    fortuneSummary: String(data.fortuneSummary || '').trim(),
    explanation: String(data.explanation || '').trim(),
    reply: String(data.reply || '').trim(),
  };
}

function buildPrompt(birthDate, message, history) {
  const { date, weekday } = getTodayInSeoul();
  const historyText = Array.isArray(history) && history.length
    ? history.map(item => `${item.role === 'assistant' ? '???' : '???'}: ${item.content}`).join('\n')
    : '';

  const userRequest = message?.trim() || '??? ??? ???? ?? ?? 6?? ??? 1?? ??? ???.';

  return `??? ?? ?? ?? ?? ?????.

[?? ??]
- ??? ????: ${birthDate}
- ?? ??(??/??): ${date} (${weekday})
- ??? ??: ${userRequest}

[?? ??]
${historyText || '(??)'}

[??]
1. ????(?, ???, ?? ??)? ?? ?? ??? fortuneSummary? 2~3???? ?????.
2. ??? ????? ??? ?? 6/45 ?? 6?? ??? 1?? ?????.
3. explanation? ?? ?? ??? ??·????? ??? 4~6???? ?????.
4. reply? ????? ??? ????? ??? ??? ?????.
5. numbers? 1~45 ?? ?? ?? 6?(????), bonus? numbers? ?? 1~45 ?????.
6. ??? ???? ??? ????? ????? ?????.
7. ??? ?? JSON ??? ?????.

{
  "numbers": [1, 2, 3, 4, 5, 6],
  "bonus": 7,
  "fortuneSummary": "?? ??",
  "explanation": "?? ?? ??",
  "reply": "????? ??? ??"
}`;
}

function extractJsonObject(text) {
  if (!text) throw new Error('AI ??? ?? ????.');

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI ???? JSON? ?? ?????.');
    return JSON.parse(match[0]);
  }
}

async function callGemini(apiKey, prompt, useSchema = true) {
  const generationConfig = {
    temperature: 0.85,
    responseMimeType: 'application/json',
  };

  if (useSchema) {
    generationConfig.responseSchema = RESPONSE_SCHEMA;
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || 'Gemini API ??? ??????.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJsonObject(text);
}

async function generateRecommendation(apiKey, prompt) {
  try {
    return await callGemini(apiKey, prompt, true);
  } catch (error) {
    if (error.status === 400 || /schema|responseSchema|JSON/i.test(error.message)) {
      return await callGemini(apiKey, prompt, false);
    }
    throw error;
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST ??? ?????.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY ????? ???? ?????. Vercel Settings?? ?? ? ???? ???.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { birthDate, message, history } = body || {};

    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return res.status(400).json({ error: '??? ????(YYYY-MM-DD)? ?????.' });
    }

    const prompt = buildPrompt(birthDate, message, history);
    const raw = await generateRecommendation(apiKey, prompt);
    const data = validateLottoRecommendation(raw);

    if (!data) {
      return res.status(502).json({ error: 'AI? ???? ?? ??? ??????. ?? ??? ???.' });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || '?? ??? ??????.' });
  }
};
