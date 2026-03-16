import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import './Layout.css';

const NAV_ITEMS = [
  { path: '/', label: '资讯首页', icon: '◈' },
  { path: '/sources', label: '信源管理', icon: '⊞' },
  { path: '/resources', label: '资源库', icon: '◉' },
  { path: '/config', label: '系统配置', icon: '⚙' },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">◆</span>
          <span className="brand-name">MakeContents</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}>
            <span className="theme-icon">{theme === 'light' ? '☾' : '☀'}</span>
            <span>{theme === 'light' ? '深色模式' : '浅色模式'}</span>
          </button>
          <span className="sidebar-version">v2.0</span>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
