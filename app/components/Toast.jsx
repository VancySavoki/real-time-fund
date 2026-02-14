'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ErrorIcon, CheckIcon } from './Icons';

export function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast.show && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            zIndex: 9999,
            padding: '10px 20px',
            background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.9)' :
                        toast.type === 'success' ? 'rgba(34, 197, 94, 0.9)' :
                        'rgba(30, 41, 59, 0.9)',
            color: '#fff',
            borderRadius: '8px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '14px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '90vw',
            whiteSpace: 'nowrap'
          }}
        >
          {toast.type === 'error' && <ErrorIcon width="16" height="16" />}
          {toast.type === 'success' && <CheckIcon width="16" height="16" />}
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
