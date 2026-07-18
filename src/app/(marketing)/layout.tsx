import { PublicNav } from "@/features/public/PublicNav";
import { PublicFooter } from "@/features/public/PublicFooter";

/*
  Shared chrome for every inner public page (About, Pricing, Blog, …): the solid
  bordered nav and the slim footer. The home page (/) is outside this group so it
  can use the transparent hero nav + full footer.
*/
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav variant="solid" />
      <main className="flex-1">{children}</main>
      <PublicFooter variant="slim" />
    </div>
  );
}
