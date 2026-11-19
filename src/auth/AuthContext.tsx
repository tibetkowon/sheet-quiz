import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "../firebase";
import { createGoogleIdentityClient, TokenResponse } from "./googleIdentity";
import { signInWithGoogle } from "./firebaseSignIn";
import { fetchGoogleUserInfo } from "./userInfo";
import { GoogleAuthError } from "./googleAuthError";
import { migrateLocalData } from "../storage/migrateLocalData";

type AuthStatus = "signed_out" | "connecting" | "connected" | "expired";

interface AuthContextValue {
  status: AuthStatus;
  googleUserId: string | null;
  email: string | null;
  error: GoogleAuthError | null;
  /** Resolves true once connected, false if the connection attempt failed. */
  connect: () => Promise<boolean>;
  disconnect: () => void;
  markExpired: () => void;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EXPIRY_BUFFER_MS = 60_000;

const TOKEN_KEY = "sheet-quiz-drive-token";

// 토큰의 주인을 함께 들고 다녀서 다른 계정의 토큰이 쓰이지 않게 한다.
type OwnedToken = TokenResponse & { googleUserId: string };

// sessionStorage가 막힌 환경(사생활 보호 모드 등)에서는 메모리로만 동작한다.
function readStoredToken(): OwnedToken | null {
  try {
    const t = JSON.parse(
      window.sessionStorage.getItem(TOKEN_KEY) ?? "null",
    ) as Partial<OwnedToken> | null;
    return typeof t?.accessToken === "string" &&
      typeof t.expiresAt === "number" &&
      typeof t.googleUserId === "string"
      ? (t as OwnedToken)
      : null;
  } catch {
    return null;
  }
}

function storeToken(token: OwnedToken) {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch {
    /* 메모리로만 유지 */
  }
}

function clearStoredToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 메모리로만 유지 */
  }
}

const identityOf = (user: User) => ({
  googleUserId: user.providerData.find((p) => p.providerId === "google.com")?.uid ?? user.uid,
  email: user.email,
});

// login_hint는 힌트일 뿐이라 다른 계정을 고를 수 있다. 로그인한 사용자의 토큰만 받는다.
async function reconnect(clientId: string, user: User) {
  const identity = identityOf(user);
  const token = await createGoogleIdentityClient(clientId).requestAccessToken(
    user.email ?? undefined,
  );
  const info = await fetchGoogleUserInfo(token.accessToken);
  if (info.googleUserId !== identity.googleUserId) {
    throw new GoogleAuthError("account_mismatch", "로그인한 계정과 다른 Google 계정입니다.");
  }
  return { ...identity, token };
}

export function AuthProvider({ clientId, children }: { clientId: string; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("connecting");
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<GoogleAuthError | null>(null);
  const tokenRef = useRef<OwnedToken | null>(null);
  const generationRef = useRef(0);
  // connect() 진행 중에는 리스너가 상태를 덮지 않게 한다 (첫 로그인 중 expired 깜빡임 방지).
  const connectingRef = useRef(false);

  // 새로고침 후 Firebase 세션 복원. 같은 사용자의 만료 전 Drive 토큰이 sessionStorage에 있으면 connected, 없으면 expired.
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (!user) {
          tokenRef.current = null;
          clearStoredToken();
          setGoogleUserId(null);
          setEmail(null);
          setStatus("signed_out");
          return;
        }
        const identity = identityOf(user);
        setGoogleUserId(identity.googleUserId);
        setEmail(identity.email);
        if (connectingRef.current) return;
        // 다른 탭에서 계정이 바뀌어도 이전 계정의 토큰을 쓰지 않는다.
        if (tokenRef.current?.googleUserId !== identity.googleUserId) {
          const stored = readStoredToken();
          if (
            stored?.googleUserId === identity.googleUserId &&
            stored.expiresAt - EXPIRY_BUFFER_MS >= Date.now()
          ) {
            tokenRef.current = stored;
          } else {
            tokenRef.current = null;
            clearStoredToken();
          }
        }
        setStatus(tokenRef.current ? "connected" : "expired");
      }),
    [],
  );

  const connect = useCallback(async (): Promise<boolean> => {
    const generation = ++generationRef.current;
    const existing = auth.currentUser;
    tokenRef.current = null;
    clearStoredToken();
    if (!existing) {
      setGoogleUserId(null);
      setEmail(null);
    }
    setStatus("connecting");
    setError(null);
    connectingRef.current = true;
    try {
      // 이미 로그인된 사용자는 계정 선택 없이 토큰만 다시 받는다.
      const result = existing
        ? await reconnect(clientId, existing)
        : await signInWithGoogle(clientId);
      if (generation !== generationRef.current) return false;
      if (!existing) {
        // 업그레이드 전 기기는 Firebase 세션이 없어 반드시 이 경로를 지난다. 실패해도 로그인은 막지 않는다.
        await migrateLocalData(result.googleUserId).catch(console.error);
        if (generation !== generationRef.current) return false;
      }
      tokenRef.current = { ...result.token, googleUserId: result.googleUserId };
      storeToken(tokenRef.current);
      setGoogleUserId(result.googleUserId);
      setEmail(result.email);
      setStatus("connected");
      return true;
    } catch (err) {
      if (generation !== generationRef.current) return false;
      tokenRef.current = null;
      setError(
        err instanceof GoogleAuthError
          ? err
          : new GoogleAuthError("unknown", "알 수 없는 오류로 Google 연결에 실패했습니다."),
      );
      setStatus(existing ? "expired" : "signed_out");
      return false;
    } finally {
      if (generation === generationRef.current) connectingRef.current = false;
    }
  }, [clientId]);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    connectingRef.current = false;
    setError(null);
    tokenRef.current = null;
    clearStoredToken();
    setGoogleUserId(null);
    setEmail(null);
    setStatus("signed_out");
    void signOut(auth);
  }, []);

  const markExpired = useCallback(() => {
    generationRef.current += 1;
    connectingRef.current = false;
    tokenRef.current = null;
    clearStoredToken();
    setStatus("expired");
  }, []);

  const getAccessToken = useCallback((): string | null => {
    const token = tokenRef.current;
    if (!token || token.expiresAt - EXPIRY_BUFFER_MS < Date.now()) {
      if (token) {
        tokenRef.current = null;
        clearStoredToken();
        setStatus("expired");
      }
      return null;
    }
    return token.accessToken;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        googleUserId,
        email,
        error,
        connect,
        disconnect,
        markExpired,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
