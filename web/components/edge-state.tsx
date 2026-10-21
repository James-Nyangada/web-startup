import React from "react";
import { Logo } from "@/components/logo";

/** S-80: shared layout for 404, 500 and maintenance pages. Works without the app shell. */
export function EdgeState({
  code,
  title,
  children,
  actions,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-page text-ink">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="grid flex-1 place-items-center px-4 pb-24">
        <div className="w-full max-w-lg text-center">
          <p className="m-0 font-mono text-sm font-semibold tracking-wider text-muted">{code}</p>
          <h1 className="m-0 mt-2 font-serif text-[40px] leading-tight font-normal tracking-tight sm:text-[52px]">{title}</h1>
          <div className="mt-4 text-base leading-7 text-muted">{children}</div>
          {actions && <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>}
        </div>
      </main>
    </div>
  );
}

export const edgePrimary =
  "ease-ui inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary";
export const edgeSecondary =
  "ease-ui inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold text-ink no-underline hover:bg-subtle hover:text-ink";
