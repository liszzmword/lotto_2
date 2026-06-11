const MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    numbers: {
      type: 'array',
      items: { type: 'integer' },
      description: '?? ?? ?? 6? (1~45, ?? ??, ????)',
    },
    bonus: {
      type: 'integer',
      description: '??? ?? (1~45, numbers? ??)',
    },
    fortuneSummary: {
      type: 'string',
      description: '????? ?? ??? ??? ??? ?? ??',
    },
    explanation: {
      type: 'string',
      description: '?? ??? ??? ?? (??·???? ?? ??)',
    },
    reply: {
      type: 'string',
      description: '????? ??? ??? ??? ?? ??',
    },
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

function validateLottoRecommendation(data) {
  if (!data || typeof data !== 'object') return false;

  const { numbers, bonus } = data;
  if (!Array.isArray(numbers) || numbers.length !== 6) return false;
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return false;

  const unique = new Set(numbers);
  if (unique.size !== 6) return false;

  for (const num of numbers) {
    if (!Number.isInteger(num) || num < 1 || num > 45) return false;
  }
  if (numbers.includes(bonus)) return false;

  data.numbers = [...numbers].sort((a, b) => a - b);
  return true;
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
1. ????(?·???·?? ?? ?)? ?? ??? ??? ??? ??? ??? fortuneSummary? 2~3???? ?????.
2. ? ??? ????? ??? ?? 6/45 ?? 6?? ??? 1?? ?????.
3. explanation? ? ??(?? ?? ??)? ? ???? ??·????? ??? 4~6???? ?????.
4. reply? ????? ??? ????? ??? ??? ?????.
5. numbers? 1~45 ?? ?? 6?(????), bonus? numbers? ?? 1~45 ???? ???.
6. ??? ???? ??? ??·????? reply ?? explanation? ????? ?????.
7. ??? JSON ???? ?? JSON? ?????.`;
}

async function callGemini(apiKey, prompt) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || 'Gemini API ??? ??????.';
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI ??? ?? ?????.');

  return JSON.parse(text);
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
    return res.status(500).json({ error: 'GEMINI_API_KEY ????? ???? ?????.' });
  }

  try {
    const { birthDate, message, history } = req.body || {};

    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return res.status(400).json({ error: '??? ????(YYYY-MM-DD)? ?????.' });
    }

    const prompt = buildPrompt(birthDate, message, history);
    const data = await callGemini(apiKey, prompt);

    if (!validateLottoRecommendation(data)) {
      return res.status(502).json({ error: 'AI? ???? ?? ??? ??????. ?? ??? ???.' });
    }

    return res.status(200).json({
      numbers: data.numbers,
      bonus: data.bonus,
      fortuneSummary: data.fortuneSummary || '',
      explanation: data.explanation || '',
      reply: data.reply || '',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || '?? ??? ??????.' });
  }
};
