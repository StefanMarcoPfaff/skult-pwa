export type CourseSession = {
  id: string;
  course_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      attendance_records: {
        Row: {
          id: string;
          course_id: string;
          session_id: string | null;
          event_date: string | null;
          ticket_id: string;
          booking_id: string | null;
          trial_reservation_id: string | null;
          subscription_id: string | null;
          checked_in_at: string;
          checked_in_by: string | null;
          method: "teacher_scan" | "participant_scan" | "manual";
          room: string | null;
          instructor_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          session_id?: string | null;
          event_date?: string | null;
          ticket_id: string;
          booking_id?: string | null;
          trial_reservation_id?: string | null;
          subscription_id?: string | null;
          checked_in_at?: string;
          checked_in_by?: string | null;
          method: "teacher_scan" | "participant_scan" | "manual";
          room?: string | null;
          instructor_name?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          course_id: string;
          session_id: string | null;
          event_date: string | null;
          ticket_id: string;
          booking_id: string | null;
          trial_reservation_id: string | null;
          subscription_id: string | null;
          checked_in_at: string;
          checked_in_by: string | null;
          method: "teacher_scan" | "participant_scan" | "manual";
          room: string | null;
          instructor_name: string | null;
        }>;
      };
      financial_documents: {
        Row: {
          id: string;
          document_type:
            | "customer_receipt"
            | "provider_payout_statement"
            | "provider_platform_fee_invoice"
            | "platform_revenue_statement"
            | "refund_receipt";
          status: "draft" | "issued" | "voided";
          document_number: string | null;
          provider_id: string | null;
          customer_email: string | null;
          booking_id: string | null;
          course_id: string | null;
          course_registration_intent_id: string | null;
          subscription_contract_id: string | null;
          payout_batch_id: string | null;
          payout_item_id: string | null;
          payment_transaction_id: string | null;
          refund_record_id: string | null;
          ledger_entry_id: string | null;
          period_start: string | null;
          period_end: string | null;
          currency: string;
          gross_amount_cents: number;
          platform_fee_cents: number;
          provider_payout_cents: number;
          tax_amount_cents: number | null;
          metadata: Record<string, unknown>;
          pdf_path: string | null;
          issued_at: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document_type:
            | "customer_receipt"
            | "provider_payout_statement"
            | "provider_platform_fee_invoice"
            | "platform_revenue_statement"
            | "refund_receipt";
          status?: "draft" | "issued" | "voided";
          document_number?: string | null;
          provider_id?: string | null;
          customer_email?: string | null;
          booking_id?: string | null;
          course_id?: string | null;
          course_registration_intent_id?: string | null;
          subscription_contract_id?: string | null;
          payout_batch_id?: string | null;
          payout_item_id?: string | null;
          payment_transaction_id?: string | null;
          refund_record_id?: string | null;
          ledger_entry_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          currency?: string;
          gross_amount_cents?: number;
          platform_fee_cents?: number;
          provider_payout_cents?: number;
          tax_amount_cents?: number | null;
          metadata?: Record<string, unknown>;
          pdf_path?: string | null;
          issued_at?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          document_type:
            | "customer_receipt"
            | "provider_payout_statement"
            | "provider_platform_fee_invoice"
            | "platform_revenue_statement"
            | "refund_receipt";
          status: "draft" | "issued" | "voided";
          document_number: string | null;
          provider_id: string | null;
          customer_email: string | null;
          booking_id: string | null;
          course_id: string | null;
          course_registration_intent_id: string | null;
          subscription_contract_id: string | null;
          payout_batch_id: string | null;
          payout_item_id: string | null;
          payment_transaction_id: string | null;
          refund_record_id: string | null;
          ledger_entry_id: string | null;
          period_start: string | null;
          period_end: string | null;
          currency: string;
          gross_amount_cents: number;
          platform_fee_cents: number;
          provider_payout_cents: number;
          tax_amount_cents: number | null;
          metadata: Record<string, unknown>;
          pdf_path: string | null;
          issued_at: string | null;
          sent_at: string | null;
          updated_at: string;
        }>;
      };
      course_sessions: {
        Row: CourseSession;
        Insert: Omit<CourseSession, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<CourseSession, "id" | "created_at">>;
      };
      subscription_charges: {
        Row: {
          id: string;
          subscription_contract_id: string;
          subscription_period_id: string | null;
          payment_transaction_id: string | null;
          provider: string;
          provider_charge_id: string | null;
          provider_invoice_id: string | null;
          provider_payment_reference: string | null;
          charge_type:
            | "initial_proration"
            | "monthly_recurring"
            | "credit"
            | "refund_adjustment"
            | "manual_adjustment";
          gross_amount_cents: number;
          currency: string;
          status:
            | "draft"
            | "scheduled"
            | "pending_provider"
            | "paid"
            | "failed"
            | "refunded"
            | "credited"
            | "cancelled";
          charged_at: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subscription_contract_id: string;
          subscription_period_id?: string | null;
          payment_transaction_id?: string | null;
          provider: string;
          provider_charge_id?: string | null;
          provider_invoice_id?: string | null;
          provider_payment_reference?: string | null;
          charge_type:
            | "initial_proration"
            | "monthly_recurring"
            | "credit"
            | "refund_adjustment"
            | "manual_adjustment";
          gross_amount_cents: number;
          currency: string;
          status?:
            | "draft"
            | "scheduled"
            | "pending_provider"
            | "paid"
            | "failed"
            | "refunded"
            | "credited"
            | "cancelled";
          charged_at?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          subscription_contract_id: string;
          subscription_period_id: string | null;
          payment_transaction_id: string | null;
          provider: string;
          provider_charge_id: string | null;
          provider_invoice_id: string | null;
          provider_payment_reference: string | null;
          charge_type:
            | "initial_proration"
            | "monthly_recurring"
            | "credit"
            | "refund_adjustment"
            | "manual_adjustment";
          gross_amount_cents: number;
          currency: string;
          status:
            | "draft"
            | "scheduled"
            | "pending_provider"
            | "paid"
            | "failed"
            | "refunded"
            | "credited"
            | "cancelled";
          charged_at: string | null;
          metadata: Record<string, unknown>;
          updated_at: string;
        }>;
      };
      subscription_contracts: {
        Row: {
          id: string;
          course_registration_intent_id: string | null;
          course_id: string;
          teacher_id: string;
          customer_email: string;
          provider: string;
          provider_subscription_id: string | null;
          provider_customer_id: string | null;
          provider_mandate_id: string | null;
          status:
            | "draft"
            | "pending_initial_payment"
            | "active"
            | "pause_scheduled"
            | "paused"
            | "cancel_scheduled"
            | "cancelled"
            | "ended"
            | "payment_holding"
            | "legacy_external";
          interval_unit: "month";
          interval_count: number;
          base_amount_cents: number;
          currency: string;
          billing_anchor_day: number;
          next_charge_at: string | null;
          started_at: string | null;
          ended_at: string | null;
          cancel_effective_date: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_registration_intent_id?: string | null;
          course_id: string;
          teacher_id: string;
          customer_email: string;
          provider: string;
          provider_subscription_id?: string | null;
          provider_customer_id?: string | null;
          provider_mandate_id?: string | null;
          status?:
            | "draft"
            | "pending_initial_payment"
            | "active"
            | "pause_scheduled"
            | "paused"
            | "cancel_scheduled"
            | "cancelled"
            | "ended"
            | "payment_holding"
            | "legacy_external";
          interval_unit?: "month";
          interval_count?: number;
          base_amount_cents: number;
          currency: string;
          billing_anchor_day?: number;
          next_charge_at?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          cancel_effective_date?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          course_registration_intent_id: string | null;
          course_id: string;
          teacher_id: string;
          customer_email: string;
          provider: string;
          provider_subscription_id: string | null;
          provider_customer_id: string | null;
          provider_mandate_id: string | null;
          status:
            | "draft"
            | "pending_initial_payment"
            | "active"
            | "pause_scheduled"
            | "paused"
            | "cancel_scheduled"
            | "cancelled"
            | "ended"
            | "payment_holding"
            | "legacy_external";
          interval_unit: "month";
          interval_count: number;
          base_amount_cents: number;
          currency: string;
          billing_anchor_day: number;
          next_charge_at: string | null;
          started_at: string | null;
          ended_at: string | null;
          cancel_effective_date: string | null;
          metadata: Record<string, unknown>;
          updated_at: string;
        }>;
      };
      subscription_credits: {
        Row: {
          id: string;
          subscription_contract_id: string;
          origin_type: "refund" | "overpayment" | "manual_adjustment" | "carry_forward";
          origin_id: string | null;
          amount_cents: number;
          remaining_amount_cents: number;
          currency: string;
          status: "available" | "partially_applied" | "applied" | "expired" | "cancelled";
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subscription_contract_id: string;
          origin_type: "refund" | "overpayment" | "manual_adjustment" | "carry_forward";
          origin_id?: string | null;
          amount_cents: number;
          remaining_amount_cents: number;
          currency: string;
          status?: "available" | "partially_applied" | "applied" | "expired" | "cancelled";
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          subscription_contract_id: string;
          origin_type: "refund" | "overpayment" | "manual_adjustment" | "carry_forward";
          origin_id: string | null;
          amount_cents: number;
          remaining_amount_cents: number;
          currency: string;
          status: "available" | "partially_applied" | "applied" | "expired" | "cancelled";
          metadata: Record<string, unknown>;
          updated_at: string;
        }>;
      };
      subscription_events: {
        Row: {
          id: string;
          subscription_contract_id: string | null;
          subscription_period_id: string | null;
          subscription_charge_id: string | null;
          event_type: string;
          event_source: "system" | "stripe" | "admin" | "migration";
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          subscription_contract_id?: string | null;
          subscription_period_id?: string | null;
          subscription_charge_id?: string | null;
          event_type: string;
          event_source: "system" | "stripe" | "admin" | "migration";
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<{
          subscription_contract_id: string | null;
          subscription_period_id: string | null;
          subscription_charge_id: string | null;
          event_type: string;
          event_source: "system" | "stripe" | "admin" | "migration";
          payload: Record<string, unknown>;
        }>;
      };
      subscription_pause_windows: {
        Row: {
          id: string;
          subscription_contract_id: string | null;
          scope_type: "course" | "participant" | "contract";
          scope_id: string;
          start_date: string;
          end_date: string;
          status: "scheduled" | "active" | "completed" | "cancelled";
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subscription_contract_id?: string | null;
          scope_type: "course" | "participant" | "contract";
          scope_id: string;
          start_date: string;
          end_date: string;
          status?: "scheduled" | "active" | "completed" | "cancelled";
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          subscription_contract_id: string | null;
          scope_type: "course" | "participant" | "contract";
          scope_id: string;
          start_date: string;
          end_date: string;
          status: "scheduled" | "active" | "completed" | "cancelled";
          metadata: Record<string, unknown>;
          updated_at: string;
        }>;
      };
      subscription_periods: {
        Row: {
          id: string;
          subscription_contract_id: string;
          period_start: string;
          period_end: string;
          service_month: string;
          status:
            | "planned"
            | "paused"
            | "charge_pending"
            | "charged"
            | "partially_credited"
            | "credited"
            | "failed"
            | "cancelled";
          planned_charge_at: string | null;
          charged_at: string | null;
          pause_mode: "course_pause" | "participant_pause" | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subscription_contract_id: string;
          period_start: string;
          period_end: string;
          service_month: string;
          status?:
            | "planned"
            | "paused"
            | "charge_pending"
            | "charged"
            | "partially_credited"
            | "credited"
            | "failed"
            | "cancelled";
          planned_charge_at?: string | null;
          charged_at?: string | null;
          pause_mode?: "course_pause" | "participant_pause" | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          subscription_contract_id: string;
          period_start: string;
          period_end: string;
          service_month: string;
          status:
            | "planned"
            | "paused"
            | "charge_pending"
            | "charged"
            | "partially_credited"
            | "credited"
            | "failed"
            | "cancelled";
          planned_charge_at: string | null;
          charged_at: string | null;
          pause_mode: "course_pause" | "participant_pause" | null;
          metadata: Record<string, unknown>;
          updated_at: string;
        }>;
      };
      tickets: {
        Row: {
          id: string;
          type: "workshop" | "trial" | "course_session" | "course_participant";
          booking_id: string | null;
          trial_reservation_id: string | null;
          subscription_id: string | null;
          course_id: string | null;
          customer_name: string;
          customer_email: string;
          qr_token: string;
          status: "issued" | "checked_in" | "cancelled" | "expired";
          checked_in_at: string | null;
          checked_in_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: "workshop" | "trial" | "course_session" | "course_participant";
          booking_id?: string | null;
          trial_reservation_id?: string | null;
          subscription_id?: string | null;
          course_id?: string | null;
          customer_name: string;
          customer_email: string;
          qr_token: string;
          status?: "issued" | "checked_in" | "cancelled" | "expired";
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          type: "workshop" | "trial" | "course_session" | "course_participant";
          booking_id: string | null;
          trial_reservation_id: string | null;
          subscription_id: string | null;
          course_id: string | null;
          customer_name: string;
          customer_email: string;
          qr_token: string;
          status: "issued" | "checked_in" | "cancelled" | "expired";
          checked_in_at: string | null;
          checked_in_by: string | null;
        }>;
      };
    };
  };
};
