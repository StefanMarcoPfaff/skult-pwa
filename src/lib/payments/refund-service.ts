import { getPaymentProvider, type PaymentProviderRegistry } from "@/lib/payments/provider";
import type { RefundPaymentInput, RefundPaymentResult } from "@/lib/payments/types";

export class RefundService {
  constructor(private readonly registry: PaymentProviderRegistry) {}

  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    return getPaymentProvider(this.registry, input.provider).refundPayment(input);
  }
}
