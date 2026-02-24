import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

const ML = 'http://localhost:8000';

const REC = {
  strong_buy: { label: 'STRONG BUY', color: '#34C759', icon: 'arrow-up-circle' },
  buy: { label: 'BUY', color: '#34C759', icon: 'trending-up' },
  hold: { label: 'HOLD', color: '#FFB300', icon: 'pause-circle' },
  sell: { label: 'SELL', color: '#FF3B30', icon: 'trending-down' },
  strong_sell: { label: 'SELL', color: '#FF3B30', icon: 'arrow-down-circle' },
};
const SIG_COLOR = { bullish: '#34C759', bearish: '#FF3B30', neutral: '#666' };

function parseSignals(p) {
  if (typeof p.signals === 'string') {
    try { p.signals = JSON.parse(p.signals); } catch { p.signals = []; }
  }
  if (!Array.isArray(p.signals)) p.signals = [];
  return p;
}

function enrichWithHolding(p, holdings) {
  const h = holdings.find(x => x.symbol === p.symbol);
  if (h && p.price) {
    p.qty = h.qty;
    p.avgPrice = h.avgPrice;
    p.totalValue = h.qty * p.price;
    p.pnl = ((p.price - h.avgPrice) / h.avgPrice) * 100;
  }
  return p;
}

