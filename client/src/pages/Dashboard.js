import React, { useState } from 'react';
import BloggerList from './BloggerList';
import PaymentsPage from './PaymentsPage';
import ProductsPage from './ProductsPage';
import ExpensesPage from './ExpensesPage';
import RegulationsPage from './RegulationsPage';
import BarterPage from './BarterPage';
import TzRequestsPage from './TzRequestsPage';
import StatsPage from './StatsPage';
import UsersPage from './UsersPage';

const ICONS = {
  bloggers:'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.75',
  stats:'M3 3v18h18M7 15l4-4 3 3 5-6',
  payments:'M2 6h20v12H2zM2 10h20M6 15h4',
  products:'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  expenses:'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  regulations:'M9 4h6M9 2h6v4H9zM6 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-1M8 11h8M8 15h6',
  barter:'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z',
  tz:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  users:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};
function NavIcon({ id }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[id]||ICONS.tz} /></svg>;
}

export default function Dashboard({ user, onLogout }) {
  const [page, setPage] = useState('bloggers');
  const isOperator = user.role === 'operator';
  const navItems = isOperator ? [
    { id:'bloggers', icon:'👥', label:'Блогеры' },
    { id:'tz', icon:'📝', label:'Запросы ТЗ' },
  ] : [
    { id:'bloggers', icon:'👥', label:'Блогеры' },
    { id:'stats', icon:'📊', label:'Аналитика' },
    { id:'payments', icon:'💳', label:'Оплаты' },
    { id:'products', icon:'📦', label:'Товары и ТЗ' },
    { id:'expenses', icon:'💸', label:'Расходы' },
    { id:'regulations', icon:'📋', label:'Регламенты' },
    { id:'barter', icon:'🎁', label:'Бартер' },
    { id:'tz', icon:'📝', label:'Запросы ТЗ' },
    ...(user.role==='admin' ? [{ id:'users', icon:'⚙️', label:'Менеджеры' }] : []),
  ];
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">M</div>
          <div><h2>MIXIT <span>CRM</span></h2>
          <p>Работа с блогерами</p></div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}>
              <NavIcon id={item.id} /><span>{item.label}</span>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info"><div className="user-avatar">{String(user.username||'?').slice(0,1).toUpperCase()}</div><div><strong>{user.username}</strong>{user.role==='admin'?'Администратор':user.role==='operator'?'Оператор':'Менеджер'}</div></div>
          <button className="btn btn-secondary btn-sm" style={{width:'100%'}} onClick={onLogout}>Выйти</button>
        </div>
      </aside>
      <main className="main-content">
        {page==='bloggers' && <BloggerList currentUser={user} />}
        {page==='stats' && <StatsPage currentUser={user} />}
        {page==='payments' && <PaymentsPage currentUser={user} />}
        {page==='products' && <ProductsPage currentUser={user} />}
        {page==='expenses' && <ExpensesPage currentUser={user} />}
        {page==='regulations' && <RegulationsPage currentUser={user} />}
        {page==='barter' && <BarterPage currentUser={user} />}
        {page==='tz' && <TzRequestsPage currentUser={user} />}
        {page==='users' && <UsersPage currentUser={user} />}
      </main>
    </div>
  );
}
