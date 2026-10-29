"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { staffApi, formatBytes, type MediaAsset } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

export default function StaffMediaLibraryPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [q, setQ] = useState("");
  const [mimeFilter, setMimeFilter] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [isDecorative, setIsDecorative] = useState(false);
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail / edit modal
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  const [usage, setUsage] = useState<{ type: string; id: string; title: string }[] | null>(null);
  const selectedId = selectedAsset?.id;
  useEffect(() => {
    setUsage(null);
    if (!selectedId) return;
    let cancelled = false;
    staffApi
      .mediaUsage(selectedId)
      .then((u) => !cancelled && setUsage(u))
      .catch(() => !cancelled && setUsage([]));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(
    async (append: string | null = null) => {
      setState("loading");
      try {
        const page = await staffApi.listMedia({
          q: q || undefined,
          mime: mimeFilter || undefined,
          cursor: append,
        });
        setItems((prev) => (append ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [q, mimeFilter],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 50 * 1024 * 1024) {
      alert("File size exceeds 50MB limit.");
      return;
    }
    setFileToUpload(file);
    setAltText("");
    setIsDecorative(false);
    setCaption("");
    setCredit("");
    setUploadError(null);
    setUploadModalOpen(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload) return;
    if (!isDecorative && !altText.trim() && fileToUpload.type.startsWith("image/")) {
      setUploadError("Alt text is required for images unless marked as decorative.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      await staffApi.uploadMedia(fileToUpload, {
        altText: isDecorative ? undefined : altText.trim(),
        isDecorative,
        caption: caption.trim() || undefined,
        credit: credit.trim() || undefined,
      });
      setUploadModalOpen(false);
      setFileToUpload(null);
      showToast("Asset uploaded successfully.");
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload asset.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    if (!selectedAsset.isDecorative && !selectedAsset.altText?.trim() && selectedAsset.mime.startsWith("image/")) {
      alert("Alt text is required for images unless marked as decorative.");
      return;
    }

    setSavingAsset(true);
    try {
      const updated = await staffApi.updateMedia(selectedAsset.id, {
        altText: selectedAsset.isDecorative ? undefined : selectedAsset.altText,
        isDecorative: selectedAsset.isDecorative,
        caption: selectedAsset.caption,
        credit: selectedAsset.credit,
      });
      setSelectedAsset(null);
      showToast("Media details updated.");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update asset.");
    } finally {
      setSavingAsset(false);
    }
  };

  const handleDeleteAsset = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? If it is referenced in blog posts or fix guides, this could cause broken images.`)) {
      return;
    }
    try {
      await staffApi.deleteMedia(id);
      setSelectedAsset(null);
      showToast("Asset deleted.");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete asset.");
    }
  };

  const copyUrl = (url: string) => {
    void navigator.clipboard.writeText(url);
    showToast("URL copied to clipboard!");
  };

  return (
    <StaffShell
      title="Media Library"
      actions={
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,video/mp4,application/pdf"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <button
            type="button"
            className={btn.primary}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon d={I.upload} size={16} />
            Upload asset
          </button>
        </div>
      }
    >
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-xl border border-ok/30 bg-ok px-4 py-2.5 text-sm font-semibold text-white shadow-xl animate-bounce"
        >
          {toast}
        </div>
      )}

      {/* Intro & filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-sm text-muted">
          Static assets stored in Cloudflare R2. PNG, JPG, WebP, SVG, GIF, MP4 (≤ 50 MB), and PDF.
          All images require descriptive alt text or an explicit &quot;is decorative&quot; setting.
        </p>
      </div>

      <div className={`${card} mb-6 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          <div className="flex-1 min-w-[180px]">
            <label htmlFor="media-search" className="sr-only">Search media</label>
            <input
              id="media-search"
              type="search"
              placeholder="Search filename or caption…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="media-filter" className="sr-only">Filter type</label>
            <select
              id="media-filter"
              value={mimeFilter}
              onChange={(e) => setMimeFilter(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              <option value="">All file types</option>
              <option value="image/">Images (PNG, JPG, WebP, SVG)</option>
              <option value="video/">Videos (MP4)</option>
              <option value="application/pdf">Documents (PDF)</option>
            </select>
          </div>
        </div>

        {/* View toggles */}
        <div className="flex items-center rounded-xl border border-line p-1 bg-subtle">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              viewMode === "grid" ? "bg-surface shadow text-ink" : "text-muted hover:text-ink"
            }`}
            aria-label="Grid view"
          >
            <Icon d={I.grid} size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              viewMode === "list" ? "bg-surface shadow text-ink" : "text-muted hover:text-ink"
            }`}
            aria-label="List view"
          >
            <Icon d={I.menu} size={15} />
          </button>
        </div>
      </div>

      {/* Drag & drop upload dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleFileSelect(e.dataTransfer.files);
        }}
        className="mb-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-subtle/30 px-6 py-8 text-center transition hover:border-primary hover:bg-primary-soft/10 cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="grid size-12 place-items-center rounded-full bg-surface text-primary shadow-sm mb-3">
          <Icon d={I.upload} size={22} />
        </div>
        <p className="text-sm font-semibold text-ink m-0">
          Drag &amp; drop files here, or <span className="text-primary underline">browse</span>
        </p>
        <p className="text-xs text-muted mt-1 m-0">
          PNG, JPG, WebP, SVG, GIF, MP4 (≤ 50 MB), PDF. Responsive sizes are created automatically.
        </p>
      </div>

      {/* Grid or List View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((asset) => {
            const isImg = asset.mime.startsWith("image/");
            return (
              <div
                key={asset.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:shadow-lg"
              >
                {/* Media thumbnail */}
                <div
                  className="relative aspect-video w-full bg-subtle flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => setSelectedAsset(asset)}
                >
                  {isImg ? (
                    <img
                      src={asset.url || `/media/${asset.key}`}
                      alt={asset.isDecorative ? "" : asset.altText || asset.filename}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : asset.mime.startsWith("video/") ? (
                    <div className="text-primary flex flex-col items-center gap-1 text-xs">
                      <Icon d={I.monitor} size={28} />
                      <span>Video</span>
                    </div>
                  ) : (
                    <div className="text-muted flex flex-col items-center gap-1 text-xs">
                      <Icon d={I.fileText} size={28} />
                      <span>PDF Document</span>
                    </div>
                  )}

                  {asset.isDecorative && (
                    <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                      Decorative
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3
                      className="m-0 truncate text-xs font-bold text-ink cursor-pointer hover:text-primary"
                      title={asset.filename}
                      onClick={() => setSelectedAsset(asset)}
                    >
                      {asset.filename}
                    </h3>
                    <div className="text-[11px] text-muted mt-1 flex items-center justify-between">
                      <span>{formatBytes(asset.size)}</span>
                      {asset.width && asset.height && <span>{asset.width}×{asset.height}</span>}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                      onClick={() => copyUrl(asset.url || `/media/${asset.key}`)}
                    >
                      <Icon d={I.copy} size={12} />
                      Copy URL
                    </button>
                    <button
                      type="button"
                      className="text-muted hover:text-ink p-1 rounded hover:bg-subtle"
                      onClick={() => setSelectedAsset(asset)}
                      aria-label="Edit details"
                    >
                      <Icon d={I.pencil} size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full border-collapse">
            <caption className="sr-only">Media library assets</caption>
            <thead className="border-b border-line bg-subtle">
              <tr>
                <th scope="col" className={th}>Preview</th>
                <th scope="col" className={th}>Filename</th>
                <th scope="col" className={th}>Alt Text / Accessibility</th>
                <th scope="col" className={th}>Size</th>
                <th scope="col" className={th}>Dimensions</th>
                <th scope="col" className={th}>Uploaded</th>
                <th scope="col" className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((asset) => (
                <tr key={asset.id} className="hover:bg-subtle/50">
                  <td className={`${td} w-16`}>
                    <div className="size-12 rounded-lg bg-subtle overflow-hidden flex items-center justify-center">
                      {asset.mime.startsWith("image/") ? (
                        <img
                          src={asset.url || `/media/${asset.key}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Icon d={I.fileText} size={20} className="text-muted" />
                      )}
                    </div>
                  </td>
                  <td className={td}>
                    <div className="font-semibold text-ink text-xs">{asset.filename}</div>
                    <div className="text-[11px] font-mono text-muted">{asset.mime}</div>
                  </td>
                  <td className={td}>
                    {asset.isDecorative ? (
                      <span className="rounded bg-subtle px-2 py-0.5 text-xs text-muted">Decorative</span>
                    ) : (
                      <span className="text-xs text-ink line-clamp-1">{asset.altText || "No alt text"}</span>
                    )}
                  </td>
                  <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                    {formatBytes(asset.size)}
                  </td>
                  <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                    {asset.width && asset.height ? `${asset.width} × ${asset.height}` : "-"}
                  </td>
                  <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                    {formatDate(asset.createdAt)}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-ink hover:bg-subtle"
                        onClick={() => copyUrl(asset.url || `/media/${asset.key}`)}
                        title="Copy URL"
                      >
                        <Icon d={I.copy} size={15} />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-ink hover:bg-subtle"
                        onClick={() => setSelectedAsset(asset)}
                        title="Edit metadata"
                      >
                        <Icon d={I.pencil} size={15} />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-crit/70 hover:text-crit hover:bg-crit-soft"
                        onClick={() => void handleDeleteAsset(asset.id, asset.filename)}
                        title="Delete asset"
                      >
                        <Icon d={I.trash} size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state === "ready" && items.length === 0 && (
        <p className="m-0 p-12 text-center text-sm text-muted">
          No media assets found. Upload your first image or file above.
        </p>
      )}

      {cursor && (
        <div className="mt-6 flex justify-center">
          <button type="button" className={btn.secondary} onClick={() => void load(cursor)} disabled={state === "loading"}>
            Load more assets
          </button>
        </div>
      )}

      {/* Upload Metadata Dialog */}
      {uploadModalOpen && fileToUpload && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h2 id="upload-modal-title" className="m-0 mb-4 text-lg font-bold text-ink">
              Upload Media: {fileToUpload.name}
            </h2>

            {uploadError && (
              <div role="alert" className="mb-4 rounded-xl border border-crit/30 bg-crit-soft p-3 text-xs text-crit">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="rounded-xl border border-line bg-subtle p-3 text-xs text-muted flex items-center justify-between">
                <span>File size: {formatBytes(fileToUpload.size)}</span>
                <span>Type: {fileToUpload.type}</span>
              </div>

              {fileToUpload.type.startsWith("image/") && (
                <>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDecorative}
                      onChange={(e) => setIsDecorative(e.target.checked)}
                      className="size-4 rounded text-primary focus:ring-primary"
                    />
                    <span>This image is decorative (empty alt text)</span>
                  </label>

                  {!isDecorative && (
                    <div>
                      <label htmlFor="upload-alt" className="mb-1 block text-xs font-semibold text-ink">
                        Alt text (Required for screen readers)
                      </label>
                      <input
                        id="upload-alt"
                        type="text"
                        required
                        placeholder="Concise description of the content or function of the image"
                        value={altText}
                        onChange={(e) => setAltText(e.target.value)}
                        className={input}
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label htmlFor="upload-caption" className="mb-1 block text-xs font-semibold text-muted">
                  Caption (Optional)
                </label>
                <input
                  id="upload-caption"
                  type="text"
                  placeholder="Displayed below image when inserted into posts"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="upload-credit" className="mb-1 block text-xs font-semibold text-muted">
                  Credit / Source (Optional)
                </label>
                <input
                  id="upload-credit"
                  type="text"
                  placeholder="e.g. Photo by Jane Doe on Unsplash"
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                  className={input}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setUploadModalOpen(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button type="submit" className={btn.primary} disabled={uploading}>
                  {uploading ? "Uploading…" : "Complete upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Detail / Edit Modal */}
      {selectedAsset && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h2 id="asset-modal-title" className="m-0 text-lg font-bold text-ink truncate max-w-md">
                {selectedAsset.filename}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded p-1 text-muted hover:text-ink"
                aria-label="Close"
              >
                <Icon d={I.x} size={18} />
              </button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-xl border border-line bg-subtle p-2 flex items-center justify-center max-h-64 overflow-hidden">
                  {selectedAsset.mime.startsWith("image/") ? (
                    <img
                      src={selectedAsset.url || `/media/${selectedAsset.key}`}
                      alt={selectedAsset.altText || ""}
                      className="max-h-56 max-w-full object-contain"
                    />
                  ) : (
                    <Icon d={I.fileText} size={48} className="text-muted my-8" />
                  )}
                </div>

                <div className="rounded-xl border border-line bg-subtle p-3 space-y-1.5 text-xs text-muted">
                  <div><strong>File size:</strong> {formatBytes(selectedAsset.size)}</div>
                  <div><strong>MIME type:</strong> {selectedAsset.mime}</div>
                  {selectedAsset.width && selectedAsset.height && (
                    <div><strong>Dimensions:</strong> {selectedAsset.width} × {selectedAsset.height} px</div>
                  )}
                  <div><strong>Uploaded:</strong> {formatDate(selectedAsset.createdAt, true)}</div>
                  <div><strong>Storage key:</strong> <span className="font-mono text-[10px]">{selectedAsset.key}</span></div>
                </div>

                <button
                  type="button"
                  className={`${btn.secondary} w-full justify-center text-xs`}
                  onClick={() => copyUrl(selectedAsset.url || `/media/${selectedAsset.key}`)}
                >
                  <Icon d={I.copy} size={14} /> Copy Public Asset URL
                </button>
              </div>

              <section aria-label="Used in" className="rounded-xl border border-line bg-subtle p-3 text-xs">
                <h4 className="m-0 font-semibold text-ink">Used in</h4>
                {usage === null ? (
                  <p className="mt-1 text-muted">Checking…</p>
                ) : usage.length === 0 ? (
                  <p className="mt-1 text-muted">Not used anywhere. It can be deleted.</p>
                ) : (
                  <>
                    <ul className="mt-1 list-disc pl-4 text-ink">
                      {usage.map((u) => (
                        <li key={`${u.type}-${u.id}`}>
                          {u.type === "content_post" ? "Post" : "Page section"}: {u.title}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-muted">Deleting is blocked while the file is in use.</p>
                  </>
                )}
              </section>

              {/* Edit metadata form */}
              <form onSubmit={handleUpdateAsset} className="space-y-4">
                {selectedAsset.mime.startsWith("image/") && (
                  <>
                    <label className="flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAsset.isDecorative}
                        onChange={(e) => setSelectedAsset({ ...selectedAsset, isDecorative: e.target.checked })}
                        className="size-4 rounded text-primary focus:ring-primary"
                      />
                      <span>Mark as decorative</span>
                    </label>

                    {!selectedAsset.isDecorative && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted">
                          Alt text (Required for WCAG 1.1.1)
                        </label>
                        <textarea
                          rows={3}
                          value={selectedAsset.altText || ""}
                          onChange={(e) => setSelectedAsset({ ...selectedAsset, altText: e.target.value })}
                          className={input}
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Caption</label>
                  <input
                    type="text"
                    value={selectedAsset.caption || ""}
                    onChange={(e) => setSelectedAsset({ ...selectedAsset, caption: e.target.value })}
                    className={input}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Credit</label>
                  <input
                    type="text"
                    value={selectedAsset.credit || ""}
                    onChange={(e) => setSelectedAsset({ ...selectedAsset, credit: e.target.value })}
                    className={input}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-line pt-4">
                  <button
                    type="button"
                    className="text-xs font-semibold text-crit hover:underline"
                    onClick={() => void handleDeleteAsset(selectedAsset.id, selectedAsset.filename)}
                  >
                    Delete asset
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={btn.secondary}
                      onClick={() => setSelectedAsset(null)}
                      disabled={savingAsset}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={btn.primary} disabled={savingAsset}>
                      {savingAsset ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
