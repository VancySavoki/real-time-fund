'use client';

import { useState } from 'react';
import { MailIcon } from '../Icons';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export default function LoginModal({
  isOpen,
  onClose,
  onLoginSuccess,
}) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleClose = () => {
    setEmail('');
    setOtp('');
    setError('');
    setSuccess('');
    onClose?.();
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isSupabaseConfigured) {
      setError('未配置 Supabase，无法登录');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true
        }
      });
      if (otpError) throw otpError;
      setSuccess('验证码已发送，请查收邮箱输入验证码完成注册/登录');
    } catch (err) {
      if (err.message?.includes('rate limit')) {
        setError('请求过于频繁，请稍后再试');
      } else if (err.message?.includes('network')) {
        setError('网络错误，请检查网络连接');
      } else {
        setError(err.message || '发送验证码失败，请稍后再试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');

    if (!isSupabaseConfigured) {
      setError('未配置 Supabase，无法登录');
      return;
    }
    if (!otp || otp.length < 4) {
      setError('请输入邮箱中的验证码');
      return;
    }

    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email'
      });
      if (verifyError) throw verifyError;
      if (data?.user) {
        onLoginSuccess?.(data.user);
        handleClose();
      }
    } catch (err) {
      if (err.message?.includes('Token has expired')) {
        setError('验证码已过期，请重新发送');
      } else if (err.message?.includes('invalid') || err.message?.includes('Invalid')) {
        setError('邮箱或验证码不正确');
      } else if (err.message?.includes('network')) {
        setError('网络错误，请检查网络连接后重试');
      } else {
        setError(err.message || '登录失败，请稍后再试');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
      onClick={handleClose}
    >
      <div className="glass card modal login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ marginBottom: 16 }}>
          <MailIcon width="20" height="20" />
          <span>邮箱登录</span>
          <span className="muted">使用邮箱验证登录</span>
        </div>

        <form onSubmit={handleSendOtp}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
              请输入邮箱，我们将发送验证码到您的邮箱
            </div>
            <input
              style={{ width: '100%' }}
              className="input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || !!success}
            />
          </div>

          {success && (
            <div className="login-message success" style={{ marginBottom: 12 }}>
              <span>{success}</span>
            </div>
          )}

          {success && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
                请输入邮箱验证码以完成注册/登录
              </div>
              <input
                className="input"
                type="text"
                placeholder="输入验证码"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                disabled={loading}
                maxLength={6}
              />
            </div>
          )}

          {error && (
            <div className="login-message error" style={{ marginBottom: 12 }}>
              <span>{error}</span>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="button secondary"
              onClick={handleClose}
              disabled={loading}
            >
              取消
            </button>
            <button
              className="button"
              type={success ? 'button' : 'submit'}
              onClick={success ? handleVerifyOtp : undefined}
              disabled={loading || (success && !otp)}
            >
              {loading ? '处理中...' : success ? '确认验证码' : '发送邮箱验证码'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
