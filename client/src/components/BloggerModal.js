import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';
import PaymentModal from './PaymentModal';

const STATUS_OPTIONS = [
  { value:'new', label:'Новый' },
  { value:'contacted', label:'Написали' },
  { value:'replied', label:'Ответили' },
  { value:'transferred', label:'Передано в работу' },
  { value:'in_work', label:'В работе' },
  { value:'declined', label:'Отказ (контент)' },
  { value:'declined_bad', label:'Отказ (чёрный список)' },
  { value:'declined_reach', label:'Отказ (низкие просмотры)' },
  { value:'declined_shop', label:'Отказ (магазин)' },
  { value:'payment_pending', label:'К оплате' },
  { value:'payment_submitted', label:'Оплата подана' },
  { value:'paid', label:'Оплачено' },
];

function cpv(price, reach) {
  if (!price || !reach) return null;
  return parseFloat((price / reach).toFixed(2));
}
function cpvColor(v) { if(!v) return 'var(--text-muted)'; if(v<=10) return '#15803d'; if(v<=30) return '#6d28d9'; return '#b91c1c'; }

export default function BloggerModal({ blogger, users, currentUser, onSave, onClose }) {
  const isEdit = !!blogger;
  const [form, setForm] = useState({
    name:'', instagram_url:'', tiktok_url:'',
    instagram_followers:'', tiktok_followers:'',
    instagram_avg_reach:'', tiktok_avg_reach:'',
    price_reels:'', price_tiktok:'', price_both:'', price_stories:'',
    status:'new', decline_reason:'', assigned_manager_id:'', in_work:false, notes:'', last_comment:'',
    ...(blogger||{}),
  });
  const [activity, setActivity] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (isEdit) apiFetch(`/api/bloggers/${blogger.id}/activity`).then(r=>r.json()).then(setActivity);
  }, [isEdit, blogger?.id]);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const n = k => Number(form[k])||0;

  const cpvReels = cpv(form.price_reels, form.instagram_avg_reach);
  const cpvTT = cpv(form.price_tiktok, form.tiktok_avg_reach);
  const cpvBoth = cpv(form.price_both, n('instagram_avg_reach')+n('tiktok_avg_reach'));
  const cpvStories = cpv(form.price_stories, form.instagram_avg_reach);

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    await onSave({...form,
      instagram_followers: Number(form.instagram_followers)||0,
      tiktok_followers: Number(form.tiktok_followers)||0,
      instagram_avg_reach: Number(form.instagram_avg_reach)||0,
      tiktok_avg_reach: Number(form.tiktok_avg_reach)||0,
      price_reels: form.price_reels ? Number(form.price_reels) : null,
      price_tiktok: form.price_tiktok ? Number(form.price_tiktok) : null,
      price_both: form.price_both ? Number(form.price_both) : null,
      price_stories: form.price_stories ? Number(form.price_stories) : null,
      assigned_manager_id: form.assigned_manager_id || null,
    });
    setSaving(false);
  };

  return (
    <>
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isEdit?'Редактировать блогера':'Добавить блогера'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="section-divider">Основное</div>
          <div className="form-row" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
            <div className="field"><label>Ник *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} placeholder="@blogger_name" /></div>
            <div className="field"><label>Ссылка Instagram</label><input value={form.instagram_url||''} onChange={e=>set('instagram_url',e.target.value)} placeholder="https://instagram.com/..." /></div>
            <div className="field"><label>Ссылка TikTok</label><input value={form.tiktok_url||''} onChange={e=>set('tiktok_url',e.target.value)} placeholder="https://tiktok.com/@..." /></div>
          </div>

          <div className="section-divider">Аудитория</div>
          <div className="form-row-4">
            <div className="field"><label>Подп. Инст</label><input type="number" value={form.instagram_followers||''} onChange={e=>set('instagram_followers',e.target.value)} /></div>
            <div className="field"><label>Охват Инст</label><input type="number" value={form.instagram_avg_reach||''} onChange={e=>set('instagram_avg_reach',e.target.value)} /></div>
            <div className="field"><label>Подп. ТТ</label><input type="number" value={form.tiktok_followers||''} onChange={e=>set('tiktok_followers',e.target.value)} /></div>
            <div className="field"><label>Охват ТТ</label><input type="number" value={form.tiktok_avg_reach||''} onChange={e=>set('tiktok_avg_reach',e.target.value)} /></div>
          </div>

          <div className="section-divider">Расценки (₸)</div>
          <div className="form-row-4">
            <div className="field"><label>Рилс</label><input type="number" value={form.price_reels||''} onChange={e=>set('price_reels',e.target.value)} /></div>
            <div className="field"><label>TikTok</label><input type="number" value={form.price_tiktok||''} onChange={e=>set('price_tiktok',e.target.value)} /></div>
            <div className="field"><label>Рилс+ТТ</label><input type="number" value={form.price_both||''} onChange={e=>set('price_both',e.target.value)} /></div>
            <div className="field"><label>Сторис</label><input type="number" value={form.price_stories||''} onChange={e=>set('price_stories',e.target.value)} /></div>
          </div>

          {(cpvReels||cpvTT||cpvBoth||cpvStories) && (
            <div className="cpv-preview">
              <div className="cpv-preview-title">CPV (₸ за просмотр)</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                {[['Рилс',cpvReels],['TikTok',cpvTT],['Рилс+ТТ',cpvBoth],['Сторис',cpvStories]].map(([label,val])=>val?(
                  <div key={label} style={{textAlign:'center',padding:'8px',background:'#fff',borderRadius:6,border:'1px solid #e2e6ef'}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:3}}>{label}</div>
                    <div style={{fontSize:15,fontWeight:600,color:cpvColor(val)}}>{val} ₸</div>
                  </div>
                ):null)}
              </div>
              <div style={{fontSize:10,color:'var(--text-muted)',marginTop:8}}>До 10 ₸ — отлично · 10–30 ₸ — нормально · выше 30 ₸ — дорого</div>
            </div>
          )}

          <div className="section-divider">Работа</div>
          <div className="form-row">
            <div className="field">
              <label>Статус</label>
              <select value={form.status} onChange={e=>set('status',e.target.value)}>
                {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Менеджер</label>
              <select value={form.assigned_manager_id||''} onChange={e=>set('assigned_manager_id',e.target.value)}>
                <option value="">— Не назначен —</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Последний комментарий</label>
            <input value={form.last_comment||''} onChange={e=>set('last_comment',e.target.value)} placeholder="Кратко о статусе переговоров..." />
          </div>
          <div className="field">
            <label>Заметки</label>
            <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Дополнительная информация..." />
          </div>

          {isEdit && activity.length > 0 && (
            <>
              <div className="section-divider">История</div>
              <div className="activity-list">
                {activity.slice(0,6).map(a=>(
                  <div key={a.id} className="activity-item">
                    <div className="activity-action">{a.details}</div>
                    <div className="activity-meta">{a.username} · {new Date(a.created_at).toLocaleString('ru')}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{display:'flex',gap:8,marginTop:20,justifyContent:'space-between',alignItems:'center'}}>
            <div>
              {isEdit && (
                <button type="button" className="btn btn-sm" style={{background:'#fef3c7',color:'#92400e',border:'1px solid #fde68a'}} onClick={()=>setShowPayment(true)}>💳 Подать на оплату</button>
              )}
            </div>
            <div style={{display:'flex',gap:8}}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Сохраняем...':isEdit?'Сохранить':'Добавить'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
      {showPayment && blogger && (
        <PaymentModal blogger={blogger} onClose={()=>setShowPayment(false)} onSave={()=>setShowPayment(false)} />
      )}
    </>
  );
}
