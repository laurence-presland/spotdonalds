"use client";

import { useState } from "react";
import { AnalysingScreen } from "@/components/analysing/AnalysingScreen";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import { BpmHistogram, GenreMixChart, TopArtistsByWindow } from "@/components/aggregates/panels";
import { QuietLogout } from "@/components/flow/QuietLogout";
import { HowWeDecided, OrderReceipt, type ReceiptMenuItem } from "@/components/order/OrderReceipt";
import { RegenerateOrderButton } from "@/components/order/RegenerateOrderButton";
import { TasteProfileCard } from "@/components/profile/TasteProfileCard";
import type { Aggregates } from "@/lib/aggregates";
import type { AnalysingState } from "@/lib/analysing/reduce";
import type { StoredOrder } from "@/lib/order/run";
import type { StoredProfile } from "@/lib/profile/run";

export function ResultsScreen({
  profile,
  order,
  menu,
  aggregates,
  orderFailed,
  history,
}: {
  profile: StoredProfile | null;
  order: StoredOrder | null;
  menu: ReceiptMenuItem[];
  aggregates: Aggregates;
  orderFailed: boolean;
  /** Tracks already loaded on this visit. Without them, Back fetches the list. */
  history?: AnalysingState;
}) {
  const [showHistory, setShowHistory] = useState(false);
  if (showHistory && history) return <AnalysingView state={history} onForward={() => setShowHistory(false)} />;
  if (showHistory) return <AnalysingScreen tracksOnly onForward={() => setShowHistory(false)} />;

  const decided = (order?.how_we_decided ?? {}) as { text?: string };
  return (
    <div className="results">
      <header className="bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wordmark wordmark-bar" src="/brand/wordmark-yellow.svg" alt="SpotDonalds" />
        <QuietLogout />
      </header>
      <main className="results-main">
        <button type="button" className="back" onClick={() => setShowHistory(true)}>
          Back
        </button>
        <div className="results-hero">
          <OrderReceipt
            order={order}
            menu={menu}
            status={order ? "ready" : orderFailed ? "error" : "loading"}
            showDecision={false}
            showRegenerate={false}
          />
          <aside className="persona-card">
            <p className="persona-kicker">We think you&apos;re a</p>
            {profile ? (
              <>
                <h1>{profile.persona_name}</h1>
                <p>{profile.tagline}</p>
              </>
            ) : (
              <p>The reading did not come together.</p>
            )}
            {order ? <HowWeDecided text={decided.text ?? ""} /> : null}
            <RegenerateOrderButton />
          </aside>
        </div>
        {profile ? <TasteProfileCard profile={profile} /> : null}
        <GenreMixChart mix={aggregates.tags} status={aggregates.tags.buckets.length ? "ready" : "empty"} />
        <BpmHistogram stats={aggregates.bpm} status={aggregates.bpm.count ? "ready" : "empty"} />
        <TopArtistsByWindow artists={aggregates.artists} status="ready" />
      </main>
    </div>
  );
}
