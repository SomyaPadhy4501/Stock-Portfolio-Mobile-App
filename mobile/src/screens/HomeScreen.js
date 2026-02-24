import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Alert, TextInput, Modal, Dimensions, ActivityIndicator
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { getQuote, ML_URL as ML } from '../api';

const W = Dimensions.get('window').width;

const REC = {
  strong_buy: { label: 'STRONG BUY', color: '#34C759', icon: 'arrow-up-circle' },
  buy: { label: 'BUY', color: '#34C759', icon: 'trending-up' },
  hold: { label: 'HOLD', color: '#FFB300', icon: 'pause-circle' },
  sell: { label: 'SELL', color: '#FF3B30', icon: 'trending-down' },
  strong_sell: { label: 'SELL', color: '#FF3B30', icon: 'arrow-down-circle' },
};
const SIG_COLOR = { bullish: '#34C759', bearish: '#FF3B30', neutral: '#666' };

function DonutChart({ slices, size }) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  let a = -Math.PI / 2;
  const cols = ['#34C759','#007AFF','#FF9500','#FF3B30','#AF52DE','#5AC8FA','#FFD60A','#FF6482'];
  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => {
        const ang = (s.pct / 100) * Math.PI * 2, end = a + ang;
        const x1 = cx + r*Math.cos(a), y1 = cy + r*Math.sin(a);
        const x2 = cx + r*Math.cos(end), y2 = cy + r*Math.sin(end);
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${ang > Math.PI?1:0} 1 ${x2} ${y2} Z`;
        a = end;
        return <Path key={i} d={d} fill={cols[i%cols.length]} />;
      })}
      <Circle cx={cx} cy={cy} r={r*0.55} fill="#000" />
    </Svg>
  );
}

export default function HomeScreen() {
  const { cash, holdings, history, buy, sell } = useApp();
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);

  // Stock detail modal
  const [stockModal, setStockModal] = useState(null); // holding object
  const [tradeMode, setTradeMode] = useState(null); // 'buy' | 'sell' | null
  const [tradeQty, setTradeQty] = useState('');

  // Insights modal
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsFetched, setInsightsFetched] = useState(false);

  const fetchPrices = async () => {
    if (!holdings.length) return;
    setLoading(true);
    const p = {};
    for (const h of holdings) {
      try { const q = await getQuote(h.symbol); if (q?.c > 0) p[h.symbol] = q; } catch {}
    }
    setPrices(p);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchPrices(); }, [holdings.length]));

  // Calcs
  const investedValue = holdings.reduce((s, h) => s + h.qty * (prices[h.symbol]?.c || h.avgPrice), 0);
  const totalValue = cash + investedValue;
  const totalCost = holdings.reduce((s, h) => s + h.qty * h.avgPrice, 0);
  const totalPnL = investedValue - totalCost;
  const pnlPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const pos = totalPnL >= 0;

  const alloc = holdings.map(h => {
    const v = h.qty * (prices[h.symbol]?.c || h.avgPrice);
    return { label: h.symbol, value: v, pct: investedValue > 0 ? (v / investedValue) * 100 : 0 };
  }).sort((a, b) => b.value - a.value);
  const cols = ['#34C759','#007AFF','#FF9500','#FF3B30','#AF52DE','#5AC8FA','#FFD60A','#FF6482'];

  // Open stock detail
  const openStock = (h) => {
    setStockModal(h);
    setTradeMode(null);
    setTradeQty('');
  };

  // Trade
  const handleTrade = () => {
    const qty = parseFloat(tradeQty);
    if (!qty || qty <= 0) return Alert.alert('Invalid', 'Enter a valid quantity.');
    const price = prices[stockModal.symbol]?.c || stockModal.avgPrice;

    if (tradeMode === 'buy') {
      const total = qty * price;
      if (total > cash) return Alert.alert('Insufficient', `Need $${total.toFixed(2)}, have $${cash.toFixed(2)}`);
      if (buy(stockModal.symbol, stockModal.name, qty, price)) {
        Alert.alert('Bought!', `${qty} shares of ${stockModal.symbol}`);
        setStockModal(null); fetchPrices();
      }
    } else {
      if (stockModal.qty < qty) return Alert.alert('Error', `You only have ${stockModal.qty} shares.`);
      if (sell(stockModal.symbol, qty, price)) {
        Alert.alert('Sold!', `${qty} shares of ${stockModal.symbol}`);
        setStockModal(null); fetchPrices();
      }
    }
  };

  // Fetch insights
  const openInsights = async () => {
    setInsightsOpen(true);
    if (insightsFetched) return;
    setInsightsLoading(true);
    try {
      const syms = holdings.map(h => h.symbol).join(',');
      const res = await fetch(`${ML}/api/insights/my?symbols=${syms}`);
      const data = await res.json();
      if (data.predictions) {
        const enriched = data.predictions.map(p => {
          if (typeof p.signals === 'string') try { p.signals = JSON.parse(p.signals); } catch { p.signals = []; }
          const h = holdings.find(x => x.symbol === p.symbol);
          if (h && p.price) { p.qty = h.qty; p.avgPrice = h.avgPrice; p.pnl = ((p.price - h.avgPrice) / h.avgPrice) * 100; }
          return p;
        });
        setInsights(enriched);
        setInsightsFetched(true);
      }
    } catch (e) {
      console.log('Insights error:', e);
    }
    setInsightsLoading(false);
  };

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPrices} tintColor="#fff" />}>

        <View style={s.header}><Text style={s.title}>StockAI</Text></View>

        {/* Portfolio Value */}
        <View style={s.card}>
          <Text style={s.label}>Portfolio Value</Text>
          <Text style={s.bigNum}>${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <View style={[s.pnlBadge, { backgroundColor: pos ? '#0d2b0d' : '#2b0d0d', marginTop: 6 }]}>
            <Ionicons name={pos ? 'trending-up' : 'trending-down'} size={14} color={pos ? '#34C759' : '#FF3B30'} />
            <Text style={{ color: pos ? '#34C759' : '#FF3B30', fontWeight: '600', fontSize: 14 }}>
              {' '}{pos ? '+' : ''}${Math.abs(totalPnL).toFixed(2)} ({pos ? '+' : ''}{pnlPct.toFixed(2)}%)
            </Text>
          </View>
          <View style={s.statsRow}>
            <View style={s.stat}><Text style={s.statL}>Cash</Text><Text style={s.statV}>${cash.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text></View>
            <View style={[s.stat, s.statB]}><Text style={s.statL}>Invested</Text><Text style={s.statV}>${investedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text></View>
            <View style={s.stat}><Text style={s.statL}>Positions</Text><Text style={s.statV}>{holdings.length}</Text></View>
          </View>
        </View>

        {/* ============ MY STOCKS CARD ============ */}
        {holdings.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <Text style={s.cardTitle}>My Stocks</Text>
              <Text style={s.cardCount}>{holdings.length}</Text>
            </View>
            {holdings.map((h, i) => {
              const q = prices[h.symbol];
              const cur = q?.c || h.avgPrice;
              const pnl = ((cur - h.avgPrice) / h.avgPrice) * 100;
              const isUp = pnl >= 0;
              return (
                <TouchableOpacity key={h.symbol} style={[s.stockRow, i === 0 && { borderTopWidth: 0 }]}
                  onPress={() => openStock(h)} activeOpacity={0.6}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.stockSym}>{h.symbol}</Text>
                      <Text style={s.stockQty}>{h.qty} shares</Text>
                    </View>
                    <Text style={s.stockName} numberOfLines={1}>{h.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.stockPrice}>${cur.toFixed(2)}</Text>
                    <Text style={{ color: isUp ? '#34C759' : '#FF3B30', fontSize: 12, fontWeight: '600' }}>
                      {isUp ? '+' : ''}{pnl.toFixed(2)}%
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#333" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ============ INSIGHTS CARD ============ */}
        {holdings.length > 0 && (
          <TouchableOpacity style={s.insightCard} onPress={openInsights} activeOpacity={0.7}>
            <View style={s.insightLeft}>
              <View style={s.insightIcon}>
                <Ionicons name="bulb" size={20} color="#FFB300" />
              </View>
              <View>
                <Text style={s.insightTitle}>AI Insights</Text>
                <Text style={s.insightSub}>ML analysis on your {holdings.length} stocks</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
        )}

        {/* Allocation */}
        {holdings.length > 1 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Allocation</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <DonutChart slices={alloc} size={110} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                {alloc.slice(0, 6).map((sl, i) => (
                  <View key={sl.label} style={s.legRow}>
                    <View style={[s.legDot, { backgroundColor: cols[i % cols.length] }]} />
                    <Text style={s.legLabel}>{sl.label}</Text>
                    <Text style={s.legPct}>{sl.pct.toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Recent */}
        {history.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Recent Activity</Text>
            {history.slice(0, 5).map((tx, i) => (
              <View key={i} style={s.txRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={tx.type === 'buy' ? 'arrow-down-circle' : 'arrow-up-circle'} size={18}
                    color={tx.type === 'buy' ? '#34C759' : '#FF3B30'} />
                  <View>
                    <Text style={s.txAction}>{tx.type === 'buy' ? 'Bought' : 'Sold'} {tx.symbol}</Text>
                    <Text style={s.txDetail}>{tx.qty} @ ${tx.price.toFixed(2)}</Text>
                  </View>
                </View>
                <Text style={{ color: tx.type === 'buy' ? '#FF3B30' : '#34C759', fontWeight: '600', fontSize: 13 }}>
                  {tx.type === 'buy' ? '-' : '+'}${(tx.qty * tx.price).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {holdings.length === 0 && (
          <View style={s.emptyCard}>
            <Ionicons name="briefcase-outline" size={40} color="#333" />
            <Text style={s.emptyTitle}>Portfolio is empty</Text>
            <Text style={s.emptyBody}>Go to Market to buy stocks!</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ============ STOCK DETAIL MODAL ============ */}
      <Modal visible={!!stockModal} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.modal}>
            {stockModal && (() => {
              const q = prices[stockModal.symbol];
              const cur = q?.c || stockModal.avgPrice;
              const pnl = ((cur - stockModal.avgPrice) / stockModal.avgPrice) * 100;
              const pnlD = (cur - stockModal.avgPrice) * stockModal.qty;
              const val = stockModal.qty * cur;
              const isUp = pnl >= 0;
              const dayPct = q?.dp || 0;
              const maxBuy = Math.floor(cash / cur);
              const maxSell = stockModal.qty;

              return (
                <>
                  <View style={s.mHeader}>
                    <View>
                      <Text style={s.mSym}>{stockModal.symbol}</Text>
                      <Text style={s.mName}>{stockModal.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setStockModal(null)}>
                      <Ionicons name="close" size={24} color="#888" />
                    </TouchableOpacity>
                  </View>

                  <Text style={s.mPrice}>${cur.toFixed(2)}</Text>
                  <Text style={{ color: dayPct >= 0 ? '#34C759' : '#FF3B30', fontSize: 14, fontWeight: '600', marginTop: 2 }}>
                    {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}% today
                  </Text>

                  {/* Holdings info */}
                  <View style={s.mInfoGrid}>
                    <View style={s.mInfoItem}><Text style={s.mInfoL}>Shares</Text><Text style={s.mInfoV}>{stockModal.qty}</Text></View>
                    <View style={s.mInfoItem}><Text style={s.mInfoL}>Avg Cost</Text><Text style={s.mInfoV}>${stockModal.avgPrice.toFixed(2)}</Text></View>
                    <View style={s.mInfoItem}><Text style={s.mInfoL}>Value</Text><Text style={s.mInfoV}>${val.toFixed(0)}</Text></View>
                    <View style={s.mInfoItem}>
                      <Text style={s.mInfoL}>P&L</Text>
                      <Text style={[s.mInfoV, { color: isUp ? '#34C759' : '#FF3B30' }]}>
                        {isUp ? '+' : ''}{pnl.toFixed(1)}% ({isUp ? '+' : '-'}${Math.abs(pnlD).toFixed(0)})
                      </Text>
                    </View>
                  </View>

                  {/* Trade mode selector */}
                  {!tradeMode ? (
                    <View style={s.mActions}>
                      <TouchableOpacity style={s.mBuyBtn} onPress={() => setTradeMode('buy')}>
                        <Ionicons name="add-circle-outline" size={18} color="#34C759" />
                        <Text style={s.mBuyText}>Buy More</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.mSellBtn} onPress={() => setTradeMode('sell')}>
                        <Ionicons name="remove-circle-outline" size={18} color="#FF3B30" />
                        <Text style={s.mSellText}>Sell</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.mTradeSection}>
                      <View style={s.mTradeHeader}>
                        <Text style={s.mTradeTitle}>{tradeMode === 'buy' ? 'Buy More' : 'Sell Shares'}</Text>
                        <TouchableOpacity onPress={() => { setTradeMode(null); setTradeQty(''); }}>
                          <Text style={s.mCancel}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={s.mTradeSub}>
                        {tradeMode === 'buy' ? `Cash: $${cash.toFixed(2)} · Max ${maxBuy} shares` : `Holding: ${maxSell} shares`}
                      </Text>
                      <TextInput style={s.mInput} value={tradeQty} onChangeText={setTradeQty}
                        placeholder="Quantity" placeholderTextColor="#555" keyboardType="decimal-pad" />
                      <View style={s.quickRow}>
                        {[0.25, 0.5, 0.75, 1].map(pct => {
                          const max = tradeMode === 'buy' ? maxBuy : maxSell;
                          const qty = tradeMode === 'buy' ? Math.floor(max * pct) : Math.floor(max * pct);
                          if (qty <= 0) return null;
                          return (
                            <TouchableOpacity key={pct} style={s.quickBtn} onPress={() => setTradeQty(String(qty))}>
                              <Text style={s.quickText}>{pct === 1 ? 'Max' : `${pct * 100}%`}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {tradeQty ? (
                        <Text style={s.mTotal}>Total: ${(parseFloat(tradeQty || 0) * cur).toFixed(2)}</Text>
                      ) : null}
                      <TouchableOpacity style={[s.mExecBtn, { backgroundColor: tradeMode === 'buy' ? '#34C759' : '#FF3B30' }]}
                        onPress={handleTrade}>
                        <Text style={s.mExecText}>{tradeMode === 'buy' ? 'Buy' : 'Sell'} {stockModal.symbol}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ============ INSIGHTS MODAL ============ */}
      <Modal visible={insightsOpen} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={[s.modal, { maxHeight: '85%' }]}>
            <View style={s.mHeader}>
              <View>
                <Text style={s.mSym}>AI Insights</Text>
                <Text style={s.mName}>Powered by AI · Your {holdings.length} stocks</Text>
              </View>
              <TouchableOpacity onPress={() => setInsightsOpen(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {insightsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: '#555', marginTop: 12 }}>Running ML analysis...</Text>
                </View>
              ) : insights.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="server-outline" size={36} color="#333" />
                  <Text style={{ color: '#888', marginTop: 10, fontSize: 14 }}>No insights available</Text>
                  <Text style={{ color: '#444', marginTop: 4, fontSize: 12 }}>Make sure ML service is running</Text>
                </View>
              ) : (
                insights.map(item => {
                  const r = REC[item.prediction] || REC.hold;
                  const signals = Array.isArray(item.signals) ? item.signals : [];
                  return (
                    <View key={item.symbol} style={s.iCard}>
                      <View style={s.iHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name={r.icon} size={20} color={r.color} />
                          <Text style={s.iSym}>{item.symbol}</Text>
                          {item.price > 0 && <Text style={s.iPrice}>${item.price.toFixed(2)}</Text>}
                        </View>
                        <View style={[s.iBadge, { backgroundColor: r.color + '18' }]}>
                          <Text style={[s.iBadgeText, { color: r.color }]}>{r.label}</Text>
                        </View>
                      </View>

                      {item.pnl !== undefined && (
                        <Text style={{ color: item.pnl >= 0 ? '#34C759' : '#FF3B30', fontSize: 13, fontWeight: '600', marginTop: 6 }}>
                          Your P&L: {item.pnl >= 0 ? '+' : ''}{item.pnl.toFixed(1)}% · {item.qty} shares
                        </Text>
                      )}

                      <View style={s.iBarRow}>
                        <Text style={s.iBarLabel}>5-Day Up</Text>
                        <View style={s.iBarBg}>
                          <View style={[s.iBarFill, {
                            width: `${(item.probability || 0.5) * 100}%`,
                            backgroundColor: (item.probability || 0.5) >= 0.55 ? '#34C759' : (item.probability || 0.5) <= 0.45 ? '#FF3B30' : '#FFB300'
                          }]} />
                        </View>
                        <Text style={s.iBarPct}>{((item.probability || 0.5) * 100).toFixed(0)}%</Text>
                      </View>

                      {signals.length > 0 && signals.slice(0, 4).map((sig, i) => (
                        <View key={i} style={s.iSigRow}>
                          <View style={[s.iSigDot, { backgroundColor: SIG_COLOR[sig.type] || '#666' }]} />
                          <Text style={s.iSigText}>{sig.text}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },

  card: { backgroundColor: '#111', marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16 },
  label: { color: '#555', fontSize: 12 },
  bigNum: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 },
  pnlBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statsRow: { flexDirection: 'row', marginTop: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statB: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#222' },
  statL: { color: '#555', fontSize: 11 },
  statV: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 3 },

  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardCount: { color: '#444', fontSize: 13 },

  // Stock rows in card
  stockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1a1a1a' },
  stockSym: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stockQty: { color: '#444', fontSize: 11 },
  stockName: { color: '#444', fontSize: 11, marginTop: 2, maxWidth: 180 },
  stockPrice: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Insights button card
  insightCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111', marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16 },
  insightLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  insightIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFB30015', justifyContent: 'center', alignItems: 'center' },
  insightTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  insightSub: { color: '#555', fontSize: 12, marginTop: 2 },

  // Allocation
  legRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  legDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legLabel: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  legPct: { color: '#888', fontSize: 11 },

  // Activity
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1a1a1a' },
  txAction: { color: '#fff', fontSize: 13, fontWeight: '600' },
  txDetail: { color: '#555', fontSize: 11, marginTop: 1 },

  emptyCard: { alignItems: 'center', paddingVertical: 50, marginTop: 20 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyBody: { color: '#555', fontSize: 13, marginTop: 4 },

  // ===== Modals =====
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  mHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  mSym: { color: '#fff', fontSize: 22, fontWeight: '800' },
  mName: { color: '#888', fontSize: 13, marginTop: 2 },
  mPrice: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },

  mInfoGrid: { flexDirection: 'row', backgroundColor: '#0a0a0a', borderRadius: 10, padding: 12, marginTop: 14 },
  mInfoItem: { flex: 1, alignItems: 'center' },
  mInfoL: { color: '#444', fontSize: 10 },
  mInfoV: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 3 },

  mActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  mBuyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#1a3a1a', backgroundColor: '#0d1f0d' },
  mBuyText: { color: '#34C759', fontSize: 15, fontWeight: '600' },
  mSellBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#3a1a1a', backgroundColor: '#1f0d0d' },
  mSellText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },

  mTradeSection: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  mTradeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mTradeTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  mCancel: { color: '#007AFF', fontSize: 14 },
  mTradeSub: { color: '#555', fontSize: 12, marginTop: 4 },
  mInput: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#222', marginTop: 10 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn: { flex: 1, backgroundColor: '#1a1a1a', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  quickText: { color: '#888', fontSize: 12, fontWeight: '600' },
  mTotal: { color: '#888', fontSize: 14, marginTop: 8 },
  mExecBtn: { borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 14 },
  mExecText: { color: '#000', fontSize: 16, fontWeight: '700' },

  // ===== Insights Modal =====
  iCard: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 14, marginBottom: 10 },
  iHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iSym: { color: '#fff', fontSize: 16, fontWeight: '800' },
  iPrice: { color: '#666', fontSize: 13 },
  iBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  iBadgeText: { fontSize: 10, fontWeight: '800' },
  iBarRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  iBarLabel: { color: '#555', fontSize: 11, width: 55 },
  iBarBg: { flex: 1, height: 5, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  iBarFill: { height: 5, borderRadius: 3 },
  iBarPct: { color: '#fff', fontSize: 11, fontWeight: '700', width: 30, textAlign: 'right' },
  iSigRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, gap: 6 },
  iSigDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  iSigText: { color: '#777', fontSize: 12, flex: 1, lineHeight: 17 },
});
