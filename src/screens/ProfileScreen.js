import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen({ navigation }) {
  const [name, setName] = useState(null);
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (active) setEmail(session.user.email);

      const { data, error } = await supabase
        .from('users')
        .select('name')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active) return;
      if (error) console.log('Profile error:', error);
      if (data?.name) setName(data.name);
      setLoading(false);
    }
    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      Alert.alert('Could not sign out', error.message);
      return;
    }
    // No manual navigation here: useAuth's onAuthStateChange listener sees
    // the SIGNED_OUT event and swaps the navigator back to the login stack.
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← back</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 48 }} />
      ) : (
        <>
          <Text style={styles.title}>{name ?? 'user'}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}

          <TouchableOpacity
            style={styles.signOutButton}
            onPress={signOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color="#ff4d4d" size="small" />
            ) : (
              <Text style={styles.signOutText}>sign out</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
  email: {
    color: '#888',
    fontSize: 14,
    marginBottom: 32,
  },
  signOutButton: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4d4d',
  },
  signOutText: {
    color: '#ff4d4d',
    fontSize: 16,
  },
});
