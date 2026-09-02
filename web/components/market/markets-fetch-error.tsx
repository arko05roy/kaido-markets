"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ErrorState } from "@/components/app/kaido-ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function MarketsFetchError({
  message,
  rpcHost,
}: {
  message: string;
  rpcHost: string | null;
}) {
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    toast({
      title: "Couldn't reach RPC",
      description: rpcHost ? `${message} (${rpcHost})` : message,
      variant: "error",
    });
  }, [message, rpcHost, toast]);

  return (
    <div className="space-y-4">
      <ErrorState
        title="Couldn't load markets"
        body={
          <>
            {message}
            {rpcHost ? ` · RPC: ${rpcHost}` : ""}
          </>
        }
      />
      <Button variant="outline" onClick={() => router.refresh()}>
        Retry
      </Button>
    </div>
  );
}
