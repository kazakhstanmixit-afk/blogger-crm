import React, { useState, useRef } from 'react';

export default function ImportModal({ onClose }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef();

  const handleFile = f => { setFile(f); setResult(null); setError(''); };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch((process.env.REACT_APP_API_URL||'') + '/api/bloggers/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch(e) {
      setError(e.message || 'Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:480}}>
        <div className="modal-header">
          <div className="modal-title">Импорт блогеров</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:16}}>
          Поддерживаются <strong>.csv</strong> и <strong>.xlsx</strong>.<br/>
          Если в файле есть колонка <strong>ID</strong> — блогеры будут <strong>обновлены</strong>, иначе — добавлены новые.
        </p>
        <div className={`import-zone ${dragging?'drag':''}`}
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
          onClick={()=>inputRef.current.click()}>
          <div style={{fontSize:36}}>📂</div>
          <p>{file?`✅ ${file.name}`:'Перетащите файл или кликните'}</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])} />
        </div>

        {result && (
          <div style={{background:'var(--surface-1)',borderRadius:8,padding:'12px 16px',marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:24,fontWeight:700,color:'#22c55e'}}>{result.added}</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>Добавлено новых</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:24,fontWeight:700,color:'#a78bfa'}}>{result.updated}</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>Обновлено по ID</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:24,fontWeight:700,color:'#f59e0b'}}>{result.skipped || 0}</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>Дублей пропущено</div>
            </div>
          </div>
        )}

        {error && <div className="error-msg" style={{marginTop:12}}>{error}</div>}

        <div style={{display:'flex',gap:10,marginTop:16,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>{result?'Закрыть':'Отмена'}</button>
          {!result && <button className="btn btn-primary" onClick={handleImport} disabled={!file||loading}>{loading?'Загружаем...':'Загрузить'}</button>}
        </div>
      </div>
    </div>
  );
}
