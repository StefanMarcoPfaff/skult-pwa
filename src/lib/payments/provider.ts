import type {
  CancelPayoutInput,
  CancelPayoutResult,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  CreateRecurringPaymentInput,
  CreateRecurringPaymentResult,
  GetPaymentStatusInput,
  GetPaymentStatusResult,
  PaymentProviderName,
  PaymentWebhookRequest,
  PaymentWebhookResult,
  RefundPaymentInput,
  RefundPaymentResult,
  SchedulePayoutInput,
  SchedulePayoutResult,
} from "@/lib/payments/types";

export interface PaymentProvider {
  readonly name: PaymentProviderName;

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult>;
  createRecurringPayment(input: CreateRecurringPaymentInput): Promise<CreateRecurringPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  handleWebhookEvent(input: PaymentWebhookRequest): Promise<PaymentWebhookResult>;
  schedulePayout(input: SchedulePayoutInput): Promise<SchedulePayoutResult>;
  cancelPayout(input: CancelPayoutInput): Promise<CancelPayoutResult>;
  getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusResult>;
}

export type PaymentProviderRegistry = ReadonlyMap<PaymentProviderName, PaymentProvider>;

export function createPaymentProviderRegistry(providers: PaymentProvider[]): PaymentProviderRegistry {
  return new Map(providers.map((provider) => [provider.name, provider] as const));
}

export function getPaymentProvider(registry: PaymentProviderRegistry, providerName: PaymentProviderName): PaymentProvider {
  const provider = registry.get(providerName);
  if (!provider) {
    throw new Error(`Payment provider "${providerName}" is not configured.`);
  }

  return provider;
}
