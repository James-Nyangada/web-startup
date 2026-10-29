"use client";

import { useEffect } from "react";
import { captureFirstUtm } from "@/lib/utm";

/** Records ?utm_* parameters on landing so sign-up can send them (staff spec P8-16). */
export function UtmCapture() {
  useEffect(() => {
    captureFirstUtm(window.location.search);
  }, []);
  return null;
}
