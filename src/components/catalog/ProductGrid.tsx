import type { CardData } from "@/lib/catalog/cards";
import { ProductCard, type CardLabels } from "./ProductCard";

export function ProductGrid({ cards, labels, headingLevel = 2, priorityCount = 0, className = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" }: { cards: CardData[]; labels: CardLabels; headingLevel?: 2 | 3; priorityCount?: number; className?: string }) {
  return (
    <ul className={className}>
      {cards.map((c, i) => (
        <li key={c.id}>
          <ProductCard card={c} labels={labels} headingLevel={headingLevel} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
