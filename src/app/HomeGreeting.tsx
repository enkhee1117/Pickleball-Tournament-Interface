'use client';

import { useEffect, useState } from 'react';

// Pure greeting picker. Pulled out of the client component so it's
// trivially unit-testable.
//   hour < 5  → Late night
//   hour < 12 → Good morning
//   hour < 18 → Good afternoon
//   else      → Good evening
export function greetingForHour(hour: number): string {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Greeting line that uses the user's local hour, not the server's. Renders
// a stable placeholder during SSR/hydration so React doesn't yell about a
// mismatch, then settles into the right greeting once the client mounts.
export function HomeGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <div className="text-[13px] tracking-wide text-ink-3">
      {greeting ? `${greeting}, ${name}` : `Hi, ${name}`} 🎾
    </div>
  );
}
