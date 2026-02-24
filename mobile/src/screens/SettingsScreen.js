import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  TextInput, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

const PROVIDER_LABELS = { email: 'Email', google: 'Google', apple: 'Apple' };
const PROVIDER_ICONS = { email: 'mail-outline', google: 'logo-google', apple: 'logo-apple' };

export default function SettingsScreen() {
  const { user, signOut, updateProfile } = useAuth();
  const { cash, holdings, watchlist, history, reset } = useApp();
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const initials = (user?.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  const totalTrades = history.length;
  const buys = history.filter(h => h.type === 'buy').length;
  const sells = history.filter(h => h.type === 'sell').length;

  const openEdit = () => {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setEditPhone(user?.phone || '');
    setEditModal(true);
  };

  const saveProfile = async () => {
    if (!editName.trim()) return Alert.alert('Required', 'Name cannot be empty.');
    await updateProfile({ name: editName.trim(), email: editEmail.trim(), phone: editPhone.trim() });
    setEditModal(false);
    Alert.alert('Saved', 'Profile updated.');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleReset = () => {
    Alert.alert('Reset Portfolio', 'Clear all holdings, watchlist, and history? You\'ll get $100k fresh.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: reset },
    ]);
  };

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}><Text style={s.title}>Settings</Text></View>

        {/* ===== ACCOUNT CARD ===== */}
        <TouchableOpacity style={s.accountCard} onPress={openEdit} activeOpacity={0.7}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user?.name || 'User'}</Text>
            <Text style={s.userEmail}>{user?.email || ''}</Text>
            {user?.phone ? <Text style={s.userPhone}>{user.phone}</Text> : null}
          </View>
          <View style={s.providerBadge}>
            <Ionicons name={PROVIDER_ICONS[user?.provider] || 'person-outline'} size={12} color="#888" />
            <Text style={s.providerText}>{PROVIDER_LABELS[user?.provider] || 'Email'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#333" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        {/* ===== STATISTICS ===== */}
        <Text style={s.section}>STATISTICS</Text>
        <View style={s.card}>
          {[
            ['Cash Balance', `$${cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
            ['Positions Held', holdings.length],
            ['Watchlist Items', watchlist.length],
            ['Total Trades', totalTrades],
            ['Buys / Sells', `${buys} / ${sells}`],
          ].map(([label, val], i, arr) => (
            <View key={label} style={[s.statRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={s.statLabel}>{label}</Text>
              <Text style={s.statVal}>{val}</Text>
            </View>
          ))}
        </View>

        {/* ===== ACTIONS ===== */}
        <Text style={s.section}>ACTIONS</Text>

        <TouchableOpacity style={s.actionRow} onPress={handleReset}>
          <View style={[s.actionIcon, { backgroundColor: '#FF950015' }]}>
            <Ionicons name="refresh-outline" size={18} color="#FF9500" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.actionTitle}>Reset Portfolio</Text>
            <Text style={s.actionSub}>Start fresh with $100k virtual cash</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity style={[s.actionRow, { marginTop: 1 }]} onPress={handleLogout}>
          <View style={[s.actionIcon, { backgroundColor: '#FF3B3015' }]}>
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.actionTitle, { color: '#FF3B30' }]}>Sign Out</Text>
            <Text style={s.actionSub}>You'll need to sign in again</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#333" />
        </TouchableOpacity>

        {/* Footer */}
        <View style={s.footerArea}>
          <Text style={s.footerText}>StockAI v1.0.0</Text>
          <Text style={s.footerText}>Paper trading simulator · No real money</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ===== EDIT PROFILE MODAL ===== */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Avatar preview */}
            <View style={s.editAvatarRow}>
              <View style={s.editAvatar}>
                <Text style={s.editAvatarText}>
                  {(editName || '??').split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)}
                </Text>
              </View>
            </View>

            <Text style={s.fieldLabel}>NAME</Text>
            <TextInput style={s.fieldInput} value={editName} onChangeText={setEditName}
              placeholder="Full Name" placeholderTextColor="#444" />

            <Text style={s.fieldLabel}>EMAIL</Text>
            <TextInput style={s.fieldInput} value={editEmail} onChangeText={setEditEmail}
              placeholder="Email" placeholderTextColor="#444"
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={s.fieldLabel}>PHONE</Text>
            <TextInput style={s.fieldInput} value={editPhone} onChangeText={setEditPhone}
              placeholder="Phone Number" placeholderTextColor="#444"
              keyboardType="phone-pad" />

            <TouchableOpacity style={s.saveBtn} onPress={saveProfile}>
              <Text style={s.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
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

  // Account card
  accountCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111', marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
    borderWidth: 2, borderColor: '#222',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  userName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  userEmail: { color: '#888', fontSize: 13, marginTop: 2 },
  userPhone: { color: '#666', fontSize: 12, marginTop: 1 },
  providerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1a1a1a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  providerText: { color: '#888', fontSize: 10, fontWeight: '600' },

  section: { color: '#555', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 28, marginBottom: 8 },

  card: { backgroundColor: '#111', marginHorizontal: 16, borderRadius: 14, padding: 4, paddingHorizontal: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1a1a1a' },
  statLabel: { color: '#888', fontSize: 14 },
  statVal: { color: '#fff', fontSize: 14, fontWeight: '700' },

  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111', marginHorizontal: 16, borderRadius: 14, padding: 14, gap: 12,
    marginBottom: 2,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionSub: { color: '#555', fontSize: 12, marginTop: 1 },

  footerArea: { alignItems: 'center', marginTop: 30 },
  footerText: { color: '#333', fontSize: 12, marginTop: 2 },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },

  editAvatarRow: { alignItems: 'center', marginBottom: 20 },
  editAvatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#222',
  },
  editAvatarText: { color: '#fff', fontSize: 24, fontWeight: '800' },

  fieldLabel: { color: '#555', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  fieldInput: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#222' },

  saveBtn: { backgroundColor: '#fff', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
