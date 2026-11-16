import { useAtomValue } from "@effect/atom-react";
import {
  collectLimitAccounts,
  collectLimitPools,
  displayLimitWindows,
} from "@t3tools/shared/usageLimits";
import { useState } from "react";

import { environmentPresentations } from "../../state/presentation";
import { providerClients } from "../settings/providerDriverMeta";
import { tvGauge } from "./tvHub.logic";

/** Remaining subscription limits as cell gauges. Now is fixed at mount, like Usage. */
export function TvUsageHud() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const [now] = useState(Date.now);
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  if (pools.length === 0) return null;
  return (
    <dl data-tv="gauges" aria-label="Usage limits left">
      {pools.flatMap((pool) =>
        displayLimitWindows(pool).map((window) => {
          const gauge = tvGauge(window.remainingPercent);
          return (
            <div key={`${pool.driver}:${window.kind}:${window.id}`} data-level={gauge.level}>
              <dt>
                {providerClients.get(pool.driver)?.label ?? String(pool.driver)} {window.label}
              </dt>
              <dd>
                <span data-tv="cells" aria-hidden>
                  {Array.from({ length: gauge.cells }, (_, cell) => (
                    <i key={cell} data-full={cell < gauge.full ? "" : undefined} />
                  ))}
                </span>
                {window.remainingPercent}%
              </dd>
            </div>
          );
        }),
      )}
    </dl>
  );
}
