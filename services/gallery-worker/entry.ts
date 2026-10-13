import { env } from "cloudflare:workers";
import { warmServerKeys } from "./crypto";
import worker from "./index";

// Keep the Cloudflare-only binding import outside the portable request handler.
// A fresh Worker can be created before its secrets are installed; configured
// Workers must finish validation/key import successfully before handling traffic.
if (env.SECRETS !== undefined) await warmServerKeys(env.SECRETS);

export default worker;
