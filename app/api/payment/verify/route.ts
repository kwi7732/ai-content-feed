import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client: bypasses RLS for server-only operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.paymentId || !body?.credits || !body?.amount) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { paymentId, credits, amount } = body;

  // 1. PortOne REST API로 결제 검증
  const portoneRes = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!portoneRes.ok) {
    return NextResponse.json({ error: "PortOne 결제 조회 실패" }, { status: 502 });
  }

  const payment = await portoneRes.json();

  // 2. 금액 불일치 방어
  if (payment.status !== "PAID" || payment.amount.total !== amount) {
    return NextResponse.json({ error: "결제 금액이 일치하지 않습니다." }, { status: 400 });
  }

  // 3. Supabase 세션으로 userId 추출
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });

  // 4. 중복 결제 방지 (payment_id unique 제약으로 처리)
  const { error: insertErr } = await supabaseAdmin.from("payments").insert({
    user_id: user.id,
    payment_id: paymentId,
    credits,
    amount,
    status: "paid",
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "이미 처리된 결제입니다." }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 5. 크레딧 지급
  const { data: newCredits, error: creditErr } = await supabaseAdmin.rpc("add_credits", {
    target_user_id: user.id,
    amount: credits,
  });

  if (creditErr) {
    return NextResponse.json({ error: creditErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, credits: newCredits });
}
