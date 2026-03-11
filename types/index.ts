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
  expandedPrompt?: string;   // Stage 1에서 확장된 프롬프트 (UI 미리보기용)
  contentType?: string;      // Stage 1에서 자동 분류한 콘텐츠 타입
  tone?: string;             // Stage 1에서 추론한 톤
}

// Stage 1 메타 프롬프트 결과
export interface MetaPromptResult {
  expanded_prompt: string;
  content_type: string;
  tone: string;
  target_audience: string;
}

// State held in the infinite feed
export interface FeedState {
  items: FeedItem[];
  isLoading: boolean;
  hasMore: boolean;
  page: number; // how many batches (of 5) have been fetched
}
