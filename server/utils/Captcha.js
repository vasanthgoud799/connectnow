import { getClientIp, logSecurityEvent } from "./AuthSecurity.js";

const providers = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

export const isCaptchaConfigured = () =>
  Boolean(process.env.CAPTCHA_SECRET_KEY && providers[process.env.CAPTCHA_PROVIDER || "turnstile"]);

export const verifyCaptcha = async ({ req, token }) => {
  if (!isCaptchaConfigured()) {
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { ok: false, reason: "missing" };
  }

  const provider = process.env.CAPTCHA_PROVIDER || "turnstile";
  const body = new URLSearchParams({
    secret: process.env.CAPTCHA_SECRET_KEY,
    response: token,
    remoteip: getClientIp(req),
  });

  const response = await fetch(providers[provider], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));

  return {
    ok: Boolean(payload.success),
    payload,
    reason: payload["error-codes"]?.join(",") || "failed",
  };
};

export const requireCaptchaIfConfigured = async (req, res, next) => {
  if (!isCaptchaConfigured() || process.env.CAPTCHA_ENFORCE_AUTH !== "true") {
    return next();
  }

  const token = req.header("X-Captcha-Token");
  const result = await verifyCaptcha({ req, token });
  if (!result.ok) {
    await logSecurityEvent({
      req,
      type: "captcha_failed",
      severity: "medium",
      metadata: { reason: result.reason },
    });
    return res.status(403).json({ message: "Verification required.", captchaRequired: true });
  }

  return next();
};
