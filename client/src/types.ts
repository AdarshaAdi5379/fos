export interface Post {
  id: number;
  post_uuid: string;
  author_key: string;
  content: string;
  signature: string;
  recovery: number;
  created_at: string;
  updated_at: string;
  post_type?: 'post' | 'reply' | 'repost';
  parent_post_uuid?: string | null;
  repost_of_uuid?: string | null;
  reposts_count?: number;

  // Optional author metadata (present in some feed endpoints)
  anon_id?: string | null;
  display_name?: string | null;
  avatar_style?: string | null;

  // Optional engagement metadata (MVP defaults to 0)
  likes_count?: number;
  replies_count?: number;
  viewer_liked?: boolean | number;
  viewer_reposted?: boolean | number;

  // Optional embedded original post fields for repost rendering
  original_post_uuid?: string | null;
  original_author_key?: string | null;
  original_content?: string | null;
  original_created_at?: string | null;
  original_anon_id?: string | null;
  original_display_name?: string | null;
  original_avatar_style?: string | null;
}

export interface PostVersion {
  id: number;
  post_id: number;
  version_number: number;
  content: string;
  signature: string;
  recovery: number;
  created_at: string;
}

export interface Signature {
  signature: string;
  recovery: number;
}

// ── Profile types ───────────────────────────────────────────────────────────

export type AvatarStyle =
  | 'robot_blue'
  | 'fox_gray'
  | 'alien_green'
  | 'ninja_black'
  | 'pixel_pink'
  | 'abstract_cyan';

export interface UserProfile {
  publicKey: string;
  anonId: string;
  displayName: string;
  avatarStyle: AvatarStyle;
  bio: string;
  themeColor: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  reputationScore: number;
}

export interface ProfileViewer {
  isFollowing: boolean;
}

export interface ProfileBundle {
  profile: UserProfile;
  stats: ProfileStats;
  viewer: ProfileViewer;
}

// ── Wallet types ─────────────────────────────────────────────────────────────

export interface Wallet {
  publicKey:  string;
  balance:    number;
  symbol:     string;
  createdAt:  string;
  updatedAt:  string;
}

export type TransactionType      = 'transfer' | 'faucet' | 'tip';
export type TransactionDirection = 'sent' | 'received' | 'other';
export type TransactionStatus    = 'pending' | 'confirmed' | 'failed';

export interface Transaction {
  tx_uuid:       string;
  sender_key:    string | null;
  recipient_key: string;
  amount:        number;
  type:          TransactionType;
  memo:          string | null;
  signature:     string;
  status:        TransactionStatus;
  created_at:    string;
  direction?:    TransactionDirection;
}

export interface TransactionPage {
  transactions: Transaction[];
  pagination: {
    total:   number;
    limit:   number;
    offset:  number;
    hasMore: boolean;
  };
}

export interface FaucetStatus {
  canClaim:       boolean;
  faucetAmount:   number;
  cooldownMs:     number;
  lastClaimedAt?: string;
  nextClaimAt?:   string;
  remainingMs?:   number;
}

export interface TransferResult {
  success:            boolean;
  txUuid:             string;
  amount:             number;
  memo:               string | null;
  senderKey:          string;
  recipientKey:       string;
  newSenderBalance:   number;
  newRecipientBalance: number;
  timestamp:          string;
}
