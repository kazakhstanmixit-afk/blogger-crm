import React, { useState } from 'react';
import { apiFetch } from '../App';

export default function PaymentModal({ blogger, onClose, onSave }) {
  const [form, setForm] = useState({
    recipient_name: '',
    iin: '',
    payment_name: '',
    amount: '',
    kaspi: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.recipient_name.trim()) { setError('Укажите ФИО получателя'); return; }
    if (!/^\d{12}$/.test(form.iin)) { setError('ИИН должен содержать ровно 12 цифр'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Укажите сумму'); return; }

    setSaving(true);
    try {
      const body = {
        blogger_id: blogger.id,
        recipient_name: form.recipient_name.trim(),
        iin: form.iin,
        payment_name: form.payment_name.trim() || form.recipient_name.trim(),
        amount: Number(form.amount),
        kaspi: form.kaspi || null,
        notes: form.notes || null,
      };

      const res = await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Ошибка при подаче заявки');
        setSaving(false);
        return;
      }

      onSave('Заявка подана! Статус блогера изменён на «К оплате»');
    } catch (err) {
      setError('Ошибка соединения с сервером');
      setSaving(false);
    }
  };

  const iinLen = form.iin.length;
  const iinValid = /^\d{12}$/.test(form.iin);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">💳 Подать на оплату</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ background: '#f8f9fb', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#5a6380' }}>
          <strong style={{ color: '#1a1d2e' }}>{blogger.name}</strong>
          {blogger.instagram_url && <> · <a href={blogger.instagram_url} target="_blank" rel="noreferrer" style={{ color: '#4f6ef7' }}>Instagram</a></>}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>ФИО получателя *</label>
            <input
              value={form.recipient_name}
              onChange={e => set('recipient_name', e.target.value)}
              placeholder="Иванов Иван Иванович"
              required
            />
          </div>

          <div className="field">
            <label>
              ИИН *
              <span style={{ marginLeft: 8, fontSize: 10, color: iinLen === 0 ? '#9ba3be' : iinValid ? '#16a34a' : '#dc2626' }}>
                {iinLen}/12 {iinValid ? '✓' : ''}
              </span>
            </label>
            <input
              value={form.iin}
              onChange={e => set('iin', e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="123456789012"
              style={{
                letterSpacing: 2,
                fontFamily: 'monospace',
                borderColor: iinLen === 12 ? (iinValid ? '#16a34a' : '#dc2626') : undefined
              }}
            />
            {iinLen === 12 && !iinValid && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>Некорректный ИИН</div>
            )}
          </div>

          <div className="field">
            <label>ФИО при пополнении (для банка)</label>
            <input
              value={form.payment_name}
              onChange={e => set('payment_name', e.target.value)}
              placeholder="Как в приложении банка (если отличается)"
            />
          </div>

          <div className="field">
            <label>Сумма (₸) *</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="50000"
              required
            />
            {(blogger.price_reels || blogger.price_tiktok || blogger.price_both) && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {blogger.price_reels && (
                  <span onClick={() => set('amount', blogger.price_reels)}
                    style={{ cursor: 'pointer', fontSize: 11, padding: '2px 7px', background: '#eef1fe', color: '#4f6ef7', borderRadius: 4 }}>
                    Рилс: {Number(blogger.price_reels).toLocaleString('ru')} ₸
                  </span>
                )}
                {blogger.price_tiktok && (
                  <span onClick={() => set('amount', blogger.price_tiktok)}
                    style={{ cursor: 'pointer', fontSize: 11, padding: '2px 7px', background: '#eef1fe', color: '#4f6ef7', borderRadius: 4 }}>
                    ТТ: {Number(blogger.price_tiktok).toLocaleString('ru')} ₸
                  </span>
                )}
                {blogger.price_both && (
                  <span onClick={() => set('amount', blogger.price_both)}
                    style={{ cursor: 'pointer', fontSize: 11, padding: '2px 7px', background: '#eef1fe', color: '#4f6ef7', borderRadius: 4 }}>
                    Рилс+ТТ: {Number(blogger.price_both).toLocaleString('ru')} ₸
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="field">
            <label>Номер Каспи <span style={{ color: '#9ba3be', fontSize: 10 }}>(необязательно)</span></label>
            <input
              value={form.kaspi}
              onChange={e => set('kaspi', e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="77001234567"
            />
          </div>

          <div className="field">
            <label>Заметки <span style={{ color: '#9ba3be', fontSize: 10 }}>(необязательно)</span></label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Дополнительная информация..."
            />
          </div>

          {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving || (iinLen === 12 && !iinValid)}>
              {saving ? 'Отправляем...' : 'Подать заявку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
