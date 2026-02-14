'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshIcon, LoginIcon, LogoutIcon, SettingsIcon, UserIcon } from './Icons';

export default function Navbar({
  refreshing,
  refreshMs,
  fundsCount,
  isSyncing,
  user,
  userAvatar,
  onRefresh,
  onOpenSettings,
  onOpenLogin,
  onLogout,
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // 点击外部关闭用户菜单
  useEffect(() => {
    if (!userMenuOpen) return;

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleOpenSettings = () => {
    setUserMenuOpen(false);
    onOpenSettings?.();
  };

  const handleOpenLogin = () => {
    setUserMenuOpen(false);
    onOpenLogin?.();
  };

  const handleLogout = () => {
    setUserMenuOpen(false);
    onLogout?.();
  };

  return (
    <div className="navbar">
      {refreshing && <div className="loading-bar"></div>}
      <div className="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="2" />
          <path d="M5 14c2-4 7-6 14-5" stroke="var(--primary)" strokeWidth="2" />
        </svg>
        <span>基估宝</span>
        <AnimatePresence>
          {isSyncing && (
            <motion.div
              key="sync-icon"
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: 'auto', marginLeft: 8 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}
              title="正在同步到云端..."
            >
              <motion.svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" stroke="var(--primary)" />
                <path d="M12 12v9" stroke="var(--accent)" />
                <path d="m16 16-4-4-4 4" stroke="var(--accent)" />
              </motion.svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="actions">
        <div className="badge" title="当前刷新频率">
          <span>刷新</span>
          <strong>{Math.round(refreshMs / 1000)}秒</strong>
        </div>
        <button
          className="icon-button"
          aria-label="立即刷新"
          onClick={onRefresh}
          disabled={refreshing || fundsCount === 0}
          aria-busy={refreshing}
          title="立即刷新"
        >
          <RefreshIcon className={refreshing ? 'spin' : ''} width="18" height="18" />
        </button>
        {/* 用户菜单 */}
        <div className="user-menu-container" ref={userMenuRef}>
          <button
            className={`icon-button user-menu-trigger ${user ? 'logged-in' : ''}`}
            aria-label={user ? '用户菜单' : '登录'}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={user ? (user.email || '用户') : '用户菜单'}
          >
            {user ? (
              <div className="user-avatar-small">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt="用户头像"
                    style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                  />
                ) : (
                  (user.email?.charAt(0).toUpperCase() || 'U')
                )}
              </div>
            ) : (
              <UserIcon width="18" height="18" />
            )}
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                className="user-menu-dropdown glass"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{ transformOrigin: 'top right' }}
              >
                {user ? (
                  <>
                    <div className="user-menu-header">
                      <div className="user-avatar-large">
                        {userAvatar ? (
                          <img
                            src={userAvatar}
                            alt="用户头像"
                            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                          />
                        ) : (
                          (user.email?.charAt(0).toUpperCase() || 'U')
                        )}
                      </div>
                      <div className="user-info">
                        <span className="user-email">{user.email}</span>
                        <span className="user-status">已登录</span>
                      </div>
                    </div>
                    <div className="user-menu-divider" />
                    <button className="user-menu-item" onClick={handleOpenSettings}>
                      <SettingsIcon width="16" height="16" />
                      <span>设置</span>
                    </button>
                    <button className="user-menu-item danger" onClick={handleLogout}>
                      <LogoutIcon width="16" height="16" />
                      <span>登出</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="user-menu-item" onClick={handleOpenLogin}>
                      <LoginIcon width="16" height="16" />
                      <span>登录</span>
                    </button>
                    <button className="user-menu-item" onClick={handleOpenSettings}>
                      <SettingsIcon width="16" height="16" />
                      <span>设置</span>
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
