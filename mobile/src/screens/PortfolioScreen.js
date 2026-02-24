import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Alert, TextInput, Modal
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { getBatchQuotes } from '../api';
import { C } from '../theme';

export default function PortfolioScreen() {
  const { cash, holdings, sellStock } = useApp();
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [sellModal, setSellModal] = useState(null); // { symbol, price }
  const [sellQty, setSellQty] = useState('');

  const fetchPrices = async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    try {
      const symbols = holdings.map(h => h.symbol);
      const quotes = await getBatchQuotes(symbols);
      setPrices(quotes);
    } catch (e) { console.log('Price fetch error:', e); }
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchPrices(); }, [holdings.length]));

  const totalInvested = holdings.reduce((s, h) => {
    const p = prices[h.symbol]?.c || h.avgPrice;
    return s + h.qty * p;
  }, 0);
  const totalValue = cash + totalInvested;

  const handleSell = () => {
    const qty = parseFloat(sellQty);
    if (!qty || qty <= 0) return Alert.alert('Invalid', 'Enter a valid quantity.');
    const ok = sellStock(sellModal.symbol, qty, sellModal.price);
    if (!ok) return Alert.alert('Error', 'Not enough shares.');
    Alert.alert('Sold', `Sold ${qty} shares of ${sellModal.symbol}`);
    setSellModal(null);
    setSellQty('');
  };

  return (
    <View style={s.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPrices} tintColor={C.white} />}
      >
        <Text style={s.header}>Portfolio</Text>

        {/* Value Card */}
        <View style={s.card}>
          <Text style={s.label}>Total Value</Text>
          <Text style={s.bigNum}>${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          <View style={s.row}>
            <View style={s.stat}>
              <Text style={s.statLabel}>Cash</Text>
              <Text style={s.statVal}>${cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Invested</Text>
              <Text style={s.statVal}>${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Stocks</Text>
              <Text style={s.statVal}>{holdings.length}</Text>
            </View>
          </View>
        </View>

        {/* Holdings */}
        <Text style={s.section}>Holdings</Text>
        {holdings.length === 0 ? (
          <Text style={s.empty}>No stocks yet. Go to Market to buy!</Text>
        ) : (
          holdings.map(h => {
            const quote = prices[h.symbol];
            const cur = quote?.c || h.avgPrice;
            const change = cur - h.avgPrice;
            const changePct = (change / h.avgPrice) * 100;
            const val = h.qty * cur;
            const pos = change >= 0;

            return (
              <TouchableOpacity
                key={h.symbol}
                style={s.stockRow}
                onPress={() => setSellModal({ symbol: h.symbol, price: cur })}
              >
                <View>
                  <Text style={s.ticker}>{h.symbol}</Text>
                  <Text style={s.sub}>{h.qty} shares · avg ${h.avgPrice.toFixed(2)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.price}>${val.toFixed(2)}</Text>
                  <Text style={[s.change, { color: pos ? C.green : C.red }]}>
                    {pos ? '+' : ''}{changePct.toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sell Modal */}
      <Modal visible={!!sellModal} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Sell {sellModal?.symbol}</Text>
            <Text style={s.sub}>Price: ${sellModal?.price?.toFixed(2)}</Text>
            <TextInput
              style={s.input}
              value={sellQty}
              onChangeText={setSellQty}
              placeholder="Quantity"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={[s.btn, { backgroundColor: C.red }]} onPress={handleSell}>
              <Text style={s.btnText}>Sell</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setSellModal(null); setSellQty(''); }}>
              <Text style={[s.sub, { textAlign: 'center', marginTop: 12 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { color: C.white, fontSize: 28, fontWeight: '700', padding: 20, paddingTop: 60 },
  card: { backgroundColor: C.card, margin: 16, borderRadius: 14, padding: 20 },
  label: { color: C.gray, fontSize: 13 },
  bigNum: { color: C.white, fontSize: 32, fontWeight: '800', marginVertical: 4 },
  row: { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: { color: C.muted, fontSize: 12 },
  statVal: { color: C.white, fontSize: 14, fontWeight: '600', marginTop: 2 },
  section: { color: C.white, fontSize: 18, fontWeight: '600', paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
  empty: { color: C.gray, paddingHorizontal: 20 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  ticker: { color: C.white, fontSize: 16, fontWeight: '600' },
  sub: { color: C.gray, fontSize: 13, marginTop: 2 },
  price: { color: C.white, fontSize: 16, fontWeight: '600' },
  change: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { color: C.white, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  input: { backgroundColor: C.input, color: C.white, borderRadius: 10, padding: 14, fontSize: 16, marginTop: 16, borderWidth: 1, borderColor: C.border },
  btn: { borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 16 },
  btnText: { color: C.white, fontSize: 16, fontWeight: '700' },
});
