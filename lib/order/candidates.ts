import { candidateSet } from "@/lib/menu/candidates";
import { loadMenu } from "@/lib/menu/load";
import type { MenuItem } from "@/lib/menu/types";
import { indicativePrice } from "@/lib/order/prices";
import { itemProtein, type ProteinKind } from "@/lib/order/protein";

export type OrderCandidate = {
  item_id: string;
  name: string;
  category: string;
  kcal: number;
  kj: number;
  protein_g: number | null;
  protein: ProteinKind;
  tag_ids: string[];
  price_aud: number;
};

/** Build the compact candidate list the order model is allowed to pick from. */
export function orderCandidates(items: MenuItem[] = candidateSet(loadMenu().items)): OrderCandidate[] {
  return items.flatMap((item) => {
    if (item.energy_kcal == null || item.energy_kj == null) return [];
    return [
      {
        item_id: item.id,
        name: item.name,
        category: item.category,
        kcal: item.energy_kcal,
        kj: item.energy_kj,
        protein_g: item.protein_g,
        protein: itemProtein(item),
        tag_ids: item.tag_ids,
        price_aud: indicativePrice(item),
      },
    ];
  });
}
