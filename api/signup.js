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

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  return { url, key };
}

function parseSupabaseError(status, errorText) {
  let message = '';
  let code = '';

  try {
    const parsed = JSON.parse(errorText);
    message = parsed.message || parsed.error || parsed.hint || '';
    code = parsed.code || '';
  } catch {
    message = errorText;
  }

  if (status === 401 || /invalid api key|jwt/i.test(message)) {
    return 'Supabase API ?? ???? ????. Vercel? SUPABASE_SERVICE_ROLE_KEY? service_role(??) ?? ????? ??? ???.';
  }

  if (status === 404 || /could not find the table|schema cache/i.test(message)) {
    return 'Supabase? signups ???? ?? ? ????. SQL Editor?? schema.sql? ?????, URL? ?? ?????? ??? ???.';
  }

  if (/row-level security|permission denied/i.test(message)) {
    return 'Supabase ?? ?????. anon ?? ?? service_role ?? ???? ???.';
  }

  if (status === 409 || code === '23505' || /duplicate|unique/i.test(message)) {
    return '?? ??? ??????.';
  }

  if (message) {
    return `Supabase ?? ??: ${message}`;
  }

  return 'Supabase ??? ??????. ???? API ? ??? ??? ???.';
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

  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Supabase ????(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)? ???? ?????.',
    });
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    return res.status(500).json({
      error: 'SUPABASE_URL ??? ???? ????. ?: https://abcdefgh.supabase.co',
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
      const error = parseSupabaseError(response.status, errorText);
      const status = /?? ???/.test(error) ? 409 : 502;
      return res.status(status).json({ error });
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || '?? ??? ??????.' });
  }
};
