import { create } from "zustand";

export interface NumberItem {
  id: string;
  number: string;
  normalizedNumber: string;
  salePrice: number;
  costPrice?: number;
  numberType: string;
  status: string;
  displayCompany?: {
    code: string;
    name: string;
  };
}

interface NumberState {
  numbers: NumberItem[];
  loading: boolean;
  selectedPrefix: string;
  searchQuery: string;
  error: string | null;
  setSelectedPrefix: (prefix: string) => void;
  setSearchQuery: (query: string) => void;
  fetchAvailableNumbers: () => Promise<void>;
  purchaseNumber: (customerId: string, numberId: string, salePrice: number) => Promise<{ success: boolean; paymentUrl?: string; error?: string }>;
}

export const useNumberStore = create<NumberState>((set, get) => ({
  numbers: [],
  loading: false,
  selectedPrefix: "ALL",
  searchQuery: "",
  error: null,

  setSelectedPrefix: (prefix: string) => set({ selectedPrefix: prefix }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),

  fetchAvailableNumbers: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/numbers?status=AVAILABLE&limit=100", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        set({ numbers: data.numbers || data.rows || [], loading: false });
      } else {
        set({ loading: false, error: "Failed to load numbers" });
      }
    } catch (err: any) {
      set({ loading: false, error: err?.message });
    }
  },

  purchaseNumber: async (customerId: string, numberId: string, salePrice: number) => {
    try {
      // 1. Atomically reserve number and create order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId,
          numberIds: [numberId],
          reservationMinutes: 15,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        return { success: false, error: orderData.error || "Reservation failed" };
      }

      // 2. Free number (0 BDT) — bypass payment gateway and complete instantly
      if (Number(salePrice || 0) <= 0) {
        const freeRes = await fetch(`/api/orders/${orderData.order.id}/complete-free`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        const freeData = await freeRes.json();
        if (!freeRes.ok || !freeData.success) {
          return { success: false, error: freeData.error || "Failed to claim free number" };
        }

        return { success: true };
      }

      // 3. Paid number — Initiate real PipraPay checkout session
      const payRes = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: orderData.order.id,
          customerId,
          amount: salePrice,
        }),
      });

      const payData = await payRes.json();
      if (!payRes.ok || !payData.paymentUrl) {
        return { success: false, error: payData.error || "Payment session creation failed" };
      }

      return { success: true, paymentUrl: payData.paymentUrl };
    } catch (err: any) {
      return { success: false, error: err?.message || "Checkout failed" };
    }
  },
}));
