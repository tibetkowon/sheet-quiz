import { GoogleAuthError } from "./googleAuthError";

export interface TokenResponse {
  accessToken: string;
  expiresAt: number;
}

export interface GoogleIdentityClient {
  requestAccessToken(): Promise<TokenResponse>;
}

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
].join(" ");

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      script.remove();
      reject(new GoogleAuthError("network_error", "Google 인증 스크립트를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

function mapTokenError(error: string): GoogleAuthError {
  if (error === "access_denied") {
    return new GoogleAuthError("access_denied", "Google 계정 접근 권한이 거부되었습니다.");
  }
  return new GoogleAuthError("unknown", `Google 인증 오류: ${error}`);
}

function mapClientError(error: { type: string }): GoogleAuthError {
  if (error.type === "popup_failed_to_open") {
    return new GoogleAuthError("popup_blocked", "팝업이 차단되었습니다.");
  }
  if (error.type === "popup_closed") {
    return new GoogleAuthError("popup_closed", "로그인 창이 닫혔습니다.");
  }
  return new GoogleAuthError("unknown", "알 수 없는 Google 인증 오류가 발생했습니다.");
}

export function createGoogleIdentityClient(clientId: string): GoogleIdentityClient {
  return {
    async requestAccessToken() {
      await loadGisScript();
      if (!window.google) {
        throw new GoogleAuthError("network_error", "Google 인증 스크립트를 불러오지 못했습니다.");
      }

      return new Promise<TokenResponse>((resolve, reject) => {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: (response) => {
            if (response.error) {
              reject(mapTokenError(response.error));
              return;
            }
            resolve({
              accessToken: response.access_token,
              expiresAt: Date.now() + response.expires_in * 1000,
            });
          },
          error_callback: (error) => reject(mapClientError(error)),
        });
        tokenClient.requestAccessToken();
      });
    },
  };
}
