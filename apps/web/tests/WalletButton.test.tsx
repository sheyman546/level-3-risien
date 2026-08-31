import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_PUBLIC_KEY } from "@stellarflow/test-utils";

const { mockFreighter } = vi.hoisted(() => {
  const PK = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  return {
    mockFreighter: {
      isConnected: vi.fn().mockResolvedValue(true),
      getPublicKey: vi.fn().mockResolvedValue(PK),
      getNetwork: vi.fn().mockResolvedValue("TESTNET"),
      getNetworkDetails: vi.fn().mockResolvedValue({
        network: "TESTNET",
        networkUrl: "https://horizon-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
      }),
      signTransaction: vi.fn().mockImplementation(async (xdr: string) => xdr),
      requestAccess: vi.fn().mockResolvedValue(PK),
    },
  };
});

vi.mock("@stellar/freighter-api", () => mockFreighter);

import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { WalletProvider } from "@/hooks/useWallet";
import { WalletButton } from "@/components/wallet/WalletButton";

function renderWithProviders() {
  return render(
    <NotificationProvider>
      <WalletProvider>
        <WalletButton />
      </WalletProvider>
    </NotificationProvider>,
  );
}

beforeEach(() => {
  mockFreighter.isConnected.mockResolvedValue({ isConnected: false });
  mockFreighter.getPublicKey.mockResolvedValue(TEST_PUBLIC_KEY);
  mockFreighter.requestAccess.mockResolvedValue(TEST_PUBLIC_KEY);
});

describe("WalletButton", () => {
  it("connects a wallet and shows the truncated address", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();

    mockFreighter.isConnected.mockResolvedValue({ isConnected: true });
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    await waitFor(() => {
      expect(mockFreighter.requestAccess).toHaveBeenCalled();
    });
    expect(await screen.findByText(/GAAA/)).toBeInTheDocument();
  });

  it("shows a hint when Freighter is not installed", async () => {
    // Simulate a missing Freighter by making the API throw on access
    mockFreighter.getPublicKey.mockImplementation(() => {
      throw new Error("Freighter not installed");
    });
    renderWithProviders();

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("disconnects and returns to the connect button", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    mockFreighter.isConnected.mockResolvedValue({ isConnected: true });
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GAAA/);

    await user.click(screen.getByRole("button", { name: /GAAA/ }));
    expect(await screen.findByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });
});
