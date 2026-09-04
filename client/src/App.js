import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './App.css';

export const API = process.env.REACT_APP_API_URL || '';

export function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  return fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).then(res => {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return res;
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) return <div className="loading-screen">Загрузка...</div>;
  if (!user) return <Login onLogin={handleLogin} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}
