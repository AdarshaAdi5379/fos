import { useState, useEffect } from 'react';
import { CryptoManager } from './crypto';
import { Post, PostVersion } from './types';
import { getApiUrl, getWebSocketUrl } from './config';

const cryptoManager = new CryptoManager();

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState('');
  const [error, setError] = useState('');
  const [editingPost, setEditingPost] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [viewingVersions, setViewingVersions] = useState<number | null>(null);
  const [postVersions, setPostVersions] = useState<PostVersion[]>([]);
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [authorPosts, setAuthorPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkExistingSession();
    fetchPosts();
    
    let ws: WebSocket | null = null;
    
    const connectWebSocket = () => {
      try {
        const wsUrl = getWebSocketUrl();
        console.log(`🔌 Attempting WebSocket connection to ${wsUrl}`);
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected successfully');
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
              case 'new_post':
                setPosts(prev => [message.data, ...prev.slice(0, 99)]);
                break;
              case 'post_updated':
                setPosts(prev => prev.map(post => 
                  post.id === message.data.id ? message.data : post
                ));
                break;
              case 'connected':
                console.log('Connected to real-time updates');
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
          
          if (event.code !== 1000 && event.code !== 1006) {
            console.log('🔄 Attempting to reconnect in 5 seconds...');
            setTimeout(connectWebSocket, 5000);
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close(1000, 'Component unmounted');
      }
    };
  }, []);

  const checkExistingSession = () => {
    const storedSeed = localStorage.getItem('unbound-seed');
    if (storedSeed) {
      const pwd = prompt('Enter password to decrypt your seed phrase:');
      if (pwd) {
        setPassword(pwd);
      }
    }
  };

  const generateNewIdentity = async () => {
    try {
      setIsLoading(true);
      const seed = cryptoManager.generateSeedPhrase();
      setSeedPhrase(seed);
      await cryptoManager.deriveKeys();
      setPublicKey(cryptoManager.getPublicKey());
      setIsAuthenticated(true);
      setError('');
    } catch (error) {
      setError('Failed to generate identity: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithSeed = async () => {
    try {
      setIsLoading(true);
      cryptoManager.setSeedPhrase(seedPhrase);
      await cryptoManager.deriveKeys();
      setPublicKey(cryptoManager.getPublicKey());
      setIsAuthenticated(true);
      setError('');
    } catch (err) {
      setError('Invalid seed phrase');
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPassword = async () => {
    try {
      setIsLoading(true);
      const decrypted = await cryptoManager.retrieveSeedPhrase(password);
      if (decrypted) {
        setSeedPhrase(decrypted);
        await cryptoManager.deriveKeys();
        setPublicKey(cryptoManager.getPublicKey());
        setIsAuthenticated(true);
        setError('');
      } else {
        setError('Invalid password or no stored seed found');
      }
    } catch (err) {
      setError('Failed to decrypt seed phrase');
    } finally {
      setIsLoading(false);
    }
  };

  const storeIdentity = async () => {
    if (password) {
      try {
        setIsLoading(true);
        const success = await cryptoManager.storeSeedPhrase(password);
        if (success) {
          setError('');
          alert('Identity stored securely');
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

  const createPost = async () => {
    if (!newPost.trim()) return;

    try {
      setIsLoading(true);
      if (!publicKey) {
        setError('Public key not available. Try regenerating identity.');
        return;
      }
      
      const signature = await cryptoManager.signMessage(newPost);
      
      const response = await fetch(getApiUrl('/api/posts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newPost,
          publicKey: publicKey,
          signature: signature.signature,
          recovery: signature.recovery
        })
      });

      if (response.ok) {
        setNewPost('');
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

  const editPost = async (postId: number) => {
    if (!editContent.trim()) return;

    try {
      setIsLoading(true);
      const signature = await cryptoManager.signMessage(editContent);
      const response = await fetch(getApiUrl(`/api/posts/${postId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(getApiUrl(`/api/identities/${authorKey}/posts`));
      const posts = await response.json();
      setAuthorPosts(posts);
      setViewingProfile(authorKey);
    } catch (err) {
      setError('Failed to fetch author posts');
    }
  };

  const closeProfile = () => {
    setViewingProfile(null);
    setAuthorPosts([]);
  };

  const fetchPosts = async () => {
    try {
      const response = await fetch(getApiUrl('/api/posts'));
      const data = await response.json();
      const sortedData = data.sort((a: Post, b: Post) => b.id - a.id);
      setPosts(sortedData);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setSeedPhrase('');
    setPassword('');
    setPublicKey('');
    setPosts([]);
    setNewPost('');
    setError('');
  };

  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <div className="container">
          <div className="auth-section fade-in">
            <div className="text-center mb-lg">
              <h1 className="text-3xl font-bold mb-sm">🔐 Unbound</h1>
              <p className="text-secondary">Cryptographically Pseudonymous Expression</p>
            </div>

            {error && (
              <div className="card mb-md" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
                <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
              </div>
            )}

            <div className="auth-section">
              <h3 className="text-lg mb-md">Generate New Identity</h3>
              <button 
                className="btn btn-lg mb-md" 
                onClick={generateNewIdentity}
                disabled={isLoading}
              >
                {isLoading ? <span className="loading-spinner-sm"></span> : '🎲'} Generate New Seed Phrase
              </button>
              {seedPhrase && (
                <div className="card">
                  <p className="text-sm mb-sm"><strong>⚠️ Your Seed Phrase (save this!):</strong></p>
                  <div className="seed-phrase-text mb-md">{seedPhrase}</div>
                  <div className="flex gap-sm">
                    <input 
                      className="input"
                      type="password" 
                      placeholder="Password to encrypt seed"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button 
                      className="btn" 
                      onClick={storeIdentity}
                      disabled={isLoading || !password}
                    >
                      🔒 Store Identity
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="auth-section">
              <h3 className="text-lg mb-md">Restore Existing Identity</h3>
              <textarea
                className="input mb-md"
                placeholder="Enter your 12-word seed phrase"
                value={seedPhrase}
                onChange={(e) => setSeedPhrase(e.target.value)}
                rows={3}
              />
              <button 
                className="btn btn-secondary mb-md" 
                onClick={loginWithSeed}
                disabled={isLoading || !seedPhrase}
              >
                🔄 Login with Seed
              </button>
            </div>

            <div className="auth-section">
              <h3 className="text-lg mb-md">Quick Login (if stored)</h3>
              <div className="flex gap-sm mb-md">
                <input
                  className="input"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  className="btn" 
                  onClick={loginWithPassword}
                  disabled={isLoading || !password}
                >
                  ⚡ Login with Password
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="container">
        {/* Header */}
        <header className="main-navigation">
          <div className="flex items-center gap-md">
            <h1 className="text-2xl font-bold">🔐 Unbound</h1>
            <span className="text-sm text-secondary">Cryptographic Social Platform</span>
          </div>
          <button className="btn btn-sm btn-danger" onClick={handleLogout}>
            🚪 Logout
          </button>
        </header>

        {/* Error Display */}
        {error && (
          <div className="card mb-md" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
            <p style={{ color: '#dc2626', margin: 0 }}>❌ {error}</p>
          </div>
        )}

        {/* Identity Display */}
        <section className="auth-section">
          <h3 className="text-lg mb-md">🔑 Your Identity</h3>
          <div className="card">
            <p className="text-sm text-secondary mb-sm">Public Key:</p>
            <div className="seed-phrase-text">{publicKey}</div>
          </div>
        </section>

        {/* Create Post */}
        <section className="auth-section">
          <h3 className="text-lg mb-md">✍️ Create Post</h3>
          <div className="card">
            <textarea
              className="input mb-md"
              placeholder="What's on your mind?"
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              rows={4}
            />
            <button 
              className="btn" 
              onClick={createPost}
              disabled={isLoading || !newPost.trim()}
            >
              {isLoading ? <span className="loading-spinner-sm"></span> : '📝'} Post
            </button>
          </div>
        </section>

        {/* Global Feed */}
        <section className="mb-xl">
          <h3 className="text-xl mb-lg">🌍 Global Feed</h3>
          <div className="posts-list">
            {posts.map(post => (
              <article key={`main-post-${post.id}-${post.author_key?.substring(0, 10)}`} className="post fade-in">
                {editingPost === post.id ? (
                  <div>
                    <textarea
                      className="input mb-md"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      placeholder="Edit your post..."
                    />
                    <div className="post-actions">
                      <button 
                        className="btn btn-sm" 
                        onClick={() => editPost(post.id)}
                        disabled={isLoading || !editContent.trim()}
                      >
                        💾 Save Edit
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                        ❌ Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="post-content">{post.content}</div>
                )}
                
                <div className="post-meta">
                  <div className="post-key">
                    <span>👤 </span>
                    <span 
                      className="author-link"
                      onClick={() => viewAuthorProfile(post.author_key)}
                    >
                      {post.author_key.substring(0, 20)}...
                    </span>
                    <span> • 🕒 {new Date(post.created_at).toLocaleString()}</span>
                    {post.updated_at && post.updated_at !== post.created_at && 
                      <span> • ✏️ edited at {new Date(post.updated_at).toLocaleString()}</span>
                    }
                  </div>
                  <div className="post-actions">
                    {post.author_key === publicKey && editingPost !== post.id && (
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => startEditing(post)}
                      >
                        ✏️ Edit
                      </button>
                    )}
                    <button 
                      className="btn btn-sm btn-secondary" 
                      onClick={() => viewPostVersions(post.id)}
                    >
                      📜 History
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {posts.length === 0 && (
              <div className="card text-center">
                <p className="text-secondary">No posts yet. Be the first to speak! 🎤</p>
              </div>
            )}
          </div>
        </section>

        {/* Post Versions Modal */}
        {viewingVersions && (
          <div className="modal-overlay open" onClick={closeVersions}>
            <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📜 Post Version History</h3>
                <button className="btn btn-sm" onClick={closeVersions}>❌</button>
              </div>
              <div className="modal-content">
                {postVersions.map((version, index) => (
                  <article key={`version-${version.id}-${index}`} className="post mb-md">
                    <h4 className="text-lg mb-sm">Version {version.version_number} {index === 0 && "(Original)"}</h4>
                    <div className="post-content mb-sm">{version.content}</div>
                    <div className="post-key">
                      🕒 Created: {new Date(version.created_at).toLocaleString()}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Author Profile Modal */}
        {viewingProfile && (
          <div className="modal-overlay open" onClick={closeProfile}>
            <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>👤 Author Profile</h3>
                <button className="btn btn-sm" onClick={closeProfile}>❌</button>
              </div>
              <div className="modal-content">
                <div className="card mb-md">
                  <p className="text-sm text-secondary mb-sm">Public Key:</p>
                  <div className="seed-phrase-text">{viewingProfile}</div>
                </div>
                <h4 className="text-lg mb-md">📝 Posts by this author ({authorPosts.length})</h4>
                {authorPosts.map(post => (
                  <article key={`author-${post.id}`} className="post mb-md">
                    <div className="post-content mb-sm">{post.content}</div>
                    <div className="post-key">
                      🕒 Posted: {new Date(post.created_at).toLocaleString()}
                      {post.updated_at && post.updated_at !== post.created_at && 
                        <span> • ✏️ edited at {new Date(post.updated_at).toLocaleString()}</span>
                      }
                    </div>
                  </article>
                ))}
                {authorPosts.length === 0 && (
                  <div className="card text-center">
                    <p className="text-secondary">No posts found from this author.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;