import React from 'react';
import PostCard from './PostCard';
import Loading from '../Common/Loading';

const FeedContainer = ({ mode, searchQuery, filters, posts }) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  
  const filteredPosts = React.useMemo(() => {
    let filtered = posts;
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(post => 
        post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.author_key.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply mode-specific filters
    if (mode === 'quality') {
      filtered = filtered.filter(post => filters.highQuality && post.word_count > 50);
    }
    
    if (mode === 'activity') {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      filtered = filtered.filter(post => 
        new Date(post.created_at) > twentyFourHoursAgo
      );
    }
    
    if (mode === 'trending') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(post => {
        const postAge = Date.now() - new Date(post.created_at).getTime();
        const postScore = post.reply_count * 5 + post.quote_count * 10;
        return postAge < sevenDaysAgo && postScore > 0;
      }).sort((a, b) => {
        const aScore = a.reply_count * 5 + a.quote_count * 10;
        const bScore = b.reply_count * 5 + b.quote_count * 10;
        return bScore - aScore;
      });
    }
    
    // Apply date range filter
    if (filters.dateRange) {
      const now = new Date();
      let startDate;
      
      switch (filters.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay(), 0, 0, 0, 0);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        filtered = filtered.filter(post => 
          new Date(post.created_at) >= startDate
        );
      }
    }
    
    // Apply author filter
    if (filters.author) {
      filtered = filtered.filter(post => 
        post.author_key === filters.author
      );
    }
    
    // Apply other filters
    if (filters.noSpam) {
      filtered = filtered.filter(post => 
        !post.is_marked_spam
      );
    }
    
    if (filters.hasMedia) {
      filtered = filtered.filter(post => 
        post.has_media
      );
    }
    
    return filtered.slice(visibleRange.start, visibleRange.end);
  }, [posts, mode, searchQuery, filters]);
  
  const handleVirtualScroll = () => {
    setVisibleRange(prev => ({
      start: prev.start + 10,
      end: prev.end + 10
    }));
  };
  
  const getPostKey = (post, index) => {
    return `feed-${mode}-${post.id}-${index}`;
  };
  
  return (
    <div className="feed-container">
      {posts.length === 0 ? (
        <Loading message="No posts found" size="lg" />
      ) : (
        <div className="posts-list">
          {posts.map((post, index) => (
            <div key={getPostKey(post, index)} className="post-item">
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}
      
      {posts.length > visibleRange.end && (
        <div className="load-more">
          <Button onClick={handleVirtualScroll} variant="secondary">
            Load More Posts
          </Button>
        </div>
      )}
    </div>
  );
};

export default FeedContainer;