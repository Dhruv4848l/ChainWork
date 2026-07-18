"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { loginAction, signupAction, type FormState } from "./actions";

/*
  AUTH-01/02 — the combined login + signup card. The pill toggle "Find Work | Post
  a Job" sets the signup role (both roles write to the one User table). Switching
  between login and signup swaps which fields render and which server action fires.
*/
type Mode = "login" | "signup";
type RoleChoice = "WORKER" | "CLIENT";

const empty: FormState = {};

export function AuthForm({
  initialMode = "login",
  returnTo = "",
}: {
  initialMode?: Mode;
  returnTo?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [role, setRole] = useState<RoleChoice>("WORKER");
  const [clientType, setClientType] = useState<"INDIVIDUAL" | "BUSINESS">(
    "INDIVIDUAL"
  );

  const [loginState, loginFormAction, loginPending] = useActionState(
    loginAction,
    empty
  );
  const [signupState, signupFormAction, signupPending] = useActionState(
    signupAction,
    empty
  );

  const isSignup = mode === "signup";
  const state = isSignup ? signupState : loginState;
  const pending = isSignup ? signupPending : loginPending;

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9">
      {/* Role toggle */}
      <div className="mb-7 flex rounded-full border border-line bg-bg p-1">
        <PillToggle active={role === "WORKER"} onClick={() => setRole("WORKER")}>
          Find Work
        </PillToggle>
        <PillToggle active={role === "CLIENT"} onClick={() => setRole("CLIENT")}>
          Post a Job
        </PillToggle>
      </div>

      <h1 className="font-display text-3xl text-ink">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-6 mt-1 text-sm text-ink2">
        {isSignup
          ? role === "WORKER"
            ? "Find trusted work with pay locked in escrow."
            : "Hire verified workers with milestone escrow."
          : "Log in to your ChainWork account."}
      </p>

      <form
        action={isSignup ? signupFormAction : loginFormAction}
        className="flex flex-col gap-3"
      >
        {isSignup ? (
          <>
            <input type="hidden" name="role" value={role} />
            <Field name="name" placeholder="Full name" autoComplete="name" />
            <Field name="phone" placeholder="Phone number" autoComplete="tel" />
            <Field
              name="email"
              type="email"
              placeholder="Email (optional, recommended)"
              autoComplete="email"
            />
            <Field
              name="password"
              type="password"
              placeholder="Password (min 8 characters)"
              autoComplete="new-password"
            />
            {role === "CLIENT" && (
              <>
                <input type="hidden" name="clientType" value={clientType} />
                <div className="flex rounded-full border border-line bg-bg p-1">
                  <PillToggle
                    small
                    active={clientType === "INDIVIDUAL"}
                    onClick={() => setClientType("INDIVIDUAL")}
                  >
                    Individual
                  </PillToggle>
                  <PillToggle
                    small
                    active={clientType === "BUSINESS"}
                    onClick={() => setClientType("BUSINESS")}
                  >
                    Business
                  </PillToggle>
                </div>
                {clientType === "BUSINESS" && (
                  <>
                    <Field name="companyName" placeholder="Company name" />
                    <Field
                      name="businessRegNumber"
                      placeholder="Business registration number"
                    />
                  </>
                )}
              </>
            )}
            <label className="mt-1 flex cursor-pointer items-start gap-2.5 text-sm text-ink2">
              <input
                type="checkbox"
                name="agree"
                className="mt-0.5 accent-bronze"
              />
              <span>
                I agree to the{" "}
                <Link href="/legal" className="text-bronze hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/legal" className="text-bronze hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="returnTo" value={returnTo} />
            <Field
              name="identifier"
              placeholder="Phone or email"
              autoComplete="username"
            />
            <Field
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
            />
            <Link
              href="/forgot-password"
              className="self-start text-sm text-ink2 hover:text-bronze"
            >
              Forgot password?
            </Link>
          </>
        )}

        {state.error && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={pending} className="mt-2">
          {pending
            ? "Please wait…"
            : isSignup
              ? "Create account"
              : "Log in"}
        </Button>
      </form>

      <div className="mt-6 border-t border-line pt-5 text-center">
        <button
          onClick={() => setMode(isSignup ? "login" : "signup")}
          className="text-sm text-bronze hover:underline"
        >
          {isSignup
            ? "Already have an account? Log in"
            : "New to ChainWork? Create an account"}
        </button>
      </div>
    </div>
  );
}

function PillToggle({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full font-semibold uppercase tracking-wider transition-colors ${
        small ? "py-2 text-[11px]" : "py-2.5 text-xs"
      } ${
        active ? "bg-bronze text-[#1a1512]" : "bg-transparent text-ink2"
      }`}
    >
      {children}
    </button>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-line-strong bg-bg px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
    />
  );
}
