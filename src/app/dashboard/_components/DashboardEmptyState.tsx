import type { ReactNode } from "react";

export default function DashboardEmptyState(props: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto max-w-xl space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
        {props.description ? <p className="text-sm text-slate-600">{props.description}</p> : null}
      </div>
      {props.action ? <div className="mt-5 flex justify-center">{props.action}</div> : null}
    </section>
  );
}
