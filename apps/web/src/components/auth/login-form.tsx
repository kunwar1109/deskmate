"use client";

import { LoginBody, type AuthResponse } from "@deskmate/shared/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiRequestError, errorMessage, postJson } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  // Same Zod schema the API validates with, so browser and server agree on what's valid.
  const form = useForm({
    resolver: zodResolver(LoginBody),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: { email: string; password: string }) {
    try {
      await postJson<AuthResponse>("/auth/login", values);
      // The API set the httpOnly cookie on this response. refresh() makes Server Components re-render with it.
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiRequestError && err.status === 401 ? "Invalid email or password" : errorMessage(err);
      form.setError("root", { message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in to Deskmate</CardTitle>
        <CardDescription>Manage your help docs and test your support bot.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input {...field} id="email" type="email" autoComplete="email" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {form.formState.errors.root && <FieldError errors={[form.formState.errors.root]} />}
            <Field>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Logging in…" : "Log in"}
              </Button>
              <FieldDescription className="text-center">
                No account yet? <Link href="/signup">Sign up</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
