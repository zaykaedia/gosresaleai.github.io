function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      if (typeof content?.output_text === 'string') parts.push(content.output_text);
    }
  }
  return parts.join('\n').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: 'OPENAI_API_KEY is not configured in Vercel environment variables.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const message = cleanText(body.message, 1400);
    if (!message || message.length < 2) {
      return json(res, 400, { error: 'Message is empty.' });
    }

    const user = body.user || {};
    const site = body.site || {};
    const products = Array.isArray(site.products) ? site.products.slice(0, 12) : [];
    const supportTelegram = cleanText(site.supportTelegram || 'https://t.me/whemmel', 120);
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const catalogText = products.length
      ? products.map((p, i) => `${i + 1}. ${cleanText(p.title, 100)} — ${cleanText(p.category, 60)}, ${Number(p.priceUSDT || 0)} USDT. ${cleanText(p.description, 180)}`).join('\n')
      : 'Каталог не передан или пользователь ещё не открыл товары.';

    const instructions = `Ты — AI-техподдержка сайта GOSRESALE, магазина цифровых AI-товаров.
Отвечай по-русски, коротко, уверенно и понятно. Стиль: дружелюбный, современный, без воды.
Помогай по темам: регистрация, вход, личный кабинет, товары, заказ, оплата USDT TRC20/TON, оплата картой, доступ к цифровому товару.
Не выдумывай факты, которых нет в контексте. Не говори, что оплата подтверждена, если нет данных от админа.
Не проси пароль, seed-фразу, приватные ключи, коды из SMS или данные банковской карты.
Если вопрос про подтверждение оплаты, возврат, спор, ручную выдачу доступа или ошибку заказа — попроси написать детали заказа и обратиться к администратору: ${supportTelegram}.
Максимум 4 коротких абзаца. Можно использовать 1–3 пункта списка, если это помогает.`;

    const input = `Данные клиента:
- Email: ${cleanText(user.email, 120)}
- Имя: ${cleanText(user.displayName, 80)}
- Telegram: ${cleanText(user.telegram, 80)}

Товары из каталога:
${catalogText}

Сообщение клиента:
${message}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        max_output_tokens: 420,
        store: false
      })
    });

    const data = await openaiResponse.json().catch(() => null);
    if (!openaiResponse.ok) {
      const errorMessage = data?.error?.message || `OpenAI API error: ${openaiResponse.status}`;
      return json(res, openaiResponse.status, { error: errorMessage });
    }

    const answer = extractOutputText(data) || 'Не смог сформировать ответ. Попробуй написать вопрос чуть подробнее.';
    return json(res, 200, { answer });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'AI support server error.' });
  }
};
