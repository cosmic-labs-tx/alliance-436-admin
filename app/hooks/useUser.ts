import { MembershipRole } from "@prisma/client";

import { useOptionalUser } from "~/hooks/useOptionalUser";

export function useUser() {
  const maybeUser = useOptionalUser();
  if (!maybeUser) {
    throw new Error(
      "No user found in root loader, but user is required by useUser. If user is optional, try useOptionalUser instead.",
    );
  }
  if (!maybeUser.role) {
    throw new Error("User has no role in root loader.");
  }
  return maybeUser as Omit<typeof maybeUser, "role"> & { role: MembershipRole };
}
