import { create } from "zustand";

export interface CentralUser {
  customerId: string;
  centralIdentityUserId: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  customerType: string;
  authorizedApps: string[];
  isImpersonated?: boolean;
  impersonatedBy?: {
    adminId: string;
    adminUsername: string;
  };
}

interface AuthState {
  user: CentralUser | null;
  customerData: any | null;
  loading: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  customerData: null,
  loading: true,
  error: null,

  fetchUser: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          set({ user: data.user, customerData: data.customer, loading: false });
          return;
        }
      }
      set({ user: null, customerData: null, loading: false });
    } catch (err: any) {
      set({ user: null, loading: false, error: err?.message });
    }
  },

  login: async (email: string, pass: string) => {
    set({ error: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        set({ error: data.error || "Authentication failed" });
        return { success: false, error: data.error || "Authentication failed" };
      }
      set({ user: data.user, error: null });
      return { success: true };
    } catch (err: any) {
      set({ error: err?.message || "Login failed" });
      return { success: false, error: err?.message || "Login failed" };
    }
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      set({ user: null, customerData: null });
    }
  },
}));
