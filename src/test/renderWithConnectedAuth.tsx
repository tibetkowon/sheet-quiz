import { ReactElement, ReactNode, useEffect } from "react";
import { render, RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../auth/AuthContext";

function ConnectGate({ children }: { children: ReactNode }) {
  const { status, connect } = useAuth();
  useEffect(() => {
    if (status === "signed_out") void connect();
  }, [status, connect]);
  if (status !== "connected") return null;
  return <>{children}</>;
}

export function renderWithConnectedAuth(
  ui: ReactElement,
  initialEntries: string[] = ["/"],
): RenderResult {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider clientId="client-id">
        <ConnectGate>{ui}</ConnectGate>
      </AuthProvider>
    </MemoryRouter>,
  );
}
