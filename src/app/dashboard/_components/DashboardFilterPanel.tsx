import type { ReactNode } from "react";

type DashboardFilterPanelProps = {
  children: ReactNode;
};

export default function DashboardFilterPanel({ children }: DashboardFilterPanelProps) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">{children}</section>;
}
