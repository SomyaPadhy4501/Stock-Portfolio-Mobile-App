import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthCtx = createContext();

// Simple JWT-like token generator (in production, this comes from your backend)
function generateToken(user) {
  const payload = { ...user, iat: Date.now(), exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }; // 30 days
  return btoa(JSON.stringify(payload));
}

function decodeToken(token) {
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp && payload.exp < Date.now()) return null; // expired
    return payload;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { name, email, phone, avatar, provider }
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('stockai_token');
        if (t) {
          const decoded = decodeToken(t);
          if (decoded) {
            setToken(t);
            setUser({ name: decoded.name, email: decoded.email, phone: decoded.phone, provider: decoded.provider });
          } else {
            await AsyncStorage.removeItem('stockai_token');
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const signIn = async ({ name, email, phone, provider }) => {
    const userData = { name, email, phone: phone || '', provider: provider || 'email' };
    const t = generateToken(userData);
    await AsyncStorage.setItem('stockai_token', t);
    setToken(t);
    setUser(userData);
    return userData;
  };

  const updateProfile = async (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    const t = generateToken(updated);
    await AsyncStorage.setItem('stockai_token', t);
    setToken(t);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('stockai_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, token, loading, signIn, signOut, updateProfile, isSignedIn: !!token }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
