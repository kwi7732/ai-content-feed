"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import * as PortOne from "@portone/browser-sdk/v2";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess: (addedCredits: number) => void;
}

const PACKAGES = [
  { credits: 10,  amount: 1900,  label: "기본",    badge: null },
  { credits: 50,  amount: 7900,  label: "인기",     badge: "BEST" },
  { credits: 100, amount: 12900, label: "프리미엄", badge: "20% 할인" },
];

export default function PaymentModal({
  isOpen,
  onClose,
  userId,
  onSuccess,
}: PaymentModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PACKAGES[selectedIndex];

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    const paymentId = `pay_${userId.slice(0, 8)}_${Date.now()}`;

    try {
      const response = await PortOne.requestPayment({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        paymentId,
        orderName: `AI Content Feed 크레딧 ${selected.credits}회`,
        totalAmount: selected.amount,
        currency: "CURRENCY_KRW",
        payMethod: "EASY_PAY",
        easyPay: { easyPayProvider: "EASY_PAY_PROVIDER_TOSSPAY" },
        customer: { customerId: userId },
      });

      if (!response || response.code) {
        setError(response?.message ?? "결제가 취소되었습니다.");
        return;
      }

      // 서버 검증 + 크레딧 지급
      const verify = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: response.paymentId,
          credits: selected.credits,
          amount: selected.amount,
        }),
      });

      const result = await verify.json();
      if (!verify.ok) {
        setError(result.error ?? "결제 검증 실패");
        return;
      }

      onSuccess(selected.credits);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "결제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="pay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            key="pay-modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
          >
            <div className="w-full max-w-sm bg-[#16162a] border border-white/10 rounded-2xl p-6 shadow-2xl pointer-events-auto">
              {/* Header */}
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">✨</div>
                <h2 className="text-lg font-bold text-white">크레딧 충전</h2>
                <p className="text-sm text-gray-400 mt-1">
                  무료 사용 30회를 모두 사용했어요.<br />크레딧을 충전해 계속 이용하세요!
                </p>
              </div>

              {/* Package selection */}
              <div className="space-y-2 mb-5">
                {PACKAGES.map((pkg, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`
                      w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all
                      ${selectedIndex === i
                        ? "bg-indigo-600/20 border-indigo-500 text-white"
                        : "bg-white/5 border-white/10 text-gray-300 hover:border-white/20"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{pkg.credits}회 크레딧</span>
                      {pkg.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500 text-white font-bold">
                          {pkg.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold">
                      {pkg.amount.toLocaleString()}원
                    </span>
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                  ⚠️ {error}
                </p>
              )}

              {/* Pay button */}
              <button
                onClick={handlePayment}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all active:scale-95"
              >
                {loading ? "결제 처리 중..." : `토스페이먼츠로 ${selected.amount.toLocaleString()}원 결제`}
              </button>

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
