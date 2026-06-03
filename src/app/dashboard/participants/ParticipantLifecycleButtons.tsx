"use client";

import type { ReactNode } from "react";
import { ConfirmIconAction } from "@/app/dashboard/courses/ConfirmIconAction";
import { OfferActionIcon } from "@/app/dashboard/courses/OfferActionIcon";
import { ParticipantPauseModal, ParticipantStopModal } from "./[id]/ParticipantSubscriptionModal";
import { pauseParticipantSubscriptionAction, stopParticipantSubscriptionAction } from "./[id]/actions";
import {
  approveTrialReservationAction,
  cancelTrialReservationAction,
  cancelWorkshopParticipantBookingAction,
  rejectTrialReservationAction,
} from "./actions";

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
    </svg>
  );
}

function IconSlot(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[4.5rem] max-w-[5.5rem] flex-col items-center gap-2 text-center">
      {props.children}
      <span className="text-[11px] font-medium leading-4 text-muted-foreground">{props.label}</span>
    </div>
  );
}

function DisabledAction(props: { title: string; className: string; children: ReactNode }) {
  return (
    <span className="inline-flex">
      <OfferActionIcon title={props.title} label={props.title} className={props.className} disabled={true}>
        {props.children}
      </OfferActionIcon>
    </span>
  );
}

function StatusAction(props: { title: string; className: string; children: ReactNode }) {
  return (
    <span className="inline-flex">
      <OfferActionIcon title={props.title} label={props.title} className={props.className}>
        {props.children}
      </OfferActionIcon>
    </span>
  );
}

export function TrialParticipantLifecycleButtons(props: {
  reservationId: string;
  redirectTo: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  playDisabled: boolean;
  stopDisabled: boolean;
  showApprovalAction: boolean;
  showCancellationAction: boolean;
}) {
  const playLabel =
    props.showApprovalAction && !props.playDisabled
      ? "Jetzt zur Anmeldung freigeben"
      : props.showCancellationAction
        ? "Warten auf Anmeldung"
        : "Nicht aktiv";
  const stopLabel = props.showApprovalAction ? "Jetzt absagen" : "Stornieren";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconSlot label={playLabel}>
        {props.showApprovalAction && !props.playDisabled ? (
          <ConfirmIconAction
            action={approveTrialReservationAction}
            fields={{ reservationId: props.reservationId, redirect_to: props.redirectTo }}
            title="Teilnahme für ein laufendes Angebot freigeben?"
            text="Die Person erhält eine E-Mail mit dem Link zur verbindlichen Anmeldung."
            cancelLabel="Nein, abbrechen"
            confirmLabel="Ja, freigeben"
            triggerLabel="freigeben"
            trigger={
              <OfferActionIcon title={playLabel} label={playLabel} className={props.playClassName}>
                <PlayGlyph />
              </OfferActionIcon>
            }
          />
        ) : (
          <StatusAction title={playLabel} className={props.playClassName}>
            <PlayGlyph />
          </StatusAction>
        )}
      </IconSlot>

      <IconSlot label="Pausieren">
        <DisabledAction title="Pausieren" className={props.pauseClassName}>
          <PauseGlyph />
        </DisabledAction>
      </IconSlot>

      <IconSlot label={stopLabel}>
        {props.showCancellationAction && !props.stopDisabled ? (
          <ConfirmIconAction
            action={props.showApprovalAction ? rejectTrialReservationAction : cancelTrialReservationAction}
            fields={{ reservationId: props.reservationId, redirect_to: props.redirectTo }}
            title={props.showApprovalAction ? "Teilnahme ablehnen?" : "Probeteilnahme absagen?"}
            text={
              props.showApprovalAction
                ? "Die Person erhält eine freundliche Absage und kann andere Angebote auf RESER entdecken."
                : "Die Probeteilnahme wird storniert und die bestehende Absage-Mail wird versendet."
            }
            cancelLabel="Nein, abbrechen"
            confirmLabel={props.showApprovalAction ? "Ja, ablehnen" : "Ja, absagen"}
            triggerLabel={props.showApprovalAction ? "ablehnen" : "absagen"}
            trigger={
              <OfferActionIcon title={stopLabel} label={stopLabel} className={props.stopClassName}>
                <StopGlyph />
              </OfferActionIcon>
            }
          />
        ) : (
          <DisabledAction title={stopLabel} className={props.stopClassName}>
            <StopGlyph />
          </DisabledAction>
        )}
      </IconSlot>
    </div>
  );
}

