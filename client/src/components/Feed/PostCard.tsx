import { Post } from '../../types';

interface PostCardProps {
  post: Post;
  currentUserKey: string;
  onEdit?: (post: Post) => void;
  onViewHistory?: (postId: number) => void;
  onViewProfile?: (authorKey: string) => void;
  onReply?: (post: Post) => void;
  onToggleRepost?: (post: Post) => void;
  onToggleLike?: (post: Post) => void;
  onViewThread?: (post: Post) => void;
}

const AVATAR_EMOJI: Record<string, string> = {
  robot_blue: '🤖',
  fox_gray: '🦊',
  alien_green: '👽',
  ninja_black: '🥷',
  pixel_pink: '🟪',
  abstract_cyan: '🔷',
};

// Generate a simple identicon character from public key
const generateIdenticon = (key: string): string => {
  if (!key || key.length < 3) return '?';
  return key.substring(2, 3).toUpperCase();
};

// Truncate public key for display
const truncateKey = (key: string): string => {
  if (!key || key.length < 16) return key;
  return `0x${key.substring(2, 8)}...${key.substring(key.length - 4)}`;
};

// Format timestamp to relative time
const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return then.toLocaleDateString();
};

export function PostCard({ 
  post, 
  currentUserKey, 
  onEdit, 
  onViewHistory, 
  onViewProfile,
  onReply,
  onToggleRepost,
  onToggleLike,
  onViewThread
}: PostCardProps) {
  const isOwnPost = post.author_key === currentUserKey;
  const timeAgo = formatTimeAgo(post.created_at);
  const wasEdited = post.updated_at && post.updated_at !== post.created_at;
  const likesCount = typeof post.likes_count === 'number' ? post.likes_count : 0;
  const repliesCount = typeof post.replies_count === 'number' ? post.replies_count : 0;
  const viewerLiked = post.viewer_liked === true || post.viewer_liked === 1;
  const viewerReposted = post.viewer_reposted === true || post.viewer_reposted === 1;
  const authorLabel = post.display_name ? post.display_name : truncateKey(post.author_key);
  const avatarChar = post.avatar_style ? (AVATAR_EMOJI[post.avatar_style] || '◉') : generateIdenticon(post.author_key);
  const isRepost = post.post_type === 'repost' && !!post.repost_of_uuid;

  const originalAuthorKey = post.original_author_key || '';
  const originalAuthorLabel = post.original_display_name
    ? post.original_display_name
    : (originalAuthorKey ? truncateKey(originalAuthorKey) : 'Unknown');
  const originalAvatarChar = post.original_avatar_style
    ? (AVATAR_EMOJI[post.original_avatar_style] || '◉')
    : (originalAuthorKey ? generateIdenticon(originalAuthorKey) : '◉');
  const originalTimeAgo = post.original_created_at ? formatTimeAgo(post.original_created_at) : '';

  return (
    <article className="post-card">
      <div className="post-layout">
        {/* Avatar Column */}
        <div className="post-avatar">
          <div className="avatar-circle" title={post.avatar_style || post.author_key}>
            {avatarChar}
          </div>
        </div>

        {/* Content Column */}
        <div className="post-body">
          {/* Header */}
          <div className="post-header">
            <button 
              className="author-key-btn"
              onClick={() => onViewProfile?.(post.author_key)}
              title="View profile"
            >
              {authorLabel}
            </button>
            {post.anon_id && (
              <>
                <span className="post-separator">·</span>
                <span className="technical text-muted text-sm">{post.anon_id}</span>
              </>
            )}
            {isRepost && (
              <>
                <span className="post-separator">·</span>
                <span className="technical text-muted text-sm">reposted</span>
              </>
            )}
            <span className="post-separator">·</span>
            <span className="post-time">{timeAgo}</span>
          </div>

          {/* Content */}
          {!isRepost && (
            <div className="post-text">
              {post.content}
            </div>
          )}

          {isRepost && (
            <div className="card" style={{ marginTop: 'var(--space-sm)', borderColor: 'rgba(0, 255, 136, 0.25)' }}>
              {post.original_post_uuid ? (
                <>
                  <div className="post-header" style={{ marginBottom: 'var(--space-sm)' }}>
                    <div className="avatar-circle" style={{ width: 28, height: 28, fontSize: 14 }} title={post.original_avatar_style || originalAuthorKey}>
                      {originalAvatarChar}
                    </div>
                    <button
                      className="author-key-btn"
                      onClick={() => originalAuthorKey && onViewProfile?.(originalAuthorKey)}
                      title="View original author"
                      style={{ marginLeft: 'var(--space-sm)' }}
                    >
                      {originalAuthorLabel}
                    </button>
                    {post.original_anon_id && (
                      <>
                        <span className="post-separator">·</span>
                        <span className="technical text-muted text-sm">{post.original_anon_id}</span>
                      </>
                    )}
                    {originalTimeAgo && (
                      <>
                        <span className="post-separator">·</span>
                        <span className="post-time">{originalTimeAgo}</span>
                      </>
                    )}
                  </div>
                  <div className="post-text">{post.original_content}</div>
                </>
              ) : (
                <div className="text-muted text-sm">Original post unavailable.</div>
              )}
            </div>
          )}

          {/* Signature Badge */}
          <div className="signature-badge">
            <span className="badge-icon">✓</span>
            <span className="badge-text">Signature Verified</span>
          </div>

          {/* Actions */}
          <div className="post-actions-row">
            <button className="action-btn" title="Reply" onClick={() => onReply?.(post)}>
              <span className="action-icon">↩</span>
              <span>Reply{repliesCount ? ` (${repliesCount})` : ''}</span>
            </button>
            <button className="action-btn" title={viewerLiked ? 'Unlike' : 'Like'} onClick={() => onToggleLike?.(post)}>
              <span className="action-icon">♥</span>
              <span>{viewerLiked ? 'Liked' : 'Like'}{likesCount ? ` (${likesCount})` : ''}</span>
            </button>
            <button className="action-btn" title={viewerReposted ? 'Undo repost' : 'Repost'} onClick={() => onToggleRepost?.(post)}>
              <span className="action-icon">⟲</span>
              <span>{viewerReposted ? 'Reposted' : 'Repost'}</span>
            </button>
            <button 
              className="action-btn" 
              onClick={() => onViewHistory?.(post.id)}
              title="View History"
            >
              <span className="action-icon">⧗</span>
              <span>History</span>
            </button>
            <button
              className="action-btn"
              onClick={() => onViewThread?.(post)}
              title="View Thread"
            >
              <span className="action-icon">🧵</span>
              <span>Thread</span>
            </button>
            {isOwnPost && onEdit && (
              <button 
                className="action-btn" 
                onClick={() => onEdit(post)}
                title="Edit Post"
              >
                <span className="action-icon">✎</span>
                <span>Edit</span>
              </button>
            )}
          </div>

          {/* Edit indicator */}
          {wasEdited && (
            <div className="edit-indicator">
              Edited {formatTimeAgo(post.updated_at)}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default PostCard;
