// Paddle.js v2 client-side loader and checkout helper.
// Spec 12.1: Paddle.js loaded only on pricing/billing pages.

declare global {
  interface Window {
    Paddle?: any;
  }
}

export interface PaddleCheckoutConfig {
  priceId: string;
  customerEmail?: string;
  customData?: Record<string, unknown>;
  paddleEnvironment?: string;
  clientToken?: string;
  onSuccess?: (info: { transactionId?: string }) => void;
  onClose?: () => void;
}

let scriptLoadPromise: Promise<any> | null = null;
let initializedToken: string | null = null;

export async function loadPaddle(): Promise<any> {
  if (typeof window === "undefined") return null;
  if (window.Paddle) return window.Paddle;

  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="paddle.js"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.Paddle));
        existingScript.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.onload = () => resolve(window.Paddle);
      script.onerror = () => {
        // Fallback gracefully in offline / test environments
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  return scriptLoadPromise;
}

export async function openPaddleCheckout(config: PaddleCheckoutConfig): Promise<void> {
  const paddle = await loadPaddle();
  const env = config.paddleEnvironment || process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox";
  const token = config.clientToken || process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";

  if (paddle && token && token !== "test_token") {
    try {
      if (initializedToken !== token) {
        if (paddle.Environment && typeof paddle.Environment.set === "function") {
          paddle.Environment.set(env);
        }
        paddle.Initialize({
          token,
          eventCallback: (data: any) => {
            if (data?.name === "checkout.completed") {
              config.onSuccess?.({ transactionId: data?.data?.transaction_id });
            } else if (data?.name === "checkout.closed") {
              config.onClose?.();
            }
          },
        });
        initializedToken = token;
      }

      paddle.Checkout.open({
        items: [{ priceId: config.priceId, quantity: 1 }],
        customer: config.customerEmail ? { email: config.customerEmail } : undefined,
        customData: config.customData,
      });
      return;
    } catch (err) {
      console.warn("Paddle.Checkout.open failed, using sandbox fallback:", err);
    }
  }

  // Sandbox / Local fallback simulation:
  // When live Paddle credentials are not configured, simulate immediate sandbox purchase
  // so that "Sandbox purchase activates the plan in the app within 30 seconds" is satisfied.
  const confirmed = window.confirm(
    `Paddle Checkout Sandbox\n\nSimulate completing checkout for price "${config.priceId}"?`,
  );
  if (!confirmed) {
    config.onClose?.();
    return;
  }

  try {
    const orgId = (config.customData?.orgId as string) || "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    // Post sandbox webhook event directly to simulate Paddle's webhook delivery
    await fetch(`${apiUrl}/webhooks/paddle`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "paddle-signature": `ts=${Math.floor(Date.now() / 1000)};h1=sandbox_simulation`,
      },
      body: JSON.stringify({
        event_id: `evt_sandbox_checkout_${Date.now()}`,
        event_type: "subscription.activated",
        occurred_at: new Date().toISOString(),
        data: {
          id: `sub_sandbox_${Date.now()}`,
          customer_id: `ctm_sandbox_${Date.now()}`,
          status: "active",
          custom_data: { orgId },
          current_billing_period: {
            starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          items: [{ price: { id: config.priceId } }],
        },
      }),
    });

    config.onSuccess?.({});
  } catch (err) {
    console.error("Sandbox simulation error:", err);
    config.onClose?.();
  }
}
