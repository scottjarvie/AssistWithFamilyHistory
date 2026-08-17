/**
 * `/settings/ai` → `/app/settings/ai`.
 *
 * The connection centre lives under `/app` with every other signed-in surface.
 * This redirect exists because `/settings/ai` is the shorter, more guessable
 * form, and because a person arriving here has usually been sent by their AI
 * after a refusal — the worst possible moment to meet a 404.
 */
import { redirect } from "next/navigation";

export default function AiConnectionsRedirect(): never {
  redirect("/app/settings/ai");
}
