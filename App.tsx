import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Button,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
  FlatList,
  ScrollView,
} from 'react-native';
import Sound from 'react-native-nitro-sound';
import RNFS from 'react-native-fs';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const App = () => {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00:00');
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const [pauseOffset, setPauseOffset] = useState(0);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [playingPath, setPlayingPath] = useState<string | null>(null);

  /** Update timer display while recording */
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (recording && !paused && startTimestamp !== null) {
      interval = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startTimestamp + pauseOffset) / 1000,
        );
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        setRecordTime(
          `${h.toString().padStart(2, '0')}:${m
            .toString()
            .padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
        );
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recording, paused, startTimestamp, pauseOffset]);

  /** Ask for microphone permission */
  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'App needs access to your microphone to record audio.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const result = await request(PERMISSIONS.IOS.MICROPHONE);
      return result === RESULTS.GRANTED;
    }
  };

  /** Load saved .m4a files */
  const refreshRecordings = async () => {
    try {
      const dir = RNFS.DocumentDirectoryPath; // Use app's private directory for both platforms
      if (!(await RNFS.exists(dir))) {
        setRecordings([]);
        return;
      }
      console.log(dir, "dir:");
      const files = await RNFS.readDir(dir);
      const audioFiles = files
        .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.mp4'))
        .map(f => f.path)
        .sort((a, b) => b.localeCompare(a));
      setRecordings(audioFiles);
    } catch (e) {
      console.warn('refreshRecordings error:', e);
      setRecordings([]);
    }
  };

  useEffect(() => {
    refreshRecordings();
  }, []);

  /** Start new recording */
  const handleStart = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission required',
        'Microphone permission is required to record audio.',
      );
      return;
    }
    setAudioPath(null);
    setPaused(false);
    setRecording(true);
    setStartTimestamp(Date.now());
    setPauseOffset(0);
    setRecordTime('00:00:00');

    const dir =
      Platform.OS === 'android'
        ? RNFS.ExternalStorageDirectoryPath
        : RNFS.DocumentDirectoryPath;
    const fileName = `recording_${Date.now()}.m4a`;
    const filePath = `${dir}/${fileName}`;
    setAudioPath(filePath);
    Sound.addRecordBackListener(e =>
      setRecordTime(Sound.mmssss(Math.floor(e.currentPosition)))
    );
    const result = await Sound.startRecorder();
    console.log('Recording started:', result); // Pass filePath to ensure saving in correct location

  };

  const handlePause = async () => {
    await Sound.pauseRecorder();
    setPaused(true);
    if (startTimestamp !== null) {
      setPauseOffset(prev => prev + (Date.now() - startTimestamp));
      setStartTimestamp(null);
    }
  };

  const handleResume = async () => {
    await Sound.resumeRecorder();
    setPaused(false);
    setStartTimestamp(Date.now());
  };

  const handleStop = async () => {
    const savedPath = await Sound.stopRecorder();
    Sound.removeRecordBackListener();
    console.log(savedPath, "savedPath:");
    setRecording(false);
    setPaused(false);
    setStartTimestamp(null);
    setPauseOffset(0);
    setRecordTime('00:00:00');
    setAudioPath(savedPath);
    await refreshRecordings();
  };

  const handlePlay = async (path?: string) => {
    const playPath = path || audioPath;
    if (!playPath) return;
    setPlaying(true);
    setPlayingPath(playPath);
    // Add playback end listener to reset state
    Sound.removePlaybackEndListener && Sound.removePlaybackEndListener();
    Sound.addPlaybackEndListener && Sound.addPlaybackEndListener(() => {
      setPlaying(false);
      setPlayingPath(null);
    });
    await Sound.startPlayer(playPath);
  };

  const handleStopPlay = async () => {
    await Sound.stopPlayer();
    setPlaying(false);
    setPlayingPath(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
      showsVerticalScrollIndicator={false}
        data={recordings}
        keyExtractor={item => item}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Audio Recorder</Text>

            <View style={styles.timerContainer}>
              <Text style={styles.timer}>{recordTime}</Text>
            </View>

            <View style={styles.buttonRow}>
              <Button title="Start" onPress={handleStart} disabled={recording} />
              <Button title="Pause" onPress={handlePause} disabled={!recording || paused} />
              <Button title="Resume" onPress={handleResume} disabled={!recording || !paused} />
              <Button title="Stop" onPress={handleStop} disabled={!recording} />
            </View>

            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>
              Saved Recordings:
            </Text>
            {recordings.length === 0 && (
              <Text style={{ color: '#888' }}>No recordings found.</Text>
            )}</>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text
              style={{ flex: 1 }}
              numberOfLines={1}
              ellipsizeMode="middle">
              {item.split('/').pop()}
            </Text>
            <Button
              title={playing && playingPath === item ? 'Stop' : 'Play'}
              onPress={
                playing && playingPath === item
                  ? handleStopPlay
                  : () => handlePlay(item)
              }
            />
          </View>
        )}
        ListFooterComponent={
          <>
            <Text style={styles.note}>
              • Recording continues in background. If mic is lost (e.g. phone call),
              recording will pause and resume automatically. No audio data is lost.
            </Text></>
        }
      />


    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  timerContainer: { marginBottom: 16 },
  timer: { fontSize: 32, fontWeight: 'bold' },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  playbackContainer: { alignItems: 'center', marginBottom: 16 },
  playbackLabel: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  note: { fontSize: 14, color: '#666', marginTop: 24, textAlign: 'center' },
});

export default App;
