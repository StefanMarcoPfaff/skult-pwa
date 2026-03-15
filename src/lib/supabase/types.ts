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
      course_sessions: {
        Row: CourseSession;
        Insert: Omit<CourseSession, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<CourseSession, "id" | "created_at">>;
      };
      tickets: {
        Row: {
          id: string;
          type: "workshop" | "trial" | "course_session";
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
          type: "workshop" | "trial" | "course_session";
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
          type: "workshop" | "trial" | "course_session";
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
