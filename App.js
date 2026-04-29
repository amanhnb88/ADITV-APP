import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
// 1. TEMA & KONFIGURASI (Dari Section 10)
// ==========================================
const theme = {
  colors: {
    bg: '#0A0A0A', surface: '#141414', surface2: '#1A1A1A',
    accent: '#E50914', text: '#FFFFFF', textMuted: '#999999',
    border: '#2A2A2A', tvFocus: '#FFFFFF', warning: '#f59e0b'
  }
};

// ==========================================
// 2. STORAGE SUPER CEPAT (MMKV) (Dari Section 5)
// ==========================================
const storage = new MMKV();
const zustandStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => storage.delete(name),
};

// ==========================================
// 3. GLOBAL STATE (Zustand + Immer) (Dari Section 1)
// ==========================================
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
// 4. UTILITIES (Deteksi TV & Jaringan) (Dari Section 9 & 8)
// ==========================================
const useDeviceType = () => {
  const isTV = Platform.isTV;
  return { isTV };
};

const useNetwork = () => {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return unsubscribe;
  }, []);
  return isOnline;
};

// ==========================================
// 5. PARSER M3U EKSTRIM (Dari Section 3)
// ==========================================
const CHUNK_SIZE = 200;
async function parseM3UChunked(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE);
    await new Promise(resolve => setTimeout(resolve, 0)); // Anti-Freeze UI
    
    let currentChannel = {};
    chunk.forEach(line => {
      if (line.startsWith('#EXTINF')) {
        // Ekstrak Logo
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        currentChannel.logo = logoMatch ? logoMatch[1] : null;
        
        // Ekstrak Kategori/Grup
        const groupMatch = line.match(/group-title="([^"]+)"/);
        currentChannel.group = groupMatch ? groupMatch[1] : 'Lainnya';
        
        // Ekstrak Nama
        const nameMatch = line.match(/,(.+)$/);
        currentChannel.name = nameMatch ? nameMatch[1].trim() : 'Unknown';
        
        // Cek DRM ClearKey
        const drmMatch = line.match(/#KODIPROP:clearkey=([^:]+):(.+)/);
        if (drmMatch) currentChannel.drm = { type: 'clearkey', keyId: drmMatch[1], key: drmMatch[2] };
        
        currentChannel.id = Math.random().toString(36).substr(2, 9);
      } else if (line.startsWith('http')) {
        currentChannel.url = line;
        if (currentChannel.name) {
          results.push({ ...currentChannel });
          currentChannel = {}; 
        }
      }
    });
  }
  return results;
}

// ==========================================
// 6. KOMPONEN UI
// ==========================================

// --- Channel Card ---
const ChannelCard = React.memo(({ item, onPress, isTV, isActive }) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={[
        styles.channelCard,
        isTV && isFocused && styles.channelCardFocused,
        isActive && styles.channelCardActive
      ]}
    >
      <Image 
        source={item.logo ? { uri: item.logo } : require('./assets/icon.png')} // Fallback logo
        style={styles.channelLogo} 
        contentFit="contain"
        cachePolicy="disk" // Disk Caching
      />
      <View style={styles.channelInfo}>
        <Text style={[styles.channelName, isActive && styles.textActive]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.channelGroup} numberOfLines={1}>{item.group}</Text>
      </View>
    </TouchableOpacity>
  );
});

// --- Dual Player Engine (Dari Section 6) ---
const DualPlayer = ({ channel }) => {
  // Expo Video (Untuk stream biasa HLS/DASH/TS)
  const expoPlayer = useVideoPlayer(channel?.url || '', (p) => { p.loop = false; p.play(); });

  if (!channel) {
    return (
      <View style={styles.playerPlaceholder}>
        <Text style={styles.textMuted}>Pilih channel untuk memutar siaran</Text>
      </View>
    );
  }

  // Jika Channel memiliki DRM proteksi, gunakan react-native-video
  if (channel.drm) {
    return (
      <View style={styles.playerContainer}>
        <Video
          source={{ uri: channel.url }}
          style={styles.videoView}
          controls={true}
          drm={{
            type: channel.drm.type,
            clearKeys: { [channel.drm.keyId]: channel.drm.key }
          }}
          onError={(e) => Alert.alert('DRM Error', 'Siaran ini diproteksi dan gagal diputar.')}
        />
        <View style={styles.playerOverlay}><Text style={styles.nowPlaying}>🔒 DRM: {channel.name}</Text></View>
      </View>
    );
  }

  // Standar Player
  return (
    <View style={styles.playerContainer}>
      <VideoView style={styles.videoView} player={expoPlayer} allowsFullscreen allowsPictureInPicture />
      <View style={styles.playerOverlay}><Text style={styles.nowPlaying}>▶️ {channel.name}</Text></View>
    </View>
  );
};

