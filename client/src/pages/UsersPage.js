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
              {u.id !== currentUser.id && (
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Удалить</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
