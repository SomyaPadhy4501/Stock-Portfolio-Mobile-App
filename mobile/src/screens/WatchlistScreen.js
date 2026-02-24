import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { getBatchQuotes } from '../api';
import { C } from '../theme';

export default function WatchlistScreen() {
  const { watchlist, toggleWatchlist } = useApp();
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [addTicker, setAddTicker] = useState('');

  const fetchPrices = async () => {
    if (watchlist.length === 0) return;
    setLoading(true);
    try {
      const quotes = await getBatchQuotes(watchlist);
      setPrices(quotes);
    } catch (e) { console.log(e); }
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchPrices(); }, [watchlist.length]));

  const handleAdd = () => {
    const sym = addTicker.trim().toUpperCase();
    if (!sym) return;
    if (!watchlist.includes(sym)) toggleWatchlist(sym);
    setAddTicker('');
  };

  const renderItem = ({ item: symbol }) => {
    const q = prices[symbol];
    const pos = (q?.dp || 0) >= 0;
    return (
      <View style={s.row}>
        <View>
          <Text style={s.ticker}>{symbol}</Text>
          {q && <Text style={s.sub}>${q.c?.toFixed(2)}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {q && (
            <Text style={[s.change, { color: pos ? C.green : C.red }]}>
              {pos ? '+' : ''}{q.dp?.toFixed(2)}%
            </Text>
          )}
          <TouchableOpacity onPress={() => toggleWatchlist(symbol)}>
            <Ionicons name="close" size={18} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <Text style={s.header}>Watchlist</Text>

      <View style={s.addRow}>
        <TextInput
          style={s.input}
          value={addTicker}
          onChangeText={setAddTicker}
          placeholder="Add ticker (e.g. AAPL)"
          placeholderTextColor={C.muted}
          autoCapitalize="characters"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={s.addBtn} onPress={handleAdd}>
          <Ionicons name="add" size={20} color={C.bg} />
        </TouchableOpacity>
      </View>

      {watchlist.length === 0 ? (
        <Text style={s.empty}>Add stocks to track them here.</Text>
      ) : (
        <FlatList
          data={watchlist}
          keyExtractor={item => item}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPrices} tintColor={C.white} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { color: C.white, fontSize: 28, fontWeight: '700', padding: 20, paddingTop: 60 },
  addRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  input: { flex: 1, backgroundColor: C.input, color: C.white, borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: C.border },
  addBtn: { width: 46, backgroundColor: C.white, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  ticker: { color: C.white, fontSize: 16, fontWeight: '600' },
  sub: { color: C.gray, fontSize: 13, marginTop: 2 },
  change: { fontSize: 14, fontWeight: '600' },
  empty: { color: C.gray, paddingHorizontal: 20, paddingTop: 20 },
});
