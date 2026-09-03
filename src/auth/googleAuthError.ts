export type GoogleAuthErrorCode =
  | "popup_blocked"
  | "popup_closed"
  | "access_denied"
  | "network_error"
  | "unknown";

export class GoogleAuthError extends Error {
  code: GoogleAuthErrorCode;

  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

export const AUTH_ERROR_MESSAGES: Record<GoogleAuthErrorCode, string> = {
  popup_blocked:
    "팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업 차단을 해제한 뒤 다시 시도해주세요.",
  popup_closed: "로그인 창이 닫혔습니다. 다시 시도해주세요.",
  access_denied: "Google 계정 접근 권한이 거부되었습니다. 읽기 권한을 승인해야 계속할 수 있습니다.",
  network_error: "네트워크 연결에 실패했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.",
  unknown: "알 수 없는 오류로 Google 연결에 실패했습니다. 다시 시도해주세요.",
};
