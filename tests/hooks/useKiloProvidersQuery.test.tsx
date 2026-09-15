import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useProvidersQuery } from "@/lib/query/queries";

const apiMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getCurrent: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  providersApi: apiMocks,
}));

describe("Kilo provider query", () => {
  it("reads the persisted list and current ID", async () => {
    const provider = {
      id: "volcengine",
      name: "Volc",
      settingsConfig: { volcengine: { options: {} } },
    };
    apiMocks.getAll.mockResolvedValue({ volcengine: provider });
    apiMocks.getCurrent.mockResolvedValue("volcengine");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useProvidersQuery("kilo"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiMocks.getAll).toHaveBeenCalledWith("kilo");
    expect(apiMocks.getCurrent).toHaveBeenCalledWith("kilo");
    expect(result.current.data).toEqual({
      providers: { volcengine: provider },
      currentProviderId: "volcengine",
    });
  });
});
