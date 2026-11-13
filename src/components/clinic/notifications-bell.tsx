"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDate } from "./ui";
import { send, useApi } from "./use-api";

interface NotificationList {
  items: Array<{ id: string; title: string; link: string | null; read_at: string | null; created_at: string }>;
  unread: number;
}

/** In-app notifications (no email/SMS is sent). Titles are generic and never contain medical details. */
export function NotificationsBell({ inverted = false }: { inverted?: boolean }) {
  const { data, reload } = useApi<NotificationList>("/api/notifications");
  const unread = data?.unread ?? 0;
  const markRead = async (id: string) => {
    await send(`/api/notifications/${id}`, "PATCH").catch(() => undefined);
    void reload();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn("relative", inverted && "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white")}
        >
          <Bell aria-hidden />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(data?.items.length ?? 0) === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">You are all caught up.</p>}
        {data?.items.slice(0, 10).map((n) => (
          <DropdownMenuItem key={n.id} asChild onSelect={() => !n.read_at && void markRead(n.id)}>
            <Link href={n.link ?? "#"} className="flex flex-col items-start gap-0.5">
              <span className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</span>
              <span className="text-xs text-muted-foreground">{formatDate(n.created_at, true)}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