// ==========================================
// 7. MAIN APP LAYOUT
// ==========================================
export default function App() {
  const { channels, activeChannel, isLoading, searchQuery, setChannels, setActiveChannel, setLoading, setSearchQuery } = useStore();
  const { isTV } = useDeviceType();
  const isOnline = useNetwork();

  // Load Playlist Awal
  useEffect(() => {
    const fetchPlaylist = async () => {
      if (channels.length > 0) return; // Load dari cache MMKV jika ada
      setLoading(true);
      try {
        // Contoh URL publik (bisa kamu ganti)
        const response = await fetch('https://iptv-org.github.io/iptv/countries/id.m3u');
        const m3uString = await response.text();
        const parsed = await parseM3UChunked(m3uString);
        setChannels(parsed);
      } catch (error) {
        Alert.alert('Gagal Load', 'Tidak dapat mengunduh playlist.');
      } finally {
        setLoading(false);
      }
    };
    if (isOnline) fetchPlaylist();
  }, [isOnline]);

  // Mesin Pencarian Cerdas (Fuse.js)
  const filteredChannels = useMemo(() => {
    if (!searchQuery) return channels;
    const fuse = new Fuse(channels, { keys: ['name', 'group'], threshold: 0.3 });
    return fuse.search(searchQuery).map(result => result.item);
  }, [channels, searchQuery]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        
        {/* Header & Network Banner */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ADITV PRO</Text>
          <Text style={styles.deviceInfo}>{isTV ? 'TV Mode 📺' : 'Mobile Mode 📱'}</Text>
        </View>
        {!isOnline && <View style={styles.offlineBanner}><Text style={styles.offlineText}>⚠️ Tidak ada koneksi internet</Text></View>}

        <View style={[styles.mainLayout, isTV && styles.tvLayout]}>
          
          {/* Player Area */}
          <View style={isTV ? styles.tvPlayerWrapper : styles.mobilePlayerWrapper}>
            <DualPlayer channel={activeChannel} />
          </View>

          {/* List & Search Area */}
          <View style={styles.listContainer}>
            {!isTV && (
              <TextInput
                style={styles.searchInput}
                placeholder="Cari Channel (Fuse.js)..."
                placeholderTextColor={theme.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            )}
            
            {isLoading ? (
              <ActivityIndicator size="large" color={theme.colors.accent} style={{ marginTop: 20 }} />
            ) : (
              <FlashList
                data={filteredChannels}
                renderItem={({ item }) => (
                  <ChannelCard 
                    item={item} isTV={isTV} isActive={activeChannel?.id === item.id}
                    onPress={() => setActiveChannel(item)} 
                  />
                )}
                estimatedItemSize={70}
                keyExtractor={(item) => item.id}
                numColumns={isTV ? 4 : 1} 
              />
            )}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ==========================================
// 8. STYLESHEET LENGKAP
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  headerTitle: { color: theme.colors.accent, fontSize: 24, fontWeight: 'bold' },
  deviceInfo: { color: theme.colors.textMuted, fontSize: 12 },
  offlineBanner: { backgroundColor: theme.colors.warning, padding: 4, alignItems: 'center' },
  offlineText: { color: '#000', fontSize: 12, fontWeight: 'bold' },
  mainLayout: { flex: 1, flexDirection: 'column' },
  tvLayout: { flexDirection: 'row' },
  mobilePlayerWrapper: { height: 250, backgroundColor: theme.colors.surface, zIndex: 10 },
  tvPlayerWrapper: { flex: 2, backgroundColor: '#000', borderRightWidth: 1, borderRightColor: theme.colors.border },
  listContainer: { flex: 1, padding: 8 },
  searchInput: { backgroundColor: theme.colors.surface2, color: theme.colors.text, padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  playerPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playerContainer: { flex: 1, backgroundColor: '#000' },
  videoView: { flex: 1 },
  playerOverlay: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  nowPlaying: { color: theme.colors.text, fontSize: 12, fontWeight: 'bold' },
  channelCard: { flexDirection: 'row', alignItems: 'center', padding: 10, margin: 4, backgroundColor: theme.colors.surface, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', height: 70 },
  channelCardFocused: { borderColor: theme.colors.tvFocus, transform: [{ scale: 1.02 }] },
  channelCardActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surface2 },
  channelLogo: { width: 50, height: 50, borderRadius: 4, backgroundColor: '#1A1A1A', marginRight: 12 },
  channelInfo: { flex: 1, justifyContent: 'center' },
  channelName: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  channelGroup: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  textActive: { color: theme.colors.accent },
  textMuted: { color: theme.colors.textMuted }
});
