"use client";

import React, { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/shell/toast-context";
import { appApi } from "@/lib/app-api";
import { notifyProfileUpdated } from "@/lib/use-current-user";

/** Fits an image inside 256 × 256 (keeping its shape and transparency) as a PNG data URL. */
async function resizeLogo(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

export function OrgLogoField({
  slug,
  name,
  canEdit,
}: {
  slug: string;
  name: string;
  canEdit: boolean;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    appApi
      .getBranding(slug)
      .then((b) => setLogoUrl(b?.logoLightKey ? `/v1/orgs/${slug}/branding/logo/light?v=${Date.now()}` : null))
      .catch(() => setLogoUrl(null));
  }, [slug]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      showToast("Choose a PNG, JPEG, WebP or SVG image.", { type: "error" });
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await resizeLogo(file);
      await appApi.uploadLogo(slug, "light", dataUrl);
      setLogoUrl(`/v1/orgs/${slug}/branding/logo/light?v=${Date.now()}`);
      notifyProfileUpdated();
      showToast("Organisation logo updated.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not upload the logo.", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await appApi.deleteLogo(slug, "light");
      setLogoUrl(null);
      notifyProfileUpdated();
      showToast("Organisation logo removed.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not remove the logo.", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const letters = name.trim().slice(0, 2).toUpperCase() || "?";

  return (
    <div className="flex flex-wrap items-center gap-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${name} logo`}
          onError={() => setLogoUrl(null)}
          className="size-16 rounded-xl border border-line bg-white object-contain"
        />
      ) : (
        <div aria-hidden="true" className="grid size-16 place-items-center rounded-xl bg-primary text-lg font-bold text-on-primary">
          {letters}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Organisation logo</span>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={onFile} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-60"
            >
              {busy ? "Working…" : logoUrl ? "Change logo" : "Upload logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-crit hover:bg-subtle disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
        ) : null}
        <p className="m-0 text-xs text-muted">Shown in the organisation switcher. PNG, JPEG, WebP or SVG.</p>
      </div>
    </div>
  );
}
