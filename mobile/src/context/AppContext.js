import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Ctx = createContext();

const DEFAULT_HOLDINGS = [
  { symbol: 'AAPL', name: 'Apple Inc', qty: 50, avgPrice: 215.30 },
  { symbol: 'TSLA', name: 'Tesla Inc', qty: 25, avgPrice: 248.50 },
  { symbol: 'PLTR', name: 'Palantir Technologies', qty: 200, avgPrice: 22.80 },
  { symbol: 'SOFI', name: 'SoFi Technologies', qty: 300, avgPrice: 9.45 },
  { symbol: 'NIO', name: 'NIO Inc', qty: 150, avgPrice: 5.20 },
];

const DEFAULTS = {
  cash: 74847.50,
  holdings: DEFAULT_HOLDINGS,
  watchlist: ['NVDA', 'AMD', 'GOOGL', 'NFLX'],
  history: [
    { type: 'buy', symbol: 'AAPL', qty: 50, price: 215.30, date: '2025-01-15' },
    { type: 'buy', symbol: 'PLTR', qty: 200, price: 22.80, date: '2025-01-20' },
    { type: 'buy', symbol: 'TSLA', qty: 25, price: 248.50, date: '2025-02-01' },
    { type: 'buy', symbol: 'NIO', qty: 150, price: 5.20, date: '2025-02-15' },
    { type: 'buy', symbol: 'SOFI', qty: 300, price: 9.45, date: '2025-03-01' },
  ],
};

const STORAGE_KEY = 'stockai_v3';

export function AppProvider({ children }) {
  const [cash, setCash] = useState(DEFAULTS.cash);
  const [holdings, setHoldings] = useState(DEFAULTS.holdings);
  const [watchlist, setWatchlist] = useState(DEFAULTS.watchlist);
  const [history, setHistory] = useState(DEFAULTS.history);
  const [ready, setReady] = useState(false);

  // Load from storage — if nothing saved, defaults are already set above
  useEffect(() => {
    (async () => {
      try {
        // Clear old keys from previous versions
        await AsyncStorage.multiRemove(['stockai_data', 'stockai_v2', 'portfolio']);

        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const d = JSON.parse(saved);
          if (d.holdings && d.holdings.length > 0) {
            setCash(d.cash);
            setHoldings(d.holdings);
            setWatchlist(d.watchlist || DEFAULTS.watchlist);
            setHistory(d.history || DEFAULTS.history);
          }
          // If saved but empty holdings, keep defaults
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  // Save on change
  useEffect(() => {
    if (ready) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ cash, holdings, watchlist, history }));
    }
  }, [cash, holdings, watchlist, history, ready]);

  const buy = (symbol, name, qty, price) => {
    const cost = qty * price;
    if (cost > cash) return false;
    setCash(p => p - cost);
    setHoldings(prev => {
      const ex = prev.find(h => h.symbol === symbol);
      if (ex) {
        const nq = ex.qty + qty;
        const na = ((ex.avgPrice * ex.qty) + (price * qty)) / nq;
        return prev.map(h => h.symbol === symbol ? { ...h, qty: nq, avgPrice: na } : h);
      }
      return [...prev, { symbol, name: name || symbol, qty, avgPrice: price }];
    });
    setHistory(p => [{ type: 'buy', symbol, qty, price, date: new Date().toISOString().split('T')[0] }, ...p]);
    return true;
  };

  const sell = (symbol, qty, price) => {
    const h = holdings.find(x => x.symbol === symbol);
    if (!h || h.qty < qty) return false;
    setCash(p => p + qty * price);
    setHoldings(prev => {
      const rem = h.qty - qty;
      if (rem <= 0) return prev.filter(x => x.symbol !== symbol);
      return prev.map(x => x.symbol === symbol ? { ...x, qty: rem } : x);
    });
    setHistory(p => [{ type: 'sell', symbol, qty, price, date: new Date().toISOString().split('T')[0] }, ...p]);
    return true;
  };

  const toggleWatch = (sym) => setWatchlist(p => p.includes(sym) ? p.filter(s => s !== sym) : [...p, sym]);

  const reset = () => {
    setCash(DEFAULTS.cash);
    setHoldings(DEFAULTS.holdings);
    setWatchlist(DEFAULTS.watchlist);
    setHistory(DEFAULTS.history);
  };

  return (
    <Ctx.Provider value={{ cash, holdings, watchlist, history, buy, sell, toggleWatch, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
