'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Mock provider only: simulates the gateway's "payment captured" webhook. */
export function PayButton({ linkId }: { linkId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button
      size="lg"
      className="mt-4 w-full"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await fetch('/api/webhooks/payments/mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId }) });
        setLoading(false);
        router.refresh();
      }}
    >
      Pay with UPI
    </Button>
  );
}
