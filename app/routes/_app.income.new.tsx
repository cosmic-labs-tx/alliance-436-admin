import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import type { MetaFunction } from "@remix-run/react";
import { withZod } from "@remix-validated-form/with-zod";
import { IconPlus } from "@tabler/icons-react";
import { nanoid } from "nanoid";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { ValidatedForm, setFormDefaults, useFieldArray, useFormContext, validationError } from "remix-validated-form";
import { z } from "zod";

import { ErrorComponent } from "~/components/error-component";
import { PageContainer } from "~/components/page-container";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { FormField, FormSelect } from "~/components/ui/form";
import { Label } from "~/components/ui/label";
import { SubmitButton } from "~/components/ui/submit-button";
import { useConsoleLog } from "~/hooks/useConsoleLog";
import { prisma } from "~/integrations/prisma.server";
import { trigger } from "~/integrations/trigger.server";
import { ContactType, TransactionItemType } from "~/lib/constants";
import { requireUser } from "~/lib/session.server";
import { toast } from "~/lib/toast.server";
import { formatCentsAsDollars, getToday } from "~/lib/utils";
import { CheckboxSchema, TransactionItemSchema } from "~/models/schemas";

const validator = withZod(
  z.object({
    date: z.coerce.date(),
    description: z.string().optional(),
    shouldNotifyUser: CheckboxSchema,
    accountId: z.string().cuid({ message: "Account required" }),
    donorId: z.string().cuid().optional(),
    transactionItems: z.array(TransactionItemSchema),
  }),
);

export const meta: MetaFunction = () => [{ title: "New Transaction • Alliance 436" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireUser(request, ["SUPERADMIN", "ADMIN"]);
  const [donors, accounts, transactionItemMethods] = await Promise.all([
    prisma.contact.findMany({
      where: { typeId: ContactType.Donor },
    }),
    prisma.account.findMany(),
    prisma.transactionItemMethod.findMany(),
  ]);
  return typedjson({
    donors,
    accounts,
    transactionItemMethods,
    ...setFormDefaults("income-form", {
      transactionItems: [{ id: nanoid() }],
    }),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireUser(request, ["ADMIN", "SUPERADMIN"]);
  const result = await validator.validate(await request.formData());
  if (result.error) {
    return validationError(result.error);
  }
  const { transactionItems, donorId, accountId, shouldNotifyUser, ...rest } = result.data;

  if (shouldNotifyUser) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        user: {
          select: {
            contact: {
              select: { email: true },
            },
          },
        },
      },
    });
    if (!account?.user?.contact.email) {
      return toast.json(
        request,
        { message: "Error notifying user" },
        {
          variant: "destructive",
          title: "Error notifying user",
          description: "There was no user found on this account, or the user has no email address.",
        },
        { status: 400 },
      );
    }
    await trigger.sendEvent({
      name: "income.created",
      payload: {
        to: account.user.contact.email,
      },
    });
  }

  const total = transactionItems.reduce((acc, i) => acc + i.amountInCents, 0);
  const transaction = await prisma.transaction.create({
    data: {
      ...rest,
      account: { connect: { id: accountId } },
      donor: donorId ? { connect: { id: donorId } } : undefined,
      amountInCents: total,
      transactionItems: {
        createMany: {
          data: transactionItems.map((i) => i),
        },
      },
    },
    include: { account: true },
  });

  return toast.redirect(request, `/accounts/${transaction.accountId}`, {
    title: "Success",
    description: `Income of ${formatCentsAsDollars(total)} added to account ${transaction.account.code}`,
  });
};

export default function AddIncomePage() {
  const { donors, accounts, transactionItemMethods } = useTypedLoaderData<typeof loader>();
  const [items, { push, remove }] = useFieldArray("transactionItems", { formId: "income-form" });
  const ctx = useFormContext("income-form");
  useConsoleLog(ctx.fieldErrors);

  return (
    <>
      <PageHeader title="Add Income" />
      <PageContainer>
        <ValidatedForm id="income-form" method="post" validator={validator} className="sm:max-w-xl">
          <SubmitButton disabled={items.length === 0}>Submit Income</SubmitButton>
          <div>
            <Label className="mt-2 inline-flex cursor-pointer items-center gap-2">
              <Checkbox name="shouldNotifyUser" />
              <span>Notify User</span>
            </Label>
          </div>
          <div className="mt-8 space-y-8">
            <div className="space-y-2">
              <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                <div className="w-auto">
                  <FormField required name="date" label="Date" type="date" defaultValue={getToday()} />
                </div>
                <FormField name="description" label="Description" />
              </div>
              <FormSelect
                required
                name="accountId"
                label="Account"
                placeholder="Select account"
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.code} - ${a.description}`,
                }))}
              />
              <FormSelect
                name="donorId"
                label="Donor"
                placeholder="Select donor"
                options={donors.map((c) => ({
                  value: c.id,
                  label: `${c.firstName} ${c.lastName}`,
                }))}
              />
            </div>
            <ul className="flex flex-col gap-4">
              {items.map(({ key }, index) => {
                const fieldPrefix = `transactionItems[${index}]`;
                return (
                  <li key={key}>
                    <Card>
                      <CardHeader>
                        <CardTitle>Item {index + 1}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <input type="hidden" name={`${fieldPrefix}.id`} />
                        <input type="hidden" name={`${fieldPrefix}.typeId`} value={TransactionItemType.Donation} />
                        <fieldset className="space-y-3">
                          <div className="grid grid-cols-10 gap-2">
                            <div className="col-span-2">
                              <FormField required name={`${fieldPrefix}.amountInCents`} label="Amount" isCurrency />
                            </div>
                            <FormSelect
                              divProps={{ className: "col-span-4" }}
                              required
                              name={`${fieldPrefix}.methodId`}
                              label="Method"
                              placeholder="Select method"
                              options={transactionItemMethods.map((t) => ({
                                value: t.id,
                                label: t.name,
                              }))}
                            />
                          </div>
                          <FormField name={`${fieldPrefix}.description`} label="Description" />
                        </fieldset>
                      </CardContent>
                      <CardFooter>
                        <Button onClick={() => remove(index)} variant="destructive" type="button" className="ml-auto">
                          Remove
                        </Button>
                      </CardFooter>
                    </Card>
                  </li>
                );
              })}
            </ul>
            <Button
              onClick={() => push({ id: nanoid() })}
              variant="outline"
              className="flex items-center gap-2"
              type="button"
            >
              <IconPlus className="h-4 w-4" />
              <span>Add item</span>
            </Button>
          </div>
        </ValidatedForm>
      </PageContainer>
    </>
  );
}

export function ErrorBoundary() {
  return <ErrorComponent />;
}