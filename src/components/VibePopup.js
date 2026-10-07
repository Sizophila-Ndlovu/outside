import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';

const { height } = Dimensions.get('window');

export default function VibePopup({ event, onClose }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinCount, setCheckinCount] = useState(event.live_checkin_count ?? 0);

  useEffect(() => {
    async function getCurrentUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setUserId(session.user.id);
    }
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (!event) return;
    fetchPosts();
    setCheckinCount(event.live_checkin_count ?? 0);

    // Liveness for the open event. Inserts are prepended, updates (edits and
    // trigger-driven like_count recomputes) merged in place, and deletes
    // dropped, instead of refetching - so another person liking a post moves
    // the number without the feed flickering through a loading spinner.
    // The events UPDATE subscription pins the check-in count to the server
    // value, which also self-corrects the optimistic +1 in checkIn().
    const channel = supabase
      .channel(`event-${event.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `event_id=eq.${event.id}`,
        },
        payload => {
          setPosts(prev => [
            payload.new,
            ...prev.filter(p => p.id !== payload.new.id),
          ]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
          filter: `event_id=eq.${event.id}`,
        },
        payload => {
          setPosts(prev =>
            prev.map(p => (p.id === payload.new.id ? payload.new : p))
          );
        }
      )
      .on(
        'postgres_changes',
        // DELETE events under RLS carry only the primary key and cannot be
        // filtered server-side, so this listens unfiltered and drops the
        // post id locally instead.
        { event: 'DELETE', schema: 'public', table: 'posts' },
        payload => {
          setPosts(prev => prev.filter(p => p.id !== payload.old.id));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${event.id}`,
        },
        payload => {
          if (typeof payload.new?.live_checkin_count === 'number') {
            setCheckinCount(payload.new.live_checkin_count);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event?.id]);

  useEffect(() => {
    if (userId && posts.length > 0) fetchUserLikes();
  }, [userId, posts.length]);

  useEffect(() => {
    if (userId && event) fetchCheckinStatus();
  }, [userId, event]);

  async function fetchPosts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.log('Posts error:', error);
      setPostsError(error.message);
    } else {
      setPostsError(null);
      setPosts(data);
    }
    setLoading(false);
  }

  async function fetchUserLikes() {
    const postIds = posts.map(p => p.id);
    const { data, error } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds);
    if (!error && data) {
      setLikedPosts(new Set(data.map(l => l.post_id)));
    }
  }

  async function fetchCheckinStatus() {
    const { data, error } = await supabase
      .from('checkins')
      .select('id')
      .eq('user_id', userId)
      .eq('event_id', event.id)
      .maybeSingle();
    if (!error && data) setCheckedIn(true);
  }

  async function checkIn() {
    if (!userId || checkingIn || checkedIn) return;
    setCheckingIn(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Turn on location access to check in.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { error } = await supabase
        .from('checkins')
        .insert({
          user_id: userId,
          event_id: event.id,
          // Explicit SRID so the ST_DWithin(::geography) proximity gate in
          // the RLS policy measures true metres rather than guessing.
          coordinates: `SRID=4326;POINT(${loc.coords.longitude} ${loc.coords.latitude})`,
        });
      if (error) {
        if (error.code === '23505') {
          // Already checked in — treat as success, not a failure.
          setCheckedIn(true);
        } else {
          Alert.alert(
            "Can't check in",
            "You need to be at the venue while it's live to check in."
          );
        }
        return;
      }
      setCheckedIn(true);
      setCheckinCount(prev => prev + 1);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setCheckingIn(false);
    }
  }

  // like_count is derived from the likes table by a database trigger
  // (supabase/migrations/...phase7...), so this only ever writes to `likes`.
  // The UI updates optimistically and rolls back if the write fails.
  function applyLocalLike(postId, liked, delta) {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (liked) next.add(postId);
      else next.delete(postId);
      return next;
    });
    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? { ...p, like_count: Math.max(0, (p.like_count ?? 0) + delta) }
          : p
      )
    );
  }

  async function toggleLike(postId) {
    if (!userId) return;
    const alreadyLiked = likedPosts.has(postId);
    const delta = alreadyLiked ? -1 : 1;

    applyLocalLike(postId, !alreadyLiked, delta);

    const { error } = alreadyLiked
      ? await supabase
          .from('likes')
          .delete()
          .eq('user_id', userId)
          .eq('post_id', postId)
      : await supabase
          .from('likes')
          .insert({ user_id: userId, post_id: postId });

    if (!error) return;

    if (error.code === '23505') {
      // Unique violation: local state was stale and the server already had
      // this like (and its count). Resync from the source of truth instead
      // of guessing at an adjustment.
      await fetchPosts();
      return;
    }

    applyLocalLike(postId, alreadyLiked, -delta);
    Alert.alert('Could not save like', error.message);
  }

  function renderPost({ item }) {
    const liked = likedPosts.has(item.id);
    return (
      <View style={styles.postCard}>
        <Image
          source={{ uri: item.media_url }}
          style={styles.postImage}
          resizeMode="cover"
        />
        {item.caption ? (
          <Text style={styles.caption}>{item.caption}</Text>
        ) : null}
        <TouchableOpacity
          style={styles.likeButton}
          onPress={() => toggleLike(item.id)}
        >
          <Text style={[styles.likeText, liked && styles.likeTextActive]}>
            ♥ {item.like_count}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View>
          <Text style={styles.locationName}>{event.location_name}</Text>
          <Text style={styles.eventTitle}>{event.title}</Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.checkinRow}>
        <Text style={styles.checkinCount}>
          {checkinCount} {checkinCount === 1 ? 'person' : 'people'} here
        </Text>
        <TouchableOpacity
          style={[styles.checkinButton, checkedIn && styles.checkinButtonDone]}
          onPress={checkIn}
          disabled={checkedIn || checkingIn}
        >
          {checkingIn ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={[styles.checkinText, checkedIn && styles.checkinTextDone]}>
              {checkedIn ? '✓ checked in' : 'check in'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            postsError ? (
              <TouchableOpacity onPress={fetchPosts}>
                <Text style={styles.empty}>
                  couldn't load posts — tap to retry
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.empty}>no posts yet</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.6,
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  locationName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  eventTitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  closeButton: {
    color: '#888',
    fontSize: 20,
  },
  checkinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkinCount: {
    color: '#888',
    fontSize: 13,
  },
  checkinButton: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  checkinButtonDone: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  checkinText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  checkinTextDone: {
    color: '#888',
  },
  postCard: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  postImage: {
    width: '100%',
    height: 220,
  },
  caption: {
    color: '#fff',
    padding: 12,
    fontSize: 14,
  },
  likeButton: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  likeText: {
    color: '#888',
    fontSize: 16,
  },
  likeTextActive: {
    color: '#ff4d6d',
  },
  empty: {
    color: '#555',
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },
});