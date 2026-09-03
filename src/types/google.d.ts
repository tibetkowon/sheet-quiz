export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token: string;
              expires_in: number;
              error?: string;
            }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): { requestAccessToken: () => void };
        };
      };
    };
  }
}
