export function creationSettings(env: Env) {
  return { siteKey: env.TURNSTILE_SITE_KEY || null };
}

export async function creationGuard(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== url.origin) {
    return Response.json({ error: "invalid creation origin" }, { status: 403 });
  }
  const ip = request.headers.get("CF-Connecting-IP");
  const attempt = await env.CREATE_ATTEMPTS.limit({ key: ip || "unknown" });
  if (!attempt.success) {
    return Response.json({ error: "creation limit reached" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  if (env.TURNSTILE_REQUIRED !== "true" && !env.TURNSTILE_SITE_KEY && !env.TURNSTILE_SECRET_KEY) return null;
  const unavailable = () => Response.json({ error: "verification unavailable" }, { status: 503 });
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) return unavailable();
  const denied = () => Response.json({ error: "verification required" }, { status: 403 });
  const token = request.headers.get("X-Turnstile-Token");
  if (!token || token.length > 2048) return denied();
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return unavailable();
    const result = await response.json<{ success: boolean; hostname?: string; action?: string }>();
    return result.success === true && result.hostname === url.hostname && result.action === "create_event" ? null : denied();
  } catch {
    return unavailable();
  }
}
