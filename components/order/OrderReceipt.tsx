import rules from "@/config/order-rules.v1.json";
import { orderTagLabel } from "@/lib/menu/tags";
import { indicativePrice } from "@/lib/order/prices";
import type { StoredOrder } from "@/lib/order/run";
import { RegenerateOrderButton } from "@/components/order/RegenerateOrderButton";

export type ReceiptMenuItem = {
  id: string;
  name: string;
  category: string;
  size?: string | null;
  kcal: number | null;
};

type StoredLine = {
  item_id: string;
  quantity: number;
  justification?: string;
  tag_ids?: string[];
};

export function OrderReceipt({
  order,
  menu,
  status = "ready",
  showDecision = true,
  showRegenerate = true,
}: {
  order: StoredOrder | null;
  menu: ReceiptMenuItem[];
  status?: "ready" | "loading" | "error";
  showDecision?: boolean;
  showRegenerate?: boolean;
}) {
  if (status !== "ready" || !order) {
    return (
      <section className="receipt" aria-live="polite">
        <p>{status === "error" ? "The order did not come together." : "Building your order."}</p>
        {showRegenerate ? <RegenerateOrderButton /> : null}
      </section>
    );
  }
  const lines = orderLines(order, menu);
  const dollars = lines.reduce((sum, line) => sum + (line.price ?? 0), 0);
  const calories = lines.reduce((sum, line) => sum + (line.kcal ?? 0), 0);
  const decided = order.how_we_decided as { text?: string };
  const invented = (order.invented_rules ?? []) as { id: string; description: string }[];
  const calorieRule = rules.rules.find((rule) => rule.id === "bpm-calories");

  return (
    <article className="receipt">
      <header className="receipt-top">
        <p className="receipt-kicker">Your order</p>
        <p className="receipt-number">#{orderNumber(order.run_id)}</p>
      </header>
      <ol className="receipt-lines">
        {lines.map((line) => (
          <OrderLine key={line.item_id} line={line} />
        ))}
      </ol>
      <BudgetBar calories={calories} min={order.budget.calorie_budget.min} max={order.budget.calorie_budget.max} rule={calorieRule?.description ?? ""} />
      <p className="receipt-total">
        <span>{money(dollars)}</span>
        <span>{calories} kcal</span>
      </p>
      {showDecision ? <HowWeDecided text={decided.text ?? ""} /> : null}
      {invented.length > 0 ? (
        <section className="house-rules">
          <h2>House rules, invented by the AI</h2>
          <ul>
            {invented.map((rule) => (
              <li key={rule.id}>{rule.description}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="receipt-foot">
        <p>Menu retrieved {order.menu_retrieved_at}.</p>
        <p>Menu data from McDonald&apos;s Australia public product pages.</p>
        <p>Not affiliated with McDonald&apos;s.</p>
      </footer>
      {showRegenerate ? <RegenerateOrderButton /> : null}
    </article>
  );
}

export function OrderLine({
  line,
}: {
  line: { item_id: string; name: string; quantity: number; price: number | null; kcal: number | null; justification: string; tags: string[] };
}) {
  return (
    <li className="receipt-line">
      <p className="line-name">
        <span>{line.quantity}× {line.name}</span>
        <span>{line.price == null ? "" : money(line.price)}</span>
      </p>
      <p className="line-kcal">{line.kcal == null ? "" : `${line.kcal} kcal`}</p>
      {line.justification ? (
        <aside className="why-chosen">
          <h3>Why this was chosen</h3>
          <p>{line.justification}</p>
        </aside>
      ) : null}
      {line.tags.length > 0 ? (
        <p className="line-tags">{line.tags.join(" · ")}</p>
      ) : null}
    </li>
  );
}

export function HowWeDecided({ text }: { text: string }) {
  return (
    <section className="how-decided">
      <h2>How we decided</h2>
      <p>{text}</p>
    </section>
  );
}

export function BudgetBar({ calories, min, max, rule }: { calories: number; min: number; max: number; rule: string }) {
  const span = Math.max(max - min, 1);
  const width = Math.max(0, Math.min(100, ((calories - min) / span) * 100));
  return (
    <section className="budget" aria-label={`Calories ${calories} inside ${min} to ${max}. ${rule}`}>
      <p>{rule}</p>
      <p>
        {calories} kcal in a {min}–{max} budget
      </p>
      <span className="budget-track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </span>
    </section>
  );
}

export function RuleChip({ label }: { label: string }) {
  return <span className="rule-chip">{label}</span>;
}

export function orderLines(order: StoredOrder, menu: ReceiptMenuItem[]) {
  const items = (Array.isArray(order.items) ? order.items : []) as StoredLine[];
  return items.map((line) => {
    const item = menu.find((entry) => entry.id === line.item_id);
    const quantity = line.quantity || 1;
    return {
      item_id: line.item_id,
      name: item?.name ?? line.item_id,
      quantity,
      price: item ? indicativePrice(item) * quantity : null,
      kcal: item?.kcal == null ? null : item.kcal * quantity,
      justification: line.justification ?? "",
      tags: (line.tag_ids ?? []).map((id) => orderTagLabel(id)).filter((label): label is string => Boolean(label)),
    };
  });
}

export function orderNumber(runId: string): string {
  let value = 0;
  for (const char of runId) value = (value * 33 + char.charCodeAt(0)) % 10000;
  return String(value).padStart(4, "0");
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
