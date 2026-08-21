import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch((process.env.REACT_APP_API_URL||'') + '/api/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Ошибка');
      onLogin(data.user, data.token);
    } catch { setError('Сервер недоступен'); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Blogger <span style={{color:'#4f6ef7'}}>CRM</span></h1>
        <p>Система управления блогерами</p>
        <form onSubmit={handleSubmit}>
          <div className="field"><label>Логин</label><input value={username} onChange={e=>setUsername(e.target.value)} autoFocus required /></div>
          <div className="field"><label>Пароль</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary" style={{width:'100%',marginTop:12}} disabled={loading}>{loading?'Входим...':'Войти'}</button>
        </form>
      </div>
    </div>
  );
}
