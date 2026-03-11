// Supabase prompts table row
export interface Prompt {
  id: string;
  title: string;
  prompt_text: string;
  category: string;
  usage_count: number;
}

// Individual feed item returned by the AI
export interface FeedItem {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata: string[];
}

// API response from /api/generate
export interface GenerateResponse {
  feed_items: FeedItem[];
  error?: string;
}

// State held in the infinite feed
export interface FeedState {
  items: FeedItem[];
  isLoading: boolean;
  hasMore: boolean;
  page: number; // how many batches (of 5) have been fetched
}
