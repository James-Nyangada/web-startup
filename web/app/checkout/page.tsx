"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPaddle } from "@/lib/paddle";

// Paddle default payment link target. Paddle redirects customers here as
// /checkout?_ptxn=txn_..., and Paddle.js opens the checkout for that transaction.
export default function CheckoutPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const env = process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox";

    loadPaddle().then((paddle) => {
      if (!paddle || !token) {
        setError("Checkout is not available right now. Please try again later.");
        return;
      }
      try {
        if (paddle.Environment && typeof paddle.Environment.set === "function") {
          paddle.Environment.set(env);
        }
        paddle.Initialize({
          token,
          eventCallback: (data: any) => {
            if (data?.name === "checkout.completed") {
              window.location.href = "/settings/billing";
            }
          },
        });
      } catch (err) {
        console.error("Paddle checkout init failed:", err);
        setError("Checkout could not be started. Please try again.");
      }
    });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="m-0 font-serif text-[32px]">Secure checkout</h1>
      {error ? (
        <p className="m-0 text-muted">{error}</p>
      ) : (
        <p className="m-0 text-muted">Loading your checkout…</p>
      )}
      <Link href="/pricing" className="text-sm underline">
        Back to pricing
      </Link>
    </main>
  );
}
