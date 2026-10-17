"use client";

import React, { useState } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";

export default function AccountSettingsPage() {
  const { showToast } = useToast();
  const [name, setName] = useState("Daniel Mwangi");
  const [email] = useState("daniel@brightline.studio");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("Profile updated successfully.");
  };

  return (
    <SettingsLayout
      title="Account & Profile"
      description="Manage your personal details and security preferences."
    >
      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-5">
          <h2 className="text-base font-semibold m-0 text-ink">Personal Information</h2>

          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-full border border-line bg-sunk text-xl font-bold text-ink">
              DM
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink">Profile Avatar</span>
              <span className="text-xs text-muted">Generated from your initials.</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-ink">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
              className="h-10 rounded-xl border border-line bg-subtle px-3 text-sm text-muted cursor-not-allowed"
            />
            <span className="text-xs text-muted">Email address cannot be changed directly. Contact support.</span>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="ease-ui rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Save profile
            </button>
          </div>
        </div>

        {/* Password update section */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold m-0 text-ink">Password</h3>
              <p className="text-xs text-muted m-0 mt-0.5">Secure your account with a strong password.</p>
            </div>
            <button
              type="button"
              onClick={() => showToast("Password reset link sent to your email.")}
              className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
            >
              Change password
            </button>
          </div>
        </div>
      </form>
    </SettingsLayout>
  );
}
