import { formatStoredSignal, signalAnchor } from "@/lib/profile/present";
import type { StoredProfile } from "@/lib/profile/run";
import { SIGNAL_REGISTRY, TRAIT_REGISTRY, type SignalKey } from "@/lib/signals/registry";
import { RegenerateButton } from "@/components/profile/RegenerateButton";

export function TasteProfileCard({ profile }: { profile: StoredProfile }) {
  return (
    <section className="profile-card" aria-labelledby="profile-insights-title">
      <h2 id="profile-insights-title">What we noticed</h2>
      <ul className="insights">
        {profile.insights.map((insight) => (
          <InsightLine key={insight.text} text={insight.text} cites={insight.cites} profile={profile} />
        ))}
      </ul>
      <h2>Traits</h2>
      <TraitChart profile={profile} />
      <RegenerateButton />
    </section>
  );
}

export function InsightLine({
  text,
  cites,
  profile,
}: {
  text: string;
  cites: SignalKey[];
  profile: StoredProfile;
}) {
  return (
    <li className="insight">
      <p>{text}</p>
      <div className="signal-chips">
        {cites.map((key) => (
          <SignalChip key={key} signalKey={key} profile={profile} />
        ))}
      </div>
    </li>
  );
}

export function SignalChip({ signalKey, profile }: { signalKey: SignalKey; profile: StoredProfile }) {
  const definition = SIGNAL_REGISTRY[signalKey];
  const sample =
    signalKey.startsWith("bpm.") && signalKey !== "bpm.sample_size" && typeof profile.signals["bpm.sample_size"] === "number"
      ? profile.signals["bpm.sample_size"]
      : null;
  return (
    <a className="signal-chip" href={signalAnchor(signalKey)}>
      <span>{definition.label}</span>
      <span>{formatStoredSignal(signalKey, profile.signals)}</span>
      {sample != null ? <span>{sample}</span> : null}
    </a>
  );
}

export function TraitChart({ profile }: { profile: StoredProfile }) {
  return (
    <div className="traits">
      <ul className="trait-bars">
        {profile.traits.map((trait) => (
          <li key={trait.name}>
            <span className="trait-name">{trait.name}</span>
            <span className="trait-score">{trait.score}</span>
            <span className="trait-track" aria-hidden="true">
              <span style={{ width: `${trait.score}%` }} />
            </span>
            <span className="trait-why">{trait.explanation}</span>
            <span className="trait-sources">
              {TRAIT_REGISTRY[trait.name].sources.map((key) => SIGNAL_REGISTRY[key].label).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      <table className="trait-table">
        <caption className="sr-only">Trait scores out of 100</caption>
        <thead>
          <tr>
            <th scope="col">Trait</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {profile.traits.map((trait) => (
            <tr key={trait.name}>
              <td>{trait.name}</td>
              <td>{trait.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
