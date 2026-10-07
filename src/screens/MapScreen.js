import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import VibePopup from '../components/VibePopup';

// The map opens on a default view (Johannesburg) and recentres on the user
// when the first GPS fix arrives. initialRegion is read once by
// react-native-maps and never again, so recentring has to go through the
// map ref.
const FALLBACK_REGION = {
  latitude: -26.1929,
  longitude: 28.0305,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// A marker needs a real GeoJSON point ([lng, lat]). A row with anything else
// is dropped instead of crashing the whole map render - there is no error
// boundary above this screen, so one malformed event used to blank it.
function pointOf(event) {
  const c = event?.coordinates?.coordinates;
  if (
    Array.isArray(c) &&
    c.length >= 2 &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1])
  ) {
    return { latitude: c[1], longitude: c[0] };
  }
  return null;
}

export default function MapScreen({ navigation }) {
  const mapRef = useRef(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    let active = true;
    async function getLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (active) setLocationDenied(true);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        if (!active) return;
        mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } catch (err) {
        // No fix available (indoors, location services off). The map still
        // works; it just stays on the fallback view.
        console.log('Location error:', err);
      }
    }
    getLocation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let subscribed = true;

    async function fetchEvents() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_live', true);
      if (!subscribed) return;
      if (error) {
        console.log('Events error:', error);
        setEventsError(error.message);
      } else {
        setEventsError(null);
        setEvents(data);
      }
    }

    fetchEvents();

    // Liveness: refetch the live-event list whenever any row in `events`
    // changes - a host goes live, an event ends, or a check-in bumps
    // live_checkin_count. Refetching the filtered list (rather than patching
    // local state from the payload) keeps the is_live filter honest for
    // inserts, updates and deletes alike. Tables must be members of the
    // supabase_realtime publication; see the phase8 migration.
    const channel = supabase
      .channel('map-events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        fetchEvents
      )
      .subscribe();

    return () => {
      subscribed = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const markers = events
    .map(event => ({ event, point: pointOf(event) }))
    .filter(m => m.point !== null);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation={true}
        followsUserLocation={false}
        initialRegion={FALLBACK_REGION}
      >
        {markers.map(({ event, point }) => (
          <Marker
            key={event.id}
            coordinate={point}
            title={event.location_name}
            onPress={() => setSelectedEvent(event)}
          />
        ))}
      </MapView>
      <View style={styles.bannerStack} pointerEvents="none">
        {locationDenied && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              location is off — turn it on to see yourself on the map
            </Text>
          </View>
        )}
        {eventsError && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              couldn't load events — check your connection
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.hostButton}
        onPress={() => navigation.navigate('HostDashboard')}
      >
        <Text style={styles.hostButtonText}>+ go live</Text>
      </TouchableOpacity>
      {selectedEvent && (
        <VibePopup
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
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
  bannerStack: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    gap: 8,
  },
  banner: {
    backgroundColor: 'rgba(26, 26, 26, 0.92)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bannerText: {
    color: '#ddd',
    fontSize: 13,
    textAlign: 'center',
  },
  hostButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 32,
  },
  hostButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});