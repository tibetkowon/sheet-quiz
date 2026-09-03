import { GoogleAuthError } from "./googleAuthError";

export interface GoogleUserInfo {
  googleUserId: string;
  email: string;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new GoogleAuthError("unknown", "Google 사용자 정보를 가져오지 못했습니다.");
  }
  const data = (await response.json()) as { sub: string; email: string };
  return { googleUserId: data.sub, email: data.email };
}
