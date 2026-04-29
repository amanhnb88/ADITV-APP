import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, Platform, TouchableOpacity, 
  ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FlashList } from '@shopify/flash-list';
import { create } from 'zustand';

// ==========================================
// 1. TEMA & WARNA (Gaya HBO/Netflix Dark Mode)
// ==========================================
const theme = {
  colors: {
    bg: '#0A0A0A',
    surface: '#141414',
    surface2: '#1A1A1A',
    accent: '#3b82f6', // Aksen biru sesuai dokumen
    text: '#FFFFFF',
    textMuted: '#999999',
    border: '#1e2d45',
    tvFocus: '#FFFFFF',
  }
};

// ==========================================
// 2. STATE MANAGEMENT (Zustand)
// ==========================================
const useStore = create((set) => ({
  channels: [],
  activeChannel: null,
  isLoading: false,
  error: null,
  setChannels: (channels) => set({ channels }),
  setActiveChannel: (channel) => set({ activeChannel: channel }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// ==========================================
// 3. DETEKSI PERANGKAT (TV vs HP)
// ==========================================
function useDeviceType() {
  const isTV = Platform.isTV;
  return { isTV };
}

// ==========================================
// 4. PARSER M3U (Anti-Freeze Chunking)
// ==========================================
const CHUNK_SIZE = 200;

async function parseM3UChunked(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE);
    await new Promise(resolve => setTimeout(resolve, 0)); // Jeda agar UI tidak macet
    
    let currentChannel = {};
    chunk.forEach(line => {
      if (line.startsWith('#EXTINF')) {
        const nameMatch = line.match(/,(.+)$/);
        currentChannel.name = nameMatch ? nameMatch[1].trim() : 'Channel Tidak Diketahui';
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
// 5. KOMPONEN UI UTAMA
// ==========================================

// Item Channel untuk List
const ChannelItem = React.memo(({ item, onPress, isTV, isActive }) => {
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
      <Text style={[styles.channelName, isActive && styles.textActive]} numberOfLines={1}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );
});

// Komponen Player Video
const PlayerEngine = ({ channel }) => {
  const player = useVideoPlayer(channel?.url || '', (player) => {
    player.loop = false;
    player.play();
  });

  if (!channel) {
    return (
      <View style={styles.playerPlaceholder}>
        <Text style={styles.textMuted}>Pilih channel untuk memutar siaran</Text>
      </View>
    );
  }

  return (
    <View style={styles.playerContainer}>
      <VideoView
        style={styles.videoView}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
      />
      <View style={styles.playerOverlay}>
        <Text style={styles.nowPlaying}>📺 Memutar: {channel.name}</Text>
      </View>
    </View>
  );
};

// ==========================================
// 6. LAYOUT UTAMA APLIKASI
// ==========================================
export default function App() {
  const { channels, activeChannel, isLoading, setChannels, setActiveChannel, setLoading } = useStore();
  const { isTV } = useDeviceType();

  // Memuat data M3U dummy saat aplikasi pertama dibuka
  useEffect(() => {
    const fetchDummyPlaylist = async () => {
      setLoading(true);
      try {
        // Dummy data M3U (Nanti diganti dengan fetch dari URL aslimu)
        const dummyM3U = `
#EXTM3U
#EXTINF:-1 tvg-id="1" tvg-name="TVRI",TVRI Nasional
https://m3u8.dummy-stream.com/tvri.m3u8
#EXTINF:-1 tvg-id="2" tvg-name="MetroTV",Metro TV
https://m3u8.dummy-stream.com/metro.m3u8
#EXTINF:-1 tvg-id="3" tvg-name="Kompas",Kompas TV
https://m3u8.dummy-stream.com/kompas.m3u8
#EXTINF:-1 tvg-id="4" tvg-name="Trans7",Trans 7
https://m3u8.dummy-stream.com/trans7.m3u8
        `.trim();

        const parsedChannels = await parseM3UChunked(dummyM3U);
        setChannels(parsedChannels);
      } catch (error) {
        console.error("Gagal parsing playlist:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDummyPlaylist();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      
      {/* Header Aplikasi */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ADITV</Text>
        <Text style={styles.deviceInfo}>{isTV ? 'Mode TV 📺' : 'Mode HP 📱'}</Text>
      </View>

      <View style={[styles.mainLayout, isTV && styles.tvLayout]}>
        
        {/* Area Pemutar Video */}
        <View style={isTV ? styles.tvPlayerWrapper : styles.mobilePlayerWrapper}>
          <PlayerEngine channel={activeChannel} />
        </View>

        {/* Area Daftar Channel (FlashList) */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={theme.colors.accent} style={{ marginTop: 20 }} />
          ) : (
            <FlashList
              data={channels}
              renderItem={({ item }) => (
                <ChannelItem 
                  item={item} 
                  isTV={isTV}
                  isActive={activeChannel?.id === item.id}
                  onPress={() => setActiveChannel(item)} 
                />
              )}
              estimatedItemSize={72}
              keyExtractor={(item) => item.id}
              numColumns={isTV ? 3 : 1} // 3 Kolom untuk TV, 1 Kolom untuk HP
            />
          )}
        </View>
        
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 7. STYLESHEET (Desain)
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { color: theme.colors.accent, fontSize: 22, fontWeight: 'bold' },
  deviceInfo: { color: theme.colors.textMuted, fontSize: 12 },
  mainLayout: { flex: 1, flexDirection: 'column' },
  tvLayout: { flexDirection: 'row' },
  mobilePlayerWrapper: { height: 250, backgroundColor: theme.colors.surface },
  tvPlayerWrapper: { flex: 2, backgroundColor: theme.colors.surface, borderRightWidth: 1, borderRightColor: theme.colors.border },
  listContainer: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  playerPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playerContainer: { flex: 1 },
  videoView: { flex: 1 },
  playerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  nowPlaying: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  channelCard: {
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 4,
    backgroundColor: theme.colors.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 60,
    justifyContent: 'center',
  },
  channelCardFocused: { borderColor: theme.colors.tvFocus, transform: [{ scale: 1.05 }] },
  channelCardActive: { borderColor: theme.colors.accent, backgroundColor: '#1e2d45' },
  channelName: { color: theme.colors.text, fontSize: 15, fontWeight: '500' },
  textActive: { color: theme.colors.accent },
  textMuted: { color: theme.colors.textMuted }
});
