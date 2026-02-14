'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { SettingsIcon } from '../Icons';

export default function SettingsModal({
  isOpen,
  refreshMs,
  onClose,
  onSave,
  onExport,
  onImport,
}) {
  const [tempSeconds, setTempSeconds] = useState(Math.round(refreshMs / 1000));
  const [importMsg, setImportMsg] = useState('');
  const importFileRef = useRef(null);

  // Sync with external refreshMs when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSeconds(Math.round(refreshMs / 1000));
      setImportMsg('');
    }
  }, [isOpen, refreshMs]);

  const handleSave = () => {
    const ms = Math.max(10, Number(tempSeconds)) * 1000;
    onSave?.(ms);
  };

  const handleImport = async (e) => {
    setImportMsg('');
    try {
      await onImport?.(e);
      setImportMsg('导入成功');
    } catch (err) {
      setImportMsg(err.message || '导入失败');
    }
    // Reset file input
    if (importFileRef.current) {
      importFileRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
      >
        <div className="title" style={{ marginBottom: 12 }}>
          <SettingsIcon width="20" height="20" />
          <span>设置</span>
          <span className="muted">配置刷新频率</span>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>刷新频率</div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {[10, 30, 60, 120, 300].map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${tempSeconds === s ? 'active' : ''}`}
                onClick={() => setTempSeconds(s)}
                aria-pressed={tempSeconds === s}
              >
                {s} 秒
              </button>
            ))}
          </div>
          <input
            className="input"
            type="number"
            min="10"
            step="5"
            value={tempSeconds}
            onChange={(e) => setTempSeconds(Number(e.target.value))}
            placeholder="自定义秒数"
          />
          {tempSeconds < 10 && (
            <div className="error-text" style={{ marginTop: 8 }}>
              最小 10 秒
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>数据导出</div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="button" onClick={onExport}>导出配置</button>
          </div>
          <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem', marginTop: 26 }}>数据导入</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="button" onClick={() => importFileRef.current?.click?.()}>导入配置</button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          {importMsg && (
            <div className="muted" style={{ marginTop: 8 }}>
              {importMsg}
            </div>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="button" onClick={handleSave} disabled={tempSeconds < 10}>保存并关闭</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
