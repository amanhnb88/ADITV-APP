import React, { useEffect, useState, useMemo } from 'react';
import { 
  View, Text, StyleSheet, Platform, TouchableOpacity, 
  ActivityIndicator, TextInput, Alert 
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Video from 'react-native-video';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import NetInfo from '@react-native-community/netinfo';
import Fuse from 'fuse.js';

// ==========================================
// 1. STORAGE & STATE MANAGEMENT
// ==========================================
const storage = new MMKV();
const zustandStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};

const useStore = create(
  persist(
    (set) => ({
      channels: [],
      activeChannel: null,
      isLoading: false,
      searchQuery: '',
      setChannels: (channels) => set({ channels }),
      setActiveChannel: (channel) => set({ activeChannel: channel }),
      setLoading: (isLoading) => set({ isLoading }),
      setSearchQuery: (query) => set({ searchQuery: query }),
    }),
    { name: 'aditv-storage', storage: createJSONStorage(() => zustandStorage) }
  )
);

// ==========================================
// 2. PARSER M3U (Defensive Parsing)
// ==========================================
async function parseM3U(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  let currentChannel = {};

  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : null,
        id: Math.random().toString(36).substring(7)
      };
    } else if (line.startsWith('http')) {
      currentChannel.url = line;
      if (currentChannel.name) {
        results.push({ ...currentChannel });
        currentChannel = {};
      }
    }
  }
  return results;
}

// ==========================================
// 3. KOMPONEN UI
// ==========================================

const DualPlayer = ({ channel }) => {
  // Gunakan expo-video sebagai default
  const player = useVideoPlayer(channel?.url || '', (p) => {
    p.loop = false;
    p.play();
  });

  if (!channel) {
    return (
      <View style={styles.placeholder}><Text style={styles.textMuted}>Pilih Saluran</Text></View>
    );
  }

  // Jika DRM terdeteksi, gunakan react-native-video (Hanya jika perlu)
  if (channel.url.includes('clearkey') || channel.url.includes('widevine')) {
    return (
      <Video 
        source={{ uri: channel.url }} 
        style={styles.video} 
        controls={true} 
        resizeMode="contain"
      />
    );
  }

  return <VideoView style={styles.video} player={player} allowsFullscreen />;
};

export default function App() {
  const { channels, activeChannel, isLoading, searchQuery, setChannels, setActiveChannel, setLoading, setSearchQuery } = useStore();
  const isTV = Platform.isTV;

  useEffect(() => {
    const init = async () => {
      if (channels.length > 0) return;
      setLoading(true);
      try {
        const res = await fetch('https://iptv-org.github.io/iptv/countries/id.m3u');
        const text = await res.text();
        const parsed = await parseM3U(text);
        setChannels(parsed);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return channels;
    const fuse = new Fuse(channels, { keys: ['name'] });
    return fuse.search(searchQuery).map(r => r.item);
  }, [channels, searchQuery]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>ADITV PRO</Text>
        </View>

        <View style={styles.playerSection}>
          <DualPlayer channel={activeChannel} />
        </View>

        <View style={styles.listSection}>
          <TextInput 
            style={styles.input} 
            placeholder="Cari..." 
            placeholderTextColor="#666"
            onChangeText={setSearchQuery}
          />
          <FlashList
            data={filtered}
            estimatedItemSize={70}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.card, activeChannel?.id === item.id && styles.activeCard]}
                onPress={() => setActiveChannel(item)}
              >
                <Image 
                  // Ganti ke icon.png jika icon2.png belum ada di repo
                  source={item.logo ? { uri: item.logo } : require('./assets/icon.png')} 
                  style={styles.logo}
                />
                <Text style={styles.channelName}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  title: { color: '#3b82f6', fontSize: 20, fontWeight: 'bold' },
  playerSection: { height: 250, backgroundColor: '#111' },
  video: { flex: 1 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listSection: { flex: 1, padding: 10 },
  input: { backgroundColor: '#111', color: '#fff', padding: 10, borderRadius: 5, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 5, backgroundColor: '#0d1321', borderRadius: 5 },
  activeCard: { borderColor: '#3b82f6', borderWidth: 1 },
  logo: { width: 40, height: 40, marginRight: 10, borderRadius: 5 },
  channelName: { color: '#fff', fontSize: 14 },
  textMuted: { color: '#666' }
});
