import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
import { GoogleAuthError } from "./googleAuthError";
import { createGoogleIdentityClient, TokenResponse } from "./googleIdentity";
import { fetchGoogleUserInfo } from "./userInfo";

export interface SignInResult {
  googleUserId: string;
  email: string;
  token: TokenResponse;
}

export async function signInWithGoogle(clientId: string): Promise<SignInResult> {
  if (import.meta.env.VITE_FIREBASE_EMULATOR) return signInWithEmulator(clientId);

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.readonly");
  provider.addScope("https://www.googleapis.com/auth/spreadsheets.readonly");
  try {
    const result = await signInWithPopup(auth, provider);
    const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    const googleUserId = result.user.providerData.find((p) => p.providerId === "google.com")?.uid;
    if (!accessToken || !googleUserId) {
      throw new GoogleAuthError("unknown", "알 수 없는 오류로 Google 연결에 실패했습니다.");
    }
    return {
      googleUserId,
      email: result.user.email ?? "",
      // 팝업 응답에는 만료 시각이 없어 Google 기본값(1시간)으로 잡는다.
      token: { accessToken, expiresAt: Date.now() + 3600_000 },
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/popup-blocked") {
      throw new GoogleAuthError("popup_blocked", "팝업이 차단되었습니다.");
    }
    if (code === "auth/popup-closed-by-user") {
      throw new GoogleAuthError("popup_closed", "로그인 창이 닫혔습니다.");
    }
    throw err;
  }
}

// e2e 전용: 팝업 대신 GIS(mock) → userinfo → Auth Emulator가 받아 주는 서명 없는 id_token.
async function signInWithEmulator(clientId: string): Promise<SignInResult> {
  const token = await createGoogleIdentityClient(clientId).requestAccessToken();
  const info = await fetchGoogleUserInfo(token.accessToken);
  await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(
      JSON.stringify({ sub: info.googleUserId, email: info.email, email_verified: true }),
    ),
  );
  return { ...info, token };
}
