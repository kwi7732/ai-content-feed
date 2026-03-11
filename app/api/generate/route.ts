import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { MetaPromptResult } from "@/types";

// ─── In-memory rate limiter (per IP, 5 req/min) ─────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Supabase admin ───────────────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

// ─── AI provider 설정 (코드내 고정) ─────────────────────────────────────────
// 모델 변경 시 이 파일만 수정하면 됨 (env 불필요)
const AI_PROVIDER = "grok" as const;  // "grok" | "openai"

const aiClient = new OpenAI(
  AI_PROVIDER === "grok"
    ? { apiKey: process.env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" }
    : { apiKey: process.env.OPENAI_API_KEY }
);

// Stage 1에는 빠르고 저렴한 모델, Stage 2에는 고품질 모델 사용
const META_MODEL  = AI_PROVIDER === "grok" ? "grok-2"       : "gpt-4o-mini"; // 프롬프트 확장
const MAIN_MODEL  = AI_PROVIDER === "grok" ? "grok-4-fast"  : "gpt-4o";      // 콘텐츠 생성

// ─── Stage 1: 메타 프롬프트 시스템 ──────────────────────────────────────────
const META_SYSTEM_PROMPT = `너는 세계 최고의 AI 콘텐츠 프롬프트 엔지니어야.
사용자가 짧은 키워드나 문장을 주면, 최고 품질의 콘텐츠를 생성할 수 있도록
전문적이고 구체적인 프롬프트로 확장해.

규칙:
- 한국어로 작성
- 구체적인 타겟 독자, 구체적인 포맷, 원하는 결과물의 깊이를 명시
- 너무 길지 않게 (100자~200자 사이)
- 인사말, 설명 없이 반드시 아래 JSON만 반환

JSON 스키마:
{
  "expanded_prompt": "확장된 전문 프롬프트",
  "content_type": "숏폼대본 | 아이디어 | 소설 | 마케팅카피 | 블로그 | 기획서 | 기타",
  "tone": "유머 | 전문적 | 감성적 | 직접적 | 창의적",
  "target_audience": "타겟 독자 (10자 이내)"
}`;

// ─── Stage 2: 콘텐츠 생성 시스템 ────────────────────────────────────────────
const CONTENT_SYSTEM_PROMPT = `너는 만능 콘텐츠 크리에이터야.
사용자의 요청에 따라 콘텐츠를 생성하되, 어떠한 인사말이나 부연 설명 없이
반드시 아래의 JSON 규격으로만 출력해.

JSON 스키마:
{
  "feed_items": [
    {
      "id": "고유 문자열 (예: item_1)",
      "type": "콘텐츠 종류 (예: 숏폼대본, 아이디어, 소설 등)",
      "title": "콘텐츠 제목",
      "content": "생성된 전체 내용 (매우 길 수 있음)",
      "metadata": ["해시태그1", "해시태그2", "해시태그3"]
    }
  ]
}

반드시 feed_items 배열에 정확히 5개의 항목을 담아 반환해. 각 항목의 id는 서로 달라야 해.`;

// ─── Stage 1: 프롬프트 확장 ──────────────────────────────────────────────────
async function expandPrompt(
  rawInput: string,
  previousTitles: string[]
): Promise<MetaPromptResult> {
  let userMsg = `키워드/요청: "${rawInput}"`;
  if (previousTitles.length > 0) {
    userMsg += `\n\n이미 생성된 콘텐츠 제목들: ${previousTitles.slice(-10).map(t => `"${t}"`).join(", ")}`;
    userMsg += `\n위 콘텐츠들과 완전히 다른 새로운 각도의 확장 프롬프트를 만들어.`;
  }

  const res = await aiClient.chat.completions.create({
    model: META_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: META_SYSTEM_PROMPT },
      { role: "user",   content: userMsg },
    ],
    temperature: 0.7,
    max_tokens: 512,
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<MetaPromptResult>;

  return {
    expanded_prompt:  parsed.expanded_prompt  ?? rawInput,
    content_type:     parsed.content_type     ?? "기타",
    tone:             parsed.tone             ?? "직접적",
    target_audience:  parsed.target_audience  ?? "",
  };
}

// ─── Stage 2: 콘텐츠 생성 ────────────────────────────────────────────────────
async function generateContent(
  expandedPrompt: string,
  contentType: string,
  previousTitles: string[]
): Promise<{ feed_items: unknown[] }> {
  let userMsg = expandedPrompt;
  if (previousTitles.length > 0) {
    const titlesStr = previousTitles.slice(-20).map(t => `"${t}"`).join(", ");
    userMsg += `\n\n⚠️ 중복 방지: 이미 생성된 ${titlesStr} 와 완전히 다른 새로운 콘텐츠 5개만 생성해.`;
  }
  userMsg += `\n\n콘텐츠 형식: ${contentType}`;

  const res = await aiClient.chat.completions.create({
    model: MAIN_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CONTENT_SYSTEM_PROMPT },
      { role: "user",   content: userMsg },
    ],
    temperature: 0.9,
    max_tokens: 4096,
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw);
}

