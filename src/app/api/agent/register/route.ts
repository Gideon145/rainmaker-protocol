import { NextRequest, NextResponse } from "next/server";
import { registerSubAgent } from "@/lib/locus";

/**
 * POST /api/agent/register
 *
 * Demonstrates Locus agent self-registration: creates a new sub-agent wallet
 * on-the-fly via the Locus beta API. The caller receives a one-time API key
 * and wallet credentials — these are never persisted server-side.
 *
 * Body (optional):
 *   { name?: string; email?: string }
 *
 * Response:
 *   { walletId, walletStatus, claimUrl, defaults, apiKey, ownerPrivateKey }
 *
 * WARNING: apiKey and ownerPrivateKey are shown ONCE — the caller must
 * store them securely.  Locus does not expose them again after registration.
 */
export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  // Basic input sanitisation — name must be a short readable string
  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim().slice(0, 64)
      : undefined;
  const email =
    typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
      ? body.email.trim()
      : undefined;

  const result = await registerSubAgent({ name, email });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Registration failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    walletId: result.walletId,
    walletStatus: result.walletStatus,
    claimUrl: result.claimUrl,
    defaults: result.defaults,
    // Sensitive credentials — shown once, never stored server-side
    apiKey: result.apiKey,
    ownerPrivateKey: result.ownerPrivateKey,
  });
}
