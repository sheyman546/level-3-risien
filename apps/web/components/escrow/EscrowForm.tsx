"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { createEscrowSchema, CreateEscrowValues } from "@/lib/validation/schemas";
import { amountToStroops, nowSeconds } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { useEscrow } from "@/hooks/useEscrow";
import { useWallet } from "@/hooks/useWallet";
import { TransactionStatusBanner } from "@/components/payments/TransactionStatusBanner";

const DAY_SECONDS = 86_400;

export function EscrowForm() {
  const { publicKey, isConnected, connect, isConnecting } = useWallet();
  const { createEscrow } = useEscrow();
  const [values, setValues] = useState<CreateEscrowValues>({
    beneficiary: "",
    amount: "",
    asset: "",
    timeoutDays: "7",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateEscrowValues, string>>>({});

  const handleChange = (field: keyof CreateEscrowValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = createEscrowSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CreateEscrowValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CreateEscrowValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (!publicKey) {
      await connect();
      return;
    }
    await createEscrow.run({
      depositor: publicKey,
      beneficiary: parsed.data.beneficiary,
      amount: amountToStroops(parsed.data.amount),
      asset: parsed.data.asset,
      timeout: nowSeconds() + Number(parsed.data.timeoutDays) * DAY_SECONDS,
    });
  };

  const status = createEscrow.status;
  const banner = useMemo(() => {
    if (status === "connecting") return { tone: "info", text: "Connecting to the Stellar network…" } as const;
    if (status === "waiting_approval") return { tone: "info", text: "Waiting for approval in your wallet…" } as const;
    if (status === "pending") return { tone: "info", text: "Transaction pending — awaiting on-chain confirmation…" } as const;
    if (status === "confirmed") return { tone: "success", text: `Escrow created ✓ (escrow #${createEscrow.result})` } as const;
    if (status === "failed") return { tone: "error", text: getErrorMessage(createEscrow.error) } as const;
    return null;
  }, [status, createEscrow.result, createEscrow.error]);

  if (!isConnected) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-ink-800/70">Connect your wallet to create an escrow.</p>
          <Button onClick={connect} loading={isConnecting}>
            Connect wallet
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          name="beneficiary"
          label="Beneficiary"
          placeholder="G…"
          hint="The Stellar address that can claim the funds"
          value={values.beneficiary}
          onChange={(e) => handleChange("beneficiary", e.target.value)}
          error={errors.beneficiary}
        />
        <Input
          name="amount"
          label="Amount (XLM)"
          placeholder="0.00"
          inputMode="decimal"
          value={values.amount}
          onChange={(e) => handleChange("amount", e.target.value)}
          error={errors.amount}
        />
        <Input
          name="asset"
          label="Asset (contract id)"
          placeholder="C…"
          value={values.asset}
          onChange={(e) => handleChange("asset", e.target.value)}
          error={errors.asset}
        />
        <Select
          name="timeoutDays"
          label="Timeout"
          value={values.timeoutDays}
          onChange={(e) => handleChange("timeoutDays", e.target.value)}
          error={errors.timeoutDays}
        >
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </Select>

        {banner && <TransactionStatusBanner tone={banner.tone} text={banner.text} />}

        <Button
          type="submit"
          loading={status === "connecting" || status === "waiting_approval" || status === "pending"}
        >
          Lock funds in escrow
        </Button>
      </form>
    </Card>
  );
}
