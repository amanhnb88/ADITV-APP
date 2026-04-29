import React, { useEffect, useMemo, useState } from 'react';
import { 
  View, Text, StyleSheet, Platform, TouchableOpacity, 
  ActivityIndicator, TextInput, Alert, ScrollView
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Video from 'react-native-video';
import { create } from 'zustand';
import Fuse from 'fuse.js';

// ==========================================
// 1. STATE & LOGGER (Logcat Internal)
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

// State untuk sistem Logcat
const useLogStore = create((set) => ({
  logs: [],
  addLog: (msg, type = 'INFO') => set((state) => {
    const time = new Date().toLocaleTimeString();
    const newLog = `[${time}] [${type}] ${msg}`;
    console.log(newLog); // Tetap print ke terminal asli
    return { logs: [newLog, ...state.logs] };
  }),
  clearLogs: () => set({ logs: [] })
}));

// ==========================================
// 2. PARSER M3U EKSTRIM (Chunked & Defensive)
// ==========================================
const CHUNK_SIZE = 200;

async function parseM3UChunked(raw) {
  const { addLog } = useLogStore.getState();
  addLog(`Memulai parsing ${raw.length} karakter...`, 'INFO');
  
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  
  let currentChannel = {};
  let currentHeaders = {};
  let currentDrm = null;

  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE);
    await new Promise(resolve => setTimeout(resolve, 0)); // Anti-Freeze

    chunk.forEach(line => {
      if (line.startsWith('#EXTINF')) {
        const nameMatch = line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);
        
        currentChannel = {
          id: Math.random().toString(36).substring(7),
          name: nameMatch ? nameMatch[1].trim() : 'Unknown Channel',
          logo: logoMatch ? logoMatch[1] : null,
          group: groupMatch ? groupMatch[1] : 'Lainnya',
        };
      } else if (line.startsWith('#KODIPROP:clearkey=')) {
        const parts = line.split('=')[1]?.split(':');
        if (parts && parts.length >= 2) {
          currentDrm = { type: 'clearkey', clearKeys: { [parts[0]]: parts[1] } };
        }
      } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
        currentDrm = { type: 'widevine', licenseServer: line.split('=')[1] };
      } else if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
        currentHeaders['User-Agent'] = line.split('=')[1];
      } else if (line.startsWith('#EXTVLCOPT:http-referrer=')) {
        currentHeaders['Referer'] = line.split('=')[1];
      } else if (line.startsWith('http')) {
        currentChannel.url = line;
        
        if (Object.keys(currentHeaders).length > 0) currentChannel.headers = currentHeaders;
        if (currentDrm) currentChannel.drm = currentDrm;

        if (currentChannel.name) {
          results.push({ ...currentChannel });
        }
        
        currentChannel = {};
        currentHeaders = {};
        currentDrm = null;
      }
    });
  }
  
  addLog(`Parsing selesai! Ditemukan ${results.length} channel.`, 'SUCCESS');
  return results;
}

// ==========================================
// 3. MESIN DUAL PLAYER CERDAS
// ==========================================
const DualPlayer = ({ channel }) => {
  const { addLog } = useLogStore();
  
  const videoSource = channel?.url 
    ? { uri: channel.url, headers: channel.headers } 
    : null;

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    if (channel?.url) {
      addLog(`Menghubungkan ke: ${channel.name}...`, 'PLAYER');
      p.play();
    }
  });

  if (!channel) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.textMuted}>Pilih channel untuk memutar 📺</Text>
      </View>
    );
  }

  if (channel.drm) {
    addLog(`Memutar DRM (react-native-video): ${channel.name}`, 'PLAYER');
    return (
      <View style={styles.videoWrapper}>
        <Video 
          source={videoSource} 
          style={styles.video} 
          controls={true} 
          resizeMode="contain"
          drm={channel.drm}
          onError={(e) => addLog(`DRM Error: ${JSON.stringify(e)}`, 'ERROR')}
          onBuffer={({ isBuffering }) => isBuffering && addLog(`Buffering DRM: ${channel.name}`, 'WARN')}
        />
        <Text style={styles.drmBadge}>🔒 DRM SECURED</Text>
      </View>
    );
  }

  return <VideoView style={styles.video} player={player} allowsFullscreen />;
};

