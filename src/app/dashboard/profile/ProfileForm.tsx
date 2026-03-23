"use client";

import { useEffect, useState, useTransition } from "react";
import { saveProfileAction, type SaveProfileState } from "./actions";
import type { ProviderType } from "@/lib/provider-profiles";

type ProfileFormProps = {
  initialValues: {
    first_name: string;
    last_name: string;
    bio: string;
    photo_url: string;
    intro_video_url: string;
    provider_type: ProviderType;
    organization_name: string;
  };
};

export default function ProfileForm({ initialValues }: ProfileFormProps) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SaveProfileState>({});
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(initialValues.photo_url);
  const [photoObjectUrl, setPhotoObjectUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState(initialValues.intro_video_url);
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<ProviderType>(initialValues.provider_type);

  useEffect(() => {
    return () => {
      if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
      }
    };
  }, [photoObjectUrl]);

  const submitAction = (formData: FormData) => {
    setFileError(null);
    const introVideoUrl = String(formData.get("intro_video_url") || "").trim();
    if (introVideoUrl && !/^https?:\/\//i.test(introVideoUrl)) {
      setVideoUrlError("Bitte gib einen gültigen Link mit http:// oder https:// an.");
      return;
    }
    setVideoUrlError(null);

    startTransition(async () => {
      const result = await saveProfileAction(formData);
      setState(result);
    });
  };

  return (
    <form action={submitAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Anbietertyp *</span>
          <select
            name="provider_type"
            value={providerType}
            onChange={(event) => setProviderType(event.target.value as ProviderType)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="independent_teacher">Selbstständige Lehrkraft</option>
            <option value="studio_provider">Studio / Anbieter</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Vorname *</span>
          <input
            name="first_name"
            required
            defaultValue={initialValues.first_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Nachname *</span>
          <input
            name="last_name"
            required
            defaultValue={initialValues.last_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {providerType === "studio_provider" ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Anbietername *</span>
          <input
            name="organization_name"
            required
            defaultValue={initialValues.organization_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Studio Keramik Nord"
          />
        </label>
      ) : (
        <input type="hidden" name="organization_name" value={initialValues.organization_name} />
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Selbstbeschreibung</span>
        <textarea
          name="bio"
          rows={5}
          defaultValue={initialValues.bio}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Profilfoto</span>
          <input
            type="file"
            name="photo_file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (!nextFile) {
                setFileError(null);
                if (photoObjectUrl) {
                  URL.revokeObjectURL(photoObjectUrl);
                  setPhotoObjectUrl(null);
                }
                setPhotoPreviewUrl(initialValues.photo_url);
                return;
              }

              if (!nextFile.type.startsWith("image/")) {
                setFileError("Bitte nur Bilddateien hochladen.");
                event.target.value = "";
                return;
              }

              setFileError(null);
              if (photoObjectUrl) {
                URL.revokeObjectURL(photoObjectUrl);
              }
              const objectUrl = URL.createObjectURL(nextFile);
              setPhotoObjectUrl(objectUrl);
              setPhotoPreviewUrl(objectUrl);
            }}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <span className="block text-xs text-muted-foreground">
            Optional: JPG, PNG oder WebP
          </span>
          <input type="hidden" name="existing_photo_url" value={initialValues.photo_url} />
          {photoPreviewUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreviewUrl}
              alt="Profilfoto Vorschau"
              className="mt-2 h-24 w-24 rounded-lg border object-cover"
            />
          ) : null}
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Vorstellungsvideo</span>
        <input
          name="intro_video_url"
          value={videoUrl}
          onChange={(event) => {
            setVideoUrl(event.target.value);
            if (videoUrlError) setVideoUrlError(null);
          }}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <span className="block text-xs text-muted-foreground">
          Optional: Link zu einem YouTube- oder Vimeo-Video
        </span>
        {videoUrl.trim() && /^https?:\/\//i.test(videoUrl.trim()) ? (
          <a
            href={videoUrl.trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium underline underline-offset-4"
          >
            Video-Link öffnen
          </a>
        ) : null}
      </label>

      {fileError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {fileError}
        </p>
      ) : null}

      {videoUrlError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {videoUrlError}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Speichert..." : "Speichern"}
      </button>
    </form>
  );
}
