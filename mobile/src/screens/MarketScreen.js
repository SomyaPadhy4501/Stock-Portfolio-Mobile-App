import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, Modal, Alert, AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { getAllUSStocks, getQuote } from '../api';

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms

export default function MarketScreen() {
  const { buy, cash, toggleWatch, watchlist } = useApp();
  const [allStocks, setAllStocks] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState({});
  const [selected, setSelected] = useState(null);
  const [buyQty, setBuyQty] = useState('');
  const [count, setCount] = useState('');

  const pendingRef = useRef(new Set());
  const viewableRef = useRef([]);
  const quotesRef = useRef({}); // mirror of quotes state for interval access
  const fetchingRef = useRef(false);
  const symbolsLoaded = useRef(false);
  const appState = useRef(AppState.currentState);

  // Keep quotesRef in sync
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);

  // 1. Load all US symbols once
  useEffect(() => {
    if (symbolsLoaded.current) return;
    (async () => {
      try {
        const data = await getAllUSStocks();
        const clean = data
          .filter(s => s.type === 'Common Stock' && s.symbol && !s.symbol.includes('.') && !s.symbol.includes('-') && s.symbol.length <= 5 && s.description)
          .map(s => ({ symbol: s.symbol, name: s.description }))
          .sort((a, b) => a.symbol.localeCompare(b.symbol));
        setAllStocks(clean);
        setFiltered(clean);
        setCount(`${clean.length} stocks`);
        symbolsLoaded.current = true;
      } catch (e) { console.log(e); }
      setLoading(false);
    })();
  }, []);

  // 2. Fetch quotes for visible items — only if cache expired
  useEffect(() => {
    const interval = setInterval(async () => {
      if (fetchingRef.current) return;
      const visible = viewableRef.current;
      if (!visible.length) return;

      fetchingRef.current = true;
      for (const sym of visible) {
        if (pendingRef.current.has(sym)) continue;

        // Skip if cached within 1 hour
        const cached = quotesRef.current[sym];
        if (cached && Date.now() - cached._ts < CACHE_DURATION) continue;

        pendingRef.current.add(sym);
        try {
          const q = await getQuote(sym);
          if (q) {
            q._ts = Date.now();
            setQuotes(prev => {
              const next = { ...prev, [sym]: q };
              quotesRef.current = next;
              return next;
            });
          }
        } catch {}
        pendingRef.current.delete(sym);
        await new Promise(r => setTimeout(r, 200));
      }
      fetchingRef.current = false;
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // 3. When app comes back to foreground — clear stale caches
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // App reopened — invalidate all caches so they refresh naturally
        const now = Date.now();
        setQuotes(prev => {
          const cleaned = {};
          for (const sym in prev) {
            // Keep the data but reset timestamp so it re-fetches when visible
            cleaned[sym] = { ...prev[sym], _ts: 0 };
          }
          quotesRef.current = cleaned;
          return cleaned;
        });
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    viewableRef.current = viewableItems.map(v => v.item.symbol);
  }, []);

  const handleSearch = (text) => {
    setSearch(text);
    if (!text.trim()) { setFiltered(allStocks); setCount(`${allStocks.length} stocks`); return; }
    const q = text.toUpperCase();
    const m = allStocks.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q));
    setFiltered(m);
    setCount(`${m.length} results`);
  };

  const handleTap = async (stock) => {
    setSelected({ ...stock, quote: quotes[stock.symbol] || null, loading: true });
    setBuyQty('');
    try {
      const q = await getQuote(stock.symbol);
      if (q) {
        q._ts = Date.now();
        setQuotes(prev => ({ ...prev, [stock.symbol]: q }));
      }
      setSelected({ ...stock, quote: q, loading: false });
    } catch { setSelected(p => p ? { ...p, loading: false } : null); }
  };

  const handleBuy = () => {
    const qty = parseFloat(buyQty);
    if (!qty || qty <= 0) return Alert.alert('Invalid', 'Enter a valid quantity.');
    if (!selected?.quote?.c) return;
    const total = qty * selected.quote.c;
    if (total > cash) return Alert.alert('Insufficient', `Need $${total.toFixed(2)}, have $${cash.toFixed(2)}`);
    const ok = buy(selected.symbol, selected.name, qty, selected.quote.c);
    if (ok) {
      Alert.alert('Bought!', `${qty} shares of ${selected.symbol} at $${selected.quote.c.toFixed(2)}`);
      setSelected(null);
    }
  };

  // Pull-to-refresh — clears all caches so everything re-fetches
  const handleRefresh = () => {
    setQuotes({});
    quotesRef.current = {};
  };

  const fmt = (v) => (!v && v !== 0) ? '—' : `$${v.toFixed(2)}`;

  const renderItem = useCallback(({ item }) => {
    const q = quotes[item.symbol];
    const has = q && q.c > 0;
    const pos = has ? q.d >= 0 : true;

    return (
      <TouchableOpacity style={s.row} onPress={() => handleTap(item)} activeOpacity={0.6}>
        <View style={{ flex: 1 }}>
          <Text style={s.symbol}>{item.symbol}</Text>
          <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        </View>
        {has ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.price}>${q.c.toFixed(2)}</Text>
            <View style={[s.badge, { backgroundColor: pos ? '#0d2b0d' : '#2b0d0d' }]}>
              <Ionicons name={pos ? 'caret-up' : 'caret-down'} size={10} color={pos ? '#34C759' : '#FF3B30'} />
              <Text style={[s.badgeText, { color: pos ? '#34C759' : '#FF3B30' }]}>
                {pos ? '+' : ''}{q.dp?.toFixed(2)}%
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'flex-end' }}>
            <View style={s.shimmer} />
            <View style={[s.shimmer, { width: 40, marginTop: 4 }]} />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [quotes, watchlist]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Market</Text>
        <Text style={s.subtitle}>US Stocks · Cached 1hr</Text>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color="#555" />
        <TextInput style={s.searchInput} value={search} onChangeText={handleSearch}
          placeholder="Search ticker or company..." placeholderTextColor="#444" autoCapitalize="characters" />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={18} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={s.countText}>{loading ? 'Loading...' : count}</Text>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.loadingText}>Loading all US stocks...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered} keyExtractor={i => i.symbol} renderItem={renderItem}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 30, minimumViewTime: 500 }}
          initialNumToRender={20} maxToRenderPerBatch={20} windowSize={10}
          getItemLayout={(_, i) => ({ length: 62, offset: 62 * i, index: i })}
          removeClippedSubviews contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={s.empty}>No stocks found.</Text>}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.modal}>
            {selected && (
              <>
                <View style={s.modalHeader}>
                  <View>
                    <Text style={s.modalSymbol}>{selected.symbol}</Text>
                    <Text style={s.modalName}>{selected.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={24} color="#888" />
                  </TouchableOpacity>
                </View>

                {selected.loading ? (
                  <ActivityIndicator size="large" color="#fff" style={{ marginVertical: 30 }} />
                ) : selected.quote?.c > 0 ? (
                  <View>
                    <Text style={s.modalPrice}>{fmt(selected.quote.c)}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 4,
                      color: (selected.quote.d || 0) >= 0 ? '#34C759' : '#FF3B30' }}>
                      {(selected.quote.d || 0) >= 0 ? '+' : ''}{selected.quote.d?.toFixed(2)} ({(selected.quote.d || 0) >= 0 ? '+' : ''}{selected.quote.dp?.toFixed(2)}%)
                    </Text>

                    <View style={s.detailGrid}>
                      <View style={s.detailItem}><Text style={s.detailLabel}>Open</Text><Text style={s.detailVal}>{fmt(selected.quote.o)}</Text></View>
                      <View style={s.detailItem}><Text style={s.detailLabel}>Prev Close</Text><Text style={s.detailVal}>{fmt(selected.quote.pc)}</Text></View>
                      <View style={s.detailItem}><Text style={s.detailLabel}>High</Text><Text style={s.detailVal}>{fmt(selected.quote.h)}</Text></View>
                      <View style={s.detailItem}><Text style={s.detailLabel}>Low</Text><Text style={s.detailVal}>{fmt(selected.quote.l)}</Text></View>
                    </View>

                    <View style={s.buySection}>
                      <Text style={s.buyLabel}>Cash: ${cash.toFixed(2)}</Text>
                      <View style={s.buyRow}>
                        <TextInput style={s.buyInput} value={buyQty} onChangeText={setBuyQty}
                          placeholder="Qty" placeholderTextColor="#555" keyboardType="decimal-pad" />
                        <TouchableOpacity style={s.buyBtn} onPress={handleBuy}>
                          <Text style={s.buyBtnText}>Buy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.watchBtn} onPress={() => toggleWatch(selected.symbol)}>
                          <Ionicons name={watchlist.includes(selected.symbol) ? 'eye' : 'eye-outline'} size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {buyQty ? <Text style={s.buyTotal}>Total: ${(parseFloat(buyQty || 0) * selected.quote.c).toFixed(2)}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <View style={{ paddingVertical: 24 }}>
                    <Text style={{ color: '#888', fontSize: 16, fontWeight: '600' }}>No real-time data available</Text>
                    <Text style={{ color: '#444', fontSize: 13, marginTop: 6 }}>Market may be closed or stock is thinly traded.</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#444', fontSize: 13, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', marginHorizontal: 16, borderRadius: 10, paddingHorizontal: 12, marginBottom: 4, gap: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 11 },
  countText: { color: '#444', fontSize: 12, paddingHorizontal: 20, paddingVertical: 6 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#444', marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#151515' },
  symbol: { color: '#fff', fontSize: 15, fontWeight: '700' },
  name: { color: '#555', fontSize: 12, marginTop: 1, maxWidth: 200 },
  price: { color: '#fff', fontSize: 15, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginTop: 2, gap: 2 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  shimmer: { width: 60, height: 10, backgroundColor: '#181818', borderRadius: 4 },
  empty: { color: '#444', textAlign: 'center', marginTop: 60 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalSymbol: { color: '#fff', fontSize: 24, fontWeight: '800' },
  modalName: { color: '#888', fontSize: 14, marginTop: 2 },
  modalPrice: { color: '#fff', fontSize: 36, fontWeight: '800' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  detailItem: { width: '50%', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#222' },
  detailLabel: { color: '#555', fontSize: 12 },
  detailVal: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 },
  buySection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#222' },
  buyLabel: { color: '#555', fontSize: 12, marginBottom: 8 },
  buyRow: { flexDirection: 'row', gap: 8 },
  buyInput: { flex: 1, backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#222' },
  buyBtn: { backgroundColor: '#34C759', borderRadius: 10, paddingHorizontal: 24, justifyContent: 'center' },
  buyBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  watchBtn: { backgroundColor: '#222', borderRadius: 10, width: 46, justifyContent: 'center', alignItems: 'center' },
  buyTotal: { color: '#888', fontSize: 13, marginTop: 6 },
});
