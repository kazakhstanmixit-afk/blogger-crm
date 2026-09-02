import React, { useState } from 'react';
import BloggerList from './BloggerList';
import PaymentsPage from './PaymentsPage';
import ProductsPage from './ProductsPage';
import StatsPage from './StatsPage';
import UsersPage from './UsersPage';

export default function Dashboard({ user, onLogout }) {
  const [page, setPage] = useState('bloggers');
  const navItems = [
    { id:'bloggers', icon:'👥', label:'Блогеры' },
    { id:'stats', icon:'📊', label:'Аналитика' },
    { id:'payments', icon:'💳', label:'Оплаты' },
    { id:'products', icon:'📦', label:'Товары и ТЗ' },
    ...(user.role==='admin' ? [{ id:'users', icon:'⚙️', label:'Менеджеры' }] : []),
  ];
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>Blogger <span>CRM</span></h2>
          <p>Управление блогерами</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}>
              <span>{item.icon}</span>{item.label}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info"><strong>{user.username}</strong>{user.role==='admin'?'Администратор':'Менеджер'}</div>
          <button className="btn btn-secondary btn-sm" style={{width:'100%'}} onClick={onLogout}>Выйти</button>
        </div>
      </aside>
      <main className="main-content">
        {page==='bloggers' && <BloggerList currentUser={user} />}
        {page==='stats' && <StatsPage currentUser={user} />}
        {page==='payments' && <PaymentsPage currentUser={user} />}
        {page==='products' && <ProductsPage currentUser={user} />}
        {page==='users' && <UsersPage currentUser={user} />}
      </main>
    </div>
  );
}
