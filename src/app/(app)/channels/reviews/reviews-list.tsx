'use client';

import { useState } from 'react';
import { MessageSquareReply, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDay, OTA_LABELS, timeAgo } from '@/lib/format';
import { replyReviewAction } from '@/server/actions/channels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

interface Review {
  id: string;
  channel: string;
  reviewerName: string;
  rating: number;
  title: string | null;
  text: string | null;
  stayDate: string | null;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('h-4 w-4', value >= i - 0.25 ? 'fill-amber-400 text-amber-400' : value >= i - 0.75 ? 'fill-amber-200 text-amber-400' : 'text-ink-200')} />
      ))}
      <span className="num ml-1 text-sm font-bold text-ink-900">{value.toFixed(1)}</span>
    </span>
  );
}

export function ReviewsList({ reviews }: { reviews: Review[] }) {
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const { run, pending } = useRun();
  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <article key={r.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <Badge tone={r.rating >= 4 ? 'success' : r.rating >= 3 ? 'warning' : 'danger'}>{r.rating >= 4 ? 'Happy' : r.rating >= 3 ? 'Mixed' : 'Unhappy'}</Badge>
              </div>
              <p className="mt-2 font-bold text-ink-900">{r.title}</p>
            </div>
            <div className="text-right text-xs text-ink-500">
              <p className="font-semibold text-ink-700">{OTA_LABELS[r.channel] ?? r.channel}</p>
              <p>
                {r.reviewerName} · {timeAgo(r.createdAt)}
              </p>
              {r.stayDate && <p>Stayed {formatDay(r.stayDate)}</p>}
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">{r.text}</p>
          {r.reply ? (
            <div className="mt-4 rounded-xl border-l-4 border-brand-500 bg-ink-50 p-3 text-sm">
              <p className="text-xs font-semibold text-ink-500">Your reply {r.repliedAt && `· ${timeAgo(r.repliedAt)}`}</p>
              <p className="mt-1 text-ink-700">{r.reply}</p>
            </div>
          ) : replying === r.id ? (
            <div className="mt-4 space-y-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Thank you ${r.reviewerName.split(' ')[0]}…`} autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setReplying(null)}>
                  Cancel
                </Button>
                <Button size="sm" loading={pending} onClick={() => run(() => replyReviewAction(r.id, text), { onSuccess: () => (setReplying(null), setText('')) })}>
                  Post reply
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="soft" className="mt-4" onClick={() => (setReplying(r.id), setText(''))}>
              <MessageSquareReply className="h-3.5 w-3.5" /> Reply
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
