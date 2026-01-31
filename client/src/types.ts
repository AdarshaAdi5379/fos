export interface Post {
  id: number;
  post_uuid: string;
  author_key: string;
  content: string;
  signature: string;
  recovery: number;
  created_at: string;
  updated_at: string;
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