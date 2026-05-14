import type { ReactNode } from "react";
import DashboardBackLink from "./DashboardBackLink";

type DashboardPageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

export default function DashboardPageHeader({
  title,
  description,
  actions,
}: DashboardPageHeaderProps) {
  return (
    <section className="space-y-3">
      <DashboardBackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
