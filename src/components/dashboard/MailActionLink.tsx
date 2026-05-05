import { OfferActionIcon, OfferActionItem } from "@/app/dashboard/courses/OfferActionIcon";

type MailActionLinkProps = {
  href: string | null;
  label?: string;
  title?: string;
  disabledHint?: string;
  showLabel?: boolean;
};

export function MailActionLink(props: MailActionLinkProps) {
  const title = props.title ?? "E-Mail schreiben";
  const label = props.label ?? "E-Mail";
  const disabledHint = props.disabledHint ?? "Keine E-Mail-Adresse vorhanden";
  const showLabel = props.showLabel ?? true;

  const icon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Z" />
      <path d="m5 7 7 5 7-5" />
    </svg>
  );

  const content = props.href ? (
    <a href={props.href} className="inline-flex" title={title} aria-label={title}>
      <OfferActionIcon title={title} label={title}>
        {icon}
      </OfferActionIcon>
    </a>
  ) : (
    <span className="inline-flex cursor-not-allowed" aria-disabled="true">
      <OfferActionIcon
        title={disabledHint}
        label={disabledHint}
        className="cursor-not-allowed text-muted-foreground/50 opacity-60"
      >
        {icon}
      </OfferActionIcon>
    </span>
  );

  if (!showLabel) return content;

  return <OfferActionItem label={label}>{content}</OfferActionItem>;
}
