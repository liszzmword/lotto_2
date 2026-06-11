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
    return { error: 'Name must be at least 2 characters.' };
  }

  if (!phone) {
    return { error: 'Invalid phone number.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Invalid email address.' };
  }

  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return { error: 'Invalid birth date format.' };
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
    return 'Invalid Supabase API key. Use service_role secret in SUPABASE_SERVICE_ROLE_KEY.';
  }

  if (status === 404 || /could not find the table|schema cache/i.test(message)) {
    return 'signups table not found. Run schema.sql in the same Supabase project as SUPABASE_URL.';
  }

  if (/row-level security|permission denied/i.test(message)) {
    return 'Supabase permission denied. Use service_role key, not anon key.';
  }

  if (status === 409 || code === '23505' || /duplicate|unique/i.test(message)) {
    return 'DUPLICATE_EMAIL';
  }

  if (message) {
    return `Supabase error: ${message}`;
  }

  return 'Failed to save signup data in Supabase.';
}

function toClientError(message) {
  if (message === 'DUPLICATE_EMAIL') {
    return '\uC774\uBBF8 \uAC00\uC785\uB41C \uC774\uBA54\uC77C\uC785\uB2C8\uB2E4.';
  }

  if (message.startsWith('Invalid Supabase API key')) {
    return 'Supabase API \uD0A4\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. Vercel\uC758 SUPABASE_SERVICE_ROLE_KEY\uC5D0 service_role(\uBE44\uBC00) \uD0A4\uB97C \uB123\uC5C8\uB294\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.';
  }

  if (message.startsWith('signups table not found')) {
    return 'Supabase\uC5D0 signups \uD14C\uC774\uBE14\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. schema.sql\uC744 \uC2E4\uD589\uD588\uB294\uC9C0, URL\uC774 \uAC19\uC740 \uD504\uB85C\uC81D\uD2B8\uC778\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.';
  }

  if (message.startsWith('Supabase permission denied')) {
    return 'Supabase \uAD8C\uD55C \uC624\uB958\uC785\uB2C8\uB2E4. anon \uD0A4\uAC00 \uC544\uB2CC service_role \uD0A4\uB97C \uC0AC\uC6A9\uD574\uC57C \uD569\uB2C8\uB2E4.';
  }

  if (message.startsWith('Supabase error:')) {
    return `Supabase \uC800\uC7A5 \uC2E4\uD328: ${message.slice('Supabase error:'.length).trim()}`;
  }

  if (message === 'Failed to save signup data in Supabase.') {
    return 'Supabase \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uD14C\uC774\uBE14\uACFC API \uD0A4 \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.';
  }

  return message;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only.' });
  }

  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    });
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    return res.status(500).json({
      error: 'Invalid SUPABASE_URL format. Example: https://abcdefgh.supabase.co',
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
      const status = error === 'DUPLICATE_EMAIL' ? 409 : 502;
      return res.status(status).json({ error: toClientError(error) });
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error.' });
  }
};
