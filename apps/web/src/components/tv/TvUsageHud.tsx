import { useAtomValue } from "@effect/atom-react";
import {
  collectLimitAccounts,
  collectLimitPools,
  displayLimitWindows,
} from "@t3tools/shared/usageLimits";
import { useState } from "react";

import { environmentPresentations } from "../../state/presentation";
import { providerClients } from "../settings/providerDriverMeta";
import { barColor } from "../usage/UsageLimits";

/** Remaining subscription limits, one bar per provider window. Now is fixed at mount, like Usage. */
export function TvUsageHud() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const [now] = useState(Date.now);
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  if (pools.length === 0) {
    return <p className="text-muted-foreground text-sm">No provider reports usage limits.</p>;
  }
  return (
    <ul
      className="flex flex-wrap items-start justify-end gap-x-8 gap-y-3"
      aria-label="Usage limits"
    >
      {pools.map((pool) => (
        <li key={pool.driver} className="flex min-w-48 flex-col gap-1.5">
          <span className="font-medium text-sm">
            {providerClients.get(pool.driver)?.label ?? String(pool.driver)}
          </span>
          {displayLimitWindows(pool).map((window) => (
            <div key={`${window.kind}:${window.id}`} className="flex flex-col gap-0.5">
              <div className="flex justify-between gap-3 text-muted-foreground text-xs">
                <span>{window.label}</span>
                <span className="tabular-nums">{window.remainingPercent}% left</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${window.remainingPercent}%`,
                    backgroundColor: barColor(pool.driver),
                  }}
                />
              </div>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
