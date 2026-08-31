import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { fakeActivityEvent } from "@stellarflow/test-utils";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {}
}

const mockFetch = vi.fn();

beforeEach(() => {
  FakeEventSource.instances = [];
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", mockFetch);
});

import { ActivityFeed } from "@/components/activity/ActivityFeed";

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("no EventSource created");
  return source;
}

describe("ActivityFeed", () => {
  it("shows connecting state then goes live", async () => {
    render(<ActivityFeed />);

    expect(screen.getByText(/connecting/i)).toBeInTheDocument();

    act(() => latestSource().onopen?.());
    expect(await screen.findByText("Live")).toBeInTheDocument();
  });

  it("renders events received over SSE", async () => {
    const event = fakeActivityEvent({ topic: "payment_created", payload: { id: 3, amount: "10000000" } });
    render(<ActivityFeed />);

    act(() => latestSource().onopen?.());
    act(() => {
      latestSource().onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
    });

    expect(await screen.findByText(/payment created/i)).toBeInTheDocument();
    expect(screen.getByText(/#3/i)).toBeInTheDocument();
  });

  it("shows reconnecting state on stream errors", async () => {
    render(<ActivityFeed />);

    act(() => latestSource().onerror?.());

    // the error banner explains what happened
    expect(await screen.findByText(/lost connection/i)).toBeInTheDocument();
    // and the status badge switches to reconnecting
    expect(screen.getAllByText(/reconnecting/i).length).toBeGreaterThan(0);
  });

  it("falls back to an empty state when nothing has happened", async () => {
    render(<ActivityFeed />);

    act(() => latestSource().onopen?.());

    await waitFor(() => {
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });
});
