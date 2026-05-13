import type { PaymentProvider } from "@/lib/payments/provider";
import type {
  CancelPayoutInput,
  CancelPayoutResult,
  PaymentProviderName,
  SchedulePayoutInput,
  SchedulePayoutResult,
} from "@/lib/payments/types";

export interface PayoutProvider {
  readonly name: PaymentProviderName;
  schedulePayout(input: SchedulePayoutInput): Promise<SchedulePayoutResult>;
  cancelPayout(input: CancelPayoutInput): Promise<CancelPayoutResult>;
}

export class DelegatingPayoutProvider implements PayoutProvider {
  readonly name: PaymentProviderName;

  constructor(private readonly provider: PaymentProvider) {
    this.name = provider.name;
  }

  schedulePayout(input: SchedulePayoutInput): Promise<SchedulePayoutResult> {
    return this.provider.schedulePayout(input);
  }

  cancelPayout(input: CancelPayoutInput): Promise<CancelPayoutResult> {
    return this.provider.cancelPayout(input);
  }
}
