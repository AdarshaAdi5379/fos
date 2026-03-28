import { useState, useEffect, useRef } from 'react';
import { CryptoManager } from './crypto/CryptoManager';
import { Post, PostVersion, ProfileBundle, AvatarStyle } from './types';
import { getApiUrl, getWebSocketUrl } from './config';
import { Sidebar } from './components/Layout/Sidebar';
import { FeedHeader } from './components/Feed/FeedHeader';
import { ComposeBox } from './components/Feed/ComposeBox';
import { PostCard } from './components/Feed/PostCard';
import { WalletPanel } from './components/Wallet/WalletPanel';
import { ProfileService } from './services/ProfileService';

const cryptoManager = new CryptoManager();

type ThreadNode = { post: Post; replies: ThreadNode[] };

const AVATAR_STYLES: { id: AvatarStyle; label: string; emoji: string }[] = [
  { id: 'robot_blue', label: 'Robot', emoji: '🤖' },
  { id: 'fox_gray', label: 'Fox', emoji: '🦊' },
  { id: 'alien_green', label: 'Alien', emoji: '👽' },
  { id: 'ninja_black', label: 'Ninja', emoji: '🥷' },
  { id: 'pixel_pink', label: 'Pixel', emoji: '🟪' },
  { id: 'abstract_cyan', label: 'Abstract', emoji: '🔷' },
];

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readSessionToken(): { token: string | null; publicKey: string } {
  if (typeof window === 'undefined') return { token: null, publicKey: '' };
  const token = sessionStorage.getItem('unbound-access-token');
  const publicKey = sessionStorage.getItem('unbound-public-key') || '';
  if (!token) return { token: null, publicKey };

  const payload = decodeJwtPayload(token);
  const exp = payload?.exp ? Number(payload.exp) * 1000 : null;
  if (exp && Date.now() >= exp) {
    sessionStorage.removeItem('unbound-access-token');
    sessionStorage.removeItem('unbound-public-key');
    return { token: null, publicKey: '' };
  }

  return { token, publicKey };
}