export function RegisteredParticipantLifecycleButtons(props: {
  reservationId: string;
  redirectTo: string;
  defaultActiveUntilDate: string;
  defaultPauseEndDate?: string | null;
  defaultStopDate: string;
  playLabel?: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  pauseLabel?: string;
  stopLabel?: string;
  pauseDisabled: boolean;
  stopDisabled: boolean;
}) {
  const playLabel = props.playLabel ?? "Aktiv";
  const pauseLabel = props.pauseLabel ?? "Pausieren";
  const stopLabel = props.stopLabel ?? "Kündigen";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconSlot label={playLabel}>
        <StatusAction title={playLabel} className={props.playClassName}>
          <PlayGlyph />
        </StatusAction>
      </IconSlot>

      <IconSlot label={pauseLabel}>
        {props.pauseDisabled ? (
          <StatusAction title={pauseLabel} className={props.pauseClassName}>
            <PauseGlyph />
          </StatusAction>
        ) : (
          <ParticipantPauseModal
            reservationId={props.reservationId}
            redirectTo={props.redirectTo}
            action={pauseParticipantSubscriptionAction}
            defaultActiveUntilDate={props.defaultActiveUntilDate}
            defaultPauseEndDate={props.defaultPauseEndDate}
            triggerTitle="pausieren"
            triggerContent={
              <OfferActionIcon title={pauseLabel} label={pauseLabel} className={props.pauseClassName}>
                <PauseGlyph />
              </OfferActionIcon>
            }
          />
        )}
      </IconSlot>

      <IconSlot label={stopLabel}>
        {props.stopDisabled ? (
          <StatusAction title={stopLabel} className={props.stopClassName}>
            <StopGlyph />
          </StatusAction>
        ) : (
          <ParticipantStopModal
            reservationId={props.reservationId}
            redirectTo={props.redirectTo}
            action={stopParticipantSubscriptionAction}
            defaultStopDate={props.defaultStopDate}
            triggerTitle="kündigen"
            triggerContent={
              <OfferActionIcon title={stopLabel} label={stopLabel} className={props.stopClassName}>
                <StopGlyph />
              </OfferActionIcon>
            }
          />
        )}
      </IconSlot>
    </div>
  );
}

export function WorkshopParticipantLifecycleButtons(props: {
  bookingId: string;
  redirectTo: string;
  paymentStatus?: string | null;
  playMode: string;
  stopDisabled: boolean;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
}) {
  const isFree = props.paymentStatus === "free";
  const playLabel =
    props.playMode === "workshop_checked_in"
      ? "Eingecheckt"
      : props.playMode === "workshop_cancelled" || props.playMode === "inactive"
        ? "Storniert"
        : "Reserviert";
  const stopLabel = props.playMode === "workshop_cancelled" || props.playMode === "inactive" ? "Storniert" : "Stornieren";
  const confirmationText = isFree
    ? "Möchtest du diese Teilnahme wirklich stornieren? Es wird keine Rückzahlung ausgelöst, weil diese Reservierung kostenlos war."
    : "Möchtest du diese Teilnahme wirklich stornieren? Die Rückerstattung richtet sich nach den Stornierungsbedingungen.";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconSlot label={playLabel}>
        <StatusAction title={playLabel} className={props.playClassName}>
          <PlayGlyph />
        </StatusAction>
      </IconSlot>
      <IconSlot label="Pausieren">
        <DisabledAction title="Pausieren" className={props.pauseClassName}>
          <PauseGlyph />
        </DisabledAction>
      </IconSlot>
      <IconSlot label={stopLabel}>
        {props.stopDisabled ? (
          <StatusAction title={stopLabel} className={props.stopClassName}>
            <StopGlyph />
          </StatusAction>
        ) : (
          <ConfirmIconAction
            action={cancelWorkshopParticipantBookingAction}
            fields={{ booking_id: props.bookingId, redirect_to: props.redirectTo }}
            title="Teilnahme stornieren?"
            text={confirmationText}
            cancelLabel="Nein, abbrechen"
            confirmLabel="Ja, Teilnahme stornieren"
            triggerLabel="Teilnahme stornieren"
            trigger={
              <OfferActionIcon title="Teilnahme stornieren" label="Teilnahme stornieren" className={props.stopClassName}>
                <StopGlyph />
              </OfferActionIcon>
            }
          />
        )}
      </IconSlot>
    </div>
  );
}
