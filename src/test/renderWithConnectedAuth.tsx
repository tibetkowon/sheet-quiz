import { ReactElement, ReactNode, useEffect } from "react";
import { render, RenderResult } from "@testing-library/react";
import { MemoryRouter, MemoryRouterProps } from "react-router-dom";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { AstryxProviders } from "../app/AstryxProviders";

export function ConnectGate({ children }: { children: ReactNode }) {
  const { status, connect } = useAuth();
  useEffect(() => {
    if (status === "signed_out") void connect();
  }, [status, connect]);
  if (status !== "connected") return null;
  return <>{children}</>;
}

export function renderWithConnectedAuth(
  ui: ReactElement,
  initialEntries: MemoryRouterProps["initialEntries"] = ["/"],
): RenderResult {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AstryxProviders>
        <AuthProvider clientId="client-id">
          <ConnectGate>{ui}</ConnectGate>
        </AuthProvider>
      </AstryxProviders>
    </MemoryRouter>,
  );
}
