import { z } from "zod";

/** Base-32 Stellar public key (G...) or contract id (C...). */
const stellarAddress = (prefix: "G" | "C", label: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}[A-Z2-7]{55}$`), `Enter a valid Stellar ${label} (${prefix}...)`);

export const createPaymentSchema = z.object({
  recipient: stellarAddress("G", "address"),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, "Enter a valid amount in XLM (max 7 decimal places)")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero"),
  asset: stellarAddress("C", "asset contract id"),
  deadlineDays: z.enum(["1", "3", "7", "30"], {
    errorMap: () => ({ message: "Pick a deadline" }),
  }),
});

export type CreatePaymentValues = z.infer<typeof createPaymentSchema>;

export const defaultCreatePaymentValues: CreatePaymentValues = {
  recipient: "",
  amount: "",
  asset: "",
  deadlineDays: "7",
};

export const createEscrowSchema = z.object({
  beneficiary: stellarAddress("G", "address"),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, "Enter a valid amount in XLM (max 7 decimal places)")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero"),
  asset: stellarAddress("C", "asset contract id"),
  timeoutDays: z.enum(["1", "3", "7", "30"], {
    errorMap: () => ({ message: "Pick a timeout" }),
  }),
});

export type CreateEscrowValues = z.infer<typeof createEscrowSchema>;
