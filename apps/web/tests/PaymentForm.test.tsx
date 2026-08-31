import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StellarFlowError } from "@stellarflow/sdk";
import { TEST_PUBLIC_KEY } from "@stellarflow/test-utils";

const mockCreatePayment = {
  status: "idle",
  result: null as number | null,
  error: null as unknown,
  run: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@/hooks/usePayments", () => ({
  usePayments: () => ({
    payments: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createPayment: mockCreatePayment,
    approvePayment: { run: vi.fn() },
    executePayment: { run: vi.fn() },
    cancelPayment: { run: vi.fn() },
  }),
}));

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    publicKey: TEST_PUBLIC_KEY,
    network: "testnet",
    isConnected: true,
    isInstalled: true,
    isConnecting: false,
    error: null,
    signer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

import { PaymentForm } from "@/components/payments/PaymentForm";

const validRecipient = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const validAsset = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/recipient/i), validRecipient);
  await user.type(screen.getByLabelText(/amount/i), "5");
  await user.type(screen.getByLabelText(/asset/i), validAsset);
}

beforeEach(() => {
  mockCreatePayment.status = "idle";
  mockCreatePayment.result = null;
  mockCreatePayment.error = null;
  mockCreatePayment.run.mockReset();
});

describe("PaymentForm", () => {
  it("shows validation errors for invalid input", async () => {
    const user = userEvent.setup();
    render(<PaymentForm />);

    await user.type(screen.getByLabelText(/recipient/i), "nope");
    await user.click(screen.getByRole("button", { name: /create payment/i }));

    expect(await screen.findByText(/valid stellar address/i)).toBeInTheDocument();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(mockCreatePayment.run).not.toHaveBeenCalled();
  });

  it("submits a valid payment with stroop conversion", async () => {
    mockCreatePayment.run.mockResolvedValue(7);
    const user = userEvent.setup();
    render(<PaymentForm />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create payment/i }));

    await waitFor(() => {
      expect(mockCreatePayment.run).toHaveBeenCalledTimes(1);
    });
    const input = mockCreatePayment.run.mock.calls[0][0];
    expect(input.recipient).toBe(validRecipient);
    expect(input.amount).toBe(50000000n); // 5 XLM in stroops
    expect(input.deadline).toBeGreaterThan(1_700_000_000);
  });

  it("surfaces a wallet rejection as a friendly error", async () => {
    mockCreatePayment.run.mockResolvedValue(null);
    mockCreatePayment.status = "failed";
    mockCreatePayment.error = new StellarFlowError("WALLET_REJECTED", "rejected");
    const user = userEvent.setup();
    render(<PaymentForm />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create payment/i }));

    expect(await screen.findByText(/rejected in your wallet/i)).toBeInTheDocument();
  });

  it("disables the submit button while a transaction is pending", async () => {
    mockCreatePayment.status = "pending";
    const user = userEvent.setup();
    render(<PaymentForm />);

    await fillForm(user);
    const submit = screen.getByRole("button", { name: /create payment/i });
    expect(submit).toBeDisabled();
  });
});
