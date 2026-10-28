"use client";

import { SignupBody, type AuthResponse, type SignupInput } from "@deskmate/shared/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiRequestError, errorMessage, postJson } from "@/lib/api";

const FIELDS: { name: FieldPath<SignupInput>; label: string; type: string; autoComplete: string; hint?: string }[] = [
  { name: "name", label: "Your name", type: "text", autoComplete: "name" },
  { name: "email", label: "Work email", type: "email", autoComplete: "email" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
  {
    name: "workspaceName",
    label: "Company name",
    type: "text",
    autoComplete: "organization",
    hint: "Your workspace. Your docs and conversations live here.",
  },
];

export function SignupForm() {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(SignupBody),
    defaultValues: { name: "", email: "", password: "", workspaceName: "" },
  });

  async function onSubmit(values: SignupInput) {
    try {
      await postJson<AuthResponse>("/auth/signup", values);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      // 409 is about one specific field, so show it under that field.
      if (err instanceof ApiRequestError && err.status === 409) {
        form.setError("email", { message: err.message });
      } else {
        form.setError("root", { message: errorMessage(err) });
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your Deskmate account</CardTitle>
        <CardDescription>Set up a workspace for your company&apos;s support bot.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {FIELDS.map(({ name, label, type, autoComplete, hint }) => (
              <Controller
                key={name}
                name={name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={name}>{label}</FieldLabel>
                    <Input {...field} id={name} type={type} autoComplete={autoComplete} aria-invalid={fieldState.invalid} />
                    {hint && !fieldState.invalid && <FieldDescription>{hint}</FieldDescription>}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
            {form.formState.errors.root && <FieldError errors={[form.formState.errors.root]} />}
            <Field>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating account…" : "Create account"}
              </Button>
              <FieldDescription className="text-center">
                Already have an account? <Link href="/login">Log in</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
