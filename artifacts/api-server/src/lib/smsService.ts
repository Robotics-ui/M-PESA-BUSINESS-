/**
 * Mobitech Technologies SMS Service
 *
 * Reusable, non-blocking SMS sending via the Mobitech SMS API.
 * All credentials are read from environment variables at call time so the
 * server can start without them (they are only required when an SMS is
 * actually triggered at runtime).
 *
 * Required env vars:
 *   MOBITECH_API_URL    – Full endpoint, e.g. https://api.mobitech.io/v1/messaging/sms
 *   MOBITECH_API_KEY    – Access key used in the Authorization header
 *
 * Optional env vars:
 *   MOBITECH_PARTNER_ID – Partner / account ID (included in payload when set)
 *   MOBITECH_SENDER_ID  – Originator name shown on the handset (default: "MPESALOANS")
 *
 * Usage:
 *   sendSms(phoneNumber, message);   // fire-and-forget — never throws
 *
 * Adding a new notification:
 *   Just call sendSms() with the recipient's phone and your message string.
 */

import { logger } from "./logger";

/** Normalise a Kenyan phone number to the 12-digit 254XXXXXXXXX format
 *  that Mobitech expects. Returns null if the number cannot be normalised. */
function normalizeKenyanPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return null;
}

/**
 * Send an SMS via the Mobitech Technologies API.
 *
 * This function is intentionally non-blocking: it never throws and never
 * rejects the returned Promise.  All errors are logged and swallowed so a
 * failed SMS cannot interrupt the normal application flow.
 *
 * @param to      Recipient phone number (any common Kenyan format accepted).
 * @param message SMS body text.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const apiUrl = process.env.MOBITECH_API_URL;
  const apiKey = process.env.MOBITECH_API_KEY;
  const partnerId = process.env.MOBITECH_PARTNER_ID;
  const senderId = process.env.MOBITECH_SENDER_ID ?? "MPESALOANS";

  // ── Configuration guard ──────────────────────────────────────────────────
  if (!apiUrl || !apiKey) {
    logger.warn(
      { to, hasApiUrl: Boolean(apiUrl), hasApiKey: Boolean(apiKey) },
      "SMS skipped: MOBITECH_API_URL or MOBITECH_API_KEY not configured",
    );
    return;
  }

  // ── Phone normalisation ──────────────────────────────────────────────────
  const mobile = normalizeKenyanPhone(to);
  if (!mobile) {
    logger.warn({ to }, "SMS skipped: could not normalise phone number to 254XXXXXXXXX format");
    return;
  }

  // ── Payload ──────────────────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    mobile,
    response_type: "json",
    sender_name: senderId,
    service_id: 0,
    message,
  };
  if (partnerId) {
    payload["partner_id"] = partnerId;
  }

  logger.info({ mobile, messageLength: message.length, senderId }, "Sending SMS via Mobitech");

  // ── HTTP request (with 15-second timeout) ────────────────────────────────
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    // Try to parse the JSON body for richer log context; fall back to null.
    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      logger.error(
        { mobile, httpStatus: response.status, responseBody },
        "SMS send failed: Mobitech returned a non-2xx response",
      );
      return;
    }

    logger.info(
      { mobile, httpStatus: response.status, responseBody },
      "SMS sent successfully via Mobitech",
    );
  } catch (err) {
    logger.error({ err, mobile }, "SMS send failed: network or timeout error");
  }
}
