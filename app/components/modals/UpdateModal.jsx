'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UpdateIcon } from '../Icons';
import { checkForUpdate } from '../../api/update';

export default function UpdateModal({
  enabled = false,
  checkInterval = 10 * 60 * 1000, // 10 minutes
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!enabled) return;

    const check = async () => {
      try {
        const result = await checkForUpdate();
        if (result.hasUpdate) {
          setContent(result.content);
          setIsOpen(true);
        }
      } catch (e) {
        console.error('Check update failed:', e);
      }
    };

    check();
    const interval = setInterval(check, checkInterval);
    return () => clearInterval(interval);
  }, [enabled, checkInterval]);

  const handleClose = () => setIsOpen(false);
  const handleConfirm = () => window.location.reload();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="更新提示"
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ zIndex: 10002 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="glass card modal"
          style={{ maxWidth: '400px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="title" style={{ marginBottom: 12 }}>
            <UpdateIcon width="20" height="20" style={{ color: 'var(--success)' }} />
            <span>更新提示</span>
          </div>
          <div style={{ marginBottom: 24 }}>
            <p className="muted" style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: 12 }}>
              检测到新版本，是否刷新浏览器以更新？
              <br />
              更新内容如下：
            </p>
            {content && (
              <div style={{
                background: 'rgba(0,0,0,0.2)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                lineHeight: '1.5',
                maxHeight: '200px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {content}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button
              className="button secondary"
              onClick={handleClose}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
            >
              取消
            </button>
            <button
              className="button"
              onClick={handleConfirm}
              style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none' }}
            >
              刷新浏览器
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
