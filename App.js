import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ color: '#10b981', fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>
        SAFE MODE AKTIF! 🚀
      </Text>
      <Text style={{ color: '#FFFFFF', fontSize: 16, textAlign: 'center', lineHeight: 24 }}>
        Kalau layar ini berhasil muncul dan tidak force close, berarti masalah utamanya ada di salah satu library (MMKV / Player / Zustand) yang kita pakai sebelumnya.
      </Text>
    </SafeAreaView>
  );
}
