"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { createPaymentSchema, CreatePaymentValues, defaultCreatePaymentValues } from "@/lib/validation/schemas";
import { amountToStroops, nowSeconds } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { usePayments } from "@/hooks/usePayments";
import { useWallet } from "@/hooks/useWallet";
import { TransactionStatusBanner } from "@/components/payments/TransactionStatusBanner";

const DAY_SECONDS = 86_400;

export function PaymentForm() {
  const { publicKey, isConnected, connect, isConnecting } = useWallet();
  const { createPayment } = usePayments();
  const [values, setValues] = useState<CreatePaymentValues>(defaultCreatePaymentValues);
  const [errors, setErrors] = useState<Partial<Record<keyof CreatePaymentValues, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field: keyof CreatePaymentValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSubmitted(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = createPaymentSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CreatePaymentValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CreatePaymentValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (!publicKey) {
      await connect();
      return;
    }
    setSubmitted(true);
    const deadline = nowSeconds() + Number(parsed.data.deadlineDays) * DAY_SECONDS;
    await createPayment.run({
      creator: publicKey,
      recipient: parsed.data.recipient,
      amount: amountToStroops(parsed.data.amount),
      asset: parsed.data.asset,
      deadline,
    });
  };

  const status = createPayment.status;
  const banner = useMemo(() => {
    if (status === "connecting") return { tone: "info", text: "Connecting to the Stellar network…" } as const;
    if (status === "waiting_approval") return { tone: "info", text: "Waiting for approval in your wallet…" } as const;
    if (status === "pending") return { tone: "info", text: "Transaction pending — awaiting on-chain confirmation…" } as const;
    if (status === "confirmed")
      return { tone: "success", text: `Payment created ✓ (payment #${createPayment.result})` } as const;
    if (status === "failed") return { tone: "error", text: getErrorMessage(createPayment.error) } as const;
    return null;
  }, [status, createPayment.result, createPayment.error]);

  if (!isConnected) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-ink-800/70">Connect your wallet to create a payment.</p>
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
          name="recipient"
          label="Recipient"
          placeholder="G…"
          hint="The Stellar address that will receive the funds"
          value={values.recipient}
          onChange={(e) => handleChange("recipient", e.target.value)}
          error={errors.recipient}
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
          hint="Contract id of the Stellar Asset Contract (SAC) to use"
          value={values.asset}
          onChange={(e) => handleChange("asset", e.target.value)}
          error={errors.asset}
        />
        <Select
          name="deadlineDays"
          label="Deadline"
          value={values.deadlineDays}
          onChange={(e) => handleChange("deadlineDays", e.target.value)}
          error={errors.deadlineDays}
        >
          <option value="1">In 1 day</option>
          <option value="3">In 3 days</option>
          <option value="7">In 7 days</option>
          <option value="30">In 30 days</option>
        </Select>

        {banner && <TransactionStatusBanner tone={banner.tone} text={banner.text} />}

        <Button type="submit" loading={status === "connecting" || status === "waiting_approval" || status === "pending" || submitted}>
          Create payment
        </Button>
      </form>
    </Card>
  );
}
