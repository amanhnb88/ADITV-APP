import React, { useEffect, useMemo } from 'react';
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
import Fuse from 'fuse.js';

// ==========================================
// 1. STATE SEDERHANA (TANPA MMKV)
// ==========================================
const useStore = create((set) => ({
  channels: [],
  activeChannel: null,
  isLoading: false,
  searchQuery: '',
  setChannels: (channels) => set({ channels }),
  setActiveChannel: (channel) => set({ activeChannel: channel }),
  setLoading: (isLoading) => set({ isLoading }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

// ==========================================
// 2. PARSER M3U
// ==========================================
async function parseM3U(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  let currentChannel = {};

  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      
      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown Channel',
        logo: logoMatch ? logoMatch[1] : null,
        group: groupMatch ? groupMatch[1] : 'Lainnya',
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
// 3. DUAL PLAYER MESIN
// ==========================================
const DualPlayer = ({ channel }) => {
  // Player utama (expo-video)
  const player = useVideoPlayer(channel?.url || null, (p) => {
    p.loop = false;
    if (channel?.url) p.play();
  });

  if (!channel) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.textMuted}>Pilih channel untuk menonton 📺</Text>
      </View>
    );
  }

  // Jika URL butuh proteksi DRM (ClearKey/Widevine)
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

  // Player Standar
  return <VideoView style={styles.video} player={player} allowsFullscreen />;
};

// ==========================================
// 4. MAIN LAYOUT
// ==========================================
export default function App() {
  const { channels, activeChannel, isLoading, searchQuery, setChannels, setActiveChannel, setLoading, setSearchQuery } = useStore();
  const isTV = Platform.isTV;

  useEffect(() => {
    const loadPlaylist = async () => {
      setLoading(true);
      try {
        const res = await fetch('https://iptv-org.github.io/iptv/countries/id.m3u');
        const text = await res.text();
        const parsed = await parseM3U(text);
        setChannels(parsed);
      } catch (e) {
        Alert.alert("Gagal", "Tidak dapat memuat playlist.");
      } finally {
        setLoading(false);
      }
    };
    loadPlaylist();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return channels;
    const fuse = new Fuse(channels, { keys: ['name', 'group'], threshold: 0.3 });
    return fuse.search(searchQuery).map(r => r.item);
  }, [channels, searchQuery]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>ADITV PRO</Text>
        </View>

        {/* MEMANGGIL MESIN PLAYER */}
        <View style={styles.playerSection}>
          <DualPlayer channel={activeChannel} />
        </View>

        <View style={styles.listSection}>
          {!isTV && (
            <TextInput 
              style={styles.input} 
              placeholder="Cari channel..." 
              placeholderTextColor="#555"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          )}

          {isLoading ? (
            <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 20 }} />
          ) : (
            <FlashList
              data={filtered}
              estimatedItemSize={75}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  activeOpacity={0.7}
                  style={[styles.card, activeChannel?.id === item.id && styles.activeCard]}
                  onPress={() => setActiveChannel(item)}
                >
                  <Image 
                    source={item.logo ? { uri: item.logo } : require('./assets/icon2.png')} 
                    style={styles.logo}
                  />
                  <View style={styles.info}>
                    <Text style={[styles.channelName, activeChannel?.id === item.id && styles.textAccent]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.channelGroup}>{item.group}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
  title: { color: '#3b82f6', fontSize: 22, fontWeight: 'bold' },
  playerSection: { height: 250, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
  video: { flex: 1, width: '100%', height: '100%' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listSection: { flex: 1, padding: 10 },
  input: { backgroundColor: '#111', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#1e2d45' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, backgroundColor: '#0d1321', borderRadius: 10 },
  activeCard: { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: '#111827' },
  logo: { width: 45, height: 45, marginRight: 15, borderRadius: 6, backgroundColor: '#000' },
  info: { flex: 1 },
  channelName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  channelGroup: { color: '#64748b', fontSize: 11, marginTop: 2 },
  textAccent: { color: '#3b82f6' },
  textMuted: { color: '#666' }
});
