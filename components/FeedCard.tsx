"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { FeedItem } from "@/types";

interface FeedCardProps {
  item: FeedItem;
  index: number;
}

export default function FeedCard({ item, index }: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: "easeOut" }}
      /* overflow-hidden 제거 → 그라데이션을 카드 외부에서 관리 */
      className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl shadow-xl"
    >
      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-3">
        <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-2 max-w-full truncate">
          {item.type}
        </span>
        <h2 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2 break-words">
          {item.title}
        </h2>
      </div>

      {/* Content with gradient fade */}
      <div className="relative px-4 sm:px-6">
        <motion.div
          animate={{ height: expanded ? "auto" : "7rem" }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
            {item.content}
          </p>
        </motion.div>

        {/* Gradient overlay — only when collapsed */}
        <AnimatePresence>
          {!expanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#1a1a2e] to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>
      </div>

      {/* More / Less button */}
      <div className="px-4 sm:px-6 pt-2 pb-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors active:scale-95"
        >
          {expanded ? "▲ 접기" : "▼ 더보기"}
        </button>
      </div>

      {/* Hashtags */}
      {item.metadata?.length > 0 && (
        <div className="px-4 sm:px-6 pb-3 flex flex-wrap gap-1.5">
          {item.metadata.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10 break-all"
            >
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      {/* Footer actions */}
      <div className="px-4 sm:px-6 pb-4 flex items-center gap-3 border-t border-white/5 pt-3">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors active:scale-95"
        >
          {copied ? (
            <span className="text-green-400">✓ 복사됨</span>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              내용 복사
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
