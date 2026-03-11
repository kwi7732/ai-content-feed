"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import FeedCard from "./FeedCard";
import { FeedItem } from "@/types";

interface InfiniteFeedProps {
  items: FeedItem[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const MAX_BATCHES = 10;

export default function InfiniteFeed({
  items,
  isLoading,
  hasMore,
  onLoadMore,
}: InfiniteFeedProps) {
  const loadingRef = useRef(false);

  function handleLoadMore() {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    onLoadMore();
  }

  // 로딩 끝나면 잠금 해제
  if (!isLoading) loadingRef.current = false;

  if (items.length === 0 && !isLoading) return null;

  const currentBatch = Math.ceil(items.length / 5);
  const reachedCap = currentBatch >= MAX_BATCHES;

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 space-y-4 px-3 sm:px-4">
      {items.map((item, i) => (
        <FeedCard key={`${item.id}-${i}`} item={item} index={i % 5} />
      ))}

      {/* 로딩 스켈레톤 */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-48 rounded-2xl bg-white/5 border border-white/10 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* 더 불러오기 버튼 */}
      {hasMore && !reachedCap && !isLoading && items.length > 0 && (
        <div className="flex justify-center pt-2 pb-6">
          <button
            onClick={handleLoadMore}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 hover:border-indigo-500/40 hover:text-white transition-all active:scale-95 font-medium"
          >
            <span>✦</span>
            <span>5개 더 불러오기</span>
            <span className="text-xs text-gray-500">({currentBatch * 5}/{MAX_BATCHES * 5})</span>
          </button>
        </div>
      )}

      {/* 최대 한도 도달 */}
      {reachedCap && !isLoading && (
        <p className="text-center text-sm text-gray-500 pb-10">
          ✅ 1개 주제당 최대 50개까지 생성됩니다. 새 주제를 입력해 보세요!
        </p>
      )}

      {/* 피드 끝 */}
      {!hasMore && !reachedCap && items.length > 0 && !isLoading && (
        <p className="text-center text-sm text-gray-500 pb-10">— 피드 끝 —</p>
      )}
    </div>
  );
}
