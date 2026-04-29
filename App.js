import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ActivityIndicator, ScrollView, TextInput 
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { create } from 'zustand';

// ==========================================
// 1. DATA CHANNEL AKTIF (HASIL SCAN PYTHON)
// ==========================================
const ACTIVE_CHANNELS = [
  {
    id: 'hbo-vip',
    name: 'HBO HD (VIP)',
    url: 'https://cdnjkt913.transvision.co.id:1000/live/master/3/4028c6856b6088c3016b87d64b970b53/manifest.mpd',
    headers: {
      'User-Agent': 'Xstream XGO/1.22 (Linux;Android 9) ExoPlayerLib/2.10.5',
    },
    drm: {
      type: 'widevine',
      licenseServer: 'https://cubmu.devhik.workers.dev/license_cenc',
    }
  },
  {
    id: 'rcti-aktif',
    name: 'RCTI (Server Aktif)',
    url: 'https://rcti-cutv.rctiplus.id/rcti-sdi.m3u8',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.rctiplus.com/',
    }
  }
];

// ==========================================
// 2. LOGGER & STATE
// ==========================================
const useLogStore = create((set) => ({
  logs: [],
  addLog: (msg, type = 'INFO') => set((state) => ({
    logs: [`[${new Date().toLocaleTimeString()}] [${type}] ${msg}`, ...state.logs]
  })),
  clearLogs: () => set({ logs: [] })
}));

// ==========================================
// 3. CUSTOM UI PLAYER (NO BIG PLAY BUTTON)
// ==========================================
const CustomPlayer = ({ channel }) => {
  const { addLog } = useLogStore();
  const [isBuffering, setIsBuffering] = useState(true);
  const [showUI, setShowUI] = useState(false);

  if (!channel) return (
    <View style={styles.placeholder}><Text style={styles.textMuted}>Pilih Channel VIP di Bawah 📺</Text></View>
  );

  const handleTouch = () => {
    setShowUI(true);
    setTimeout(() => setShowUI(false), 3000);
  };

  return (
    <View style={styles.videoWrapper}>
      <Video 
        source={{ uri: channel.url, headers: channel.headers }} 
        style={styles.video}
        controls={false} // HILANGKAN TOMBOL PLAY SISTEM
        autoplay={true}
        resizeMode="contain"
        drm={channel.drm ? { ...channel.drm, headers: channel.headers } : undefined}
        bufferConfig={{ minBufferMs: 15000, maxBufferMs: 50000, bufferForPlaybackMs: 2500 }}
        onLoad={() => { setIsBuffering(false); addLog(`Playing: ${channel.name}`, 'SUCCESS'); }}
        onBuffer={({ isBuffering }) => setIsBuffering(isBuffering)}
        onError={(e) => { setIsBuffering(false); addLog(`Error: ${JSON.stringify(e)}`, 'ERROR'); }}
      />

      {isBuffering && <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#3b82f6" /></View>}

      <TouchableOpacity style={styles.touchArea} activeOpacity={1} onPress={handleTouch}>
        {showUI && (
          <View style={styles.topBar}>
            <Text style={styles.liveBadge}>● LIVE</Text>
            <Text style={styles.channelTitle}>{channel.name}</Text>
            <TouchableOpacity style={styles.gearButton} onPress={() => alert("Settings Open")}>
              <Text style={{fontSize: 18}}>⚙️</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ==========================================
// 4. MAIN APP
// ==========================================
export default function App() {
  const [activeChannel, setActiveChannel] = useState(null);
  const { logs, clearLogs } = useLogStore();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>ADITV PRO VIP</Text></View>

        <View style={styles.playerSection}>
          <CustomPlayer channel={activeChannel} />
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Saluran Aktif Terverifikasi:</Text>
          {ACTIVE_CHANNELS.map((ch) => (
            <TouchableOpacity 
              key={ch.id} 
              style={[styles.card, activeChannel?.id === ch.id && styles.activeCard]}
              onPress={() => setActiveChannel(ch)}
            >
              <View style={styles.dot} />
              <Text style={styles.channelName}>{ch.name}</Text>
              {ch.drm && <Text style={styles.drmTag}>DRM</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* LOGCAT MINI */}
        <View style={styles.logcatMini}>
          <View style={styles.logHeader}>
            <Text style={styles.logTitle}>System Logs</Text>
            <TouchableOpacity onPress={clearLogs}><Text style={{color: '#ef4444', fontSize: 10}}>CLEAR</Text></TouchableOpacity>
          </View>
          <ScrollView style={{flex: 1}} nestedScrollEnabled>
            <Text style={styles.logText}>{logs.join('\n')}</Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  header: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#1e2d45', alignItems: 'center' },
  title: { color: '#3b82f6', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
  playerSection: { height: 250, backgroundColor: '#000' },
  videoWrapper: { flex: 1, position: 'relative' },
  video: { flex: 1, width: '100%' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  touchArea: { ...StyleSheet.absoluteFillObject },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 10 },
  liveBadge: { backgroundColor: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 'bold', padding: 3, borderRadius: 3, marginRight: 10 },
  channelTitle: { color: '#fff', fontSize: 14, flex: 1 },
  gearButton: { padding: 5 },
  listSection: { flex: 1, padding: 20 },
  sectionTitle: { color: '#64748b', marginBottom: 15, fontSize: 12, fontWeight: 'bold' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1321', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1e2d45' },
  activeCard: { borderColor: '#3b82f6', backgroundColor: '#111827' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', marginRight: 15 },
  channelName: { color: '#fff', fontSize: 16, fontWeight: '500', flex: 1 },
  drmTag: { color: '#f59e0b', fontSize: 10, fontWeight: 'bold', borderWidth: 1, borderColor: '#f59e0b', paddingHorizontal: 4, borderRadius: 3 },
  logcatMini: { height: 120, backgroundColor: '#000', borderTopWidth: 1, borderTopColor: '#1e2d45', padding: 10 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  logTitle: { color: '#3b82f6', fontSize: 10, fontWeight: 'bold' },
  logText: { color: '#10b981', fontSize: 9, fontFamily: 'monospace' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  textMuted: { color: '#444' }
});
