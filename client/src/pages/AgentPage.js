import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

export default function AgentPage({ token, user }) {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [analyzed, setAnalyzed] = useState([]);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [priorityFilter, setPriorityFilter] = useState('');

  const h = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const [s, st, q, an] = await Promise.all([
        fetch(`${API}/api/agent/status`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/agent/stats`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/agent/queue`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/agent/analyzed?limit=100${priorityFilter ? `&priority=${priorityFilter}` : ''}`, { headers: h }).then(r => r.json()),
      ]);
      setStatus(s);
      setStats(st);
      setQueue(q.queue || []);
      setAnalyzed(an.items || []);
    } catch(e) { console.error(e); }
  }, [token, priorityFilter]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // Автообновление если идёт обработка
  useEffect(() => {
    const interval = setInterval(() => {
      if (status?.is_processing || status?.queue_length > 0) load();
    }, 3000);
    return () => clearInterval(interval);
  }, [status, load]);

  async function loadSettings() {
    const s = await fetch(`${API}/api/agent/settings`, { headers: h }).then(r => r.json());
    setSettings(s);
    setSettingsForm({
      gemini_api_key: '',
      gemini_model: s.gemini_model || 'gemini-1.5-flash',
      auto_update_prices: s.auto_update_prices || false,
    });
    setShowSettings(true);
  }

  async function saveSettings() {
    setLoading(true);
    const res = await fetch(`${API}/api/agent/settings`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) { setMsg('✓ Настройки сохранены'); setShowSettings(false); load(); }
    else setMsg('Ошибка: ' + data.error);
  }

  async function addToQueue(mode) {
    setLoading(true);
    const res = await fetch(`${API}/api/agent/queue`, {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) { setMsg(`✓ Добавлено ${data.added} блогеров в очередь`); load(); }
    else setMsg('Ошибка: ' + data.error);
    setTimeout(() => setMsg(''), 4000);
  }

  async function clearQueue() {
    if (!window.confirm('Очистить очередь?')) return;
    await fetch(`${API}/api/agent/queue`, { method: 'DELETE', headers: h });
    load();
  }

  const priorityColor = p => ({ high: '#ef4444', medium: '#f59e0b', low: '#10b981' }[p] || '#6b7280');
  const priorityLabel = p => ({ high: 'Высокий', medium: 'Средний', low: 'Низкий' }[p] || p);
  const statusColor = s => ({ pending: '#6b7280', processing: '#3b82f6', done: '#10b981', error: '#ef4444' }[s] || '#6b7280');

  return (
    <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Заголовок */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>🤖 AI Агент</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Автоматический анализ блогеров и оценка цен
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {user?.role === 'admin' && (
            <button onClick={loadSettings} style={btnStyle('#4b5563')}>⚙️ Настройки</button>
          )}
          <button onClick={load} style={btnStyle('#3b82f6')}>🔄 Обновить</button>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, marginBottom: 16, color: '#065f46' }}>
          {msg}
        </div>
      )}

      {/* Статус бар */}
      {status && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Статус', value: status.is_processing ? '🟢 Работает' : status.queue_length > 0 ? '🟡 Ожидание' : '⚪ Готов', bg: '#f0fdf4' },
            { label: 'В очереди', value: status.queue_length, bg: '#eff6ff' },
            { label: 'Обработано', value: status.processed_count, bg: '#f0fdf4' },
            { label: 'Ошибок', value: status.error_count, bg: status.error_count > 0 ? '#fef2f2' : '#f9fafb' },
          ].map(({ label, value, bg }) => (
            <div key={label} style={{ flex: '1 1 140px', padding: '12px 16px', background: bg, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
          {!status.has_api_key && (
            <div style={{ flex: '1 1 200px', padding: '12px 16px', background: '#fef3c7', borderRadius: 10, border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              ⚠️ Gemini API key не настроен
            </div>
          )}
        </div>
      )}

      {/* Таб меню */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {[['dashboard', '📊 Дашборд'], ['queue', '📋 Очередь'], ['analyzed', '✅ Результаты']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === key ? 700 : 400,
            color: activeTab === key ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: -2, fontSize: 14,
          }}>{label}</button>
        ))}
      </div>

      {/* Дашборд */}
      {activeTab === 'dashboard' && stats && (
        <div>
          {/* Статистика */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Всего блогеров', value: stats.total, color: '#3b82f6' },
              { label: 'Проанализировано', value: stats.analyzed, color: '#10b981' },
              { label: 'Не проанализировано', value: stats.not_analyzed, color: '#f59e0b' },
              { label: 'Средний балл', value: stats.avg_score || '—', color: '#8b5cf6' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Приоритеты */}
          {stats.analyzed > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>По приоритету</h3>
              <div style={{ display: 'flex', gap: 12 }}>
                {Object.entries(stats.by_priority).map(([p, count]) => (
                  <div key={p} style={{ flex: 1, padding: '12px 16px', background: '#fff', borderRadius: 10, border: `2px solid ${priorityColor(p)}` }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: priorityColor(p) }}>{count}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{priorityLabel(p)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Кнопки запуска */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Запустить анализ</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { mode: 'no_prices', label: '💰 Без цен', desc: 'Блогеры без заполненных цен' },
                { mode: 'not_analyzed', label: '🆕 Не анализированные', desc: 'Ещё не были обработаны' },
                { mode: 'all_new', label: '✨ Новые', desc: 'Со статусом "новый"' },
              ].map(({ mode, label, desc }) => (
                <button key={mode} onClick={() => addToQueue(mode)} disabled={loading || !status?.has_api_key}
                  style={{ ...btnStyle('#3b82f6'), flexDirection: 'column', height: 'auto', padding: '14px 20px', alignItems: 'flex-start', minWidth: 200, opacity: loading || !status?.has_api_key ? 0.5 : 1 }}>
                  <span style={{ fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{desc}</span>
                </button>
              ))}
            </div>
            {!status?.has_api_key && user?.role === 'admin' && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>
                ⚠️ Сначала добавьте Gemini API key в настройках
              </p>
            )}
          </div>
        </div>
      )}

      {/* Очередь */}
      {activeTab === 'queue' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>В очереди: {queue.length}</span>
            {queue.length > 0 && (
              <button onClick={clearQueue} style={btnStyle('#ef4444', 'sm')}>🗑 Очистить</button>
            )}
          </div>
          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📭</div>
              <div>Очередь пуста</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queue.map(task => (
                <div key={task.id} style={{ padding: '12px 16px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{task.blogger_name || task.blogger_id}</span>
                    {task.status === 'processing' && <span style={{ marginLeft: 8, fontSize: 13, color: '#3b82f6' }}>⚡ Обрабатывается...</span>}
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, background: `${statusColor(task.status)}20`, color: statusColor(task.status), fontWeight: 600 }}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Результаты */}
      {activeTab === 'analyzed' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['', 'high', 'medium', 'low'].map(p => (
              <button key={p} onClick={() => setPriorityFilter(p)} style={{
                padding: '6px 14px', borderRadius: 20, border: `1px solid ${p ? priorityColor(p) : '#e5e7eb'}`,
                background: priorityFilter === p ? (p ? priorityColor(p) : '#3b82f6') : '#fff',
                color: priorityFilter === p ? '#fff' : (p ? priorityColor(p) : '#374151'),
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
                {p ? priorityLabel(p) : 'Все'}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 14, alignSelf: 'center' }}>
              {analyzed.length} блогеров
            </span>
          </div>

          {analyzed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
              <div>Нет проанализированных блогеров</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Запустите анализ на вкладке Дашборд</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {analyzed.map(b => (
                <div key={b.id} style={{ padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{b.name}</span>
                      {b.instagram_url && (
                        <a href={b.instagram_url.startsWith('http') ? b.instagram_url : `https://instagram.com/${b.instagram_url}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ marginLeft: 10, color: '#e1306c', fontSize: 13 }}>@instagram</a>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {b.agent_priority && (
                        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, background: `${priorityColor(b.agent_priority)}20`, color: priorityColor(b.agent_priority), fontWeight: 700 }}>
                          {priorityLabel(b.agent_priority)}
                        </span>
                      )}
                      {b.agent_score && (
                        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 14, background: '#f3f4f6', fontWeight: 700 }}>
                          ⭐ {b.agent_score}/10
                        </span>
                      )}
                    </div>
                  </div>

                  {b.agent_recommendation && (
                    <p style={{ margin: '0 0 10px', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
                      💬 {b.agent_recommendation}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {/* Текущие цены */}
                    {(b.price_reels || b.price_tiktok || b.price_stories) && (
                      <div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Текущие цены</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {b.price_reels && <span style={priceTag('#dbeafe', '#1d4ed8')}>Reels {Number(b.price_reels).toLocaleString()}₸</span>}
                          {b.price_tiktok && <span style={priceTag('#dcfce7', '#166534')}>TikTok {Number(b.price_tiktok).toLocaleString()}₸</span>}
                          {b.price_stories && <span style={priceTag('#fef3c7', '#92400e')}>Stories {Number(b.price_stories).toLocaleString()}₸</span>}
                        </div>
                      </div>
                    )}

                    {/* Предложенные цены */}
                    {b.agent_suggested_prices && (
                      <div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>AI Оценка</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {b.agent_suggested_prices.price_reels && <span style={priceTag('#ede9fe', '#5b21b6')}>Reels ~{Number(b.agent_suggested_prices.price_reels).toLocaleString()}₸</span>}
                          {b.agent_suggested_prices.price_tiktok && <span style={priceTag('#fce7f3', '#9d174d')}>TikTok ~{Number(b.agent_suggested_prices.price_tiktok).toLocaleString()}₸</span>}
                          {b.agent_suggested_prices.price_stories && <span style={priceTag('#fff7ed', '#9a3412')}>Stories ~{Number(b.agent_suggested_prices.price_stories).toLocaleString()}₸</span>}
                        </div>
                      </div>
                    )}
                  </div>

                  {b.agent_reasoning && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                      {b.agent_reasoning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Модал настроек */}
      {showSettings && settings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 24px', fontSize: 20 }}>⚙️ Настройки агента</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Gemini API Key</label>
              <input type="password" placeholder={settings.gemini_api_key || 'Вставьте ключ из Google AI Studio'}
                value={settingsForm.gemini_api_key} onChange={e => setSettingsForm(f => ({ ...f, gemini_api_key: e.target.value }))}
                style={inputStyle} />
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Получить бесплатно: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Модель Gemini</label>
              <select value={settingsForm.gemini_model} onChange={e => setSettingsForm(f => ({ ...f, gemini_model: e.target.value }))} style={inputStyle}>
                <option value="gemini-1.5-flash">gemini-1.5-flash (быстрый, бесплатный)</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro (умнее)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash (новый)</option>
              </select>
            </div>

            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="auto_prices" checked={settingsForm.auto_update_prices}
                onChange={e => setSettingsForm(f => ({ ...f, auto_update_prices: e.target.checked }))} />
              <label htmlFor="auto_prices" style={{ fontSize: 14, cursor: 'pointer' }}>
                Автоматически вставлять цены если они не заполнены
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSettings(false)} style={btnStyle('#6b7280', 'sm')}>Отмена</button>
              <button onClick={saveSettings} disabled={loading} style={btnStyle('#3b82f6', 'sm')}>
                {loading ? 'Сохраняю...' : '✓ Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Стили
function btnStyle(color, size) {
  return {
    padding: size === 'sm' ? '8px 16px' : '10px 20px',
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: size === 'sm' ? 13 : 14,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
}

function priceTag(bg, color) {
  return {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: bg,
    color,
    whiteSpace: 'nowrap',
  };
}

const labelStyle = { display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
