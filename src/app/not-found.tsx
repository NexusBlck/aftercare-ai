import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-teal">404</p>
        <h1 className="mt-1 text-2xl font-extrabold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">The page you are looking for does not exist or has moved.</p>
        <Button asChild className="mt-6">
          <Link href="/">Go to home</Link>
        </Button>
      </div>
    </main>
  );
}