// ─── POST /api/generate ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. IP Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (1분에 5회 제한)" },
      { status: 429 }
    );
  }

  // 2. Parse body
  const body = await req.json().catch(() => null);
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "prompt 필드가 필요합니다." }, { status: 400 });
  }

  const { prompt, previousTitles = [] }: { prompt: string; previousTitles: string[] } = body;

  // 3. Auth check + credit/usage gate
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("free_usage_count, credits")
        .eq("id", user.id)
        .single();

      const freeCount = profile?.free_usage_count ?? 0;
      const credits   = profile?.credits ?? 0;

      if (freeCount < 30) {
        await supabaseAdmin.rpc("increment_free_usage", { user_id: user.id });
      } else if (credits > 0) {
        const remaining = await supabaseAdmin.rpc("deduct_credit", { user_id: user.id });
        if ((remaining.data ?? -1) < 0) {
          return NextResponse.json({ error: "credit_exhausted", credits: 0 }, { status: 402 });
        }
      } else {
        return NextResponse.json({ error: "credit_exhausted", credits: 0 }, { status: 402 });
      }
    }
  }

  // 4. 2단계 메타 프롬프팅 파이프라인
  try {
    // ── Stage 1: 프롬프트 최적화 ──
    console.log("\n" + "═".repeat(60));
    console.log(`📝 [Stage 1] 프롬프트 확장 중... (${META_MODEL})`);
    console.log(`   입력: "${prompt}"`);

    const meta = await expandPrompt(prompt, previousTitles);

    console.log(`✅ [Stage 1] 완료`);
    console.log(`   타입: ${meta.content_type} | 톤: ${meta.tone} | 타겟: ${meta.target_audience}`);
    console.log(`   확장: ${meta.expanded_prompt}`);
    console.log("─".repeat(60));

    // ── Stage 2: 콘텐츠 생성 ──
    console.log(`🚀 [Stage 2] 콘텐츠 생성 중... (${MAIN_MODEL})`);

    const result = await generateContent(meta.expanded_prompt, meta.content_type, previousTitles);

    if (!Array.isArray(result.feed_items)) {
      return NextResponse.json(
        { error: "AI 응답 형식 오류. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    console.log(`✅ [Stage 2] ${result.feed_items.length}개 아이템 생성 완료`);
    console.log("═".repeat(60) + "\n");

    return NextResponse.json({
      feed_items:     result.feed_items,
      expandedPrompt: meta.expanded_prompt,
      contentType:    meta.content_type,
      tone:           meta.tone,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[/api/generate] error:", message);
    return NextResponse.json({ error: `AI 호출 실패: ${message}` }, { status: 500 });
  }
}
