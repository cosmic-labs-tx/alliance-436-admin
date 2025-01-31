import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { useSearchParams } from "@remix-run/react";
import { withZod } from "@remix-validated-form/with-zod";
import { IconChevronRight } from "@tabler/icons-react";
import { redirect, typedjson, useTypedLoaderData } from "remix-typedjson";
import { ValidatedForm, validationError } from "remix-validated-form";
import { z } from "zod";

import { AuthCard } from "~/components/auth/auth-card";
import { BigButton } from "~/components/ui/big-button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { db } from "~/integrations/prisma.server";
import { Toasts } from "~/lib/toast.server";
import { normalizeEnum } from "~/lib/utils";
import { CheckboxSchema } from "~/models/schemas";
import { SessionService, sessionStorage } from "~/services.server/session";

const validator = withZod(
  z.object({
    orgId: z.string().min(1, { message: "Organization is required" }),
    redirectTo: z.string().optional(),
    rememberSelection: CheckboxSchema,
  }),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await SessionService.requireUserId(request);
  const session = await SessionService.getSession(request);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      memberships: {
        select: {
          org: {
            select: { id: true, name: true },
          },
          role: true,
          isDefault: true,
        },
      },
    },
  });

  if (!user) {
    throw await SessionService.logout(request);
  }

  if (!user.memberships.length) {
    return Toasts.redirectWithError(
      "/login",
      { title: "Error", description: "You are not a member of any organizations." },
      {
        headers: {
          "Set-Cookie": await sessionStorage.destroySession(session),
        },
      },
    );
  }
  return typedjson({
    orgs: user.memberships.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role, isDefault: m.isDefault })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await SessionService.requireUserId(request);
  const result = await validator.validate(await request.formData());

  if (result.error) {
    return validationError(result.error);
  }

  const { orgId, redirectTo, rememberSelection } = result.data;

  // Ensure the user is a member of the selected organization
  await db.membership.findUniqueOrThrow({ where: { userId_orgId: { userId, orgId } }, select: { id: true } });

  // Skip this screen on future logins
  if (rememberSelection) {
    await db.membership.update({
      data: { isDefault: true },
      where: {
        userId_orgId: {
          orgId,
          userId,
        },
      },
    });
  } else {
    await db.membership.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  const session = await SessionService.getSession(request);
  session.set(SessionService.ORGANIZATION_SESSION_KEY, orgId);

  const url = new URL(request.url);
  const redirectUrl = new URL(redirectTo ?? "/", url.origin);

  return redirect(redirectUrl.toString(), {
    headers: {
      "Set-Cookie": await SessionService.commitSession(session),
    },
  });
};

export const meta: MetaFunction = () => [{ title: "Choose Organization" }];

export default function LoginPage() {
  const { orgs } = useTypedLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  return (
    <AuthCard>
      <h1 className="text-4xl font-extrabold">Choose organization</h1>
      <p className="mt-1 text-sm text-muted-foreground">You can change organizations at any time.</p>
      <ValidatedForm validator={validator} method="post" className="mt-6 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo === "/choose-org" ? "/" : redirectTo} />
        <Label className="inline-flex cursor-pointer items-center gap-2">
          <Checkbox
            name="rememberSelection"
            defaultChecked={orgs.some((o) => o.isDefault)}
            aria-label="Remember selection"
          />
          <span>Remember selection</span>
        </Label>
        <div className="flex max-h-[30dvh] flex-col gap-y-4 overflow-y-scroll">
          {orgs.map((org) => {
            return (
              <BigButton key={org.id} type="submit" name="orgId" value={org.id}>
                <div>
                  <p className="text-lg font-bold text-foreground">{org.name}</p>
                  <p className="text-sm text-muted-foreground">{normalizeEnum(org.role)}</p>
                </div>
                <IconChevronRight />
              </BigButton>
            );
          })}
        </div>
      </ValidatedForm>
    </AuthCard>
  );
}