export default function InsightsScreen() {
  const { holdings } = useApp();
  const [tab, setTab] = useState('my');
  const [myData, setMyData] = useState([]);
  const [discoverData, setDiscoverData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initialFetched = useRef(false);
  const prevSymbols = useRef([]); // track which symbols we already have

  // Full fetch — runs once on first load
  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // My stocks
      if (holdings.length > 0) {
        const syms = holdings.map(h => h.symbol).join(',');
        const res = await fetch(`${ML}/api/insights/my?symbols=${syms}`);
        const data = await res.json();
        if (data.predictions) {
          const enriched = data.predictions.map(p => enrichWithHolding(parseSignals(p), holdings));
          setMyData(enriched);
          prevSymbols.current = enriched.map(p => p.symbol);
        }
      }

      // Discover
      const res2 = await fetch(`${ML}/api/insights/discover`);
      const data2 = await res2.json();
      if (data2.predictions) {
        const heldSyms = holdings.map(h => h.symbol);
        const disc = data2.predictions
          .filter(p => !heldSyms.includes(p.symbol))
          .map(p => parseSignals(p));
        setDiscoverData(disc);
      }

      initialFetched.current = true;
    } catch (e) {
      console.log('ML error:', e);
      setError('ML service offline. Run: cd ml-service && python server.py');
    }
    setLoading(false);
  };

  // Initial fetch — once
  useEffect(() => {
    if (!initialFetched.current) {
      fetchAll();
    }
  }, []);

  // Watch for NEW stocks added to portfolio — fetch only the new one
  useEffect(() => {
    if (!initialFetched.current) return; // don't run before initial fetch
    if (holdings.length === 0) return;

    const currentSymbols = holdings.map(h => h.symbol);
    const newSymbols = currentSymbols.filter(s => !prevSymbols.current.includes(s));

    if (newSymbols.length === 0) {
      // No new stocks, but qty/avgPrice might have changed — update existing cards
      setMyData(prev => prev.map(p => enrichWithHolding({ ...p }, holdings)));
      return;
    }

    // Fetch prediction for each new stock and append
    (async () => {
      for (const sym of newSymbols) {
        try {
          const res = await fetch(`${ML}/api/insights/${sym}`);
          const pred = await res.json();
          if (pred && pred.symbol) {
            const enriched = enrichWithHolding(parseSignals(pred), holdings);
            setMyData(prev => [...prev, enriched]);
            // Also remove from discover since user now owns it
            setDiscoverData(prev => prev.filter(p => p.symbol !== sym));
          }
        } catch (e) {
          console.log(`Failed to fetch insight for ${sym}:`, e);
        }
      }
      prevSymbols.current = currentSymbols;
    })();
  }, [holdings]);

  const data = tab === 'my' ? myData : discoverData;

  const renderCard = (item) => {
    const r = REC[item.prediction] || REC.hold;
    const signals = Array.isArray(item.signals) ? item.signals : [];
    const prob = item.probability || 0.5;
    const conf = item.confidence || 0.5;

    return (
      <View key={item.symbol} style={s.card}>
        <View style={s.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[s.iconWrap, { backgroundColor: r.color + '15' }]}>
              <Ionicons name={r.icon} size={20} color={r.color} />
            </View>
            <View>
              <Text style={s.sym}>{item.symbol}</Text>
              {item.price > 0 && <Text style={s.priceSmall}>${item.price.toFixed(2)}</Text>}
            </View>
          </View>
          <View style={[s.badge, { backgroundColor: r.color + '18' }]}>
            <Text style={[s.badgeText, { color: r.color }]}>{r.label}</Text>
          </View>
        </View>

        {item.qty && (
          <View style={s.portfolioBox}>
            <View style={s.pItem}><Text style={s.pLabel}>Shares</Text><Text style={s.pVal}>{item.qty}</Text></View>
            <View style={s.pItem}><Text style={s.pLabel}>Avg Cost</Text><Text style={s.pVal}>${item.avgPrice?.toFixed(2)}</Text></View>
            <View style={s.pItem}><Text style={s.pLabel}>Value</Text><Text style={s.pVal}>${item.totalValue?.toFixed(0)}</Text></View>
            <View style={s.pItem}>
              <Text style={s.pLabel}>P&L</Text>
              <Text style={[s.pVal, { color: item.pnl >= 0 ? '#34C759' : '#FF3B30' }]}>
                {item.pnl >= 0 ? '+' : ''}{item.pnl?.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        <View style={s.barsSection}>
          <View style={s.barRow}>
            <Text style={s.barLabel}>5-Day Up Probability</Text>
            <View style={s.barBg}>
              <View style={[s.barFill, {
                width: `${prob * 100}%`,
                backgroundColor: prob >= 0.55 ? '#34C759' : prob <= 0.45 ? '#FF3B30' : '#FFB300'
              }]} />
            </View>
            <Text style={s.barPct}>{(prob * 100).toFixed(0)}%</Text>
          </View>
          <View style={s.barRow}>
            <Text style={s.barLabel}>Model Accuracy</Text>
            <View style={s.barBg}>
              <View style={[s.barFill, {
                width: `${conf * 100}%`,
                backgroundColor: conf >= 0.58 ? '#34C759' : conf >= 0.52 ? '#FFB300' : '#FF3B30'
              }]} />
            </View>
            <Text style={s.barPct}>{(conf * 100).toFixed(0)}%</Text>
          </View>
        </View>

        {(item.rsi != null || item.momentum_5d != null || item.volatility != null) && (
          <View style={s.techRow}>
            {item.rsi != null && <View style={s.techPill}><Text style={s.techText}>RSI {item.rsi}</Text></View>}
            {item.momentum_5d != null && (
              <View style={s.techPill}>
                <Text style={[s.techText, { color: item.momentum_5d >= 0 ? '#34C759' : '#FF3B30' }]}>
                  5d {item.momentum_5d >= 0 ? '+' : ''}{item.momentum_5d}%
                </Text>
              </View>
            )}
            {item.momentum_20d != null && (
              <View style={s.techPill}>
                <Text style={[s.techText, { color: item.momentum_20d >= 0 ? '#34C759' : '#FF3B30' }]}>
                  20d {item.momentum_20d >= 0 ? '+' : ''}{item.momentum_20d}%
                </Text>
              </View>
            )}
            {item.volatility != null && (
              <View style={s.techPill}><Text style={s.techText}>Vol {(item.volatility * 100).toFixed(0)}%</Text></View>
            )}
          </View>
        )}

        {signals.length > 0 && (
          <View style={s.signalsBox}>
            {signals.map((sig, i) => (
              <View key={i} style={s.sigRow}>
                <View style={[s.sigDot, { backgroundColor: SIG_COLOR[sig.type] || '#666' }]} />
                <Text style={s.sigText}>{sig.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Insights</Text>
        <Text style={s.subtitle}>Powered by AI</Text>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'my' && s.tabOn]} onPress={() => setTab('my')}>
          <Ionicons name="briefcase-outline" size={14} color={tab === 'my' ? '#000' : '#666'} />
          <Text style={[s.tabText, tab === 'my' && s.tabTextOn]}>My Stocks ({myData.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'discover' && s.tabOn]} onPress={() => setTab('discover')}>
          <Ionicons name="compass-outline" size={14} color={tab === 'discover' ? '#000' : '#666'} />
          <Text style={[s.tabText, tab === 'discover' && s.tabTextOn]}>Discover ({discoverData.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#fff" />}
      >
        {loading && data.length === 0 ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={s.loadingText}>
              {tab === 'my' ? 'Analyzing your portfolio...' : 'Running ML on 50+ stocks...'}
            </Text>
          </View>
        ) : error && data.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="server-outline" size={44} color="#333" />
            <Text style={s.emptyTitle}>ML Service Offline</Text>
            <Text style={s.emptyBody}>{error}</Text>
          </View>
        ) : data.length === 0 && !loading ? (
          <View style={s.center}>
            <Ionicons name={tab === 'my' ? 'briefcase-outline' : 'compass-outline'} size={44} color="#333" />
            <Text style={s.emptyTitle}>{tab === 'my' ? 'No stocks to analyze' : 'No predictions yet'}</Text>
            <Text style={s.emptyBody}>{tab === 'my' ? 'Buy stocks from Market first.' : 'Pull to refresh.'}</Text>
          </View>
        ) : (
          data.map(renderCard)
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#444', fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#111', borderRadius: 10, padding: 3, marginTop: 8, marginBottom: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: '#000' },
  center: { alignItems: 'center', paddingVertical: 50 },
  loadingText: { color: '#888', marginTop: 14, fontSize: 14 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyBody: { color: '#555', fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  card: { backgroundColor: '#111', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sym: { color: '#fff', fontSize: 17, fontWeight: '800' },
  priceSmall: { color: '#888', fontSize: 13, marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  portfolioBox: { flexDirection: 'row', backgroundColor: '#0a0a0a', borderRadius: 8, padding: 10, marginTop: 12 },
  pItem: { flex: 1, alignItems: 'center' },
  pLabel: { color: '#444', fontSize: 10 },
  pVal: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },
  barsSection: { marginTop: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barLabel: { color: '#555', fontSize: 11, width: 120 },
  barBg: { flex: 1, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barPct: { color: '#fff', fontSize: 12, fontWeight: '700', width: 35, textAlign: 'right' },
  techRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  techPill: { backgroundColor: '#1a1a1a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  techText: { color: '#888', fontSize: 11, fontWeight: '600' },
  signalsBox: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1a1a1a' },
  sigRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, gap: 8 },
  sigDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  sigText: { color: '#888', fontSize: 13, flex: 1, lineHeight: 18 },
});
