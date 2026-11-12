"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Generic error page: never shows error details or stack traces to visitors. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">
          An unexpected error stopped this page from loading. Your saved information is not affected. Please try again.
        </p>
        {digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Go to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
