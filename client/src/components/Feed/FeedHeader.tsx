interface Tab {
  id: string;
  label: string;
}

interface FeedHeaderProps {
  title: string;
  activeTab?: string;
  tabs?: Tab[];
  onTabChange?: (tabId: string) => void;
}

export function FeedHeader({ title, activeTab, tabs = [], onTabChange }: FeedHeaderProps) {
  return (
    <header className="feed-header">
      <h1 className="feed-title glow-green">{title}</h1>
      
      {tabs.length > 0 && (
        <div className="feed-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

export default FeedHeader;
