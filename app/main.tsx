'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createAvatar } from '@dicebear/core';
import { glass } from '@dicebear/collection';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Announcement, Stat, GroupSummary, Toast, Navbar } from "./components";
import { ChevronIcon, ExitIcon, GridIcon, ListIcon, PlusIcon, SettingsIcon, SortIcon, StarIcon, TrashIcon } from "./components/Icons";
import {
  useDefaultTool,
  useFrontendTool,
} from "@copilotkit/react-core";
import {
  HoldingActionModal,
  TradeModal,
  HoldingEditModal,
  AddResultModal,
  SuccessModal,
  CloudConfigModal,
  ConfirmModal,
  GroupManageModal,
  AddFundToGroupModal,
  GroupModal,
  LoginModal,
  UpdateModal,
  SettingsModal
} from "./components/modals";
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { fetchFundData, fetchShanghaiIndexDate, fetchSmartFundNetValue, searchFunds } from './api/fund';
import {
  getFundCodesSignature,
  dedupeByCode} from './lib/configUtils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const TZ = 'Asia/Shanghai';
const nowInTz = () => dayjs().tz(TZ);
const toTz = (input) => (input ? dayjs.tz(input, TZ) : nowInTz());
const formatDate = (input) => toTz(input).format("YYYY-MM-DD");

