/**
 * AI Agent module — анализирует блогеров и предлагает цены
 * Работает через очередь задач в lowdb
 * Gemini API для анализа
 */

const https = require('https');
const { v4: uuidv4 } = require('uuid');

// ── Gemini API helper ──────────────────────────────────────
function geminiRequest(apiKey, model, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Промпт для анализа блогера ─────────────────────────────
function buildAnalysisPrompt(blogger) {
  const followers = blogger.instagram_followers || blogger.tiktok_followers || 0;
  const reach = blogger.instagram_avg_reach || blogger.tiktok_avg_reach || 0;
  const existingPrices = [
    blogger.price_reels ? `Reels: ${blogger.price_reels}` : '',
    blogger.price_tiktok ? `TikTok: ${blogger.price_tiktok}` : '',
    blogger.price_stories ? `Stories: ${blogger.price_stories}` : '',
  ].filter(Boolean).join(', ');

  return `Ты менеджер по работе с блогерами. Проанализируй блогера и предложи справедливые цены на рекламу.

ДАННЫЕ БЛОГЕРА:
- Имя: ${blogger.name || 'не указано'}
- Instagram: ${blogger.instagram_url || 'нет'}
- TikTok: ${blogger.tiktok_url || 'нет'}
- Подписчики Instagram: ${blogger.instagram_followers || 0}
- Подписчики TikTok: ${blogger.tiktok_followers || 0}
- Средний охват Instagram: ${blogger.instagram_avg_reach || 0}
- Средний охват TikTok: ${blogger.tiktok_avg_reach || 0}
- Категория: ${blogger.category || 'не указана'}
- Текущие цены: ${existingPrices || 'не заполнены'}
- Статус: ${blogger.status || 'новый'}
- Заметки: ${blogger.notes || 'нет'}
- Последний комментарий: ${blogger.last_comment || 'нет'}

ЗАДАЧА:
1. Оцени блогера по шкале 1-10 (потенциал для сотрудничества)
2. Предложи цены в тенге (KZT) если они не заполнены или явно устарели:
   - price_reels (за Reels/видео в Instagram)
   - price_tiktok (за TikTok видео)
   - price_stories (за Stories)
3. Напиши рекомендацию менеджеру (2-3 предложения)
4. Укажи приоритет обработки: high/medium/low

Ответ СТРОГО в JSON (без markdown, без пояснений):
{
  "score": 7,
  "priority": "high",
  "suggested_prices": {
    "price_reels": 50000,
    "price_tiktok": 40000,
    "price_stories": 15000
  },
  "recommendation": "Рекомендация для менеджера",
  "reasoning": "Краткое обоснование цен"
}`;
}

// ── Основной модуль агента ─────────────────────────────────
module.exports = function agentModule(app, db, auth) {
  // Состояние очереди (в памяти, не в файле)
  let agentQueue = [];
  let isProcessing = false;
  let processedCount = 0;
  let errorCount = 0;
  let lastActivity = null;

  function getSettings() {
    const s = db.get('agent_settings').value() || {};
    return {
      enabled: s.enabled || false,
      gemini_api_key: s.gemini_api_key || process.env.GEMINI_API_KEY || '',
      gemini_model: s.gemini_model || 'gemini-1.5-flash',
      max_concurrent: s.max_concurrent || 3,
      auto_update_prices: s.auto_update_prices || false,
    };
  }

  function saveSettings(updates) {
    const current = db.get('agent_settings').value() || {};
    db.set('agent_settings', { ...current, ...updates }).write();
  }

  // ── Обработка одной задачи ─────────────────────────────
  async function processTask(task) {
    const settings = getSettings();
    if (!settings.gemini_api_key) throw new Error('Gemini API key не настроен');

    const blogger = db.get('bloggers').find({ id: task.blogger_id }).value();
    if (!blogger) throw new Error(`Блогер ${task.blogger_id} не найден`);

    const prompt = buildAnalysisPrompt(blogger);
    const rawText = await geminiRequest(settings.gemini_api_key, settings.gemini_model, prompt);

    // Парсим JSON из ответа
    let result;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON не найден в ответе');
      result = JSON.parse(jsonMatch[0]);
    } catch(e) {
      throw new Error(`Ошибка парсинга ответа AI: ${e.message}`);
    }

    // Сохраняем результат в блогера
    const now = new Date().toISOString();
    const update = {
      agent_status: 'analyzed',
      agent_score: result.score,
      agent_priority: result.priority,
      agent_recommendation: result.recommendation,
      agent_reasoning: result.reasoning,
      agent_last_analysis: now,
      updated_at: now,
    };

    // Если включено авто-обновление цен и цены не заполнены
    if (settings.auto_update_prices && result.suggested_prices) {
      const sp = result.suggested_prices;
      if (sp.price_reels && !blogger.price_reels) update.price_reels = sp.price_reels;
      if (sp.price_tiktok && !blogger.price_tiktok) update.price_tiktok = sp.price_tiktok;
      if (sp.price_stories && !blogger.price_stories) update.price_stories = sp.price_stories;
    }

    // Всегда сохраняем предложенные цены отдельно
    update.agent_suggested_prices = result.suggested_prices;

    db.get('bloggers').find({ id: task.blogger_id }).assign(update).write();

    lastActivity = now;
    processedCount++;
    return result;
  }

  // ── Очередь ────────────────────────────────────────────
  async function runQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (agentQueue.length > 0) {
      const task = agentQueue.shift();
      task.status = 'processing';
      task.started_at = new Date().toISOString();

      try {
        const result = await processTask(task);
        task.status = 'done';
        task.result = result;
        task.finished_at = new Date().toISOString();
      } catch(e) {
        task.status = 'error';
        task.error = e.message;
        task.finished_at = new Date().toISOString();
        errorCount++;
        console.error(`Agent task error [${task.blogger_id}]:`, e.message);
      }

      // Пауза между запросами (не перегружать API)
      await new Promise(r => setTimeout(r, 1500));
    }

    isProcessing = false;
  }

  // ── API маршруты ────────────────────────────────────────

  // Статус агента
  app.get('/api/agent/status', auth, (req, res) => {
    const settings = getSettings();
    res.json({
      enabled: settings.enabled,
      queue_length: agentQueue.length,
      is_processing: isProcessing,
      processed_count: processedCount,
      error_count: errorCount,
      last_activity: lastActivity,
      has_api_key: !!settings.gemini_api_key,
    });
  });

  // Настройки агента
  app.get('/api/agent/settings', auth, (req, res) => {
    const s = getSettings();
    // Не отдаём ключ целиком
    res.json({
      ...s,
      gemini_api_key: s.gemini_api_key ? '***' + s.gemini_api_key.slice(-4) : '',
    });
  });

  app.put('/api/agent/settings', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для admin' });
    const { gemini_api_key, gemini_model, max_concurrent, auto_update_prices, enabled } = req.body;
    const update = {};
    if (gemini_api_key && !gemini_api_key.startsWith('***')) update.gemini_api_key = gemini_api_key;
    if (gemini_model) update.gemini_model = gemini_model;
    if (max_concurrent !== undefined) update.max_concurrent = max_concurrent;
    if (auto_update_prices !== undefined) update.auto_update_prices = auto_update_prices;
    if (enabled !== undefined) update.enabled = enabled;
    saveSettings(update);
    res.json({ ok: true });
  });

  // Добавить блогеров в очередь
  app.post('/api/agent/queue', auth, (req, res) => {
    const { blogger_ids, mode } = req.body; // mode: 'selected' | 'no_prices' | 'all_new'
    const settings = getSettings();
    if (!settings.gemini_api_key) {
      return res.status(400).json({ error: 'Сначала настройте Gemini API key в настройках агента' });
    }

    let bloggers = db.get('bloggers').value() || [];

    let targets = [];
    if (mode === 'selected' && blogger_ids?.length) {
      targets = bloggers.filter(b => blogger_ids.includes(b.id));
    } else if (mode === 'no_prices') {
      targets = bloggers.filter(b => !b.price_reels && !b.price_tiktok && !b.price_stories);
    } else if (mode === 'all_new') {
      targets = bloggers.filter(b => b.status === 'новый' || b.status === 'new' || !b.status);
    } else if (mode === 'not_analyzed') {
      targets = bloggers.filter(b => !b.agent_status || b.agent_status === 'pending');
    } else {
      return res.status(400).json({ error: 'Укажите mode или blogger_ids' });
    }

    // Не дублируем уже стоящих в очереди
    const inQueue = new Set(agentQueue.map(t => t.blogger_id));
    const toAdd = targets.filter(b => !inQueue.has(b.id));

    const newTasks = toAdd.map(b => ({
      id: uuidv4(),
      blogger_id: b.id,
      blogger_name: b.name,
      status: 'pending',
      created_at: new Date().toISOString(),
      manager_id: req.user.id,
    }));

    agentQueue.push(...newTasks);

    // Запускаем очередь если не запущена
    if (!isProcessing) runQueue().catch(e => console.error('Queue error:', e));

    res.json({ ok: true, added: newTasks.length, queue_length: agentQueue.length });
  });

  // Состояние очереди
  app.get('/api/agent/queue', auth, (req, res) => {
    res.json({
      queue: agentQueue.slice(0, 50), // первые 50
      total: agentQueue.length,
      is_processing: isProcessing,
    });
  });

  // Очистить очередь
  app.delete('/api/agent/queue', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    const removed = agentQueue.filter(t => t.status === 'pending').length;
    agentQueue = agentQueue.filter(t => t.status === 'processing');
    res.json({ ok: true, removed });
  });

  // Анализ одного блогера (мгновенно)
  app.post('/api/agent/analyze/:id', auth, async (req, res) => {
    const settings = getSettings();
    if (!settings.gemini_api_key) {
      return res.status(400).json({ error: 'Gemini API key не настроен' });
    }
    const blogger = db.get('bloggers').find({ id: req.params.id }).value();
    if (!blogger) return res.status(404).json({ error: 'Блогер не найден' });

    try {
      const task = { blogger_id: req.params.id };
      const result = await processTask(task);
      res.json({ ok: true, result });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Статистика по проанализированным блогерам
  app.get('/api/agent/stats', auth, (req, res) => {
    const bloggers = db.get('bloggers').value() || [];
    const analyzed = bloggers.filter(b => b.agent_status === 'analyzed');
    const byPriority = { high: 0, medium: 0, low: 0 };
    analyzed.forEach(b => {
      const p = b.agent_priority || 'medium';
      byPriority[p] = (byPriority[p] || 0) + 1;
    });
    res.json({
      total: bloggers.length,
      analyzed: analyzed.length,
      not_analyzed: bloggers.length - analyzed.length,
      by_priority: byPriority,
      avg_score: analyzed.length
        ? Math.round(analyzed.reduce((s, b) => s + (b.agent_score || 0), 0) / analyzed.length * 10) / 10
        : 0,
    });
  });

  // Список проанализированных блогеров (для дашборда)
  app.get('/api/agent/analyzed', auth, (req, res) => {
    const { priority, limit = 50, offset = 0 } = req.query;
    let bloggers = db.get('bloggers').value() || [];
    bloggers = bloggers.filter(b => b.agent_status === 'analyzed');
    if (priority) bloggers = bloggers.filter(b => b.agent_priority === priority);
    bloggers.sort((a, b) => (b.agent_score || 0) - (a.agent_score || 0));
    res.json({
      total: bloggers.length,
      items: bloggers.slice(Number(offset), Number(offset) + Number(limit)),
    });
  });

  console.log('✓ Agent module loaded');
};
