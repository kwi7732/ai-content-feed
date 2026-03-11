"use client";

import { motion, AnimatePresence } from "framer-motion";
import { signInWithKakao } from "@/lib/auth";
import { useState } from "react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [loading, setLoading] = useState(false);

  const handleKakaoLogin = async () => {
    setLoading(true);
    try {
      await signInWithKakao();
      // 리다이렉트 발생 — 이후 코드 실행 안 됨
    } catch {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="auth-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="auth-modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
          >
            <div className="w-full max-w-sm bg-[#16162a] border border-white/10 rounded-2xl p-6 shadow-2xl pointer-events-auto">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-2xl">
                  🪄
                </div>
              </div>

              {/* Title */}
              <h2 className="text-center text-lg font-bold text-white mb-1">
                무료 체험이 끝났어요
              </h2>
              <p className="text-center text-sm text-gray-400 mb-6 leading-relaxed">
                비로그인 사용자는 <span className="text-white font-semibold">3회</span>까지 무료예요.
                <br />
                로그인하면 <span className="text-indigo-400 font-semibold">30회 추가 무료</span>로 이용할 수 있어요!
              </p>

              {/* Kakao login button */}
              <button
                onClick={handleKakaoLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#FEE500] hover:bg-[#f0d800] disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95 font-semibold text-[#191600] text-sm"
              >
                {loading ? (
                  <span className="animate-spin text-base">⏳</span>
                ) : (
                  /* Kakao logo SVG */
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M9 0.5C4.029 0.5 0 3.713 0 7.7c0 2.553 1.696 4.8 4.264 6.1L3.2 17.2a.3.3 0 0 0 .46.327L8.1 14.3c.294.029.594.044.9.044 4.971 0 9-3.213 9-7.2C18 3.713 13.971.5 9 .5z"
                      fill="#191600"
                    />
                  </svg>
                )}
                카카오 로그인
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="mt-3 w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                나중에 할게요
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