function App() {
  // Auth state
  const initialSession = readSessionToken();
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!initialSession.publicKey);
  const [generatedSeedPhrase, setGeneratedSeedPhrase] = useState('');
  const [restoreSeedPhrase, setRestoreSeedPhrase] = useState('');
  const [storePassword, setStorePassword] = useState('');
  const [quickLoginPassword, setQuickLoginPassword] = useState('');
  const [publicKey, setPublicKey] = useState(() => initialSession.publicKey);
  const [accessToken, setAccessToken] = useState<string | null>(() => initialSession.token);
  const [hasStoredIdentity, setHasStoredIdentity] = useState<boolean | null>(null);
  
  // Wallet state – live balance pushed from WebSocket wallet_update events
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  
  // Feed state
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedMessage, setFeedMessage] = useState('');
  
  // Navigation state
  const [currentView, setCurrentView] = useState('home');
  const [activeTab, setActiveTab] = useState('global');
  
  // Edit state
  const [editingPost, setEditingPost] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  
  // Modal state
  const [viewingVersions, setViewingVersions] = useState<number | null>(null);
  const [postVersions, setPostVersions] = useState<PostVersion[]>([]);
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [authorPosts, setAuthorPosts] = useState<Post[]>([]);
  const [viewingProfileData, setViewingProfileData] = useState<ProfileBundle | null>(null);
  const [viewingProfileLoading, setViewingProfileLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // Reply/Repost UI
  const [replyingTo, setReplyingTo] = useState<Post | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replies, setReplies] = useState<Post[]>([]);
  const [repliesOffset, setRepliesOffset] = useState(0);
  const [repliesHasMore, setRepliesHasMore] = useState(false);

  // Thread modal
  const [threadRoot, setThreadRoot] = useState<Post | null>(null);
  const [threadNodes, setThreadNodes] = useState<ThreadNode[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadOffset, setThreadOffset] = useState(0);
  const [threadHasMore, setThreadHasMore] = useState(false);
  
  // My profile (current user)
  const [myProfile, setMyProfile] = useState<ProfileBundle | null>(null);
  const [myProfileLoading, setMyProfileLoading] = useState(false);
  const [myProfileNotFound, setMyProfileNotFound] = useState(false);
  const [profileForm, setProfileForm] = useState<{
    displayName: string;
    avatarStyle: AvatarStyle;
    bio: string;
    themeColor: string;
  }>({
    displayName: '',
    avatarStyle: 'robot_blue',
    bio: '',
    themeColor: '#00ff88',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  
  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Compose box ref for focus
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const activeTabRef = useRef<string>(activeTab);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const avatarEmoji = (style: AvatarStyle) => {
    return AVATAR_STYLES.find(a => a.id === style)?.emoji || '◉';
  };

  const profileApi = () => new ProfileService(accessToken);

  const fetchMyProfile = async () => {
    if (!accessToken) return;
    setMyProfileLoading(true);
    setMyProfileNotFound(false);
    try {
      const data = await profileApi().getMe();
      setMyProfile(data);
      setProfileForm({
        displayName: data.profile.displayName,
        avatarStyle: data.profile.avatarStyle,
        bio: data.profile.bio,
        themeColor: data.profile.themeColor,
      });
    } catch (err: any) {
      if (err?.code === 'PROFILE_NOT_FOUND' || String(err?.message || '').includes('404')) {
        setMyProfile(null);
        setMyProfileNotFound(true);
      } else {
        console.warn('Failed to fetch my profile:', err);
      }
    } finally {
      setMyProfileLoading(false);
    }
  };

  useEffect(() => {
    if (currentView === 'profile') {
      fetchMyProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, accessToken]);

  useEffect(() => {
    checkExistingSession();
    fetchPosts();

    let reconnectTimer: number | null = null;
    let manuallyClosed = false;

    const connectWebSocket = () => {
      try {
        const wsUrl = getWebSocketUrl();
        console.log(`🔌 Attempting WebSocket connection to ${wsUrl}`);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          // If we already have a token (e.g., restored session), authenticate immediately
          const token = accessTokenRef.current;
          if (token) {
            try {
              ws.send(JSON.stringify({ type: 'authenticate', token }));
            } catch (err) {
              console.warn('Failed to authenticate WebSocket:', err);
            }
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case 'new_post':
                if (activeTabRef.current === 'global') {
                  setPosts(prev => [message.data, ...prev.slice(0, 99)]);
                }
                break;
              case 'post_updated':
                if (activeTabRef.current === 'global') {
                  setPosts(prev => prev.map(post =>
                    post.id === message.data.id ? message.data : post
                  ));
                }
                break;
              case 'wallet_update':
                // Real-time balance push for the authenticated user
                setWalletBalance(message.data.balance);
                break;
              case 'connected':
                console.log('Connected to real-time updates');
                break;
              case 'authenticated':
                console.log('✅ WebSocket authenticated');
                break;
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
        };

        ws.onclose = (event) => {
          console.log('🔌 WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });

          if (!manuallyClosed && event.code !== 1000) {
            console.log('🔄 Attempting to reconnect in 5 seconds...');
            if (reconnectTimer) {
              window.clearTimeout(reconnectTimer);
            }
            reconnectTimer = window.setTimeout(connectWebSocket, 5000);
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      manuallyClosed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      wsRef.current?.close(1000, 'Component unmounted');
      wsRef.current = null;
    };
  }, []);

  // If a token arrives after the socket is open, authenticate without forcing a reconnect.
  useEffect(() => {
    if (!accessToken) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'authenticate', token: accessToken }));
    } catch (err) {
      console.warn('Failed to authenticate WebSocket:', err);
    }
  }, [accessToken]);

  const checkExistingSession = () => {
    // Detect if a seed exists in IndexedDB (encrypted). This does NOT decrypt anything.
    try {
      const request = indexedDB.open('unbound-secure-storage', 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('seeds')) {
          db.createObjectStore('seeds', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains('seeds')) {
            setHasStoredIdentity(false);
            db.close();
            return;
          }

          const transaction = db.transaction(['seeds'], 'readonly');
          const store = transaction.objectStore('seeds');
          const getReq = store.get('current');
          getReq.onsuccess = () => {
            setHasStoredIdentity(!!getReq.result);
            db.close();
          };
          getReq.onerror = () => {
            setHasStoredIdentity(false);
            db.close();
          };
        } catch {
          setHasStoredIdentity(false);
          db.close();
        }
      };
      request.onerror = () => {
        setHasStoredIdentity(false);
      };
    } catch {
      setHasStoredIdentity(false);
    }
  };

  const generateNewIdentity = async () => {
    try {
      setIsLoading(true);
      const seed = await cryptoManager.generateSeedPhrase();
      setGeneratedSeedPhrase(seed);
      await cryptoManager.deriveKeys();
      const pubKey = cryptoManager.getPublicKey();
      setPublicKey(pubKey);
      setError('');
      // Do not auto-enter the app: show the seed phrase so the user can back it up / store it.
    } catch (error) {
      setError('Failed to generate identity: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const continueWithGeneratedIdentity = async () => {
    if (!publicKey) {
      setError('Public key not available. Please generate identity again.');
      return;
    }
    setIsAuthenticated(true);
    await loginToServer(publicKey);
  };

  const loginWithSeed = async () => {
    try {
      setIsLoading(true);
      cryptoManager.setSeedPhrase(restoreSeedPhrase);
      await cryptoManager.deriveKeys();
      const pubKey = cryptoManager.getPublicKey();
      setPublicKey(pubKey);
      setGeneratedSeedPhrase('');
      setIsAuthenticated(true);
      setError('');
      // Authenticate with server to get JWT token for protected endpoints
      await loginToServer(pubKey);
    } catch (err) {
      setError('Invalid seed phrase');
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPassword = async () => {
    try {
      setIsLoading(true);
      const decrypted = await cryptoManager.retrieveSeedPhrase(quickLoginPassword);
      if (decrypted) {
        setGeneratedSeedPhrase('');
        await cryptoManager.deriveKeys();
        const pubKey = cryptoManager.getPublicKey();
        setPublicKey(pubKey);
        setIsAuthenticated(true);
        setError('');
        // Authenticate with server to get JWT token for protected endpoints
        await loginToServer(pubKey);
      } else {
        setError('Invalid password or no stored seed found');
      }
    } catch (err) {
      setError('Failed to decrypt seed phrase');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Authenticate with server and obtain JWT access token.
   * Signs a challenge message with the private key to prove ownership.
   */
  const loginToServer = async (pubKey: string) => {
    try {
      const message = `login:${pubKey}:${Date.now()}`;
      const signature = await cryptoManager.signMessage(message);

      const response = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: pubKey,
          signature: signature.signature,
          message
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.accessToken);
        // Store token for session persistence
        if (data.accessToken) {
          sessionStorage.setItem('unbound-access-token', data.accessToken);
          sessionStorage.setItem('unbound-public-key', pubKey);
          // Backward-compat cleanup (older builds used localStorage)
          localStorage.removeItem('unbound-access-token');
        }
      } else {
        console.warn('Server authentication failed - JWT-protected endpoints will not work');
      }
    } catch (err) {
      console.warn('Server authentication failed:', err);
    }
  };

  const storeIdentity = async () => {
    if (storePassword) {
      try {
        setIsLoading(true);
        const success = await cryptoManager.storeSeedPhrase(storePassword);
        if (success) {
          setError('');
          alert('Identity stored securely');
          setHasStoredIdentity(true);
        } else {
          setError('Failed to store identity');
        }
      } catch (err) {
        setError('Failed to store identity: ' + (err as Error).message);
      } finally {
        setIsLoading(false);
      }
    } else {
      setError('Please enter a password');
    }
  };

  const createPost = async (content: string) => {
    if (!content.trim()) return;

    try {
      setIsLoading(true);
      if (!publicKey) {
        setError('Public key not available. Try regenerating identity.');
        return;
      }

      const signature = await cryptoManager.signMessage(content);

      const response = await fetch(getApiUrl('/api/posts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content,
          publicKey: publicKey,
          signature: signature.signature,
          recovery: signature.recovery
        })
      });

      if (response.ok) {
        fetchPosts();
      } else {
        setError('Failed to create post');
      }
    } catch (err) {
      setError('Failed to create post: ' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const openReply = (post: Post) => {
    setReplyingTo(post);
    setReplyContent('');
    setReplies([]);
    setRepliesOffset(0);
    setRepliesHasMore(false);
    setError('');
  };

  const closeReply = () => {
    setReplyingTo(null);
    setReplyContent('');
    setReplies([]);
    setRepliesOffset(0);
    setRepliesHasMore(false);
  };

  const loadReplies = async (parent: Post, nextOffset = 0) => {
    try {
      setRepliesLoading(true);
      const limit = 20;
      const page = Math.floor(nextOffset / limit) + 1;
      const response = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(parent.post_uuid)}/replies?limit=${limit}&page=${page}`));
      const data = await response.json();
      const list = Array.isArray(data.replies) ? data.replies : [];
      setReplies(prev => nextOffset === 0 ? list : [...prev, ...list]);
      setRepliesOffset(nextOffset);
      setRepliesHasMore(!!data.pagination?.hasMore);
    } catch (err) {
      console.warn('Failed to load replies:', err);
    } finally {
      setRepliesLoading(false);
    }
  };

  useEffect(() => {
    if (replyingTo) {
      loadReplies(replyingTo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyingTo?.post_uuid]);

  const createReply = async () => {
    if (!replyingTo) return;
    if (!replyContent.trim()) return;

    try {
      setReplyBusy(true);
      if (!publicKey) {
        setError('Public key not available. Try regenerating identity.');
        return;
      }

      const canonical = `reply:${replyingTo.post_uuid}:${replyContent.trim()}`;
      const sig = await cryptoManager.signMessage(canonical);

      const response = await fetch(getApiUrl('/api/posts/reply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent.trim(),
          publicKey,
          signature: sig.signature,
          recovery: sig.recovery,
          parent_post_id: replyingTo.post_uuid,
        })
      });

      if (response.ok) {
        closeReply();
        fetchPosts();
      } else {
        const body = await response.json().catch(() => null);
        setError(body?.error || 'Failed to create reply');
      }
    } catch (err) {
      setError('Failed to create reply: ' + (err as Error).message);
    } finally {
      setReplyBusy(false);
    }
  };

  const toggleLike = async (post: Post) => {
    if (!accessToken) {
      setError('Login required to like posts');
      return;
    }

    try {
      const liked = post.viewer_liked === true || post.viewer_liked === 1;
      const url = liked
        ? getApiUrl(`/api/posts/${encodeURIComponent(post.post_uuid)}/unlike`)
        : getApiUrl(`/api/posts/${encodeURIComponent(post.post_uuid)}/like`);

      const res = await fetch(url, {
        method: liked ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: liked ? undefined : JSON.stringify({}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
      }

      // Optimistic UI update
      setPosts(prev => prev.map(p => {
        if (p.post_uuid !== post.post_uuid) return p;
        const nextLiked = !liked;
        const currLikes = typeof p.likes_count === 'number' ? p.likes_count : 0;
        return {
          ...p,
          viewer_liked: nextLiked,
          likes_count: nextLiked ? (currLikes + 1) : Math.max(currLikes - 1, 0),
        };
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to update like');
    }
  };

  const toggleRepost = async (post: Post) => {
    if (!accessToken) {
      setError('Login required to repost');
      return;
    }

    const targetUuid = post.post_type === 'repost' ? (post.repost_of_uuid || post.post_uuid) : post.post_uuid;
    const reposted = post.viewer_reposted === true || post.viewer_reposted === 1;

    try {
      if (reposted) {
        const res = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(targetUuid)}/repost`), {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTP ${res.status}`);
        }

        // Update state + refresh feed (repost record should disappear)
        setPosts(prev => prev.map(p => {
          if (p.post_uuid !== targetUuid) return p;
          const curr = typeof p.reposts_count === 'number' ? p.reposts_count : 0;
          return { ...p, viewer_reposted: false, reposts_count: Math.max(curr - 1, 0) };
        }));
        fetchPosts();
        return;
      }

      if (!publicKey) {
        setError('Public key not available. Try regenerating identity.');
        return;
      }

      const canonical = `repost:${targetUuid}`;
      const sig = await cryptoManager.signMessage(canonical);

      const response = await fetch(getApiUrl('/api/posts/repost'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey,
          signature: sig.signature,
          recovery: sig.recovery,
          original_post_id: targetUuid,
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to repost');
      }

      setPosts(prev => prev.map(p => {
        if (p.post_uuid !== targetUuid) return p;
        const curr = typeof p.reposts_count === 'number' ? p.reposts_count : 0;
        return { ...p, viewer_reposted: true, reposts_count: curr + 1 };
      }));
      fetchPosts();
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle repost');
    }
  };

  const openThread = async (post: Post) => {
    try {
      setThreadLoading(true);
      const targetUuid =
        post.post_type === 'repost'
          ? (post.repost_of_uuid || post.post_uuid)
          : post.post_uuid;

      // Open modal immediately with a placeholder root (replaced by server response)
      setThreadRoot(post);
      setThreadNodes([]);
      setThreadOffset(0);
      setThreadHasMore(false);

      const limit = 20;
      const res = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(targetUuid)}/thread?limit=${limit}&offset=0&depth=10`));
      const data = await res.json();
      setThreadRoot(data.root || null);
      setThreadNodes(data.replies || []);
      setThreadHasMore(!!data.pagination?.hasMore);
      setThreadOffset(0);
    } catch (err) {
      setError('Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  };

  const closeThread = () => {
    setThreadRoot(null);
    setThreadNodes([]);
    setThreadOffset(0);
    setThreadHasMore(false);
  };

  const loadMoreThread = async () => {
    if (!threadRoot || !threadHasMore || threadLoading) return;
    try {
      setThreadLoading(true);
      const limit = 20;
      const nextOffset = threadOffset + limit;
      const res = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(threadRoot.post_uuid)}/thread?limit=${limit}&offset=${nextOffset}&depth=10`));
      const data = await res.json();
      const more = Array.isArray(data.replies) ? data.replies : [];
      setThreadNodes(prev => [...prev, ...more]);
      setThreadHasMore(!!data.pagination?.hasMore);
      setThreadOffset(nextOffset);
    } catch {
      setError('Failed to load more thread replies');
    } finally {
      setThreadLoading(false);
    }
  };

  const editPost = async (postId: number) => {
    if (!editContent.trim()) return;

    try {
      setIsLoading(true);
      const signature = await cryptoManager.signMessage(editContent);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const response = await fetch(getApiUrl(`/api/posts/${postId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          content: editContent,
          publicKey: publicKey,
          signature: signature.signature,
          recovery: signature.recovery
        })
      });

      if (response.ok) {
        setEditingPost(null);
        setEditContent('');
        fetchPosts();
      }
    } catch (err) {
      setError('Failed to edit post');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (post: Post) => {
    if (post.author_key !== publicKey) return;
    setEditingPost(post.id);
    setEditContent(post.content);
  };

  const cancelEdit = () => {
    setEditingPost(null);
    setEditContent('');
  };

  const renderThreadNode = (node: ThreadNode, depth: number) => {
    const indent = Math.min(Math.max(depth, 0), 10) * 20;
    return (
      <div key={node.post.post_uuid} style={{ marginLeft: indent, marginTop: 'var(--space-sm)' }}>
        <PostCard
          post={node.post}
          currentUserKey={publicKey}
          onEdit={startEditing}
          onViewHistory={viewPostVersions}
          onViewProfile={viewAuthorProfile}
          onReply={openReply}
          onToggleRepost={toggleRepost}
          onToggleLike={toggleLike}
          onViewThread={openThread}
        />
        {Array.isArray(node.replies) && node.replies.length > 0 && (
          <div style={{ marginTop: 'var(--space-xs)' }}>
            {node.replies.map(child => renderThreadNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const viewPostVersions = async (postId: number) => {
    try {
      const response = await fetch(getApiUrl(`/api/posts/${postId}/versions`));
      const versions = await response.json();
      setPostVersions(versions);
      setViewingVersions(postId);
    } catch (err) {
      setError('Failed to fetch post versions');
    }
  };

  const closeVersions = () => {
    setViewingVersions(null);
    setPostVersions([]);
  };

  const viewAuthorProfile = async (authorKey: string) => {
    try {
      setViewingProfileLoading(true);
      setViewingProfileData(null);
      setViewingProfile(authorKey);

      const [postsRes, profile] = await Promise.all([
        fetch(getApiUrl(`/api/identities/${authorKey}/posts`)).then(r => r.json()),
        profileApi().getProfile(authorKey).catch(() => null),
      ]);

      setAuthorPosts(postsRes || []);
      setViewingProfileData(profile);
    } catch (err) {
      setError('Failed to fetch author posts');
    } finally {
      setViewingProfileLoading(false);
    }
  };

  const closeProfile = () => {
    setViewingProfile(null);
    setAuthorPosts([]);
    setViewingProfileData(null);
  };

  const toggleFollow = async (bundle: ProfileBundle) => {
    if (!accessToken) {
      setError('Login required to follow');
      return;
    }
    if (bundle.profile.publicKey === publicKey) return;

    setFollowBusy(true);
    try {
      const api = profileApi();
      if (bundle.viewer.isFollowing) {
        await api.unfollow(bundle.profile.publicKey);
      } else {
        await api.follow(bundle.profile.publicKey);
      }
      // Refresh viewer context
      const refreshed = await api.getProfile(bundle.profile.publicKey);
      setViewingProfileData(refreshed);
    } catch (err: any) {
      setError(err?.message || 'Failed to update follow state');
    } finally {
      setFollowBusy(false);
    }
  };

  const saveMyProfile = async () => {
    if (!accessToken) return;
    setProfileSaving(true);
    try {
      const api = profileApi();
      const payload = {
        displayName: profileForm.displayName,
        avatarStyle: profileForm.avatarStyle,
        bio: profileForm.bio,
        themeColor: profileForm.themeColor,
      };

      const updated = myProfileNotFound
        ? await api.createProfile(payload)
        : await api.updateProfile(payload);

      setMyProfile(updated);
      setMyProfileNotFound(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const fetchPosts = async () => {
    try {
      setFeedMessage('');

      if (activeTab === 'following') {
        if (!accessToken) {
          setPosts([]);
          setFeedMessage('Login to see posts from people you follow.');
          return;
        }

        const response = await fetch(getApiUrl('/api/feed/following?limit=50&offset=0'), {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        const list = Array.isArray(data.posts) ? data.posts : [];
        setPosts(list);
        if (data.message) setFeedMessage(data.message);
        return;
      }

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(getApiUrl('/api/posts?limit=100&offset=0'), { headers });
      const data = await response.json();
      const list = Array.isArray(data.posts) ? data.posts : [];
      const sortedData = list.sort((a: Post, b: Post) => b.id - a.id);
      setPosts(sortedData);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  };

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, accessToken]);

  const handleLogout = () => {
    setIsAuthenticated(false);
    setGeneratedSeedPhrase('');
    setRestoreSeedPhrase('');
    setStorePassword('');
    setQuickLoginPassword('');
    setPublicKey('');
    setAccessToken(null);
    setWalletBalance(null);
    setPosts([]);
    setError('');
    setCurrentView('home');
    setSidebarOpen(false);
    sessionStorage.removeItem('unbound-access-token');
    sessionStorage.removeItem('unbound-public-key');
    // Backward-compat cleanup
    localStorage.removeItem('unbound-access-token');
  };

  const handleNewPost = () => {
    setCurrentView('home');
    setSidebarOpen(false);
    // Focus on compose box
    setTimeout(() => {
      composeRef.current?.focus();
    }, 100);
  };

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="auth-layout">
        <div className="auth-container">
          <div className="auth-logo">
            <div className="logo-icon glow-green">UNBOUND</div>
            <div className="logo-tagline">Anonymous. Verified. Immutable.</div>
          </div>

          {error && (
            <div className="card mb-md" style={{ borderColor: 'var(--error)' }}>
              <p className="text-error" style={{ margin: 0 }}>{error}</p>
            </div>
          )}

          <div className="auth-section fade-in">
            <h3 className="text-lg mb-md text-green">Generate New Identity</h3>
            <button
              className="btn btn-primary btn-lg mb-md"
              onClick={generateNewIdentity}
              disabled={isLoading}
              style={{ width: '100%' }}
            >
              {isLoading ? <span className="loading-spinner-sm"></span> : null}
              Generate New Seed Phrase
            </button>
            
            {generatedSeedPhrase && (
              <div className="card mb-lg">
                <p className="text-sm mb-sm text-warning">
                  <strong>WARNING: Save this seed phrase securely!</strong>
                </p>
                <div className="seed-phrase-text mb-md">{generatedSeedPhrase}</div>
                <button
                  className="btn btn-secondary btn-sm mb-md"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedSeedPhrase);
                    setError('Seed phrase copied to clipboard!');
                    setTimeout(() => setError(''), 2000);
                  }}
                  style={{ width: '100%' }}
                >
                  Copy Seed Phrase
                </button>
                <div className="flex flex-col gap-sm">
                  <input
                    className="input"
                    type="password"
                    placeholder="Password to encrypt seed"
                    value={storePassword}
                    onChange={(e) => setStorePassword(e.target.value)}
                  />
                  <button
                    className="btn"
                    onClick={storeIdentity}
                    disabled={isLoading || !storePassword}
                  >
                    Store Identity
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={continueWithGeneratedIdentity}
                    disabled={isLoading}
                  >
                    Continue to Unbound
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="auth-section">
            <h3 className="text-lg mb-md text-green">Restore Existing Identity</h3>
            <textarea
              className="input mb-md"
              placeholder="Enter your 12-word seed phrase"
              value={restoreSeedPhrase}
              onChange={(e) => setRestoreSeedPhrase(e.target.value)}
              rows={3}
            />
            <button
              className="btn btn-secondary mb-md"
              onClick={loginWithSeed}
              disabled={isLoading || !restoreSeedPhrase}
              style={{ width: '100%' }}
            >
              Login with Seed
            </button>
          </div>

          <div className="auth-section">
            <h3 className="text-lg mb-md text-green">Quick Login</h3>
            {hasStoredIdentity === true && (
              <p className="text-sm text-muted mb-sm" style={{ marginTop: 0 }}>
                Stored identity detected on this device.
              </p>
            )}
            {hasStoredIdentity === false && (
              <p className="text-sm text-muted mb-sm" style={{ marginTop: 0 }}>
                No stored identity detected yet. Use “Store Identity” after generating one.
              </p>
            )}
            <div className="flex flex-col gap-sm">
              <input
                className="input"
                type="password"
                placeholder="Enter password"
                value={quickLoginPassword}
                onChange={(e) => setQuickLoginPassword(e.target.value)}
              />
              <button
                className="btn"
                onClick={loginWithPassword}
                disabled={isLoading || !quickLoginPassword}
              >
                Login with Password
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main authenticated view with 2-column layout
  return (
    <div className="app-layout">
      {/* Mobile sidebar overlay */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      
      {/* Sidebar */}
      <Sidebar
        publicKey={publicKey}
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          setSidebarOpen(false);
        }}
        onLogout={handleLogout}
        onNewPost={handleNewPost}
      />

      {/* Main Content */}
      <main className="main-content">
        {/* Mobile Header */}
        <div className="mobile-header" style={{ display: 'none' }}>
          <button 
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="logo-icon text-green">UNBOUND</div>
          <div style={{ width: 24 }} />
        </div>

        {/* Main View */}
        {currentView === 'wallet' ? (
          <WalletPanel
            publicKey={publicKey}
            accessToken={accessToken ?? ''}
            cryptoManager={cryptoManager}
            liveBalance={walletBalance}
          />
        ) : currentView === 'profile' ? (
          <>
            <FeedHeader title="Profile" />

            {/* Error Display */}
            {error && (
              <div className="card" style={{
                margin: 'var(--space-md)',
                borderColor: 'var(--error)',
                backgroundColor: 'rgba(255, 0, 64, 0.1)'
              }}>
                <p className="text-error" style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            <div className="card" style={{ margin: 'var(--space-md)' }}>
              <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)' }}>
                <div className="flex" style={{ alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: profileForm.themeColor || '#00ff88',
                      color: '#0b0b0f',
                      fontSize: 28,
                      boxShadow: '0 0 0 2px rgba(0,0,0,0.25) inset'
                    }}
                    title={profileForm.avatarStyle}
                  >
                    {avatarEmoji(profileForm.avatarStyle)}
                  </div>
                  <div>
                    <div className="text-lg text-green" style={{ fontWeight: 700 }}>
                      {myProfile?.profile.displayName || (myProfileNotFound ? 'Create your profile' : 'Your profile')}
                    </div>
                    <div className="technical text-muted text-sm">
                      Key: {publicKey ? `${publicKey.substring(0, 10)}...${publicKey.substring(publicKey.length - 8)}` : ''}
                    </div>
                    {myProfile?.profile.anonId && (
                      <div className="technical text-muted text-sm">Anon ID: {myProfile.profile.anonId}</div>
                    )}
                  </div>
                </div>

                {myProfile && (
                  <div className="technical text-muted text-sm" style={{ textAlign: 'right' }}>
                    <div>Posts: {myProfile.stats.postsCount}</div>
                    <div>Followers: {myProfile.stats.followersCount}</div>
                    <div>Following: {myProfile.stats.followingCount}</div>
                    <div>Reputation: {myProfile.stats.reputationScore}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ margin: 'var(--space-md)' }}>
              <h3 className="text-green mb-md">{myProfileNotFound ? 'Create Profile' : 'Edit Profile'}</h3>

              {!accessToken && (
                <div className="card mb-md" style={{ borderColor: 'var(--warning)', backgroundColor: 'rgba(255, 204, 0, 0.08)' }}>
                  <p className="text-sm text-warning" style={{ margin: 0 }}>
                    Server authentication is required to create/edit your profile. Generate/restore your identity and ensure login succeeds.
                  </p>
                </div>
              )}

              {myProfileLoading ? (
                <div className="text-muted">Loading profile…</div>
              ) : (
                <>
                  <label className="text-sm text-muted">Display name (3–24, letters/numbers/_)</label>
                  <input
                    className="input mb-md"
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm(p => ({ ...p, displayName: e.target.value }))}
                    placeholder="SilentFox"
                    disabled={!accessToken || profileSaving}
                  />

                  <label className="text-sm text-muted">Avatar</label>
                  <select
                    className="input mb-md"
                    value={profileForm.avatarStyle}
                    onChange={(e) => setProfileForm(p => ({ ...p, avatarStyle: e.target.value as AvatarStyle }))}
                    disabled={!accessToken || profileSaving}
                  >
                    {AVATAR_STYLES.map(a => (
                      <option key={a.id} value={a.id}>{a.emoji} {a.label}</option>
                    ))}
                  </select>

                  <label className="text-sm text-muted">Bio (max 160, no URLs/emails)</label>
                  <textarea
                    className="input mb-md"
                    rows={3}
                    maxLength={160}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                    placeholder="Learning distributed systems."
                    disabled={!accessToken || profileSaving}
                  />

                  <label className="text-sm text-muted">Theme color (hex)</label>
                  <input
                    className="input mb-md"
                    value={profileForm.themeColor}
                    onChange={(e) => setProfileForm(p => ({ ...p, themeColor: e.target.value }))}
                    placeholder="#00ff88"
                    disabled={!accessToken || profileSaving}
                  />

                  <button
                    className="btn btn-primary"
                    onClick={saveMyProfile}
                    disabled={!accessToken || profileSaving || !profileForm.displayName.trim()}
                  >
                    {profileSaving ? 'Saving…' : (myProfileNotFound ? 'Create Profile' : 'Save Changes')}
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Feed Header */}
            <FeedHeader
              title={currentView === 'explore' ? 'Explore' : currentView === 'settings' ? 'Settings' : 'Home'}
              activeTab={activeTab}
              tabs={[
                { id: 'global', label: 'Global' },
                { id: 'following', label: 'Following' }
              ]}
              onTabChange={setActiveTab}
            />

            {/* Compose Box */}
            <ComposeBox
              onPost={createPost}
              isLoading={isLoading}
              publicKey={publicKey}
            />

            {/* Error Display */}
            {error && (
              <div className="card" style={{ 
                margin: 'var(--space-md)', 
                borderColor: 'var(--error)',
                backgroundColor: 'rgba(255, 0, 64, 0.1)'
              }}>
                <p className="text-error" style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Feed List */}
            <div className="feed-list">
              {posts.map(post => (
                editingPost === post.id ? (
                  <div key={`edit-${post.id}`} className="post-card" style={{ padding: 'var(--space-md)' }}>
                    <textarea
                      className="input mb-md"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      placeholder="Edit your post..."
                    />
                    <div className="flex gap-sm">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => editPost(post.id)}
                        disabled={isLoading || !editContent.trim()}
                      >
                        Save Edit
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <PostCard
                    key={`post-${post.id}`}
                    post={post}
                    currentUserKey={publicKey}
                    onEdit={startEditing}
                    onViewHistory={viewPostVersions}
                    onViewProfile={viewAuthorProfile}
                    onReply={openReply}
                    onToggleRepost={toggleRepost}
                    onToggleLike={toggleLike}
                    onViewThread={openThread}
                  />
                )
              ))}
              
              {posts.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">📡</div>
                  <p className="empty-state-text">{feedMessage || 'No posts yet. Be the first to broadcast!'}</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Post Versions Modal */}
      {viewingVersions && (
        <div className="modal-overlay open" onClick={closeVersions}>
          <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-green">Post History</h3>
              <button className="btn btn-sm btn-secondary" onClick={closeVersions}>×</button>
            </div>
            <div className="modal-content">
              {postVersions.map((version, index) => (
                <article key={`version-${version.id}-${index}`} className="post-card mb-md">
                  <div className="post-body">
                    <div className="post-header">
                      <span className="technical text-green">
                        Version {version.version_number} {index === 0 && "(Original)"}
                      </span>
                    </div>
                    <div className="post-text">{version.content}</div>
                    <div className="technical text-muted text-sm">
                      Created: {new Date(version.created_at).toLocaleString()}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {replyingTo && (
        <div className="modal-overlay open" onClick={closeReply}>
          <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-green">Reply</h3>
              <button className="btn btn-sm btn-secondary" onClick={closeReply}>×</button>
            </div>
            <div className="modal-content">
              <div className="card mb-md">
                <div className="text-sm text-muted mb-sm">Replying to:</div>
                <div className="technical text-muted text-sm">
                  {(replyingTo.display_name || '').trim() ? replyingTo.display_name : `${replyingTo.author_key.substring(0, 10)}…${replyingTo.author_key.substring(replyingTo.author_key.length - 8)}`}
                </div>
                <div className="post-text" style={{ marginTop: 'var(--space-sm)' }}>
                  {replyingTo.content}
                </div>
              </div>

              <textarea
                className="input mb-md"
                rows={4}
                maxLength={500}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write your reply…"
              />

              <div className="flex gap-sm">
                <button
                  className="btn btn-primary"
                  onClick={createReply}
                  disabled={replyBusy || !replyContent.trim()}
                >
                  {replyBusy ? 'Posting…' : 'Post Reply'}
                </button>
                <button className="btn btn-secondary" onClick={closeReply} disabled={replyBusy}>
                  Cancel
                </button>
              </div>

              <div style={{ marginTop: 'var(--space-lg)' }}>
                <h4 className="text-green mb-md">Replies</h4>

                {repliesLoading && replies.length === 0 ? (
                  <div className="text-muted">Loading replies…</div>
                ) : replies.length === 0 ? (
                  <div className="text-muted">No replies yet.</div>
                ) : (
                  <div className="feed-list" style={{ padding: 0 }}>
                    {replies.map(r => (
                      <div key={r.post_uuid} className="card mb-sm">
                        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)' }}>
                          <div>
                            <div className="text-green" style={{ fontWeight: 700 }}>
                              {r.display_name || 'Anonymous'}
                              {r.anon_id ? <span className="text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>· {r.anon_id}</span> : null}
                            </div>
                            <div className="text-muted text-sm">{r.content}</div>
                          </div>
                          <button className="btn btn-secondary btn-sm" onClick={() => openReply(r)}>Reply</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {repliesHasMore && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => replyingTo && loadReplies(replyingTo, repliesOffset + 20)}
                    disabled={repliesLoading}
                    style={{ marginTop: 'var(--space-md)' }}
                  >
                    {repliesLoading ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thread Modal */}
      {(threadRoot || threadLoading) && (
        <div className="modal-overlay open" onClick={closeThread}>
          <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-green">Thread</h3>
              <button className="btn btn-sm btn-secondary" onClick={closeThread}>×</button>
            </div>
            <div className="modal-content">
              {threadRoot && (
                <div className="mb-md">
                  <PostCard
                    post={threadRoot}
                    currentUserKey={publicKey}
                    onEdit={startEditing}
                    onViewHistory={viewPostVersions}
                    onViewProfile={viewAuthorProfile}
                    onReply={openReply}
                    onToggleRepost={toggleRepost}
                    onToggleLike={toggleLike}
                    onViewThread={openThread}
                  />
                </div>
              )}

              {threadLoading && (
                <div className="text-muted text-sm">Loading thread…</div>
              )}

              {!threadLoading && threadNodes.length === 0 && (
                <div className="text-muted text-sm">No replies yet.</div>
              )}

              {!threadLoading && threadNodes.length > 0 && (
                <div>
                  {threadNodes.map(node => renderThreadNode(node, 1))}
                </div>
              )}

              {!threadLoading && threadHasMore && (
                <div className="mt-md">
                  <button className="btn btn-secondary btn-sm" onClick={loadMoreThread}>
                    Load more replies
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Author Profile Modal */}
      {viewingProfile && (
        <div className="modal-overlay open" onClick={closeProfile}>
          <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-green">Author Profile</h3>
              <button className="btn btn-sm btn-secondary" onClick={closeProfile}>×</button>
            </div>
            <div className="modal-content">
              {viewingProfileLoading ? (
                <div className="card mb-md">
                  <div className="text-muted">Loading profile…</div>
                </div>
              ) : viewingProfileData ? (
                <div className="card mb-md">
                  <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <div className="flex" style={{ alignItems: 'center', gap: 'var(--space-md)' }}>
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 999,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: viewingProfileData.profile.themeColor || '#00ff88',
                          color: '#0b0b0f',
                          fontSize: 26,
                          boxShadow: '0 0 0 2px rgba(0,0,0,0.25) inset'
                        }}
                      >
                        {avatarEmoji(viewingProfileData.profile.avatarStyle)}
                      </div>
                      <div>
                        <div className="text-lg text-green" style={{ fontWeight: 700 }}>
                          {viewingProfileData.profile.displayName}
                        </div>
                        <div className="technical text-muted text-sm">
                          {viewingProfileData.profile.anonId} • {viewingProfileData.profile.publicKey.substring(0, 10)}…{viewingProfileData.profile.publicKey.substring(viewingProfileData.profile.publicKey.length - 8)}
                        </div>
                      </div>
                    </div>

                    {viewingProfileData.profile.publicKey !== publicKey && (
                      <button
                        className={`btn ${viewingProfileData.viewer.isFollowing ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        onClick={() => toggleFollow(viewingProfileData)}
                        disabled={followBusy || !accessToken}
                        title={!accessToken ? 'Login to follow users' : undefined}
                      >
                        {followBusy ? '…' : (viewingProfileData.viewer.isFollowing ? 'Unfollow' : 'Follow')}
                      </button>
                    )}
                  </div>

                  {viewingProfileData.profile.bio && (
                    <p className="text-muted" style={{ marginTop: 'var(--space-md)' }}>
                      {viewingProfileData.profile.bio}
                    </p>
                  )}

                  <div className="flex" style={{ gap: 'var(--space-md)', marginTop: 'var(--space-md)', flexWrap: 'wrap' }}>
                    <div className="technical text-muted text-sm">Posts: {viewingProfileData.stats.postsCount}</div>
                    <div className="technical text-muted text-sm">Followers: {viewingProfileData.stats.followersCount}</div>
                    <div className="technical text-muted text-sm">Following: {viewingProfileData.stats.followingCount}</div>
                    <div className="technical text-muted text-sm">Reputation: {viewingProfileData.stats.reputationScore}</div>
                  </div>
                </div>
              ) : (
                <div className="card mb-md">
                  <p className="text-sm text-muted mb-sm">Public Key:</p>
                  <div className="seed-phrase-text">{viewingProfile}</div>
                  <p className="text-muted text-sm" style={{ marginTop: 'var(--space-sm)' }}>
                    This user hasn’t created a profile yet.
                  </p>
                </div>
              )}

              <h4 className="text-lg mb-md text-green">
                Posts by this author ({authorPosts.length})
              </h4>
              {authorPosts.map(post => (
                <article key={`author-${post.id}`} className="post-card mb-md">
                  <div className="post-body">
                    <div className="post-text">{post.content}</div>
                    <div className="technical text-muted text-sm">
                      Posted: {new Date(post.created_at).toLocaleString()}
                      {post.updated_at && post.updated_at !== post.created_at &&
                        <span> (edited {new Date(post.updated_at).toLocaleString()})</span>
                      }
                    </div>
                  </div>
                </article>
              ))}
              {authorPosts.length === 0 && (
                <div className="empty-state">
                  <p className="text-muted">No posts found from this author.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile-specific CSS */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-header {
            display: flex !important;
          }
          .sidebar {
            left: ${sidebarOpen ? '0' : '-100%'};
          }
        }
      `}</style>
    </div>
  );
}

export default App;
