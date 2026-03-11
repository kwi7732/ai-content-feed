"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { signOut, getProfile } from "@/lib/auth";
import PresetTags from "@/components/PresetTags";
import InfiniteFeed from "@/components/InfiniteFeed";
import AuthModal from "@/components/AuthModal";
import PaymentModal from "@/components/PaymentModal";
import { Prompt, FeedItem } from "@/types";
import type { User } from "@supabase/supabase-js";

const MAX_BATCHES = 10;
const GUEST_LIMIT = 3;        // 비로그인 최대 사용 횟수
const GUEST_STORAGE_KEY = "ai_feed_guest_count";

function HomeContent() {
  const searchParams = useSearchParams();

  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{
    nickname: string | null;
    avatar_url: string | null;
    free_usage_count: number;
    credits: number;
  } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // ── Feed state ────────────────────────────────────────────────────────────
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const currentPromptRef = useRef("");
  const previousTitlesRef = useRef<string[]>([]);
  const batchCountRef = useRef(0);
  const isLoadingRef = useRef(false);

  // ── Auth subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await getProfile(session.user.id);
        setProfile(p);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const p = await getProfile(session.user.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── Load presets ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("prompts")
        .select("*")
        .order("usage_count", { ascending: false });
      if (data) setPrompts(data as Prompt[]);
    })();
  }, []);

  // ── Shared URL ────────────────────────────────────────────────────────────
  useEffect(() => {
    const sharedId = searchParams.get("prompt");
    if (!sharedId || prompts.length === 0) return;
    const found = prompts.find((p) => p.id === sharedId);
    if (found) handleSelectPreset(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, prompts]);

  // ── Guest usage tracking (localStorage: browser-only) ──────────────────────
  const [guestCount, setGuestCount] = useState(0);

  // 클라이언트에서만 localStorage 접근
  useEffect(() => {
    if (typeof window !== "undefined") {
      setGuestCount(parseInt(localStorage.getItem(GUEST_STORAGE_KEY) ?? "0", 10));
    }
  }, []);

  function getGuestCount(): number {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem(GUEST_STORAGE_KEY) ?? "0", 10);
  }
  function incrementGuestCount() {
    if (typeof window === "undefined") return;
    const next = getGuestCount() + 1;
    localStorage.setItem(GUEST_STORAGE_KEY, String(next));
    setGuestCount(next); // UI 즉시 업데이트
  }

  // ── Usage gate check ──────────────────────────────────────────────────────
  function checkUsageGate(): boolean {
    if (!user) {
      if (getGuestCount() >= GUEST_LIMIT) {
        setShowAuthModal(true);
        return false;
      }
      return true;
    }
    // Logged-in: gate is enforced server-side (402 response)
    return true;
  }

  // ── Core fetch ────────────────────────────────────────────────────────────
  async function fetchBatch(promptText: string, isNewTopic: boolean) {
    if (isLoadingRef.current) return;
    if (!checkUsageGate()) return;

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    if (isNewTopic) {
      previousTitlesRef.current = [];
      batchCountRef.current = 0;
      setFeedItems([]);
      setBatchCount(0);
      setHasMore(false);
    }

    try {
      // Attach auth token if logged in
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: promptText, previousTitles: previousTitlesRef.current }),
      });

      const data = await res.json();

      if (res.status === 402) {
        // Credit exhausted for logged-in user
        setShowPaymentModal(true);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "오류가 발생했습니다.");
        return;
      }

      // Increment guest count on success
      if (!user) incrementGuestCount();

      const newItems: FeedItem[] = data.feed_items ?? [];
      previousTitlesRef.current = [...previousTitlesRef.current, ...newItems.map((i: FeedItem) => i.title)];
      setFeedItems((prev) => isNewTopic && prev.length === 0 ? newItems : [...prev, ...newItems]);

      const nextBatch = batchCountRef.current + 1;
      batchCountRef.current = nextBatch;
      setBatchCount(nextBatch);
      setHasMore(nextBatch < MAX_BATCHES);

      // Refresh profile credit display
      if (user) {
        const p = await getProfile(user.id);
        setProfile(p);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }

  function handleSelectPreset(prompt: Prompt) {
    setActivePromptId(prompt.id);
    setInputValue(prompt.prompt_text);
    currentPromptRef.current = prompt.prompt_text;
    supabase.rpc("increment_usage", { row_id: prompt.id }).then(() => {});
    fetchBatch(prompt.prompt_text, true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setActivePromptId(null);
    currentPromptRef.current = trimmed;
    fetchBatch(trimmed, true);
  }

  function handleLoadMore() {
    const prompt = currentPromptRef.current;
    if (!prompt || batchCountRef.current >= MAX_BATCHES) return;
    fetchBatch(prompt, false);
  }

  async function handleShare() {
    if (!activePromptId) return;
    const url = `${window.location.origin}?prompt=${activePromptId}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  }

  async function handleSignOut() {
    await signOut();
    setFeedItems([]);
  }

  // ── Credit display helper ─────────────────────────────────────────────────
  const freeLeft = profile ? Math.max(0, 30 - profile.free_usage_count) : null;
  // guestCount 는 클라이언트 hydration 후 useState로 관리 (SSR 안전)
  const guestLeft = !user ? Math.max(0, GUEST_LIMIT - guestCount) : null;

  return (
    <div className="min-h-screen min-h-dvh bg-[#0f0f1a] text-white pb-24">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-40 bg-[#0f0f1a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Logo row */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent shrink-0">
              ✦ AI Content Feed
            </h1>

            <div className="flex items-center gap-2 shrink-0">
              {/* Usage badge */}
              {user && profile && (
                <button
                  onClick={() => freeLeft === 0 && profile.credits === 0 && setShowPaymentModal(true)}
                  className="hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400"
                >
                  {freeLeft! > 0 ? (
                    <span>무료 <span className="text-white font-bold">{freeLeft}</span>회 남음</span>
                  ) : (
                    <span>크레딧 <span className="text-indigo-400 font-bold">{profile.credits}</span></span>
                  )}
                </button>
              )}

              {guestLeft !== null && (
                <span className="hidden sm:flex items-center text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                  비로그인 <span className="text-white font-bold mx-1">{guestLeft}</span>회 남음
                </span>
              )}

              {/* Share */}
              {activePromptId && (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-all active:scale-95 whitespace-nowrap"
                >
                  {shareCopied ? (
                    <span className="text-green-400">✓ 복사됨!</span>
                  ) : (
                    <>
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      <span className="hidden xs:inline">공유</span>
                    </>
                  )}
                </button>
              )}

              {/* User avatar or login button */}
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all active:scale-95"
                  title="로그아웃"
                >
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="avatar" className="w-4 h-4 rounded-full" />
                  ) : (
                    <span>👤</span>
                  )}
                  <span className="hidden sm:inline max-w-[80px] truncate">
                    {profile?.nickname ?? "로그아웃"}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-[#FEE500]/10 border border-[#FEE500]/30 text-[#FEE500] hover:bg-[#FEE500]/20 transition-all active:scale-95"
                >
                  로그인
                </button>
              )}
            </div>
          </div>

          {/* Preset tags */}
          <PresetTags
            prompts={prompts}
            activeId={activePromptId}
            onSelect={handleSelectPreset}
          />

          {/* Input form */}
          <form onSubmit={handleSubmit} className="relative flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="프롬프트를 직접 입력하거나 위 태그를 눌러보세요..."
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all active:scale-95"
            >
              생성
            </button>
          </form>

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs"
              >
                <span className="flex-shrink-0 mt-0.5">⚠️</span>
                <span className="break-words">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── Feed ── */}
      <main className="w-full">
        {feedItems.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center pt-20 gap-3 text-gray-500 px-4 text-center">
            <span className="text-5xl">🪄</span>
            <p className="text-sm leading-relaxed">
              프롬프트를 선택하거나<br className="sm:hidden" /> 입력하면 피드가 생성됩니다.
            </p>
          </div>
        )}

        <InfiniteFeed
          items={feedItems}
          isLoading={isLoading}
          hasMore={hasMore && batchCount < MAX_BATCHES}
          onLoadMore={handleLoadMore}
        />
      </main>

      {/* ── Modals ── */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      {user && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          userId={user.id}
          onSuccess={(added) => {
            setProfile((prev) =>
              prev ? { ...prev, credits: prev.credits + added } : prev
            );
          }}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
