import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from './lib/supabase';

export default function App() {
  const [location, setLocation] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    async function getLocation() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    }
    getLocation();
  }, []);

  useEffect(() => {
    async function fetchEvents() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_live', true);
      if (error) console.log('Events error:', error);
      else setEvents(data);
    }
    fetchEvents();
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        showsUserLocation={true}
        followsUserLocation={false}
        initialRegion={{
          latitude: location ? location.latitude : -26.1929,
          longitude: location ? location.longitude : 28.0305,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {events.map(event => {
          const coords = event.coordinates;
          return (
            <Marker
              key={event.id}
              coordinate={{
                latitude: coords.coordinates[1],
                longitude: coords.coordinates[0],
              }}
              title={event.location_name}
              description={event.title}
            />
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});