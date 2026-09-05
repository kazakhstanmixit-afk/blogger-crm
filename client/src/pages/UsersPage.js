import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

export default function UsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = () => apiFetch('/api/users').then(r => r.json()).then(setUsers);
  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const res = await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setSuccess(`Пользователь ${username} создан`);
    setUsername(''); setPassword('');
    fetchUsers();
  };

  const [changePwdId, setChangePwdId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdError, setPwdError] = useState('');

  const handleChangePassword = async (id) => {
    if (!newPassword) return setPwdError('Введите новый пароль');
    setPwdError(''); setPwdSuccess('');
    const res = await apiFetch(`/api/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) return setPwdError(data.error);
    setPwdSuccess('Пароль изменён!');
    setNewPassword('');
    setTimeout(() => { setChangePwdId(null); setPwdSuccess(''); }, 2000);
  };

  const handleDelete = async (id) => {
    if (id === currentUser.id) return alert('Нельзя удалить себя');
    if (!window.confirm('Удалить пользователя?')) return;
    await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Менеджеры</div>
          <div className="page-subtitle">Управление доступом</div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:24}}>
        <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20}}>
          <h3 style={{fontSize:15, marginBottom:16}}>Добавить пользователя</h3>
          <form onSubmit={handleAdd}>
            <div className="field"><label>Логин</label><input required value={username} onChange={e => setUsername(e.target.value)} /></div>
            <div className="field"><label>Пароль</label><input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div className="field">
              <label>Роль</label>
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="manager">Менеджер</option>
                <option value="admin">Администратор</option>
              </select>
            </div>
            {error && <div className="error-msg">{error}</div>}
            {success && <div className="success-msg">{success}</div>}
            <button className="btn btn-primary" style={{marginTop:8}}>Создать</button>
          </form>
        </div>

        <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20}}>
          <h3 style={{fontSize:15, marginBottom:16}}>Все пользователи</h3>
          {users.map(u => (
            <div key={u.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)'}}>
              <div>
                <strong>{u.username}</strong>
                <div style={{fontSize:12, color:'var(--text3)'}}>{u.role === 'admin' ? 'Администратор' : 'Менеджер'}</div>
              </div>
              <div style={{display:'flex',gap:6}}>
                {u.role === 'admin' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setChangePwdId(u.id); setNewPassword(''); setPwdError(''); setPwdSuccess(''); }}>🔑 Пароль</button>
                )}
                {u.id !== currentUser.id && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Удалить</button>
                )}
              </div>
              {changePwdId === u.id && (
                <div style={{marginTop:8,padding:'10px 12px',background:'#f8f9fb',borderRadius:8,border:'1px solid #e2e6ef'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}
                      placeholder="Новый пароль" style={{flex:1,padding:'5px 10px',fontSize:12,border:'1px solid #e2e6ef',borderRadius:6,outline:'none'}} />
                    <button className="btn btn-primary btn-sm" onClick={()=>handleChangePassword(u.id)}>Сохранить</button>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setChangePwdId(null)}>×</button>
                  </div>
                  {pwdError && <div style={{color:'#dc2626',fontSize:11,marginTop:4}}>{pwdError}</div>}
                  {pwdSuccess && <div style={{color:'#16a34a',fontSize:11,marginTop:4}}>{pwdSuccess}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
