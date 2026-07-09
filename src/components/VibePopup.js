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
} from 'react-native';
import { supabase } from '../../lib/supabase';

const { height } = Dimensions.get('window');

export default function VibePopup({ event, onClose }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (event) fetchPosts();
  }, [event]);

  async function fetchPosts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false });
    if (error) console.log('Posts error:', error);
    else setPosts(data);
    setLoading(false);
  }

  async function likePost(postId, currentLikes) {
    const { error } = await supabase
      .from('posts')
      .update({ like_count: currentLikes + 1 })
      .eq('id', postId);
    if (!error) {
      setPosts(posts.map(p =>
        p.id === postId ? { ...p, like_count: currentLikes + 1 } : p
      ));
    }
  }

  function renderPost({ item }) {
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
          onPress={() => likePost(item.id, item.like_count)}
        >
          <Text style={styles.likeText}>♥ {item.like_count}</Text>
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
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.empty}>no posts yet</Text>
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
    color: '#ff4d6d',
    fontSize: 16,
  },
});