export default function HomePage() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const refreshingRef = useRef(false);
  const isLoggingOutRef = useRef(false);

  // 刷新频率状态
  const [refreshMs, setRefreshMs] = useState(300000);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSeconds, setTempSeconds] = useState(30);

  // 全局刷新状态
  const [refreshing, setRefreshing] = useState(false);

  // 收起/展开状态
  const [collapsedCodes, setCollapsedCodes] = useState(new Set());

  // 自选状态
  const [favorites, setFavorites] = useState(new Set());
  const [groups, setGroups] = useState([]); // [{ id, name, codes: [] }]
  const [currentTab, setCurrentTab] = useState('all');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [addFundToGroupOpen, setAddFundToGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  // 排序状态
  const [sortBy, setSortBy] = useState('default'); // default, name, yield, holding
  const [sortOrder, setSortOrder] = useState('desc'); // asc | desc

  // 视图模式
  const [viewMode, setViewMode] = useState('card'); // card, list

  // 用户认证状态
  const [user, setUser] = useState(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const userAvatar = useMemo(() => {
    if (!user?.id) return '';
    return createAvatar(glass, {
      seed: user.id,
      size: 80
    }).toDataUri();
  }, [user?.id]);

  // 搜索相关状态
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFunds, setSelectedFunds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);
  const dropdownRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [addResultOpen, setAddResultOpen] = useState(false);
  const [addFailures, setAddFailures] = useState([]);
  const [holdingModal, setHoldingModal] = useState({ open: false, fund: null });
  const [actionModal, setActionModal] = useState({ open: false, fund: null });
  const [tradeModal, setTradeModal] = useState({ open: false, fund: null, type: 'buy' }); // type: 'buy' | 'sell'
  const [clearConfirm, setClearConfirm] = useState(null); // { fund }
  const [holdings, setHoldings] = useState({}); // { [code]: { share: number, cost: number } }
  const [pendingTrades, setPendingTrades] = useState([]); // [{ id, fundCode, share, date, ... }]
  const [percentModes, setPercentModes] = useState({}); // { [code]: boolean }

  const holdingsRef = useRef(holdings);
  const pendingTradesRef = useRef(pendingTrades);

  useEffect(() => {
    holdingsRef.current = holdings;
    pendingTradesRef.current = pendingTrades;
  }, [holdings, pendingTrades]);

  const [isTradingDay, setIsTradingDay] = useState(true); // 默认为交易日，通过接口校正
  const tabsRef = useRef(null);
  const [fundDeleteConfirm, setFundDeleteConfirm] = useState(null); // { code, name }

  const todayStr = formatDate();

  const [isMobile, setIsMobile] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => setIsMobile(window.innerWidth <= 640);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);


  // 存储当前被划开的基金代码
  const [swipedFundCode, setSwipedFundCode] = useState(null);

  // 点击页面其他区域时收起删除按钮
  useEffect(() => {
    const handleClickOutside = (e) => {
      // 检查点击事件是否来自删除按钮
      // 如果点击的是 .swipe-action-bg 或其子元素，不执行收起逻辑
      if (e.target.closest('.swipe-action-bg')) {
        return;
      }

      if (swipedFundCode) {
        setSwipedFundCode(null);
      }
    };

    if (swipedFundCode) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [swipedFundCode]);

  // 检查交易日状态
  const checkTradingDay = async () => {
    const now = nowInTz();
    const isWeekend = now.day() === 0 || now.day() === 6;

    // 周末直接判定为非交易日
    if (isWeekend) {
      setIsTradingDay(false);
      return;
    }

    // 工作日通过上证指数判断是否为节假日
    // 接口返回示例: v_sh000001="1~上证指数~...~20260205150000~..."
    // 第30位是时间字段
    try {
      const dateStr = await fetchShanghaiIndexDate();
      if (!dateStr) {
        setIsTradingDay(!isWeekend);
        return;
      }
      const currentStr = todayStr.replace(/-/g, '');
      if (dateStr === currentStr) {
        setIsTradingDay(true);
      } else {
        const minutes = now.hour() * 60 + now.minute();
        if (minutes >= 9 * 60 + 30) {
          setIsTradingDay(false);
        } else {
          setIsTradingDay(true);
        }
      }
    } catch (e) {
      setIsTradingDay(!isWeekend);
    }
  };

  useEffect(() => {
    checkTradingDay();
    // 每分钟检查一次
    const timer = setInterval(checkTradingDay, 60000);
    return () => clearInterval(timer);
  }, []);

  // 计算持仓收益
  const getHoldingProfit = (fund, holding) => {
    if (!holding || typeof holding.share !== 'number') return null;

    const now = nowInTz();
    const isAfter9 = now.hour() >= 9;
    const hasTodayData = fund.jzrq === todayStr;
    const hasTodayValuation = typeof fund.gztime === 'string' && fund.gztime.startsWith(todayStr);
    const canCalcTodayProfit = hasTodayData || hasTodayValuation;

    // 如果是交易日且9点以后，且今日净值未出，则强制使用估值（隐藏涨跌幅列模式）
    const useValuation = isTradingDay && isAfter9 && !hasTodayData;

    let currentNav;
    let profitToday;

    if (!useValuation) {
      // 使用确权净值 (dwjz)
      currentNav = Number(fund.dwjz);
      if (!currentNav) return null;

      if (canCalcTodayProfit) {
        const amount = holding.share * currentNav;
        // 优先用 zzl (真实涨跌幅), 降级用 gszzl
        const rate = fund.zzl !== undefined ? Number(fund.zzl) : (Number(fund.gszzl) || 0);
        profitToday = amount - (amount / (1 + rate / 100));
      } else {
        profitToday = null;
      }
    } else {
      // 否则使用估值
      currentNav = fund.estPricedCoverage > 0.05
        ? fund.estGsz
        : (typeof fund.gsz === 'number' ? fund.gsz : Number(fund.dwjz));

      if (!currentNav) return null;

      if (canCalcTodayProfit) {
        const amount = holding.share * currentNav;
        // 估值涨跌幅
        const gzChange = fund.estPricedCoverage > 0.05 ? fund.estGszzl : (Number(fund.gszzl) || 0);
        profitToday = amount - (amount / (1 + gzChange / 100));
      } else {
        profitToday = null;
      }
    }

    // 持仓金额
    const amount = holding.share * currentNav;

    // 总收益 = (当前净值 - 成本价) * 份额
    const profitTotal = typeof holding.cost === 'number'
      ? (currentNav - holding.cost) * holding.share
      : null;

    return {
      amount,
      profitToday,
      profitTotal
    };
  };


  // 过滤和排序后的基金列表
  const displayFunds = funds
    .filter(f => {
      if (currentTab === 'all') return true;
      if (currentTab === 'fav') return favorites.has(f.code);
      const group = groups.find(g => g.id === currentTab);
      return group ? group.codes.includes(f.code) : true;
    })
    .sort((a, b) => {
      if (sortBy === 'yield') {
        const valA = typeof a.estGszzl === 'number' ? a.estGszzl : (Number(a.gszzl) || 0);
        const valB = typeof b.estGszzl === 'number' ? b.estGszzl : (Number(b.gszzl) || 0);
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'holding') {
        const pa = getHoldingProfit(a, holdings[a.code]);
        const pb = getHoldingProfit(b, holdings[b.code]);
        const valA = pa?.profitTotal ?? Number.NEGATIVE_INFINITY;
        const valB = pb?.profitTotal ?? Number.NEGATIVE_INFINITY;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name, 'zh-CN') : b.name.localeCompare(a.name, 'zh-CN');
      }
      return 0;
    });

  // 自动滚动选中 Tab 到可视区域
  useEffect(() => {
    if (!tabsRef.current) return;
    if (currentTab === 'all') {
      tabsRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const activeTab = tabsRef.current.querySelector('.tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentTab]);

  // 鼠标拖拽滚动逻辑
  const [isDragging, setIsDragging] = useState(false);
  // Removed startX and scrollLeft state as we use movementX now
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const handleSaveHolding = (code, data) => {
    setHoldings(prev => {
      const next = { ...prev };
      if (data.share === null && data.cost === null) {
        delete next[code];
      } else {
        next[code] = data;
      }
      storageHelper.setItem('holdings', JSON.stringify(next));
      return next;
    });
    setHoldingModal({ open: false, fund: null });
  };

  const handleAction = (type, fund) => {
    setActionModal({ open: false, fund: null });
    if (type === 'edit') {
      setHoldingModal({ open: true, fund });
    } else if (type === 'clear') {
      setClearConfirm({ fund });
    } else if (type === 'buy' || type === 'sell') {
      setTradeModal({ open: true, fund, type });
    }
  };

  const handleClearConfirm = () => {
    if (clearConfirm?.fund) {
      handleSaveHolding(clearConfirm.fund.code, { share: null, cost: null });
    }
    setClearConfirm(null);
  };

  const processPendingQueue = async () => {
    const currentPending = pendingTradesRef.current;
    if (currentPending.length === 0) return;

    let stateChanged = false;
    let tempHoldings = { ...holdingsRef.current };
    const processedIds = new Set();

    for (const trade of currentPending) {
      let queryDate = trade.date;
      if (trade.isAfter3pm) {
          queryDate = toTz(trade.date).add(1, 'day').format('YYYY-MM-DD');
      }

      // 尝试获取智能净值
      const result = await fetchSmartFundNetValue(trade.fundCode, queryDate);

      if (result && result.value > 0) {
        // 成功获取，执行交易
        const current = tempHoldings[trade.fundCode] || { share: 0, cost: 0 };

        let newShare, newCost;
        if (trade.type === 'buy') {
             const feeRate = trade.feeRate || 0;
             const netAmount = trade.amount / (1 + feeRate / 100);
             const share = netAmount / result.value;
             newShare = current.share + share;
             newCost = (current.cost * current.share + trade.amount) / newShare;
        } else {
             newShare = Math.max(0, current.share - trade.share);
             newCost = current.cost;
             if (newShare === 0) newCost = 0;
        }

        tempHoldings[trade.fundCode] = { share: newShare, cost: newCost };
        stateChanged = true;
        processedIds.add(trade.id);
      }
    }

    if (stateChanged) {
      setHoldings(tempHoldings);
      storageHelper.setItem('holdings', JSON.stringify(tempHoldings));

      setPendingTrades(prev => {
          const next = prev.filter(t => !processedIds.has(t.id));
          storageHelper.setItem('pendingTrades', JSON.stringify(next));
          return next;
      });

      showToast(`已处理 ${processedIds.size} 笔待定交易`, 'success');
    }
  };

  const handleTrade = (fund, data) => {
    // 如果没有价格（API失败），加入待处理队列
    if (!data.price || data.price === 0) {
        const pending = {
            id: crypto.randomUUID(),
            fundCode: fund.code,
            fundName: fund.name,
            type: tradeModal.type,
            share: data.share,
            amount: data.totalCost,
            feeRate: tradeModal.type === 'buy' ? data.feeRate : 0, // Buy needs feeRate
            feeMode: data.feeMode,
            feeValue: data.feeValue,
            date: data.date,
            isAfter3pm: data.isAfter3pm,
            timestamp: Date.now()
        };

        const next = [...pendingTrades, pending];
        setPendingTrades(next);
        storageHelper.setItem('pendingTrades', JSON.stringify(next));

        setTradeModal({ open: false, fund: null, type: 'buy' });
        showToast('净值暂未更新，已加入待处理队列', 'info');
        return;
    }

    const current = holdings[fund.code] || { share: 0, cost: 0 };
    const isBuy = tradeModal.type === 'buy';

    let newShare, newCost;

    if (isBuy) {
      newShare = current.share + data.share;

      // 如果传递了 totalCost（即买入总金额），则用它来计算新成本
      // 否则回退到用 share * price 计算（减仓或旧逻辑）
      const buyCost = data.totalCost !== undefined ? data.totalCost : (data.price * data.share);

      // 加权平均成本 = (原持仓成本 * 原份额 + 本次买入总花费) / 新总份额
      // 注意：这里默认将手续费也计入成本（如果 totalCost 包含了手续费）
      newCost = (current.cost * current.share + buyCost) / newShare;
    } else {
      newShare = Math.max(0, current.share - data.share);
      // 减仓不改变单位成本，只减少份额
      newCost = current.cost;
      if (newShare === 0) newCost = 0;
    }

    handleSaveHolding(fund.code, { share: newShare, cost: newCost });
    setTradeModal({ open: false, fund: null, type: 'buy' });
  };

  const handleMouseDown = (e) => {
    if (!tabsRef.current) return;
    setIsDragging(true);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !tabsRef.current) return;
    e.preventDefault();
    tabsRef.current.scrollLeft -= e.movementX;
  };

  const handleWheel = (e) => {
    if (!tabsRef.current) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    tabsRef.current.scrollLeft += delta;
  };

  const updateTabOverflow = () => {
    if (!tabsRef.current) return;
    const el = tabsRef.current;
    setTabsOverflow(el.scrollWidth > el.clientWidth);
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    updateTabOverflow();
    const onResize = () => updateTabOverflow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [groups, funds.length, favorites.size]);

  // 成功提示弹窗
  const [successModal, setSuccessModal] = useState({ open: false, message: '' });
  // 轻提示 (Toast)
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' }); // type: 'info' | 'success' | 'error'
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3000);
  };

  const handleOpenLogin = () => {
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    setLoginModalOpen(true);
  };

  const [cloudConfigModal, setCloudConfigModal] = useState({ open: false, userId: null });
  const syncDebounceRef = useRef(null);
  const lastSyncedRef = useRef('');
  const skipSyncRef = useRef(false);
  const userIdRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user]);

  // 使用从 configUtils 导入的 getFundCodesSignature

  const scheduleSync = useCallback(() => {
    if (!userIdRef.current) return;
    if (skipSyncRef.current) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      const payload = collectLocalPayload();
      const next = getComparablePayload(payload);
      if (next === lastSyncedRef.current) return;
      lastSyncedRef.current = next;
      syncUserConfig(userIdRef.current, false);
    }, 2000);
  }, []);

  const storageHelper = useMemo(() => {
    const keys = new Set(['funds', 'favorites', 'groups', 'collapsedCodes', 'refreshMs', 'holdings', 'pendingTrades', 'viewMode']);
    const triggerSync = (key, prevValue, nextValue) => {
      if (keys.has(key)) {
        if (key === 'funds') {
          const prevSig = getFundCodesSignature(prevValue);
          const nextSig = getFundCodesSignature(nextValue);
          if (prevSig === nextSig) return;
        }
        if (!skipSyncRef.current) {
          window.localStorage.setItem('localUpdatedAt', nowInTz().toISOString());
        }
        scheduleSync();
      }
    };
    return {
      setItem: (key, value) => {
        const prevValue = key === 'funds' ? window.localStorage.getItem(key) : null;
        window.localStorage.setItem(key, value);
        triggerSync(key, prevValue, value);
      },
      removeItem: (key) => {
        const prevValue = key === 'funds' ? window.localStorage.getItem(key) : null;
        window.localStorage.removeItem(key);
        triggerSync(key, prevValue, null);
      },
      clear: () => {
        window.localStorage.clear();
        if (!skipSyncRef.current) {
          window.localStorage.setItem('localUpdatedAt', nowInTz().toISOString());
        }
        scheduleSync();
      }
    };
  }, [getFundCodesSignature, scheduleSync]);

  useEffect(() => {
    const keys = new Set(['funds', 'favorites', 'groups', 'collapsedCodes', 'refreshMs', 'holdings', 'pendingTrades', 'viewMode']);
    const onStorage = (e) => {
      if (!e.key) return;
      if (!keys.has(e.key)) return;
      if (e.key === 'funds') {
        const prevSig = getFundCodesSignature(e.oldValue);
        const nextSig = getFundCodesSignature(e.newValue);
        if (prevSig === nextSig) return;
      }
      scheduleSync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [getFundCodesSignature, scheduleSync]);

  const applyViewMode = useCallback((mode) => {
    if (mode !== 'card' && mode !== 'list') return;
    setViewMode(mode);
    storageHelper.setItem('viewMode', mode);
  }, [storageHelper]);

  const toggleFavorite = (code) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      storageHelper.setItem('favorites', JSON.stringify(Array.from(next)));
      if (next.size === 0) setCurrentTab('all');
      return next;
    });
  };

  const toggleCollapse = (code) => {
    setCollapsedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      // 同步到本地存储
      storageHelper.setItem('collapsedCodes', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleAddGroup = (name) => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name,
      codes: []
    };
    const next = [...groups, newGroup];
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
    setCurrentTab(newGroup.id);
    setGroupModalOpen(false);
  };

  // const handleRemoveGroup = (id) => {
  //   const next = groups.filter(g => g.id !== id);
  //   setGroups(next);
  //   storageHelper.setItem('groups', JSON.stringify(next));
  //   if (currentTab === id) setCurrentTab('all');
  // };

  const handleUpdateGroups = (newGroups) => {
    setGroups(newGroups);
    storageHelper.setItem('groups', JSON.stringify(newGroups));
    // 如果当前选中的分组被删除了，切换回“全部”
    if (currentTab !== 'all' && currentTab !== 'fav' && !newGroups.find(g => g.id === currentTab)) {
      setCurrentTab('all');
    }
  };

  const handleAddFundsToGroup = (codes) => {
    if (!codes || codes.length === 0) return;
    const next = groups.map(g => {
      if (g.id === currentTab) {
        return {
          ...g,
          codes: Array.from(new Set([...g.codes, ...codes]))
        };
      }
      return g;
    });
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
    setAddFundToGroupOpen(false);
    setSuccessModal({ open: true, message: `成功添加 ${codes.length} 支基金` });
  };

  const removeFundFromCurrentGroup = (code) => {
    const next = groups.map(g => {
      if (g.id === currentTab) {
        return {
          ...g,
          codes: g.codes.filter(c => c !== code)
        };
      }
      return g;
    });
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
  };

  const toggleFundInGroup = (code, groupId) => {
    const next = groups.map(g => {
      if (g.id === groupId) {
        const has = g.codes.includes(code);
        return {
          ...g,
          codes: has ? g.codes.filter(c => c !== code) : [...g.codes, code]
        };
      }
      return g;
    });
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
  };

  // 使用从 configUtils 导入的 dedupeByCode

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('funds') || '[]');
      if (Array.isArray(saved) && saved.length) {
        const deduped = dedupeByCode(saved);
        setFunds(deduped);
        storageHelper.setItem('funds', JSON.stringify(deduped));
        const codes = Array.from(new Set(deduped.map((f) => f.code)));
        if (codes.length) refreshAll(codes);
      }
      const savedMs = parseInt(localStorage.getItem('refreshMs') || '300000', 10);
      if (Number.isFinite(savedMs) && savedMs >= 5000) {
        setRefreshMs(savedMs);
        setTempSeconds(Math.round(savedMs / 1000));
      }
      // 加载收起状态
      const savedCollapsed = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
      if (Array.isArray(savedCollapsed)) {
        setCollapsedCodes(new Set(savedCollapsed));
      }
      // 加载自选状态
      const savedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (Array.isArray(savedFavorites)) {
        setFavorites(new Set(savedFavorites));
      }
      // 加载待处理交易
      const savedPending = JSON.parse(localStorage.getItem('pendingTrades') || '[]');
      if (Array.isArray(savedPending)) {
        setPendingTrades(savedPending);
      }
      // 加载分组状态
      const savedGroups = JSON.parse(localStorage.getItem('groups') || '[]');
      if (Array.isArray(savedGroups)) {
        setGroups(savedGroups);
      }
      // 加载持仓数据
      const savedHoldings = JSON.parse(localStorage.getItem('holdings') || '{}');
      if (savedHoldings && typeof savedHoldings === 'object') {
        setHoldings(savedHoldings);
      }
      const savedViewMode = localStorage.getItem('viewMode');
      if (savedViewMode === 'card' || savedViewMode === 'list') {
        setViewMode(savedViewMode);
      }
    } catch { }
  }, []);

  // 初始化认证状态监听
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null);
      return;
    }
    const clearAuthState = () => {
      setUser(null);
    };

    const handleSession = async (session, event) => {
      if (!session?.user) {
        if (event === 'SIGNED_OUT' && !isLoggingOutRef.current) {
          setLoginError('会话已过期，请重新登录');
          setLoginModalOpen(true);
        }
        isLoggingOutRef.current = false;
        clearAuthState();
        return;
      }
      if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
        isLoggingOutRef.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        try {
          const storageKeys = Object.keys(localStorage);
          storageKeys.forEach((key) => {
            if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
              storageHelper.removeItem(key);
            }
          });
        } catch { }
        try {
          const sessionKeys = Object.keys(sessionStorage);
          sessionKeys.forEach((key) => {
            if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
              sessionStorage.removeItem(key);
            }
          });
        } catch { }
        clearAuthState();
        setLoginError('会话已过期，请重新登录');
        showToast('会话已过期，请重新登录', 'error');
        setLoginModalOpen(true);
        return;
      }
      setUser(session.user);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setLoginModalOpen(false);
        setLoginEmail('');
        setLoginSuccess('');
        setLoginError('');
      }
      fetchCloudConfig(session.user.id);
    };

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        clearAuthState();
        return;
      }
      await handleSession(data?.session ?? null, 'INITIAL_SESSION');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      await handleSession(session ?? null, event);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    const channel = supabase
      .channel(`user-configs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_configs', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const incoming = payload?.new?.data;
        if (!incoming || typeof incoming !== 'object') return;
        const incomingComparable = getComparablePayload(incoming);
        if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
        await applyCloudConfig(incoming, payload.new.updated_at);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_configs', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const incoming = payload?.new?.data;
        if (!incoming || typeof incoming !== 'object') return;
        const incomingComparable = getComparablePayload(incoming);
        if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
        await applyCloudConfig(incoming, payload.new.updated_at);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleLoginSuccess = (user) => {
    setLoginModalOpen(false);
    fetchCloudConfig(user.id);
  };

  // 登出
  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    if (!isSupabaseConfigured) {
      setLoginModalOpen(false);
      setLoginModalOpen(false);
      setUser(null);
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error && error.code !== 'session_not_found') {
          throw error;
        }
      }
    } catch (err) {
      showToast(err.message, 'error')
      console.error('登出失败', err);
    } finally {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch { }
      try {
        const storageKeys = Object.keys(localStorage);
        storageKeys.forEach((key) => {
          if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            storageHelper.removeItem(key);
          }
        });
      } catch { }
      try {
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
          if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            sessionStorage.removeItem(key);
          }
        });
      } catch { }
      setLoginModalOpen(false);
      setUser(null);
    }
  };

  // useEffect(() => {
  //   if (timerRef.current) clearInterval(timerRef.current);
  //   timerRef.current = setInterval(() => {
  //     const codes = Array.from(new Set(funds.map((f) => f.code)));
  //     if (codes.length) refreshAll(codes);
  //   }, refreshMs);
  //   return () => {
  //     if (timerRef.current) clearInterval(timerRef.current);
  //   };
  // }, [funds, refreshMs]);

  const performSearch = async (val) => {
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const fundsOnly = await searchFunds(val);
      setSearchResults(fundsOnly);
    } catch (e) {
      console.error('搜索失败', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(val), 300);
  };

  const toggleSelectFund = (fund) => {
    setSelectedFunds(prev => {
      const exists = prev.find(f => f.CODE === fund.CODE);
      if (exists) {
        return prev.filter(f => f.CODE !== fund.CODE);
      }
      return [...prev, fund];
    });
  };

  const refreshAll = async (codes) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const uniqueCodes = Array.from(new Set(codes));
    try {
      const updated = [];
      for (const c of uniqueCodes) {
        try {
          const data = await fetchFundData(c);
          updated.push(data);
        } catch (e) {
          console.error(`刷新基金 ${c} 失败`, e);
          // 失败时从当前 state 中寻找旧数据
          setFunds(prev => {
            const old = prev.find((f) => f.code === c);
            if (old) updated.push(old);
            return prev;
          });
        }
      }

      if (updated.length > 0) {
        setFunds(prev => {
          // 将更新后的数据合并回当前最新的 state 中，防止覆盖掉刚刚导入的数据
          const merged = [...prev];
          updated.forEach(u => {
            const idx = merged.findIndex(f => f.code === u.code);
            if (idx > -1) {
              merged[idx] = u;
            } else {
              merged.push(u);
            }
          });
          const deduped = dedupeByCode(merged);
          storageHelper.setItem('funds', JSON.stringify(deduped));
          return deduped;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      try {
        await processPendingQueue();
      }catch (e) {
        showToast('待交易队列计算出错', 'error')
      }
    }
  };

  const toggleViewMode = () => {
    const nextMode = viewMode === 'card' ? 'list' : 'card';
    applyViewMode(nextMode);
  };

  const requestRemoveFund = (fund) => {
    const h = holdings[fund.code];
    const hasHolding = h && typeof h.share === 'number' && h.share > 0;
    if (hasHolding) {
      setFundDeleteConfirm({ code: fund.code, name: fund.name });
    } else {
      removeFund(fund.code);
    }
  };

  const addFund = async (e) => {
    e?.preventDefault?.();
    setError('');
    const manualTokens = String(searchTerm || '')
      .split(/[^0-9A-Za-z]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
    const selectedCodes = Array.from(new Set([
      ...selectedFunds.map(f => f.CODE),
      ...manualTokens.filter(t => /^\d{6}$/.test(t))
    ]));
    if (selectedCodes.length === 0) {
      setError('请输入或选择基金代码');
      return;
    }
    setLoading(true);
    try {
      const newFunds = [];
      const failures = [];
      const nameMap = {};
      selectedFunds.forEach(f => { nameMap[f.CODE] = f.NAME; });
      for (const c of selectedCodes) {
        if (funds.some((f) => f.code === c)) continue;
        try {
          const data = await fetchFundData(c);
          newFunds.push(data);
        } catch (err) {
          failures.push({ code: c, name: nameMap[c] });
        }
      }
      if (newFunds.length === 0) {
        setError('未添加任何新基金');
      } else {
        const next = dedupeByCode([...newFunds, ...funds]);
        setFunds(next);
        storageHelper.setItem('funds', JSON.stringify(next));
      }
      setSearchTerm('');
      setSelectedFunds([]);
      setShowDropdown(false);
      if (failures.length > 0) {
        setAddFailures(failures);
        setAddResultOpen(true);
      }
    } catch (e) {
      setError(e.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const removeFund = (removeCode) => {
    const next = funds.filter((f) => f.code !== removeCode);
    setFunds(next);
    storageHelper.setItem('funds', JSON.stringify(next));

    // 同步删除分组中的失效代码
    const nextGroups = groups.map(g => ({
      ...g,
      codes: g.codes.filter(c => c !== removeCode)
    }));
    setGroups(nextGroups);
    storageHelper.setItem('groups', JSON.stringify(nextGroups));

    // 同步删除展开收起状态
    setCollapsedCodes(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      storageHelper.setItem('collapsedCodes', JSON.stringify(Array.from(nextSet)));
      return nextSet;
    });

    // 同步删除自选状态
    setFavorites(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      storageHelper.setItem('favorites', JSON.stringify(Array.from(nextSet)));
      if (nextSet.size === 0) setCurrentTab('all');
      return nextSet;
    });

    // 同步删除持仓数据
    setHoldings(prev => {
      if (!prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      storageHelper.setItem('holdings', JSON.stringify(next));
      return next;
    });

    // 同步删除待处理交易
    setPendingTrades(prev => {
      const next = prev.filter((trade) => trade?.fundCode !== removeCode);
      storageHelper.setItem('pendingTrades', JSON.stringify(next));
      return next;
    });
  };

  const manualRefresh = async () => {
    if (refreshingRef.current) return;
    const codes = Array.from(new Set(funds.map((f) => f.code)));
    if (!codes.length) return;
    await refreshAll(codes);
  };

  const handleSaveSettings = (ms) => {
    setRefreshMs(ms);
    storageHelper.setItem('refreshMs', String(ms));
    setSettingsOpen(false);
  };

  const normalizeCode = (value) => String(value || '').trim();
  const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  function getComparablePayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const rawFunds = Array.isArray(payload.funds) ? payload.funds : [];
    const fundCodes = rawFunds
      .map((fund) => normalizeCode(fund?.code || fund?.CODE))
      .filter(Boolean);
    const uniqueFundCodes = Array.from(new Set(fundCodes)).sort();

    const favorites = Array.isArray(payload.favorites)
      ? Array.from(new Set(payload.favorites.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
      : [];

    const collapsedCodes = Array.isArray(payload.collapsedCodes)
      ? Array.from(new Set(payload.collapsedCodes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
      : [];

    const groups = Array.isArray(payload.groups)
      ? payload.groups
          .map((group) => {
            const id = normalizeCode(group?.id);
            if (!id) return null;
            const name = typeof group?.name === 'string' ? group.name : '';
            const codes = Array.isArray(group?.codes)
              ? Array.from(new Set(group.codes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
              : [];
            return { id, name, codes };
          })
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    const holdingsSource = payload.holdings && typeof payload.holdings === 'object' && !Array.isArray(payload.holdings)
      ? payload.holdings
      : {};
    const holdings = {};
    Object.keys(holdingsSource)
      .map(normalizeCode)
      .filter((code) => uniqueFundCodes.includes(code))
      .sort()
      .forEach((code) => {
        const value = holdingsSource[code] || {};
        const share = normalizeNumber(value.share);
        const cost = normalizeNumber(value.cost);
        if (share === null && cost === null) return;
        holdings[code] = { share, cost };
      });

    const pendingTrades = Array.isArray(payload.pendingTrades)
      ? payload.pendingTrades
          .map((trade) => {
            const fundCode = normalizeCode(trade?.fundCode);
            if (!fundCode) return null;
            return {
              id: trade?.id ? String(trade.id) : '',
              fundCode,
              type: trade?.type || '',
              share: normalizeNumber(trade?.share),
              amount: normalizeNumber(trade?.amount),
              feeRate: normalizeNumber(trade?.feeRate),
              feeMode: trade?.feeMode || '',
              feeValue: normalizeNumber(trade?.feeValue),
              date: trade?.date || '',
              isAfter3pm: !!trade?.isAfter3pm
            };
          })
          .filter((trade) => trade && uniqueFundCodes.includes(trade.fundCode))
          .sort((a, b) => {
            const keyA = a.id || `${a.fundCode}|${a.type}|${a.date}|${a.share ?? ''}|${a.amount ?? ''}|${a.feeMode}|${a.feeValue ?? ''}|${a.feeRate ?? ''}|${a.isAfter3pm ? 1 : 0}`;
            const keyB = b.id || `${b.fundCode}|${b.type}|${b.date}|${b.share ?? ''}|${b.amount ?? ''}|${b.feeMode}|${b.feeValue ?? ''}|${b.feeRate ?? ''}|${b.isAfter3pm ? 1 : 0}`;
            return keyA.localeCompare(keyB);
          })
      : [];

    const viewMode = payload.viewMode === 'list' ? 'list' : 'card';

    return JSON.stringify({
      funds: uniqueFundCodes,
      favorites,
      groups,
      collapsedCodes,
      refreshMs: Number.isFinite(payload.refreshMs) ? payload.refreshMs : 30000,
      holdings,
      pendingTrades,
      viewMode
    });
  }

  const collectLocalPayload = () => {
    try {
      const funds = JSON.parse(localStorage.getItem('funds') || '[]');
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      const groups = JSON.parse(localStorage.getItem('groups') || '[]');
      const collapsedCodes = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
      const viewMode = localStorage.getItem('viewMode') === 'list' ? 'list' : 'card';
      const fundCodes = new Set(
        Array.isArray(funds)
          ? funds.map((f) => f?.code).filter(Boolean)
          : []
      );
      const holdings = JSON.parse(localStorage.getItem('holdings') || '{}');
      const pendingTrades = JSON.parse(localStorage.getItem('pendingTrades') || '[]');
      const cleanedHoldings = holdings && typeof holdings === 'object' && !Array.isArray(holdings)
        ? Object.entries(holdings).reduce((acc, [code, value]) => {
          if (!fundCodes.has(code) || !value || typeof value !== 'object') return acc;
          const parsedShare = typeof value.share === 'number'
            ? value.share
            : typeof value.share === 'string'
              ? Number(value.share)
              : NaN;
          const parsedCost = typeof value.cost === 'number'
            ? value.cost
            : typeof value.cost === 'string'
              ? Number(value.cost)
              : NaN;
          const nextShare = Number.isFinite(parsedShare) ? parsedShare : null;
          const nextCost = Number.isFinite(parsedCost) ? parsedCost : null;
          if (nextShare === null && nextCost === null) return acc;
          acc[code] = {
            ...value,
            share: nextShare,
            cost: nextCost
          };
          return acc;
        }, {})
        : {};
      const cleanedFavorites = Array.isArray(favorites)
        ? favorites.filter((code) => fundCodes.has(code))
        : [];
      const cleanedCollapsed = Array.isArray(collapsedCodes)
        ? collapsedCodes.filter((code) => fundCodes.has(code))
        : [];
      const cleanedGroups = Array.isArray(groups)
        ? groups.map((group) => ({
          ...group,
          codes: Array.isArray(group?.codes)
            ? group.codes.filter((code) => fundCodes.has(code))
            : []
        }))
        : [];
      const cleanedPendingTrades = Array.isArray(pendingTrades)
        ? pendingTrades.filter((trade) => trade && fundCodes.has(trade.fundCode))
        : [];
      return {
        funds,
        favorites: cleanedFavorites,
        groups: cleanedGroups,
        collapsedCodes: cleanedCollapsed,
        refreshMs: parseInt(localStorage.getItem('refreshMs') || '30000', 10),
        holdings: cleanedHoldings,
        pendingTrades: cleanedPendingTrades,
        viewMode,
        exportedAt: nowInTz().toISOString()
      };
    } catch {
      return {
        funds: [],
        favorites: [],
        groups: [],
        collapsedCodes: [],
        refreshMs: 30000,
        holdings: {},
        pendingTrades: [],
        viewMode: 'card',
        exportedAt: nowInTz().toISOString()
      };
    }
  };

  const applyCloudConfig = async (cloudData, cloudUpdatedAt) => {
    if (!cloudData || typeof cloudData !== 'object') return;
    skipSyncRef.current = true;
    try {
      if (cloudUpdatedAt) {
        storageHelper.setItem('localUpdatedAt', toTz(cloudUpdatedAt).toISOString());
      }
      const nextFunds = Array.isArray(cloudData.funds) ? dedupeByCode(cloudData.funds) : [];
      setFunds(nextFunds);
      storageHelper.setItem('funds', JSON.stringify(nextFunds));
      const nextFundCodes = new Set(nextFunds.map((f) => f.code));

      const nextFavorites = Array.isArray(cloudData.favorites) ? cloudData.favorites : [];
      setFavorites(new Set(nextFavorites));
      storageHelper.setItem('favorites', JSON.stringify(nextFavorites));

      const nextGroups = Array.isArray(cloudData.groups) ? cloudData.groups : [];
      setGroups(nextGroups);
      storageHelper.setItem('groups', JSON.stringify(nextGroups));

      const nextCollapsed = Array.isArray(cloudData.collapsedCodes) ? cloudData.collapsedCodes : [];
      setCollapsedCodes(new Set(nextCollapsed));
      storageHelper.setItem('collapsedCodes', JSON.stringify(nextCollapsed));

      const nextRefreshMs = Number.isFinite(cloudData.refreshMs) && cloudData.refreshMs >= 5000 ? cloudData.refreshMs : 30000;
      setRefreshMs(nextRefreshMs);
      setTempSeconds(Math.round(nextRefreshMs / 1000));
      storageHelper.setItem('refreshMs', String(nextRefreshMs));

      if (cloudData.viewMode === 'card' || cloudData.viewMode === 'list') {
        applyViewMode(cloudData.viewMode);
      }

      const nextHoldings = cloudData.holdings && typeof cloudData.holdings === 'object' ? cloudData.holdings : {};
      setHoldings(nextHoldings);
      storageHelper.setItem('holdings', JSON.stringify(nextHoldings));

      const nextPendingTrades = Array.isArray(cloudData.pendingTrades)
        ? cloudData.pendingTrades.filter((trade) => trade && nextFundCodes.has(trade.fundCode))
        : [];
      setPendingTrades(nextPendingTrades);
      storageHelper.setItem('pendingTrades', JSON.stringify(nextPendingTrades));

      if (nextFunds.length) {
        const codes = Array.from(new Set(nextFunds.map((f) => f.code)));
        if (codes.length) await refreshAll(codes);
      }

      const payload = collectLocalPayload();
      lastSyncedRef.current = getComparablePayload(payload);
    } finally {
      skipSyncRef.current = false;
    }
  };

  const fetchCloudConfig = async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('user_configs')
        .select('id, data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) {
        const { error: insertError } = await supabase
          .from('user_configs')
          .insert({ user_id: userId });
        if (insertError) throw insertError;
        setCloudConfigModal({ open: true, userId, type: 'empty' });
        return;
      }
      if (data?.data && typeof data.data === 'object' && Object.keys(data.data).length > 0) {
        const localPayload = collectLocalPayload();
        const localComparable = getComparablePayload(localPayload);
        const cloudComparable = getComparablePayload(data.data);

        if (localComparable !== cloudComparable) {
          // 如果数据不一致，无论时间戳如何，都提示用户
          // 用户可以选择使用本地数据覆盖云端，或者使用云端数据覆盖本地
          setCloudConfigModal({ open: true, userId, type: 'conflict', cloudData: data.data });
          return;
        }

        await applyCloudConfig(data.data, data.updated_at);
        return;
      }
      setCloudConfigModal({ open: true, userId, type: 'empty' });
    } catch (e) {
      console.error('获取云端配置失败', e);
    }
  };

  const syncUserConfig = async (userId, showTip = true) => {
    if (!userId) {
      showToast(`userId 不存在，请重新登录`, 'error');
      return;
    }
    try {
      setIsSyncing(true);
      const payload = collectLocalPayload();
      const now = nowInTz().toISOString();
      const { data: upsertData, error: updateError } = await supabase
        .from('user_configs')
        .upsert(
          {
            user_id: userId,
            data: payload,
            updated_at: now
          },
          { onConflict: 'user_id' }
        )
        .select();

      if (updateError) throw updateError;
      if (!upsertData || upsertData.length === 0) {
        throw new Error('同步失败：未写入任何数据，请检查账号状态或重新登录');
      }

      storageHelper.setItem('localUpdatedAt', now);

      if (showTip) {
        setSuccessModal({ open: true, message: '已同步云端配置' });
      }
    } catch (e) {
      console.error('同步云端配置异常', e);
      // 临时关闭同步异常提示
      // showToast(`同步云端配置异常:${e}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncLocalConfig = async () => {
    const userId = cloudConfigModal.userId;
    setCloudConfigModal({ open: false, userId: null });
    await syncUserConfig(userId);
  };

  const exportLocalData = async () => {
    try {
      const payload = {
        funds: JSON.parse(localStorage.getItem('funds') || '[]'),
        favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
        groups: JSON.parse(localStorage.getItem('groups') || '[]'),
        collapsedCodes: JSON.parse(localStorage.getItem('collapsedCodes') || '[]'),
        refreshMs: parseInt(localStorage.getItem('refreshMs') || '30000', 10),
        viewMode: localStorage.getItem('viewMode') === 'list' ? 'list' : 'card',
        holdings: JSON.parse(localStorage.getItem('holdings') || '{}'),
        pendingTrades: JSON.parse(localStorage.getItem('pendingTrades') || '[]'),
        exportedAt: nowInTz().toISOString()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: `realtime-fund-config-${Date.now()}.json`,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setSuccessModal({ open: true, message: '导出成功' });
        setSettingsOpen(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `realtime-fund-config-${Date.now()}.json`;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        setSuccessModal({ open: true, message: '导出成功' });
        setSettingsOpen(false);
      };
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') return;
        finish();
        document.removeEventListener('visibilitychange', onVisibility);
      };
      document.addEventListener('visibilitychange', onVisibility, { once: true });
      a.click();
      setTimeout(finish, 3000);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleImportFileChange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (data && typeof data === 'object') {
        // 从 localStorage 读取最新数据进行合并，防止状态滞后导致的数据丢失
        const currentFunds = JSON.parse(localStorage.getItem('funds') || '[]');
        const currentFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        const currentGroups = JSON.parse(localStorage.getItem('groups') || '[]');
        const currentCollapsed = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
        const currentPendingTrades = JSON.parse(localStorage.getItem('pendingTrades') || '[]');

        let mergedFunds = currentFunds;
        let appendedCodes = [];

        if (Array.isArray(data.funds)) {
          const incomingFunds = dedupeByCode(data.funds);
          const existingCodes = new Set(currentFunds.map(f => f.code));
          const newItems = incomingFunds.filter(f => f && f.code && !existingCodes.has(f.code));
          appendedCodes = newItems.map(f => f.code);
          mergedFunds = [...currentFunds, ...newItems];
          setFunds(mergedFunds);
          storageHelper.setItem('funds', JSON.stringify(mergedFunds));
        }

        if (Array.isArray(data.favorites)) {
          const mergedFav = Array.from(new Set([...currentFavorites, ...data.favorites]));
          setFavorites(new Set(mergedFav));
          storageHelper.setItem('favorites', JSON.stringify(mergedFav));
        }

        if (Array.isArray(data.groups)) {
          // 合并分组：如果 ID 相同则合并 codes，否则添加新分组
          const mergedGroups = [...currentGroups];
          data.groups.forEach(incomingGroup => {
            const existingIdx = mergedGroups.findIndex(g => g.id === incomingGroup.id);
            if (existingIdx > -1) {
              mergedGroups[existingIdx] = {
                ...mergedGroups[existingIdx],
                codes: Array.from(new Set([...mergedGroups[existingIdx].codes, ...(incomingGroup.codes || [])]))
              };
            } else {
              mergedGroups.push(incomingGroup);
            }
          });
          setGroups(mergedGroups);
          storageHelper.setItem('groups', JSON.stringify(mergedGroups));
        }

        if (Array.isArray(data.collapsedCodes)) {
          const mergedCollapsed = Array.from(new Set([...currentCollapsed, ...data.collapsedCodes]));
          setCollapsedCodes(new Set(mergedCollapsed));
          storageHelper.setItem('collapsedCodes', JSON.stringify(mergedCollapsed));
        }

        if (typeof data.refreshMs === 'number' && data.refreshMs >= 5000) {
          setRefreshMs(data.refreshMs);
          setTempSeconds(Math.round(data.refreshMs / 1000));
          storageHelper.setItem('refreshMs', String(data.refreshMs));
        }
        if (data.viewMode === 'card' || data.viewMode === 'list') {
          applyViewMode(data.viewMode);
        }

        if (data.holdings && typeof data.holdings === 'object') {
          const mergedHoldings = { ...JSON.parse(localStorage.getItem('holdings') || '{}'), ...data.holdings };
          setHoldings(mergedHoldings);
          storageHelper.setItem('holdings', JSON.stringify(mergedHoldings));
        }

        if (Array.isArray(data.pendingTrades)) {
          const existingPending = Array.isArray(currentPendingTrades) ? currentPendingTrades : [];
          const incomingPending = data.pendingTrades.filter((trade) => trade && trade.fundCode);
          const fundCodeSet = new Set(mergedFunds.map((f) => f.code));
          const keyOf = (trade) => {
            if (trade?.id) return `id:${trade.id}`;
            return `k:${trade?.fundCode || ''}:${trade?.type || ''}:${trade?.date || ''}:${trade?.share || ''}:${trade?.amount || ''}:${trade?.isAfter3pm ? 1 : 0}`;
          };
          const mergedPendingMap = new Map();
          existingPending.forEach((trade) => {
            if (!trade || !fundCodeSet.has(trade.fundCode)) return;
            mergedPendingMap.set(keyOf(trade), trade);
          });
          incomingPending.forEach((trade) => {
            if (!fundCodeSet.has(trade.fundCode)) return;
            mergedPendingMap.set(keyOf(trade), trade);
          });
          const mergedPending = Array.from(mergedPendingMap.values());
          setPendingTrades(mergedPending);
          storageHelper.setItem('pendingTrades', JSON.stringify(mergedPending));
        }

        // 导入成功后，仅刷新新追加的基金
        if (appendedCodes.length) {
          // 这里需要确保 refreshAll 不会因为闭包问题覆盖掉刚刚合并好的 mergedFunds
          // 我们直接传入所有代码执行一次全量刷新是最稳妥的，或者修改 refreshAll 支持增量更新
          const allCodes = mergedFunds.map(f => f.code);
          await refreshAll(allCodes);
        }

        setSuccessModal({ open: true, message: '导入成功' });
        setSettingsOpen(false); // 导入成功自动关闭设置弹框
      }
    } catch (err) {
      console.error('Import error:', err);
      throw new Error('导入失败，请检查文件格式');
    }
  };

  useEffect(() => {
    const isAnyModalOpen =
      settingsOpen ||
      addResultOpen ||
      addFundToGroupOpen ||
      groupManageOpen ||
      groupModalOpen ||
      successModal.open ||
      cloudConfigModal.open ||
      logoutConfirmOpen ||
      holdingModal.open ||
      actionModal.open ||
      tradeModal.open ||
      !!clearConfirm ||
      !!fundDeleteConfirm;

    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [
    settingsOpen,
    addResultOpen,
    addFundToGroupOpen,
    groupManageOpen,
    groupModalOpen,
    successModal.open,
    cloudConfigModal.open,
    logoutConfirmOpen,
    holdingModal.open,
    actionModal.open,
    tradeModal.open,
    clearConfirm
  ]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const getGroupName = () => {
    if (currentTab === 'all') return '全部资产';
    if (currentTab === 'fav') return '自选资产';
    const group = groups.find(g => g.id === currentTab);
    return group ? `${group.name}资产` : '分组资产';
  };

  useDefaultTool({
    render: ({ name, args, status, result }) => {
      return (
        <div className="p-4 border rounded my-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">{name}</h4>
            <span className="text-sm text-gray-500">
              {status === "inProgress" && "Running..."}
              {status === "executing" && "Executing..."}
              {status === "complete" && "Complete"}
            </span>
          </div>
          {Object.keys(args).length > 0 && (
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-600">Parameters:</p>
              <pre className="text-xs bg-gray-100 p-2 rounded mt-1">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {status === "complete" && result && (
            <div>
              <p className="text-sm font-medium text-gray-600">Result:</p>
              <pre className="text-xs bg-gray-100 p-2 rounded mt-1">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );
    },
  });
  useFrontendTool({
    name: "get_my_holding_funds",
    description: "获取我当前的持仓基金",
    parameters: [{
        name: "type",
        type: "string",
        description: "The type of funds to return. optional, can be 'all' or 'holding'. If 'holding', only return funds with non-zero shares. Default is 'all'.",
        required: false,
      }],
    handler: async ({ type }) => {
      // Add the new graph to the beginning of the array
      
      return { success: true, data: JSON.stringify(funds)};
    },
    render: ({ result }) => {
  
      return (<code><pre>{JSON.stringify(result, null, 2)}</pre></code>);
    },
  });


  return (
    <div className="container content">
      <Announcement />
      <Navbar
        refreshing={refreshing}
        refreshMs={refreshMs}
        fundsCount={funds.length}
        isSyncing={isSyncing}
        user={user}
        userAvatar={userAvatar}
        onRefresh={manualRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenLogin={handleOpenLogin}
        onLogout={() => setLogoutConfirmOpen(true)}
      />

      <div className="grid">
        <div className="col-12 glass card add-fund-section" role="region" aria-label="添加基金">

          <div className="search-container" ref={dropdownRef}>
            <form className="form" onSubmit={addFund}>
              <div className="search-input-wrapper" style={{ flex: 1, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* {selectedFunds.length > 0 && (
                  <div className="selected-inline-chips">
                    {selectedFunds.map(fund => (
                      <div key={fund.CODE} className="fund-chip">
                        <span>{fund.NAME}</span>
                        <button onClick={() => toggleSelectFund(fund)} className="remove-chip">
                          <CloseIcon width="14" height="14" />
                        </button>
                      </div>
                    ))}
                  </div>
                )} */}
                <input
                  className="input"
                  placeholder="搜索基金名称或代码..."
                  value={searchTerm}
                  onChange={handleSearchInput}
                  onFocus={() => setShowDropdown(true)}
                />
                {isSearching && <div className="search-spinner" />}
              </div>
              <button
                className="button"
                type="submit"
                disabled={loading || refreshing}
                style={{pointerEvents: refreshing ? 'none' : 'auto', opacity: refreshing ? 0.6 : 1}}
              >
                {loading ? '添加中…' : '添加'}
              </button>
            </form>

            <AnimatePresence>
              {showDropdown && (searchTerm.trim() || searchResults.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="search-dropdown glass"
                >
                  {searchResults.length > 0 ? (
                    <div className="search-results">
                      {searchResults.map((fund) => {
                        const isSelected = selectedFunds.some(f => f.CODE === fund.CODE);
                        const isAlreadyAdded = funds.some(f => f.code === fund.CODE);
                        return (
                          <div
                            key={fund.CODE}
                            className={`search-item ${isSelected ? 'selected' : ''} ${isAlreadyAdded ? 'added' : ''}`}
                            onClick={() => {
                              if (isAlreadyAdded) return;
                              toggleSelectFund(fund);
                            }}
                          >
                            <div className="fund-info">
                              <span className="fund-name">{fund.NAME}</span>
                              <span className="fund-code muted">#{fund.CODE} | {fund.TYPE}</span>
                            </div>
                            {isAlreadyAdded ? (
                              <span className="added-label">已添加</span>
                            ) : (
                              <div className="checkbox">
                                {isSelected && <div className="checked-mark" />}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : searchTerm.trim() && !isSearching ? (
                    <div className="no-results muted">未找到相关基金</div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>



          {error && <div className="muted" style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
        </div>

        <div className="col-12">
          <div className="filter-bar" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="tabs-container">
              <div
                className="tabs-scroll-area"
                data-mask-left={canLeft}
                data-mask-right={canRight}
              >
                <div
                  className="tabs"
                  ref={tabsRef}
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeaveOrUp}
                  onMouseUp={handleMouseLeaveOrUp}
                  onMouseMove={handleMouseMove}
                  onWheel={handleWheel}
                  onScroll={updateTabOverflow}
                >
                  <AnimatePresence mode="popLayout">
                    <motion.button
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      key="all"
                      className={`tab ${currentTab === 'all' ? 'active' : ''}`}
                      onClick={() => setCurrentTab('all')}
                      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                    >
                      全部 ({funds.length})
                    </motion.button>
                    <motion.button
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      key="fav"
                      className={`tab ${currentTab === 'fav' ? 'active' : ''}`}
                      onClick={() => setCurrentTab('fav')}
                      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                    >
                      自选 ({favorites.size})
                    </motion.button>
                    {groups.map(g => (
                      <motion.button
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        key={g.id}
                        className={`tab ${currentTab === g.id ? 'active' : ''}`}
                        onClick={() => setCurrentTab(g.id)}
                        transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                      >
                        {g.name} ({g.codes.length})
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
              {groups.length > 0 && (
                <button
                  className="icon-button manage-groups-btn"
                  onClick={() => setGroupManageOpen(true)}
                  title="管理分组"
                >
                  <SortIcon width="16" height="16" />
                </button>
              )}
              <button
                className="icon-button add-group-btn"
                onClick={() => setGroupModalOpen(true)}
                title="新增分组"
              >
                <PlusIcon width="16" height="16" />
              </button>
            </div>

            <div className="sort-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="view-toggle" style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '2px' }}>
                <button
                  className={`icon-button ${viewMode === 'card' ? 'active' : ''}`}
                  onClick={() => { applyViewMode('card'); }}
                  style={{ border: 'none', width: '32px', height: '32px', background: viewMode === 'card' ? 'var(--primary)' : 'transparent', color: viewMode === 'card' ? '#05263b' : 'var(--muted)' }}
                  title="卡片视图"
                >
                  <GridIcon width="16" height="16" />
                </button>
                <button
                  className={`icon-button ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => { applyViewMode('list'); }}
                  style={{ border: 'none', width: '32px', height: '32px', background: viewMode === 'list' ? 'var(--primary)' : 'transparent', color: viewMode === 'list' ? '#05263b' : 'var(--muted)' }}
                  title="表格视图"
                >
                  <ListIcon width="16" height="16" />
                </button>
              </div>

              <div className="divider" style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

              <div className="sort-items" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <SortIcon width="14" height="14" />
                  排序
                </span>
                <div className="chips">
                  {[
                    { id: 'default', label: '默认' },
                    { id: 'yield', label: '涨跌幅' },
                    { id: 'holding', label: '持有收益' },
                    { id: 'name', label: '名称' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      className={`chip ${sortBy === s.id ? 'active' : ''}`}
                      onClick={() => {
                        if (sortBy === s.id) {
                          // 同一按钮重复点击，切换升序/降序
                          setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                        } else {
                          // 切换到新的排序字段，默认用降序
                          setSortBy(s.id);
                          setSortOrder('desc');
                        }
                      }}
                      style={{ height: '28px', fontSize: '12px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>{s.label}</span>
                      {s.id !== 'default' && sortBy === s.id && (
                        <span
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            lineHeight: 1,
                            fontSize: '8px',
                          }}
                        >
                          <span style={{ opacity: sortOrder === 'asc' ? 1 : 0.3 }}>▲</span>
                          <span style={{ opacity: sortOrder === 'desc' ? 1 : 0.3 }}>▼</span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {displayFunds.length === 0 ? (
            <div className="glass card empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: 16, opacity: 0.5 }}>📂</div>
              <div className="muted" style={{ marginBottom: 20 }}>{funds.length === 0 ? '尚未添加基金' : '该分组下暂无数据'}</div>
              {currentTab !== 'all' && currentTab !== 'fav' && funds.length > 0 && (
                <button className="button" onClick={() => setAddFundToGroupOpen(true)}>
                  添加基金到此分组
                </button>
              )}
            </div>
          ) : (
            <>
              <GroupSummary
                  funds={displayFunds}
                  holdings={holdings}
                  groupName={getGroupName()}
                  getProfit={getHoldingProfit}
                />

              {currentTab !== 'all' && currentTab !== 'fav' && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="button-dashed"
                  onClick={() => setAddFundToGroupOpen(true)}
                  style={{
                    width: '100%',
                    height: '48px',
                    border: '2px dashed rgba(255,255,255,0.1)',
                    
                    borderRadius: '12px',
                    
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                  // onMouseEnter={(e) => {
                  //   e.currentTarget.style.borderColor = 'var(--primary)';
                  //   e.currentTarget.style.color = 'var(--primary)';
                  //   e.currentTarget.style.background = 'rgba(34, 211, 238, 0.05)';
                  // }}
                  // onMouseLeave={(e) => {
                  //   e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  //   e.currentTarget.style.color = 'var(--muted)';
                  //   e.currentTarget.style.background = 'transparent';
                  // }}
                >
                  <PlusIcon width="18" height="18" />
                  <span>添加基金到此分组</span>
                </motion.button>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={viewMode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={viewMode === 'card' ? 'grid' : 'table-container glass'}
                >
                  <div className={viewMode === 'card' ? 'grid col-12 masonry' : ''} style={viewMode === 'card' ? {} : {}}>
                    {viewMode === 'list' && (
                      <div className="table-header-row">
                        <div className="table-header-cell">基金名称</div>
                        <div className="table-header-cell text-right">净值/估值</div>
                        <div className="table-header-cell text-right">涨跌幅</div>
                        <div className="table-header-cell text-right">估值时间</div>
                        <div className="table-header-cell text-right">持仓金额</div>
                        <div className="table-header-cell text-right">当日盈亏</div>
                        <div className="table-header-cell text-right">持有收益</div>
                        <div className="table-header-cell text-center">操作</div>
                      </div>
                    )}
                    <AnimatePresence mode="popLayout">
                      {displayFunds.map((f) => (
                        <motion.div
                          key={f.code}
                          className={viewMode === 'card' ? 'col-6' : 'table-row-wrapper'}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          style={{ position: 'relative', overflow: 'hidden' }}
                        >
                          {viewMode === 'list' && isMobile && (
                            <div
                              className="swipe-action-bg"
                              onClick={(e) => {
                                e.stopPropagation(); // 阻止冒泡，防止触发全局收起导致状态混乱
                                if (refreshing) return;
                                requestRemoveFund(f);
                              }}
                              style={{ pointerEvents: refreshing ? 'none' : 'auto', opacity: refreshing ? 0.6 : 1 }}
                            >
                              <TrashIcon width="18" height="18" />
                              <span>删除</span>
                            </div>
                          )}
                          <motion.div
                            className={viewMode === 'card' ? 'glass card' : 'table-row'}
                            drag={viewMode === 'list' && isMobile ? "x" : false}
                            dragConstraints={{ left: -80, right: 0 }}
                            dragElastic={0.1}
                            // 增加 dragDirectionLock 确保在垂直滚动时不会轻易触发水平拖拽
                            dragDirectionLock={true}
                            // 调整触发阈值，只有明显的水平拖拽意图才响应
                            onDragStart={(event, info) => {
                              // 如果水平移动距离小于垂直移动距离，或者水平速度很小，视为垂直滚动意图，不进行拖拽处理
                              // framer-motion 的 dragDirectionLock 已经处理了大部分情况，但可以进一步微调体验
                            }}
                            // 如果当前行不是被选中的行，强制回到原点 (x: 0)
                            animate={viewMode === 'list' && isMobile ? { x: swipedFundCode === f.code ? -80 : 0 } : undefined}
                            onDragEnd={(e, { offset, velocity }) => {
                              if (viewMode === 'list' && isMobile) {
                                if (offset.x < -40) {
                                  setSwipedFundCode(f.code);
                                } else {
                                  setSwipedFundCode(null);
                                }
                              }
                            }}
                            onClick={(e) => {
                              // 阻止事件冒泡，避免触发全局的 click listener 导致立刻被收起
                              // 只有在已经展开的情况下点击自身才需要阻止冒泡（或者根据需求调整）
                              // 这里我们希望：点击任何地方都收起。
                              // 如果点击的是当前行，且不是拖拽操作，上面的全局 listener 会处理收起。
                              // 但为了防止点击行内容触发收起后又立即触发行的其他点击逻辑（如果有的话），
                              // 可以在这里处理。不过当前需求是“点击其他区域收起”，
                              // 实际上全局 listener 已经覆盖了“点击任何区域（包括其他行）收起”。
                              // 唯一的问题是：点击当前行的“删除按钮”时，会先触发全局 click 导致收起，然后触发删除吗？
                              // 删除按钮在底层，通常不会受影响，因为 React 事件和原生事件的顺序。
                              // 但为了保险，删除按钮的 onClick 应该阻止冒泡。

                              // 如果当前行已展开，点击行内容（非删除按钮）应该收起
                              if (viewMode === 'list' && isMobile && swipedFundCode === f.code) {
                                e.stopPropagation(); // 阻止冒泡，自己处理收起，避免触发全局再次处理
                                setSwipedFundCode(null);
                              }
                            }}
                            style={{
                              background: viewMode === 'list' ? 'var(--bg)' : undefined,
                              position: 'relative',
                              zIndex: 1
                            }}
                          >
                            {viewMode === 'list' ? (
                              <>
                                <div className="table-cell name-cell">
                                  {currentTab !== 'all' && currentTab !== 'fav' ? (
                                    <button
                                      className="icon-button fav-button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeFundFromCurrentGroup(f.code);
                                      }}
                                      title="从当前分组移除"
                                    >
                                      <ExitIcon width="18" height="18" style={{ transform: 'rotate(180deg)' }} />
                                    </button>
                                  ) : (
                                    <button
                                      className={`icon-button fav-button ${favorites.has(f.code) ? 'active' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(f.code);
                                      }}
                                      title={favorites.has(f.code) ? "取消自选" : "添加自选"}
                                    >
                                      <StarIcon width="18" height="18" filled={favorites.has(f.code)} />
                                    </button>
                                  )}
                                  <div className="title-text">
                                    <span
                                      className={`name-text ${f.jzrq === todayStr ? 'updated' : ''}`}
                                      title={f.jzrq === todayStr ? "今日净值已更新" : ""}
                                    >
                                      {f.name}
                                    </span>
                                    <span className="muted code-text">#{f.code}</span>
                                  </div>
                                </div>
                                {(() => {
                                  const now = nowInTz();
                                  const isAfter9 = now.hour() >= 9;
                                  const hasTodayData = f.jzrq === todayStr;
                                  const shouldHideChange = isTradingDay && isAfter9 && !hasTodayData;

                                  if (!shouldHideChange) {
                                    // 如果涨跌幅列显示（即非交易时段或今日净值已更新），则显示单位净值和真实涨跌幅
                                    return (
                                      <>
                                        <div className="table-cell text-right value-cell">
                                          <span style={{ fontWeight: 700 }}>{f.dwjz ?? '—'}</span>
                                        </div>
                                        <div className="table-cell text-right change-cell">
                                          <span className={f.zzl > 0 ? 'up' : f.zzl < 0 ? 'down' : ''} style={{ fontWeight: 700 }}>
                                            {f.zzl !== undefined ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : ''}
                                          </span>
                                        </div>
                                      </>
                                    );
                                  } else {
                                    // 否则显示估值净值和估值涨跌幅
                                    // 如果是无估值数据的基金，直接显示净值数据
                                    if (f.noValuation) {
                                      return (
                                        <>
                                          <div className="table-cell text-right value-cell">
                                            <span style={{ fontWeight: 700 }}>{f.dwjz ?? '—'}</span>
                                          </div>
                                          <div className="table-cell text-right change-cell">
                                            <span className={f.zzl > 0 ? 'up' : f.zzl < 0 ? 'down' : ''} style={{ fontWeight: 700 }}>
                                              {f.zzl !== undefined && f.zzl !== null ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : '—'}
                                            </span>
                                          </div>
                                        </>
                                      );
                                    }
                                    return (
                                      <>
                                        <div className="table-cell text-right value-cell">
                                          <span style={{ fontWeight: 700 }}>{f.estPricedCoverage > 0.05 ? f.estGsz.toFixed(4) : (f.gsz ?? '—')}</span>
                                        </div>
                                        <div className="table-cell text-right change-cell">
                                          <span className={f.estPricedCoverage > 0.05 ? (f.estGszzl > 0 ? 'up' : f.estGszzl < 0 ? 'down' : '') : (Number(f.gszzl) > 0 ? 'up' : Number(f.gszzl) < 0 ? 'down' : '')} style={{ fontWeight: 700 }}>
                                            {f.estPricedCoverage > 0.05 ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%` : (typeof f.gszzl === 'number' ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—')}
                                          </span>
                                        </div>
                                      </>
                                    );
                                  }
                                })()}
                                <div className="table-cell text-right time-cell">
                                  <span className="muted" style={{ fontSize: '12px' }}>{f.noValuation ? (f.jzrq || '-') : (f.gztime || f.time || '-')}</span>
                                </div>
                                {!isMobile && (() => {
                                  const holding = holdings[f.code];
                                  const profit = getHoldingProfit(f, holding);
                                  const amount = profit ? profit.amount : null;
                                  if (amount === null) {
                                    return (
                                      <div
                                        className="table-cell text-right holding-amount-cell"
                                        title="设置持仓"
                                        onClick={(e) => { e.stopPropagation(); setHoldingModal({ open: true, fund: f }); }}
                                      >
                                        <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '12px', cursor: 'pointer' }}>
                                          未设置 <SettingsIcon width="18" height="18" />
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div
                                      className="table-cell text-right holding-amount-cell"
                                      title="点击设置持仓"
                                      onClick={(e) => { e.stopPropagation(); setActionModal({ open: true, fund: f }); }}
                                    >
                                      <span style={{ fontWeight: 700, marginRight: 6 }}>¥{amount.toFixed(2)}</span>
                                      <button
                                        className="icon-button"
                                        onClick={(e) => { e.stopPropagation(); setActionModal({ open: true, fund: f }); }}
                                        title="编辑持仓"
                                        style={{ border: 'none', width: '28px', height: '28px', marginLeft: -6 }}
                                      >
                                        <SettingsIcon width="14" height="14" />
                                      </button>
                                    </div>
                                  );
                                })()}
                                {(() => {
                                  const holding = holdings[f.code];
                                  const profit = getHoldingProfit(f, holding);
                                  const profitValue = profit ? profit.profitToday : null;
                                  const hasProfit = profitValue !== null;

                                  return (
                                    <div className="table-cell text-right profit-cell">
                                      <span
                                        className={hasProfit ? (profitValue > 0 ? 'up' : profitValue < 0 ? 'down' : '') : 'muted'}
                                        style={{ fontWeight: 700 }}
                                      >
                                        {hasProfit
                                          ? `${profitValue > 0 ? '+' : profitValue < 0 ? '-' : ''}¥${Math.abs(profitValue).toFixed(2)}`
                                          : ''}
                                      </span>
                                    </div>
                                  );
                                })()}
                                {!isMobile && (() => {
                                  const holding = holdings[f.code];
                                  const profit = getHoldingProfit(f, holding);
                                  const total = profit ? profit.profitTotal : null;
                                  const principal = holding && holding.cost && holding.share ? holding.cost * holding.share : 0;
                                  const asPercent = percentModes[f.code];
                                  const hasTotal = total !== null;
                                  const formatted = hasTotal
                                    ? (asPercent && principal > 0
                                      ? `${total > 0 ? '+' : total < 0 ? '-' : ''}${Math.abs((total / principal) * 100).toFixed(2)}%`
                                      : `${total > 0 ? '+' : total < 0 ? '-' : ''}¥${Math.abs(total).toFixed(2)}`)
                                    : '';
                                  const cls = hasTotal ? (total > 0 ? 'up' : total < 0 ? 'down' : '') : 'muted';
                                  return (
                                    <div
                                      className="table-cell text-right holding-cell"
                                      title="点击切换金额/百分比"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasTotal) {
                                          setPercentModes(prev => ({ ...prev, [f.code]: !prev[f.code] }));
                                        }
                                      }}
                                      style={{ cursor: hasTotal ? 'pointer' : 'default' }}
                                    >
                                      <span className={cls} style={{ fontWeight: 700 }}>{formatted}</span>
                                    </div>
                                  );
                                })()}
                                <div className="table-cell text-center action-cell" style={{ gap: 4 }}>
                                  <button
                                    className="icon-button danger"
                                    onClick={() => !refreshing && requestRemoveFund(f)}
                                    title="删除"
                                    disabled={refreshing}
                                    style={{ width: '28px', height: '28px', opacity: refreshing ? 0.6 : 1, cursor: refreshing ? 'not-allowed' : 'pointer' }}
                                  >
                                    <TrashIcon width="14" height="14" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="row" style={{ marginBottom: 10 }}>
                                  <div className="title">
                                    {currentTab !== 'all' && currentTab !== 'fav' ? (
                                      <button
                                        className="icon-button fav-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFundFromCurrentGroup(f.code);
                                        }}
                                        title="从当前分组移除"
                                      >
                                        <ExitIcon width="18" height="18" style={{ transform: 'rotate(180deg)' }} />
                                      </button>
                                    ) : (
                                      <button
                                        className={`icon-button fav-button ${favorites.has(f.code) ? 'active' : ''}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleFavorite(f.code);
                                        }}
                                        title={favorites.has(f.code) ? "取消自选" : "添加自选"}
                                      >
                                        <StarIcon width="18" height="18" filled={favorites.has(f.code)} />
                                      </button>
                                    )}
                                    <div className="title-text">
                                      <span
                                        className={`name-text ${f.jzrq === todayStr ? 'updated' : ''}`}
                                        title={f.jzrq === todayStr ? "今日净值已更新" : ""}
                                      >
                                        {f.name}
                                      </span>
                                      <span className="muted">#{f.code}</span>
                                    </div>
                                  </div>

                                  <div className="actions">
                                    <div className="badge-v">
                                      <span>{f.noValuation ? '净值日期' : '估值时间'}</span>
                                      <strong>{f.noValuation ? (f.jzrq || '-') : (f.gztime || f.time || '-')}</strong>
                                    </div>
                                    <div className="row" style={{ gap: 4 }}>
                                      <button
                                        className="icon-button danger"
                                        onClick={() => !refreshing && requestRemoveFund(f)}
                                        title="删除"
                                        disabled={refreshing}
                                        style={{ width: '28px', height: '28px', opacity: refreshing ? 0.6 : 1, cursor: refreshing ? 'not-allowed' : 'pointer' }}
                                      >
                                        <TrashIcon width="14" height="14" />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="row" style={{ marginBottom: 12 }}>
                                  <Stat label="单位净值" value={f.dwjz ?? '—'} />
                                  {f.noValuation ? (
                                    // 无估值数据的基金，直接显示净值涨跌幅，不显示估值相关字段
                                    <Stat
                                      label="涨跌幅"
                                      value={f.zzl !== undefined && f.zzl !== null ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : '—'}
                                      delta={f.zzl}
                                    />
                                  ) : (
                                    <>
                                      {(() => {
                                        const now = nowInTz();
                                        const isAfter9 = now.hour() >= 9;
                                        const hasTodayData = f.jzrq === todayStr;
                                        const shouldHideChange = isTradingDay && isAfter9 && !hasTodayData;

                                        if (shouldHideChange) return null;

                                        return (
                                          <Stat
                                            label="涨跌幅"
                                            value={f.zzl !== undefined ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : ''}
                                            delta={f.zzl}
                                          />
                                        );
                                      })()}
                                      <Stat label="估值净值" value={f.estPricedCoverage > 0.05 ? f.estGsz.toFixed(4) : (f.gsz ?? '—')} />
                                      <Stat
                                        label="估值涨跌幅"
                                        value={f.estPricedCoverage > 0.05 ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%` : (typeof f.gszzl === 'number' ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—')}
                                        delta={f.estPricedCoverage > 0.05 ? f.estGszzl : (Number(f.gszzl) || 0)}
                                      />
                                    </>
                                  )}
                                </div>

                                <div className="row" style={{ marginBottom: 12 }}>
                                  {(() => {
                                    const holding = holdings[f.code];
                                    const profit = getHoldingProfit(f, holding);

                                    if (!profit) {
                                      return (
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">持仓金额</span>
                                          <div
                                            className="value muted"
                                            style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                            onClick={() => setHoldingModal({ open: true, fund: f })}
                                          >
                                            未设置 <SettingsIcon width="18" height="18" />
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <>
                                        <div
                                          className="stat"
                                          style={{ cursor: 'pointer', flexDirection: 'column', gap: 4 }}
                                          onClick={() => setActionModal({ open: true, fund: f })}
                                        >
                                          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            持仓金额 <SettingsIcon width="18" height="18" style={{ opacity: 0.7 }} />
                                          </span>
                                          <span className="value">¥{profit.amount.toFixed(2)}</span>
                                        </div>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">当日盈亏</span>
                                          <span className={`value ${profit.profitToday > 0 ? 'up' : profit.profitToday < 0 ? 'down' : ''}`}>
                                            {profit.profitToday > 0 ? '+' : profit.profitToday < 0 ? '-' : ''}¥{Math.abs(profit.profitToday).toFixed(2)}
                                          </span>
                                        </div>
                                        {profit.profitTotal !== null && (
                                          <div
                                            className="stat"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPercentModes(prev => ({ ...prev, [f.code]: !prev[f.code] }));
                                            }}
                                            style={{ cursor: 'pointer', flexDirection: 'column', gap: 4 }}
                                            title="点击切换金额/百分比"
                                          >
                                            <span className="label">持有收益{percentModes[f.code] ? '(%)' : ''}</span>
                                            <span className={`value ${profit.profitTotal > 0 ? 'up' : profit.profitTotal < 0 ? 'down' : ''}`}>
                                              {profit.profitTotal > 0 ? '+' : profit.profitTotal < 0 ? '-' : ''}
                                              {percentModes[f.code]
                                                ? `${Math.abs((holding.cost * holding.share) ? (profit.profitTotal / (holding.cost * holding.share)) * 100 : 0).toFixed(2)}%`
                                                : `¥${Math.abs(profit.profitTotal).toFixed(2)}`
                                              }
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>

                                {f.estPricedCoverage > 0.05 && (
                                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: -8, marginBottom: 10, textAlign: 'right' }}>
                                    基于 {Math.round(f.estPricedCoverage * 100)}% 持仓估算
                                  </div>
                                )}
                                <div
                                  style={{ marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}
                                  className="title"
                                  onClick={() => toggleCollapse(f.code)}
                                >
                                  <div className="row" style={{ width: '100%', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span>前10重仓股票</span>
                                      <ChevronIcon
                                        width="16"
                                        height="16"
                                        className="muted"
                                        style={{
                                          transform: collapsedCodes.has(f.code) ? 'rotate(-90deg)' : 'rotate(0deg)',
                                          transition: 'transform 0.2s ease'
                                        }}
                                      />
                                    </div>
                                    <span className="muted">涨跌幅 / 占比</span>
                                  </div>
                                </div>
                                <AnimatePresence>
                                  {!collapsedCodes.has(f.code) && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                                      style={{ overflow: 'hidden' }}
                                    >
                                      {Array.isArray(f.holdings) && f.holdings.length ? (
                                        <div className="list">
                                          {f.holdings.map((h, idx) => (
                                            <div className="item" key={idx}>
                                              <span className="name">{h.name}</span>
                                              <div className="values">
                                                {typeof h.change === 'number' && (
                                                  <span className={`badge ${h.change > 0 ? 'up' : h.change < 0 ? 'down' : ''}`} style={{ marginRight: 8 }}>
                                                    {h.change > 0 ? '+' : ''}{h.change.toFixed(2)}%
                                                  </span>
                                                )}
                                                <span className="weight">{h.weight}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="muted" style={{ padding: '8px 0' }}>暂无重仓数据</div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </>
                            )}
                          </motion.div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {fundDeleteConfirm && (
          <ConfirmModal
            title="删除确认"
            message={`基金 "${fundDeleteConfirm.name}" 存在持仓记录。删除后将移除该基金及其持仓数据，是否继续？`}
            confirmText="确定删除"
            onConfirm={() => {
              removeFund(fundDeleteConfirm.code);
              setFundDeleteConfirm(null);
            }}
            onCancel={() => setFundDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {logoutConfirmOpen && (
          <ConfirmModal
            title="确认登出"
            message="确定要退出当前账号吗？"
            confirmText="确认登出"
            onConfirm={() => {
              setLogoutConfirmOpen(false);
              handleLogout();
            }}
            onCancel={() => setLogoutConfirmOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="footer">
      </div>

      <AnimatePresence>
        {addResultOpen && (
          <AddResultModal
            failures={addFailures}
            onClose={() => setAddResultOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addFundToGroupOpen && (
          <AddFundToGroupModal
            allFunds={funds}
            currentGroupCodes={groups.find(g => g.id === currentTab)?.codes || []}
            onClose={() => setAddFundToGroupOpen(false)}
            onAdd={handleAddFundsToGroup}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionModal.open && (
          <HoldingActionModal
            fund={actionModal.fund}
            onClose={() => setActionModal({ open: false, fund: null })}
            onAction={(type) => handleAction(type, actionModal.fund)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tradeModal.open && (
          <TradeModal
            type={tradeModal.type}
            fund={tradeModal.fund}
            holding={holdings[tradeModal.fund?.code]}
            onClose={() => setTradeModal({ open: false, fund: null, type: 'buy' })}
            onConfirm={(data) => handleTrade(tradeModal.fund, data)}
            pendingTrades={pendingTrades}
            onDeletePending={(id) => {
                setPendingTrades(prev => {
                    const next = prev.filter(t => t.id !== id);
                    storageHelper.setItem('pendingTrades', JSON.stringify(next));
                    return next;
                });
                showToast('已撤销待处理交易', 'success');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {clearConfirm && (
          <ConfirmModal
            title="清空持仓"
            message={`确定要清空“${clearConfirm.fund?.name}”的所有持仓记录吗？此操作不可恢复。`}
            onConfirm={handleClearConfirm}
            onCancel={() => setClearConfirm(null)}
            confirmText="确认清空"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {holdingModal.open && (
          <HoldingEditModal
            fund={holdingModal.fund}
            holding={holdings[holdingModal.fund?.code]}
            onClose={() => setHoldingModal({ open: false, fund: null })}
            onSave={(data) => handleSaveHolding(holdingModal.fund?.code, data)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {groupManageOpen && (
          <GroupManageModal
            groups={groups}
            onClose={() => setGroupManageOpen(false)}
            onSave={handleUpdateGroups}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {groupModalOpen && (
          <GroupModal
            onClose={() => setGroupModalOpen(false)}
            onConfirm={handleAddGroup}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {successModal.open && (
          <SuccessModal
            message={successModal.message}
            onClose={() => setSuccessModal({ open: false, message: '' })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cloudConfigModal.open && (
          <CloudConfigModal
            type={cloudConfigModal.type}
            onConfirm={handleSyncLocalConfig}
            onCancel={() => {
              if (cloudConfigModal.type === 'conflict' && cloudConfigModal.cloudData) {
                applyCloudConfig(cloudConfigModal.cloudData);
              }
              setCloudConfigModal({ open: false, userId: null });
            }}
          />
        )}
      </AnimatePresence>

      <SettingsModal
        isOpen={settingsOpen}
        refreshMs={refreshMs}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onExport={exportLocalData}
        onImport={handleImportFileChange}
      />

      {/* 更新提示弹窗 - 默认禁用，需要时启用 */}
      <UpdateModal enabled={false} />
      
      {/* 登录模态框 */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* 全局轻提示 Toast */}
      <Toast toast={toast} />
    </div>
  );
}
