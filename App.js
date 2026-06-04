import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from './lib/supabase';

export default function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from('_test').select('*').limit(1);
      console.log('data:', data);
      console.log('error:', error);
      if (!error || error.code === 'PGRST116' || error.code === '42P01' || error.code === 'PGRST205') {
        setConnected(true);
      }
    }
    testConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text>{connected ? 'Supabase connected.' : 'Connecting...'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});