import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEmail = async () => {
    if (!email.trim() || !password.trim()) return Alert.alert('Required', 'Enter email and password.');
    if (mode === 'register' && !name.trim()) return Alert.alert('Required', 'Enter your name.');

    setLoading(true);
    try {
      await signIn({
        name: mode === 'register' ? name.trim() : email.split('@')[0],
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        provider: 'email',
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Sign in failed.');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    // In production, use expo-auth-session with your Google Client ID
    // For now, simulate Google sign in
    Alert.alert(
      'Google Sign In',
      'Google Sign In requires a development build. Use email sign in for testing in Expo Go.',
    );
  };

  const handleApple = async () => {
    Alert.alert(
      'Apple Sign In',
      'Apple Sign In requires a development build. Use email sign in for testing in Expo Go.',
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.logoArea}>
          <View style={s.logoIcon}>
            <Ionicons name="trending-up" size={32} color="#fff" />
          </View>
          <Text style={s.appName}>StockAI</Text>
          <Text style={s.tagline}>Smart trading, simplified.</Text>
        </View>

        {/* Apple */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity style={s.appleBtn} onPress={handleApple} disabled={loading}>
            <Ionicons name="logo-apple" size={18} color="#000" />
            <Text style={s.appleBtnText}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        {/* Google */}
        <TouchableOpacity style={s.googleBtn} onPress={handleGoogle} disabled={loading}>
          <Ionicons name="logo-google" size={16} color="#fff" />
          <Text style={s.googleBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {mode === 'register' && (
          <TextInput style={s.input} value={name} onChangeText={setName}
            placeholder="Full Name" placeholderTextColor="#444" />
        )}

        <TextInput style={s.input} value={email} onChangeText={setEmail}
          placeholder="Email" placeholderTextColor="#444"
          keyboardType="email-address" autoCapitalize="none" />

        {mode === 'register' && (
          <TextInput style={s.input} value={phone} onChangeText={setPhone}
            placeholder="Phone Number (optional)" placeholderTextColor="#444"
            keyboardType="phone-pad" />
        )}

        <View style={s.pwRow}>
          <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={password}
            onChangeText={setPassword} placeholder="Password" placeholderTextColor="#444"
            secureTextEntry={!showPw} />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw(!showPw)}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color="#444" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.submitBtn} onPress={handleEmail} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : (
            <Text style={s.submitText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.toggleRow} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
          <Text style={s.toggleText}>{mode === 'login' ? "Don't have an account? " : "Already have an account? "}</Text>
          <Text style={s.toggleLink}>{mode === 'login' ? 'Sign Up' : 'Sign In'}</Text>
        </TouchableOpacity>

        <Text style={s.footer}>Paper trading with $100k virtual cash.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoArea: { alignItems: 'center', marginBottom: 36 },
  logoIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  appName: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: '#555', fontSize: 14, marginTop: 4 },
  appleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, gap: 10, marginBottom: 10 },
  appleBtnText: { color: '#000', fontSize: 15, fontWeight: '600' },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4285F4', padding: 14, borderRadius: 10, gap: 10, marginBottom: 10 },
  googleBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1a1a1a' },
  dividerText: { color: '#444', marginHorizontal: 14, fontSize: 13 },
  input: { backgroundColor: '#111', color: '#fff', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 12 },
  pwRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  eyeBtn: { position: 'absolute', right: 14 },
  submitBtn: { backgroundColor: '#fff', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 4 },
  submitText: { color: '#000', fontSize: 16, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  toggleText: { color: '#555', fontSize: 14 },
  toggleLink: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  footer: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 30 },
});
