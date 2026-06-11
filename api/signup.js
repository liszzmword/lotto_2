function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) return null;
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function validatePayload(body) {
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = normalizePhone(body?.phone);
  const birthDate = body?.birthDate ? String(body.birthDate).trim() : null;

  if (!name || name.length < 2) {
    return { error: '??? 2?? ?? ??? ???.' };
  }

  if (!phone) {
    return { error: '??? ????? ??? ???.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: '??? ???? ??? ???.' };
  }

  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return { error: '???? ??? ???? ????.' };
  }

  return {
    data: {
      name,
      phone,
      email,
      birth_date: birthDate,
    },
  };
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Supabase ????(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)? ???? ?????.',
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const validated = validatePayload(body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/signups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(validated.data),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 409 || /duplicate|unique/i.test(errorText)) {
        return res.status(409).json({ error: '?? ??? ??????.' });
      }

      return res.status(502).json({
        error: 'Supabase ??? ??????. ??? ??? ??? ???.',
      });
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || '?? ??? ??????.' });
  }
};
