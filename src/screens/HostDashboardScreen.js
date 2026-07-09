import { decode } from 'base64-arraybuffer';
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

export default function HostDashboardScreen({ navigation }) {
  const [step, setStep] = useState('create');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const [caption, setCaption] = useState('');
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);
        checkActiveEvent(session.user.id);
      }
    }
    getUser();
  }, []);

  async function checkActiveEvent(uid) {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('host_id', uid)
      .eq('is_live', true)
      .single();
    if (data) {
      setActiveEvent(data);
      setStep('posting');
    }
  }

  async function goLive() {
    if (!title || !locationName) {
      Alert.alert('Error', 'Please fill in event title and location name');
      return;
    }
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required to go live');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { data, error } = await supabase
        .from('events')
        .insert({
          host_id: userId,
          title,
          description,
          event_type: 'popup',
          coordinates: `POINT(${loc.coords.longitude} ${loc.coords.latitude})`,
          location_name: locationName,
          is_live: true,
        })
        .select()
        .single();
      if (error) throw error;
      setActiveEvent(data);
      setStep('posting');
      Alert.alert('You are live!', 'Your event is now visible on the map.');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
    setLoading(false);
  }

  async function pickAndPost() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    setLoading(true);
    try {
      const file = result.assets[0];
      const fileName = `${userId}/${Date.now()}.jpg`;
      const base64Data = decode(file.base64);
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, base64Data, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('posts')
        .getPublicUrl(fileName);
      const { error: postError } = await supabase
        .from('posts')
        .insert({
          event_id: activeEvent.id,
          user_id: userId,
          caption,
          media_url: urlData.publicUrl,
          media_type: 'image',
        });
      if (postError) throw postError;
      setCaption('');
      Alert.alert('Posted!', 'Your post is live.');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
    setLoading(false);
  }

  async function endEvent() {
    Alert.alert('End event', 'Are you sure you want to end this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End', style: 'destructive', onPress: async () => {
          await supabase
            .from('events')
            .update({ is_live: false, ended_at: new Date() })
            .eq('id', activeEvent.id);
          setActiveEvent(null);
          setStep('create');
          setTitle('');
          setDescription('');
          setLocationName('');
        }
      }
    ]);
  }

  if (step === 'create') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>go live</Text>
        <Text style={styles.subtitle}>your event will appear on the map instantly</Text>
        <TextInput
          style={styles.input}
          placeholder="event title"
          placeholderTextColor="#555"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="location name (e.g. ekoneni)"
          placeholderTextColor="#555"
          value={locationName}
          onChangeText={setLocationName}
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="describe the vibe (optional)"
          placeholderTextColor="#555"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />
        <TouchableOpacity style={styles.liveButton} onPress={goLive} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.liveButtonText}>go live now</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.liveHeader}>
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>● LIVE</Text>
        </View>
        <Text style={styles.liveLocation}>{activeEvent?.location_name}</Text>
      </View>
      <Text style={styles.subtitle}>add a post to your live event</Text>
      <TextInput
        style={styles.input}
        placeholder="caption (optional)"
        placeholderTextColor="#555"
        value={caption}
        onChangeText={setCaption}
      />
      <TouchableOpacity style={styles.liveButton} onPress={pickAndPost} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.liveButtonText}>pick photo & post</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.endButton} onPress={endEvent}>
        <Text style={styles.endButtonText}>end event</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  back: {
    marginBottom: 24,
  },
  backText: {
    color: '#888',
    fontSize: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: '#111',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  liveButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  liveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  liveBadge: {
    backgroundColor: '#ff4d4d',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  liveLocation: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  endButton: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4d4d',
  },
  endButtonText: {
    color: '#ff4d4d',
    fontSize: 16,
  },
});