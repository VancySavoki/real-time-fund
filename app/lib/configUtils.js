/**
 * 配置数据处理工具函数
 */

// 代码归一化
export const normalizeCode = (value) => String(value || '').trim();

// 数字归一化
export const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

// 计算 fund 签名（用于比较）
export const getFundCodesSignature = (value) => {
  try {
    const list = JSON.parse(value || '[]');
    if (!Array.isArray(list)) return '';
    const codes = list.map((item) => item?.code).filter(Boolean);
    return Array.from(new Set(codes)).sort().join('|');
  } catch (e) {
    return '';
  }
};

// 根据 code 去重 fund
export const dedupeByCode = (funds) => {
  if (!Array.isArray(funds)) return [];
  const seen = new Set();
  return funds.filter((f) => {
    if (!f?.code) return false;
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
};

/**
 * 获取可比较的 payload 字符串
 * 用于比较本地和云端数据是否一致
 */
export function getComparablePayload(payload) {
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

/**
 * 从 localStorage 收集本地配置
 * 返回完整的 payload 对象
 */
export function collectLocalPayload() {
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

    // 清洗 holdings
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
      exportedAt: new Date().toISOString()
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
      exportedAt: new Date().toISOString()
    };
  }
}

/**
 * 导入并合并配置数据
 * @param {Object} data - 要导入的数据
 * @param {Object} currentState - 当前页面状态
 * @returns {Object} 合并后的状态和新添加的基金代码
 */
export function mergeImportData(data, currentState) {
  const currentFunds = currentState.funds || JSON.parse(localStorage.getItem('funds') || '[]');
  const currentFavorites = currentState.favorites || JSON.parse(localStorage.getItem('favorites') || '[]');
  const currentGroups = currentState.groups || JSON.parse(localStorage.getItem('groups') || '[]');
  const currentCollapsed = currentState.collapsedCodes || JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
  const currentPendingTrades = currentState.pendingTrades || JSON.parse(localStorage.getItem('pendingTrades') || '[]');
  const currentHoldings = currentState.holdings || JSON.parse(localStorage.getItem('holdings') || '{}');

  let mergedFunds = currentFunds;
  let appendedCodes = [];

  if (Array.isArray(data.funds)) {
    const incomingFunds = dedupeByCode(data.funds);
    const existingCodes = new Set(currentFunds.map(f => f.code));
    const newItems = incomingFunds.filter(f => f && f.code && !existingCodes.has(f.code));
    appendedCodes = newItems.map(f => f.code);
    mergedFunds = [...currentFunds, ...newItems];
  }

  const fundCodeSet = new Set(mergedFunds.map(f => f.code));

  // 合并 favorites
  const mergedFavorites = Array.isArray(data.favorites)
    ? Array.from(new Set([...currentFavorites, ...data.favorites]))
    : currentFavorites;

  // 合并 groups
  const mergedGroups = Array.isArray(data.groups)
    ? [...currentGroups].map(group => {
      const incomingGroup = data.groups.find(g => g.id === group.id);
      if (incomingGroup) {
        return {
          ...group,
          codes: Array.from(new Set([...group.codes, ...(incomingGroup.codes || [])]))
        };
      }
      return group;
    })
    : currentGroups;

  // 合并其他数据
  const mergedCollapsed = Array.isArray(data.collapsedCodes)
    ? Array.from(new Set([...currentCollapsed, ...data.collapsedCodes]))
    : currentCollapsed;

  const mergedHoldings = data.holdings && typeof data.holdings === 'object'
    ? { ...currentHoldings, ...data.holdings }
    : currentHoldings;

  // 合并 pendingTrades
  const mergedPendingTrades = Array.isArray(data.pendingTrades)
    ? [...currentPendingTrades, ...data.pendingTrades]
    : currentPendingTrades;

  // 清洗数据，只保留存在的 fundCode
  const cleanedPendingTrades = mergedPendingTrades.filter(t => fundCodeSet.has(t.fundCode));
  const cleanedHoldings = Object.fromEntries(
    Object.entries(mergedHoldings).filter(([code]) => fundCodeSet.has(code))
  );

  return {
    funds: mergedFunds,
    favorites: mergedFavorites,
    groups: mergedGroups,
    collapsedCodes: mergedCollapsed,
    holdings: cleanedHoldings,
    pendingTrades: cleanedPendingTrades,
    appendedCodes,
    refreshMs: typeof data.refreshMs === 'number' && data.refreshMs >= 5000 ? data.refreshMs : null,
    viewMode: data.viewMode === 'card' || data.viewMode === 'list' ? data.viewMode : null
  };
}

/**
 * 导出本地配置数据
 * @returns {Blob} JSON 文件的 Blob 对象
 */
export function exportLocalConfig() {
  const payload = collectLocalPayload();
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

/**
 * 验证导入数据格式
 * @param {Object} data
 * @returns {boolean}
 */
export function validateImportData(data) {
  return data && typeof data === 'object';
}
