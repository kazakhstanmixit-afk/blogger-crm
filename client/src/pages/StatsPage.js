import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const PERIODS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'custom', label: 'Свой период' },
];

const STATUS_LABELS = { new:'Новый', contacted:'Написали', replied:'Ответили', in_work:'В работе', transferred:'Передано в работу', declined:'Отказ (контент)', declined_bad:'Отказ (чёрный список)', declined_reach:'Отказ (низкие просмотры)', declined_shop:'Отказ (магазин)', payment_pending:'К оплате', paid:'Оплачено' };

function StatCard({ value, label, color = '#1a1d2e', bg = '#f8f9fb' }) {
  return (
    <div style={{ background: bg, border: '1px solid #e2e6ef', borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#9ba3be', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function ManagerRow({ m }) {
  return (
    <tr style={{ borderBottom: '1px solid #e2e6ef' }}>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef1fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#4f6ef7' }}>
            {m.username.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{m.username}</span>
        </div>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <span style={{ display: 'inline-block', padding: '3px 10px', background: '#eef1fe', color: '#4f6ef7', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
          {m.assigned_transferred}
        </span>
        <div style={{ fontSize: 10, color: '#9ba3be', marginTop: 2 }}>всего: {m.assigned_total}</div>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{m.contacted}</span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#6d28d9' }}>{m.replied}</span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{m.declined}</span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>{m.category_changed}</span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#15803d' }}>{m.payment_submitted}</span>
      </td>
    </tr>
  );
}

export default function StatsPage({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [bloggerStats, setBloggerStats] = useState(null);

  const fetchDashboard = async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set('period', period);
    if (period === 'custom' && dateFrom && dateTo) {
      p.set('date_from', dateFrom);
      p.set('date_to', dateTo);
    }
    const res = await apiFetch('/api/dashboard?' + p);
    setData(await res.json());
    setLoading(false);
  };

  const fetchBloggerStats = async () => {
    const res = await apiFetch('/api/stats');
    setBloggerStats(await res.json());
  };

  useEffect(() => { fetchDashboard(); }, [period, dateFrom, dateTo]);
  useEffect(() => { fetchBloggerStats(); }, []);

  const today = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Дашборд</div>
          <div className="page-subtitle">{today}</div>
        </div>
      </div>

      {/* Общая статистика базы */}
      {bloggerStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard value={bloggerStats.total} label="Всего блогеров" />
          <StatCard value={bloggerStats.in_work} label="В работе" color="#15803d" bg="#f0fdf4" />
          <StatCard value={bloggerStats.with_price} label="С расценками" color="#6d28d9" bg="#f5f3ff" />
          <StatCard value={bloggerStats.waiting} label="Ждут ответа 3+ дн." color="#d97706" bg="#fffbeb" />
          <StatCard value={bloggerStats.total - bloggerStats.with_price} label="Без расценок" color="#9ba3be" />
        </div>
      )}

      {/* Фильтр периода */}
      <div style={{ background: '#fff', border: '1px solid #e2e6ef', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#5a6380', marginRight: 4 }}>Период:</span>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className="btn btn-sm"
              style={{ background: period === p.value ? '#4f6ef7' : '#f8f9fb', color: period === p.value ? '#fff' : '#5a6380', border: '1px solid', borderColor: period === p.value ? '#4f6ef7' : '#e2e6ef' }}>
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ padding: '5px 10px', border: '1px solid #e2e6ef', borderRadius: 7, fontSize: 12 }} />
              <span style={{ color: '#9ba3be' }}>—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ padding: '5px 10px', border: '1px solid #e2e6ef', borderRadius: 7, fontSize: 12 }} />
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={fetchDashboard}>Обновить</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Загрузка...</div>
      ) : data && (
        <>
          {/* Итого за период */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard value={data.totals.contacted} label="Написали" color="#f59e0b" bg="#fffbeb" />
            <StatCard value={data.totals.replied} label="Ответили" color="#6d28d9" bg="#f5f3ff" />
            <StatCard value={data.totals.declined} label="Отказов" color="#dc2626" bg="#fef2f2" />
            <StatCard value={data.totals.category_changed} label="Отсмотрено (категория)" color="#059669" bg="#f0fdf4" />
            <StatCard value={data.totals.payment_submitted} label="Подано на оплату" color="#15803d" bg="#f0fdf4" />
          </div>

          {/* Таблица по менеджерам */}
          <div style={{ background: '#fff', border: '1px solid #e2e6ef', borderRadius: 10, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e6ef' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>По менеджерам</div>
            </div>
            {data.managers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>
                Нет активности за выбранный период
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fb' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ba3be', textTransform: 'uppercase', letterSpacing: '.06em' }}>Менеджер</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ba3be', textTransform: 'uppercase' }}>Передано в работу</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase' }}>Написали</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6d28d9', textTransform: 'uppercase' }}>Ответили</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase' }}>Отказов</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#059669', textTransform: 'uppercase' }}>Отсмотрено</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#15803d', textTransform: 'uppercase' }}>На оплату</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.managers.map(m => <ManagerRow key={m.id} m={m} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* По дням */}
          {data.daily.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #e2e6ef', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e6ef' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>По дням</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fb' }}>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, color: '#9ba3be', textTransform: 'uppercase' }}>Дата</th>
                      <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: '#f59e0b', textTransform: 'uppercase' }}>Написали</th>
                      <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: '#6d28d9', textTransform: 'uppercase' }}>Ответили</th>
                      <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: '#dc2626', textTransform: 'uppercase' }}>Отказов</th>
                      <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: '#059669', textTransform: 'uppercase' }}>Отсмотрено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map(d => (
                      <tr key={d.date} style={{ borderBottom: '1px solid #f0f2f7' }}>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: '#5a6380' }}>{new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: d.contacted > 0 ? 600 : 400, color: d.contacted > 0 ? '#f59e0b' : '#9ba3be' }}>{d.contacted || '—'}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: d.replied > 0 ? 600 : 400, color: d.replied > 0 ? '#6d28d9' : '#9ba3be' }}>{d.replied || '—'}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: d.declined > 0 ? 600 : 400, color: d.declined > 0 ? '#dc2626' : '#9ba3be' }}>{d.declined || '—'}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: d.category_changed > 0 ? 600 : 400, color: d.category_changed > 0 ? '#059669' : '#9ba3be' }}>{d.category_changed || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
