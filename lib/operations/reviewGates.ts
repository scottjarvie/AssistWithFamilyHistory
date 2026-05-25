export function requireHumanReviewConfirmation(args: {
  actionName: string;
  confirmed: unknown;
  note: unknown;
}) {
  const errors: string[] = [];

  if (args.confirmed !== true) {
    errors.push(`${args.actionName} requires explicit human review confirmation.`);
  }

  if (typeof args.note !== "string" || args.note.trim().length < 20) {
    errors.push(`${args.actionName} requires a review note of at least 20 characters.`);
  }

  return errors;
}
