import React, { useState } from 'react';
import { apiFetch } from '../App';

function cpvClass(v) { if(!v) return 'cpv-none'; if(v<=2) return 'cpv-great'; if(v<=5) return 'cpv-good'; return 'cpv-bad'; }

export default function BudgetModal({ onClose }) {
  const [budget, setBudget] = useState('');
  const [platform, setPlatform] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOptimize = async () => {
    if (!budget || Number(budget) <= 0) { setError('Введите бюджет'); return; }
    setError(''); setLoading(true);
    const res = await apiFetch('/api/budget-optimize', {
      method: 'POST',
      body: JSON.stringify({ budget: Number(budget), platform }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:560}}>
        <div className="modal-header">
          <div className="modal-title">💰 Подбор по бюджету</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:16}}>
          Система подберёт блогеров с лучшим CPV, которые влезают в бюджет. Финальный выбор — за вами (контент блогера учитывайте сами).
        </p>
        <div className="form-row">
          <div className="field">
            <label>Бюджет (₸)</label>
            <input type="number" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="500 000" />
          </div>
          <div className="field">
            <label>Платформа</label>
            <select value={platform} onChange={e=>setPlatform(e.target.value)}>
              <option value="">Любая (лучшая цена)</option>
              <option value="instagram">Только Instagram</option>
              <option value="tiktok">Только TikTok</option>
            </select>
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn btn-primary" onClick={handleOptimize} disabled={loading} style={{marginBottom:16}}>
          {loading ? 'Считаем...' : 'Подобрать блогеров'}
        </button>

        {result && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
              <div style={{background:'var(--surface-0)',borderRadius:8,padding:'10px 14px'}}>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Блогеров</div>
                <div style={{fontSize:20,fontWeight:600}}>{result.count}</div>
              </div>
              <div style={{background:'var(--surface-0)',borderRadius:8,padding:'10px 14px'}}>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Потратим</div>
                <div style={{fontSize:20,fontWeight:600}}>{result.spent.toLocaleString('ru')} ₸</div>
              </div>
              <div style={{background:'var(--surface-0)',borderRadius:8,padding:'10px 14px'}}>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Суммарный охват</div>
                <div style={{fontSize:20,fontWeight:600}}>{result.total_reach.toLocaleString('ru')}</div>
              </div>
            </div>
            {result.count === 0 ? (
              <p style={{color:'var(--text-muted)',fontSize:13}}>Нет блогеров с расценками под этот бюджет. Добавьте расценки или увеличьте бюджет.</p>
            ) : (
              <div style={{maxHeight:280,overflowY:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      {['Блогер','Цена','CPV','Охват'].map(h=>(
                        <th key={h} style={{textAlign:'left',padding:'6px 8px',fontSize:10,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.selected.map(b=>(
                      <tr key={b.id} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'7px 8px',fontSize:12,fontWeight:500}}>{b.name}</td>
                        <td style={{padding:'7px 8px',fontSize:12,color:'var(--text-secondary)'}}>{(b._price||0).toLocaleString('ru')} ₸</td>
                        <td style={{padding:'7px 8px'}}><span className={`cpv-badge ${cpvClass(b._cpv)}`}>{b._cpv} ₸/тыс</span></td>
                        <td style={{padding:'7px 8px',fontSize:12,color:'var(--text-muted)'}}>{(b._reach||0).toLocaleString('ru')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
