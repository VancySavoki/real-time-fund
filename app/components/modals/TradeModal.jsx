'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon } from '../Icons';
import { NumericInput, DatePicker } from '../Common';
import { formatDate, toTz, nowInTz } from '../../lib/date';
import { fetchSmartFundNetValue } from '../../api/fund';
import ConfirmModal from './ConfirmModal';

export default function TradeModal({ type, fund, holding, onClose, onConfirm, pendingTrades = [], onDeletePending }) {
  const isBuy = type === 'buy';
  const [share, setShare] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('0');
  const [date, setDate] = useState(() => {
    return formatDate();
  });
  const [isAfter3pm, setIsAfter3pm] = useState(nowInTz().hour() >= 15);
  const [calcShare, setCalcShare] = useState(null);

  const currentPendingTrades = useMemo(() => {
    return pendingTrades.filter(t => t.fundCode === fund?.code);
  }, [pendingTrades, fund]);

  const pendingSellShare = useMemo(() => {
      return currentPendingTrades
          .filter(t => t.type === 'sell')
          .reduce((acc, curr) => acc + (Number(curr.share) || 0), 0);
  }, [currentPendingTrades]);

  const availableShare = holding ? Math.max(0, holding.share - pendingSellShare) : 0;

  const [showPendingList, setShowPendingList] = useState(false);

  // Auto-close pending list if empty
  useEffect(() => {
      if (showPendingList && currentPendingTrades.length === 0) {
          setShowPendingList(false);
      }
  }, [showPendingList, currentPendingTrades]);

  const getEstimatePrice = () => fund?.estPricedCoverage > 0.05 ? fund?.estGsz : (typeof fund?.gsz === 'number' ? fund?.gsz : Number(fund?.dwjz));
  const [price, setPrice] = useState(getEstimatePrice());
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [actualDate, setActualDate] = useState(null);

  useEffect(() => {
    if (date && fund?.code) {
        setLoadingPrice(true);
        setActualDate(null);

        let queryDate = date;
        if (isAfter3pm) {
            queryDate = toTz(date).add(1, 'day').format('YYYY-MM-DD');
        }

        fetchSmartFundNetValue(fund.code, queryDate).then(result => {
            if (result) {
                setPrice(result.value);
                setActualDate(result.date);
            } else {
                setPrice(0);
                setActualDate(null);
            }
        }).finally(() => setLoadingPrice(false));
    }
  }, [date, isAfter3pm, isBuy, fund]);

  const [feeMode, setFeeMode] = useState('rate'); // 'rate' | 'amount'
  const [feeValue, setFeeValue] = useState('0'); // Stores either rate or amount depending on mode
  const [showConfirm, setShowConfirm] = useState(false);

  // Sell logic calculations
  const sellShare = parseFloat(share) || 0;
  const sellPrice = parseFloat(price) || 0;
  const sellAmount = sellShare * sellPrice;

  // Calculate fee and return based on mode
  let sellFee = 0;
  if (feeMode === 'rate') {
    const rate = parseFloat(feeValue) || 0;
    sellFee = sellAmount * (rate / 100);
  } else {
    sellFee = parseFloat(feeValue) || 0;
  }

  const estimatedReturn = sellAmount - sellFee;

  useEffect(() => {
    if (!isBuy) return;
    const a = parseFloat(amount);
    const f = parseFloat(feeRate);
    const p = parseFloat(price);
    if (a > 0 && !isNaN(f)) {
        if (p > 0) {
            const netAmount = a / (1 + f / 100);
            const s = netAmount / p;
            setCalcShare(s.toFixed(2));
        } else {
            setCalcShare('待确认');
        }
    } else {
      setCalcShare(null);
    }
  }, [isBuy, amount, feeRate, price]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBuy) {
      if (!amount || !feeRate || !date || calcShare === null) return;
      setShowConfirm(true);
    } else {
      if (!share || !date) return;
      setShowConfirm(true);
    }
  };

  const handleFinalConfirm = () => {
      if (isBuy) {
        onConfirm({ share: calcShare === '待确认' ? null : Number(calcShare), price: Number(price), totalCost: Number(amount), date, isAfter3pm, feeRate: Number(feeRate) });
        return;
      }
      onConfirm({ share: Number(share), price: Number(price), date: actualDate || date, isAfter3pm, feeMode, feeValue });
  };

  const isValid = isBuy
    ? (!!amount && !!feeRate && !!date && calcShare !== null)
    : (!!share && !!date);

  const handleSetShareFraction = (fraction) => {
      if(availableShare > 0) {
          setShare((availableShare * fraction).toFixed(2));
      }
  };

  const [revokeTrade, setRevokeTrade] = useState(null);

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isBuy ? "加仓" : "减仓"}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>{isBuy ? '📥' : '📤'}</span>
            <span>{showPendingList ? '待交易队列' : (showConfirm ? (isBuy ? '买入确认' : '卖出确认') : (isBuy ? '加仓' : '减仓'))}</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {!showPendingList && !showConfirm && currentPendingTrades.length > 0 && (
            <div
                style={{
                    marginBottom: 16,
                    background: 'rgba(230, 162, 60, 0.1)',
                    border: '1px solid rgba(230, 162, 60, 0.2)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#e6a23c',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                }}
                onClick={() => setShowPendingList(true)}
            >
                <span>⚠️ 当前有 {currentPendingTrades.length} 笔待处理交易</span>
                <span style={{ textDecoration: 'underline' }}>查看详情 &gt;</span>
            </div>
        )}

        {showPendingList ? (
            <div className="pending-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <div className="pending-list-header" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(6px)', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <button
                        className="button secondary"
                        onClick={() => setShowPendingList(false)}
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                        &lt; 返回
                    </button>
                </div>
                <div className="pending-list-items" style={{ paddingTop: 0 }}>
                    {currentPendingTrades.map((trade, idx) => (
                        <div key={trade.id || idx} style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, fontSize: '14px', color: trade.type === 'buy' ? 'var(--danger)' : 'var(--success)' }}>
                                    {trade.type === 'buy' ? '买入' : '卖出'}
                                </span>
                                <span className="muted" style={{ fontSize: '12px' }}>{trade.date} {trade.isAfter3pm ? '(15:00后)' : ''}</span>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px' }}>
                                <span className="muted">份额/金额</span>
                                <span>{trade.share ? `${trade.share} 份` : `¥${trade.amount}`}</span>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 4 }}>
                                <span className="muted">状态</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#e6a23c' }}>等待净值更新...</span>
                                    <button
                                        className="button secondary"
                                        onClick={() => setRevokeTrade(trade)}
                                        style={{
                                            padding: '2px 8px',
                                            fontSize: '10px',
                                            height: 'auto',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: 'var(--text)'
                                        }}
                                    >
                                        撤销
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ) : (
            <>
        {!showConfirm && (
        <div style={{ marginBottom: 16 }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
        </div>
        )}

        {showConfirm ? (
            isBuy ? (
            <div style={{ fontSize: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">基金名称</span>
                        <span style={{ fontWeight: 600 }}>{fund?.name}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">买入金额</span>
                        <span>¥{Number(amount).toFixed(2)}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">买入费率</span>
                        <span>{Number(feeRate).toFixed(2)}%</span>
                    </div>
                     <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">参考净值</span>
                        <span>{loadingPrice ? '查询中...' : (price ? `¥${Number(price).toFixed(4)}` : '待查询 (加入队列)')}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">预估份额</span>
                        <span>{calcShare === '待确认' ? '待确认' : `${Number(calcShare).toFixed(2)} 份`}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">买入日期</span>
                        <span>{date}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                        <span className="muted">交易时段</span>
                        <span>{isAfter3pm ? '15:00后' : '15:00前'}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '12px', textAlign: 'right', marginTop: 4 }}>
                        {loadingPrice ? '正在获取该日净值...' : `*基于${price === getEstimatePrice() ? '当前净值/估值' : '当日净值'}测算`}
                    </div>
                </div>

                {holding && calcShare !== '待确认' && (
                    <div style={{ marginBottom: 20 }}>
                        <div className="muted" style={{ marginBottom: 8, fontSize: '12px' }}>持仓变化预览</div>
                        <div className="row" style={{ gap: 12 }}>
                            <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有份额</div>
                                <div style={{ fontSize: '12px' }}>
                                    <span style={{ opacity: 0.7 }}>{holding.share.toFixed(2)}</span>
                                    <span style={{ margin: '0 4px' }}>→</span>
                                    <span style={{ fontWeight: 600 }}>{(holding.share + Number(calcShare)).toFixed(2)}</span>
                                </div>
                            </div>
                            {price ? (
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                    <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有市值 (估)</div>
                                    <div style={{ fontSize: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>¥{(holding.share * Number(price)).toFixed(2)}</span>
                                        <span style={{ margin: '0 4px' }}>→</span>
                                        <span style={{ fontWeight: 600 }}>¥{((holding.share + Number(calcShare)) * Number(price)).toFixed(2)}</span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className="row" style={{ gap: 12 }}>
                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => setShowConfirm(false)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                    >
                        返回修改
                    </button>
                    <button
                        type="button"
                        className="button"
                        onClick={handleFinalConfirm}
                        disabled={loadingPrice}
                        style={{ flex: 1, background: 'var(--primary)', opacity: loadingPrice ? 0.6 : 1, color: '#05263b' }}
                    >
                        {loadingPrice ? '请稍候' : (price ? '确认买入' : '加入待处理队列')}
                    </button>
                </div>
            </div>
            ) : (
            <div style={{ fontSize: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">基金名称</span>
                        <span style={{ fontWeight: 600 }}>{fund?.name}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">卖出份额</span>
                        <span>{sellShare.toFixed(2)} 份</span>
                    </div>
                     <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">预估卖出单价</span>
                        <span>{loadingPrice ? '查询中...' : (price ? `¥${sellPrice.toFixed(4)}` : '待查询 (加入队列)')}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">卖出费率/费用</span>
                        <span>{feeMode === 'rate' ? `${feeValue}%` : `¥${feeValue}`}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">预估手续费</span>
                        <span>{price ? `¥${sellFee.toFixed(2)}` : '待计算'}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">卖出日期</span>
                        <span>{date}</span>
                    </div>
                     <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                        <span className="muted">预计回款</span>
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{loadingPrice ? '计算中...' : (price ? `¥${estimatedReturn.toFixed(2)}` : '待计算')}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '12px', textAlign: 'right', marginTop: 4 }}>
                        {loadingPrice ? '正在获取该日净值...' : `*基于${price === getEstimatePrice() ? '当前净值/估值' : '当日净值'}测算`}
                    </div>
                </div>

                {holding && (
                    <div style={{ marginBottom: 20 }}>
                        <div className="muted" style={{ marginBottom: 8, fontSize: '12px' }}>持仓变化预览</div>
                        <div className="row" style={{ gap: 12 }}>
                            <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有份额</div>
                                <div style={{ fontSize: '12px' }}>
                                    <span style={{ opacity: 0.7 }}>{holding.share.toFixed(2)}</span>
                                    <span style={{ margin: '0 4px' }}>→</span>
                                    <span style={{ fontWeight: 600 }}>{(holding.share - sellShare).toFixed(2)}</span>
                                </div>
                            </div>
                            {price ? (
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                    <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有市值 (估)</div>
                                    <div style={{ fontSize: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>¥{(holding.share * sellPrice).toFixed(2)}</span>
                                        <span style={{ margin: '0 4px' }}>→</span>
                                        <span style={{ fontWeight: 600 }}>¥{((holding.share - sellShare) * sellPrice).toFixed(2)}</span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className="row" style={{ gap: 12 }}>
                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => setShowConfirm(false)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                    >
                        返回修改
                    </button>
                    <button
                        type="button"
                        className="button"
                        onClick={handleFinalConfirm}
                        disabled={loadingPrice}
                        style={{ flex: 1, background: 'var(--danger)', opacity: loadingPrice ? 0.6 : 1 }}
                    >
                        {loadingPrice ? '请稍候' : (price ? '确认卖出' : '加入待处理队列')}
                    </button>
                </div>
            </div>
            )
        ) : (
        <form onSubmit={handleSubmit}>
          {isBuy ? (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  加仓金额 (¥) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ border: !amount ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
                  <NumericInput
                    value={amount}
                    onChange={setAmount}
                    step={100}
                    min={0}
                    placeholder="请输入加仓金额"
                  />
                </div>
              </div>

              <div className="row" style={{ gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    买入费率 (%) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div style={{ border: !feeRate ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
                    <NumericInput
                      value={feeRate}
                      onChange={setFeeRate}
                      step={0.01}
                      min={0}
                      placeholder="0.12"
                    />
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8}}>
                    加仓日期 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <DatePicker value={date} onChange={setDate} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <div className="muted" style={{ display: 'block', marginBottom: 8}}>
                  交易时段
                </div>
                <div className="row" style={{ gap: 8, background: 'var(--primary)', borderRadius: '8px', padding: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(false)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: !isAfter3pm ? 'var(--text)' : 'transparent',
                      color: !isAfter3pm ? 'var(--bg)' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00前
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(true)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: isAfter3pm ? 'var(--text)' : 'transparent',
                      color: isAfter3pm ? 'var(--bg)' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00后
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: '12px' }}>
                {loadingPrice ? (
                    <span className="muted">正在查询净值数据...</span>
                ) : price === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="muted">参考净值: {Number(price).toFixed(4)}</span>
                    </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  卖出份额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ border: !share ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
                  <NumericInput
                    value={share}
                    onChange={setShare}
                    step={1}
                    min={0}
                    placeholder={holding ? `最多可卖 ${availableShare.toFixed(2)} 份` : "请输入卖出份额"}
                  />
                </div>
                {holding && holding.share > 0 && (
                   <div className="row" style={{ gap: 8, marginTop: 8 }}>
                       {[
                           { label: '1/4', value: 0.25 },
                           { label: '1/3', value: 1/3 },
                           { label: '1/2', value: 0.5 },
                           { label: '全部', value: 1 }
                       ].map((opt) => (
                           <button
                               key={opt.label}
                               type="button"
                               onClick={() => handleSetShareFraction(opt.value)}
                               style={{
                                   flex: 1,
                                   padding: '4px 8px',
                                   fontSize: '12px',
                                   background: 'var(--primary)',
                                   border: 'none',
                                   borderRadius: '4px',
                                   color: 'var(--text)',
                                   cursor: 'pointer'
                               }}
                           >
                               {opt.label}
                           </button>
                       ))}
                   </div>
                )}
                 {holding && (
                    <div className="muted" style={{ fontSize: '12px', marginTop: 6 }}>
                        当前持仓: {holding.share.toFixed(2)} 份 {pendingSellShare > 0 && <span style={{color: '#e6a23c', marginLeft: 8}}>冻结: {pendingSellShare.toFixed(2)} 份</span>}
                    </div>
                )}
              </div>

              <div className="row" style={{ gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label className="muted" style={{ fontSize: '14px' }}>
                      {feeMode === 'rate' ? '卖出费率 (%)' : '卖出费用 (¥)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                          setFeeMode(m => m === 'rate' ? 'amount' : 'rate');
                          setFeeValue('0');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      切换为{feeMode === 'rate' ? '金额' : '费率'}
                    </button>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
                    <NumericInput
                      value={feeValue}
                      onChange={setFeeValue}
                      step={feeMode === 'rate' ? 0.01 : 1}
                      min={0}
                      placeholder={feeMode === 'rate' ? "0.00" : "0.00"}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    卖出日期 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <DatePicker value={date} onChange={setDate} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  交易时段
                </label>
                <div className="row" style={{ gap: 8, background: 'var(--primary)', borderRadius: '8px', padding: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(false)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: !isAfter3pm ? 'var(--text)' : 'transparent',
                      color: !isAfter3pm ? 'var(--bg)' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00前
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(true)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: isAfter3pm ? 'var(--text)' : 'transparent',
                      color: isAfter3pm ? 'var(--bg)' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00后
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: '12px' }}>
                {loadingPrice ? (
                    <span className="muted">正在查询净值数据...</span>
                ) : price === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="muted">参考净值: {price.toFixed(4)}</span>
                    </div>
                )}
              </div>
            </>
          )}

          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
            <button
              type="submit"
              className="button"
              disabled={!isValid || loadingPrice}
              style={{ flex: 1, opacity: (!isValid || loadingPrice) ? 0.6 : 1 }}
            >
              确定
            </button>
          </div>
        </form>
      )}
              </>
            )}
      </motion.div>
      <AnimatePresence>
        {revokeTrade && (
          <ConfirmModal
            key="revoke-confirm"
            title="撤销交易"
            message={`确定要撤销这笔 ${revokeTrade.share ? `${revokeTrade.share}份` : `¥${revokeTrade.amount}`} 的${revokeTrade.type === 'buy' ? '买入' : '卖出'}申请吗？`}
            onConfirm={() => {
                onDeletePending?.(revokeTrade.id);
                setRevokeTrade(null);
            }}
            onCancel={() => setRevokeTrade(null)}
            confirmText="确认撤销"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
