import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { createGoogleIdentityClient, TokenResponse } from "./googleIdentity";
import { fetchGoogleUserInfo } from "./userInfo";
import { GoogleAuthError } from "./googleAuthError";

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

export function AuthProvider({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>("signed_out");
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<GoogleAuthError | null>(null);
  const tokenRef = useRef<TokenResponse | null>(null);

  const connect = useCallback(async (): Promise<boolean> => {
    setStatus("connecting");
    setError(null);
    try {
      const client = createGoogleIdentityClient(clientId);
      const token = await client.requestAccessToken();
      tokenRef.current = token;
      const info = await fetchGoogleUserInfo(token.accessToken);
      setGoogleUserId(info.googleUserId);
      setEmail(info.email);
      setStatus("connected");
      return true;
    } catch (err) {
      tokenRef.current = null;
      setError(
        err instanceof GoogleAuthError
          ? err
          : new GoogleAuthError("unknown", "알 수 없는 오류로 Google 연결에 실패했습니다."),
      );
      setStatus("signed_out");
      return false;
    }
  }, [clientId]);

  const disconnect = useCallback(() => {
    tokenRef.current = null;
    setGoogleUserId(null);
    setEmail(null);
    setStatus("signed_out");
  }, []);

  const markExpired = useCallback(() => {
    tokenRef.current = null;
    setStatus("expired");
  }, []);

  const getAccessToken = useCallback((): string | null => {
    const token = tokenRef.current;
    if (!token || token.expiresAt - EXPIRY_BUFFER_MS < Date.now()) {
      if (token) setStatus("expired");
      return null;
    }
    return token.accessToken;
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, googleUserId, email, error, connect, disconnect, markExpired, getAccessToken }}
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
