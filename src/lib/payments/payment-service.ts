import { paymentLedger } from "@/lib/payments/ledger";
import {
  createPaymentProviderRegistry,
  getPaymentProvider,
  type PaymentProvider,
  type PaymentProviderRegistry,
} from "@/lib/payments/provider";
import { createStripePaymentProvider } from "@/lib/payments/stripe-provider";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  CreateRecurringPaymentInput,
  CreateRecurringPaymentResult,
  GetPaymentStatusInput,
  GetPaymentStatusResult,
  PaymentWebhookRequest,
  PaymentWebhookResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "@/lib/payments/types";

export class PaymentService {
  constructor(private readonly registry: PaymentProviderRegistry) {}

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    const result = await getPaymentProvider(this.registry, input.provider).createCheckoutSession(input);
    await paymentLedger.record({
      provider: result.provider,
      type: "payment_authorized",
      referenceType: "checkout_session",
      referenceId: result.sessionId,
      metadata: input.metadata,
    });
    return result;
  }

  async createRecurringPayment(input: CreateRecurringPaymentInput): Promise<CreateRecurringPaymentResult> {
    const result = await getPaymentProvider(this.registry, input.provider).createRecurringPayment(input);
    await paymentLedger.record({
      provider: result.provider,
      type: "payment_authorized",
      referenceType: "checkout_session",
      referenceId: result.sessionId,
      metadata: input.metadata,
    });
    return result;
  }

  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    return getPaymentProvider(this.registry, input.provider).refundPayment(input);
  }

  handleWebhookEvent(input: PaymentWebhookRequest): Promise<PaymentWebhookResult> {
    return getPaymentProvider(this.registry, input.provider).handleWebhookEvent(input);
  }

  getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusResult> {
    return getPaymentProvider(this.registry, input.provider).getPaymentStatus(input);
  }
}

export function createDefaultPaymentProviders(): PaymentProvider[] {
  return [createStripePaymentProvider()];
}

export const paymentProviderRegistry = createPaymentProviderRegistry(createDefaultPaymentProviders());
export const paymentService = new PaymentService(paymentProviderRegistry);
