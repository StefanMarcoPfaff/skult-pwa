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
    };
  };
};
