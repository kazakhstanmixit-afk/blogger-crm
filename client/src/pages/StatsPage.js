import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const STATUS_LABELS = { new:'Новый', contacted:'Написали', replied:'Ответили', in_work:'В работе', declined:'Отказ (контент)', declined_bad:'Отказ (чёрный список)' };

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  useEffect(() => { apiFetch('/api/stats').then(r=>r.json()).then(setStats); }, []);
  if (!stats) return <div className="page"><div style={{color:'var(--text-muted)'}}>Загрузка...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Аналитика</div><div className="page-subtitle">Общая картина по базе</div></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{stats.total}</div><div className="stat-label">Всего блогеров</div></div>
        <div className="stat-card"><div className="stat-value stat-green">{stats.in_work}</div><div className="stat-label">В работе</div></div>
        <div className="stat-card"><div className="stat-value stat-purple">{stats.with_price}</div><div className="stat-label">С расценками</div></div>
        <div className="stat-card"><div className="stat-value stat-yellow">{stats.waiting}</div><div className="stat-label">Ждут ответа 3+ дн.</div></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:20}}>
        <div style={{background:'var(--surface-1)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
          <h3 style={{fontSize:13,fontWeight:500,marginBottom:12}}>По статусам</h3>
          {stats.by_status.map(s=>(
            <div key={s.status} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
              <span className={`status-badge status-${s.status}`}>{STATUS_LABELS[s.status]||s.status}</span>
              <strong>{s.c}</strong>
            </div>
          ))}
        </div>

        <div style={{background:'var(--surface-1)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
          <h3 style={{fontSize:13,fontWeight:500,marginBottom:12}}>По менеджерам (в работе)</h3>
          {stats.by_manager && stats.by_manager.length > 0 ? stats.by_manager.map(m=>(
            <div key={m.username} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'var(--bg-accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'var(--text-accent)'}}>
                  {m.username.slice(0,2).toUpperCase()}
                </div>
                <span style={{fontSize:13}}>{m.username}</span>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:16,fontWeight:600,color:'#22c55e'}}>{m.in_work}</div>
                <div style={{fontSize:10,color:'var(--text-muted)'}}>из {m.total}</div>
              </div>
            </div>
          )) : <p style={{color:'var(--text-muted)',fontSize:13}}>Нет назначенных блогеров</p>}
        </div>

        <div style={{background:'linear-gradient(135deg,var(--surface-1),#1a1560)',border:'1px solid #3730a3',borderRadius:10,padding:16}}>
          <h3 style={{fontSize:13,fontWeight:500,marginBottom:10}}>🤖 Лучший CPV</h3>
          {stats.best_cpv.length === 0 ? (
            <p style={{color:'var(--text-muted)',fontSize:13}}>Добавьте расценки</p>
          ) : stats.best_cpv.map((b,i)=>(
            <div key={b.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(255,255,255,.04)',borderRadius:5,padding:'6px 10px',marginBottom:4}}>
              <span style={{fontSize:12}}><span style={{color:'var(--text-muted)',fontSize:10,marginRight:4}}>#{i+1}</span>{b.name}</span>
              <span className="cpv-badge cpv-great">{b.best_cpv}₸</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
