import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

// ─── AI provider 설정 (코드내 고정) ───────────────────────────────────
// 모델 변경 시 이 파일만 수정만 하면 됨 (env 불필요)
const AI_PROVIDER = "grok" as const;  // "grok" | "openai"

const openai = new OpenAI(
  AI_PROVIDER === "grok"
    ? { apiKey: process.env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" }
    : { apiKey: process.env.OPENAI_API_KEY }
);

const AI_MODEL = AI_PROVIDER === "grok" ? "grok-4-fast" : "gpt-4o-mini";

// ─── System prompt (JSON mode enforced) ─────────────────────────────────────
const SYSTEM_PROMPT = `너는 만능 콘텐츠 크리에이터야. 사용자의 요청에 따라 콘텐츠를 생성하되, 어떠한 인사말이나 부연 설명 없이 반드시 아래의 JSON 규격으로만 출력해.

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
    // ── 로그인 사용자 ────────────────────────────────────────────
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("free_usage_count, credits")
        .eq("id", user.id)
        .single();

      const freeCount = profile?.free_usage_count ?? 0;
      const credits = profile?.credits ?? 0;

      if (freeCount < 30) {
        // 무료 사용 가능 → free_usage_count 증가
        await supabaseAdmin.rpc("increment_free_usage", { user_id: user.id });
      } else if (credits > 0) {
        // 크레딧 차감
        const remaining = await supabaseAdmin.rpc("deduct_credit", { user_id: user.id });
        if ((remaining.data ?? -1) < 0) {
          return NextResponse.json({ error: "credit_exhausted", credits: 0 }, { status: 402 });
        }
      } else {
        // 무료 다 씀 + 크레딧 없음
        return NextResponse.json({ error: "credit_exhausted", credits: 0 }, { status: 402 });
      }
    }
  }
  // 비로그인 사용자는 프론트엔드 localStorage에서 3회 제어 (서버는 IP 제한만 적용)

  // 4. Build user message with deduplication context
  let userMessage = prompt;
  if (previousTitles.length > 0) {
    const titlesStr = previousTitles.map((t) => `"${t}"`).join(", ");
    userMessage +=
      `\n\n⚠️ 중복 방지: 이미 생성된 콘텐츠 제목은 ${titlesStr} 이야. ` +
      `이 내용들과 중복되거나 유사하지 않은 완전히 새로운 콘텐츠 5개를 생성해.`;
  }

  // ── 🔍 DEBUG: 실제 전송 프롬프트 출력 ──────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📤 [/api/generate] AI 전송 페이로드");
  console.log("═".repeat(60));
  console.log("🖥  MODEL  :", AI_MODEL, `(${AI_PROVIDER})`);
  console.log("🌡  TEMP   :", 0.9);
  console.log("📋 SYSTEM :\n", SYSTEM_PROMPT);
  console.log("-".repeat(60));
  console.log("👤 USER   :\n", userMessage);
  console.log("═".repeat(60) + "\n");
  // ────────────────────────────────────────────────────────────────────

  // 5. Call OpenAI with JSON mode
  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 4096,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.feed_items)) {
      return NextResponse.json(
        { error: "AI 응답 형식 오류. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json({ feed_items: parsed.feed_items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[/api/generate] error:", message);
    return NextResponse.json({ error: `AI 호출 실패: ${message}` }, { status: 500 });
  }
}
