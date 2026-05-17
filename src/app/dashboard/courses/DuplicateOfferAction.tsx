"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { duplicateCourseAction } from "./[id]/actions";

function DuplicateOfferSubmitButton(props: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title="Angebot duplizieren"
      aria-label="Angebot duplizieren"
      className="disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function DuplicateOfferAction(props: { courseId: string; children: ReactNode }) {
  return (
    <form
      action={duplicateCourseAction}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <input type="hidden" name="course_id" value={props.courseId} />
      <DuplicateOfferSubmitButton>{props.children}</DuplicateOfferSubmitButton>
    </form>
  );
}
