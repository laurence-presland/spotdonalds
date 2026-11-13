import { loadAggregates } from "@/lib/aggregates/load";
import { loadMenu } from "@/lib/menu/load";
import { supabaseOrderStore } from "@/lib/order/store";
import { supabaseProfileStore } from "@/lib/profile/store";
import type { ReceiptMenuItem } from "@/components/order/OrderReceipt";

export async function loadResults(userId: string) {
  const profiles = supabaseProfileStore();
  const orders = supabaseOrderStore();
  const run = await profiles.latestRun(userId);
  if (!run) return null;
  const [profile, order, aggregates] = await Promise.all([
    profiles.getProfile(run.id),
    orders.getOrder(run.id),
    loadAggregates(userId),
  ]);
  const menu: ReceiptMenuItem[] = loadMenu().items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    size: item.size,
    kcal: item.energy_kcal,
  }));
  return { run, profile, order, aggregates, menu };
}
