"use client";

import { Prompt } from "@/types";

interface PresetTagsProps {
  prompts: Prompt[];
  activeId: string | null;
  onSelect: (prompt: Prompt) => void;
}

export default function PresetTags({ prompts, activeId, onSelect }: PresetTagsProps) {
  if (prompts.length === 0) return null;

  return (
    /* 외부 div 에 overflow-hidden 제거, 페이드는 pointer-events-none 으로만 */
    <div className="relative -mx-4">
      {/* Left fade hint */}
      <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#0f0f1a] to-transparent z-10 pointer-events-none rounded-l-full" />
      {/* Right fade hint */}
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#0f0f1a] to-transparent z-10 pointer-events-none rounded-r-full" />

      <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-1">
        {prompts.map((prompt) => {
          const isActive = activeId === prompt.id;

          return (
            <button
              key={prompt.id}
              onClick={() => onSelect(prompt)}
              className={`
                flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium
                border transition-all duration-200 whitespace-nowrap
                ${
                  isActive
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                    : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20 hover:text-white"
                }
              `}
            >
              <span>{prompt.title}</span>
              {prompt.usage_count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-white/10 text-gray-500"
                  }`}
                >
                  {prompt.usage_count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