// ==========================================
// 4. LOGCAT PANEL COMPONENT
// ==========================================
const LogcatPanel = () => {
  const { logs, clearLogs } = useLogStore();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <TouchableOpacity style={styles.fab} onPress={() => setIsOpen(true)}>
        <Text style={styles.fabText}>🐛 LOG</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.logcatContainer}>
      <View style={styles.logcatHeader}>
        <Text style={styles.logcatTitle}>Terminal / Logcat</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={clearLogs} style={styles.logBtn}><Text style={styles.logBtnText}>Bersihkan</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setIsOpen(false)} style={[styles.logBtn, {backgroundColor: '#ef4444'}]}><Text style={styles.logBtnText}>Tutup</Text></TouchableOpacity>
        </View>
      </View>
      <ScrollView style={styles.logcatBody}>
        <TextInput 
          editable={false} 
          selectable={true} 
          multiline 
          value={logs.join('\n\n')} 
          style={styles.logText}
        />
      </ScrollView>
      <Text style={styles.hintText}>* Tekan tahan teks hijau di atas untuk Menyalin (Copy)</Text>
    </View>
  );
};

// ==========================================
// 5. MAIN LAYOUT
// ==========================================
export default function App() {
  const { channels, activeChannel, isLoading, searchQuery, setChannels, setActiveChannel, setLoading, setSearchQuery } = useStore();
  const { addLog } = useLogStore();
  const isTV = Platform.isTV;

  useEffect(() => {
    const loadPlaylist = async () => {
      setLoading(true);
      addLog('Mengunduh playlist VIP super...', 'NETWORK');
      try {
        // Menggunakan raw github link untuk file playlist_super.m3u
        const res = await fetch('https://raw.githubusercontent.com/amanhnb88/AdiTV/main/streams/playlist_super.m3u');
        
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const text = await res.text();
        addLog(`File terunduh, ukuran: ${text.length} bytes`, 'NETWORK');
        
        const parsedChannels = await parseM3UChunked(text);
        setChannels(parsedChannels);
      } catch (e) {
        addLog(`Gagal memuat playlist: ${e.message}`, 'ERROR');
        Alert.alert("Gagal Memuat Playlist", "Cek Logcat untuk detail error.");
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
          <Text style={styles.countInfo}>{channels.length} Saluran</Text>
        </View>

        <View style={styles.playerSection}>
          <DualPlayer channel={activeChannel} />
        </View>

        <View style={styles.listSection}>
          {!isTV && (
            <TextInput 
              style={styles.input} 
              placeholder="Cari ribuan channel VIP..." 
              placeholderTextColor="#555"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          )}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Menyiapkan Playlist Super...</Text>
            </View>
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
                    cachePolicy="memory"
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

        {/* Suntikkan Logcat Panel di atas segalanya */}
        {!isTV && <LogcatPanel />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ==========================================
// 6. STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
  title: { color: '#3b82f6', fontSize: 22, fontWeight: 'bold' },
  countInfo: { color: '#10b981', fontSize: 12, fontWeight: 'bold' },
  playerSection: { height: 250, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
  videoWrapper: { flex: 1, width: '100%', position: 'relative' },
  video: { flex: 1, width: '100%', height: '100%' },
  drmBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listSection: { flex: 1, padding: 10 },
  input: { backgroundColor: '#111', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#1e2d45' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#3b82f6', marginTop: 10, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, backgroundColor: '#0d1321', borderRadius: 10 },
  activeCard: { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: '#111827' },
  logo: { width: 45, height: 45, marginRight: 15, borderRadius: 6, backgroundColor: '#000' },
  info: { flex: 1 },
  channelName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  channelGroup: { color: '#64748b', fontSize: 11, marginTop: 2 },
  textAccent: { color: '#3b82f6' },
  textMuted: { color: '#666' },
  
  // Logcat Styles
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#f59e0b', padding: 12, borderRadius: 30, elevation: 5, zIndex: 999 },
  fabText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
  logcatContainer: { position: 'absolute', top: 50, left: 10, right: 10, bottom: 50, backgroundColor: 'rgba(10, 10, 10, 0.95)', borderRadius: 10, borderWidth: 1, borderColor: '#3b82f6', zIndex: 1000, padding: 10 },
  logcatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10, marginBottom: 10 },
  logcatTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  logBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  logBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  logcatBody: { flex: 1 },
  logText: { color: '#10b981', fontFamily: 'monospace', fontSize: 11 },
  hintText: { color: '#666', fontSize: 10, marginTop: 10, fontStyle: 'italic', textAlign: 'center' }
});
