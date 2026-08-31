import React, { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#15803d' },
    error: { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
    info: { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8' },
  };
  const c = colors[type] || colors.success;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 500,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
      animation: 'slideIn 0.2s ease',
    }}>
      <span>{type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span style={{flex:1}}>{message}</span>
      <span onClick={onClose} style={{cursor:'pointer', opacity:0.5, fontSize:16}}>×</span>
    </div>
  );
}
