import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

// Disable native screens on web — fixes static export crash
if (Platform.OS === 'web') {
  require('react-native-screens').enableScreens(false);
}

import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppProvider } from './src/context/AppContext';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import MarketScreen from './src/screens/MarketScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const ICONS = { Home: 'pie-chart-outline', Market: 'trending-up-outline', Insights: 'bulb-outline', Settings: 'cog-outline' };

function MainApp() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { backgroundColor: '#000', borderTopColor: '#151515', borderTopWidth: 1, height: 80, paddingTop: 8, paddingBottom: 24 },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#444',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
          tabBarIcon: ({ color }) => <Ionicons name={ICONS[route.name]} size={20} color={color} />,
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Market" component={MarketScreen} />
        <Tab.Screen name="Insights" component={InsightsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function Root() {
  const { isSignedIn, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return isSignedIn ? (
    <AppProvider>
      <MainApp />
    </AppProvider>
  ) : (
    <LoginScreen />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}
