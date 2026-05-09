"use client";

import { OfferActionIcon } from "./OfferActionIcon";
import { ShareEmbedDialog } from "./ShareEmbedDialog";

export function CourseCardShareButton(props: {
  publicUrl: string;
  embedUrl: string;
  visibility: "public" | "private_link";
  isEnabled: boolean;
  className?: string;
}) {
  return (
    <span
      className="inline-flex"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ShareEmbedDialog
        isEnabled={props.isEnabled}
        publicUrl={props.publicUrl}
        embedUrl={props.embedUrl}
        visibility={props.visibility}
        triggerLabel="teilen"
        trigger={
          <span className={props.className ?? "inline-flex"}>
            <OfferActionIcon title="teilen" label="teilen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.22" />
                <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
              </svg>
            </OfferActionIcon>
          </span>
        }
      />
    </span>
  );
}
