import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TxPhase, WriteResult } from "@stellarflow/sdk";
import { useContractCall } from "@/hooks/useContractCall";

function Harness({ fn }: { fn: (onPhase: (p: TxPhase) => void) => Promise<WriteResult<string>> }) {
  const call = useContractCall(fn);
  return (
    <div>
      <button onClick={() => void call.run()}>run</button>
      <span data-testid="status">{call.status}</span>
      {call.txHash && <span data-testid="hash">{call.txHash}</span>}
      {call.result && <span data-testid="result">{call.result}</span>}
      {call.error && <span data-testid="error">{call.error.message}</span>}
    </div>
  );
}

describe("useContractCall", () => {
  it("walks through the transaction states to confirmed", async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async (onPhase: (p: TxPhase) => void) => {
      onPhase("waiting_approval");
      onPhase("pending");
      return { result: "done", hash: "abc123", phase: "confirmed" as const };
    });
    render(<Harness fn={fn} />);

    await user.click(screen.getByRole("button", { name: "run" }));

    expect(await screen.findByTestId("status")).toHaveTextContent("confirmed");
    expect(screen.getByTestId("hash")).toHaveTextContent("abc123");
    expect(screen.getByTestId("result")).toHaveTextContent("done");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("maps a rejection to failed with a typed error", async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async () => {
      throw new Error("User rejected the request");
    });
    render(<Harness fn={fn} />);

    await user.click(screen.getByRole("button", { name: "run" }));

    expect(await screen.findByTestId("status")).toHaveTextContent("failed");
    expect(screen.getByTestId("error")).toHaveTextContent(/rejected/i);
  });

  it("handles contract failures", async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async () => {
      throw new Error("Simulation failed");
    });
    render(<Harness fn={fn} />);

    await user.click(screen.getByRole("button", { name: "run" }));

    expect(await screen.findByTestId("status")).toHaveTextContent("failed");
  });

  it("surfaces waiting_approval phase to the UI", async () => {
    const user = userEvent.setup();
    let setPhase: (p: TxPhase) => void = () => {};
    const fn = vi.fn(async (onPhase: (p: TxPhase) => void) => {
      setPhase = onPhase;
      return new Promise(() => {}); // never resolves
    });
    render(<Harness fn={fn} />);

    await user.click(screen.getByRole("button", { name: "run" }));

    await act(async () => {
      setPhase("waiting_approval");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("waiting_approval");
  });
});
