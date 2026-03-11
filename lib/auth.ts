import { supabase } from "./supabaseClient";

/** 카카오 OAuth 로그인 (Supabase redirect) */
export async function signInWithKakao() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
}

/** 로그아웃 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** 현재 세션 유저 (없으면 null) */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** 프로필 조회 (크레딧 잔량 포함) */
export async function getProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, free_usage_count, credits")
    .eq("id", userId)
    .single();
  return data;
}
