import { BadgePercent, Truck, ShieldCheck, RotateCcw } from "lucide-react";

const FEATURES = [
  {
    title: "Mega Discounts",
    subtitle: "When sign up",
    Icon: BadgePercent,
    tint: "bg-emerald-500/10",
    iconTint: "text-emerald-600",
  },
  {
    title: "Free Delivery",
    subtitle: "24/7 amazing services",
    Icon: Truck,
    tint: "bg-amber-500/10",
    iconTint: "text-amber-600",
  },
  {
    title: "Secured Payment",
    subtitle: "We accept all credit cards",
    Icon: ShieldCheck,
    tint: "bg-violet-500/10",
    iconTint: "text-violet-600",
  },
  {
    title: "Easy Returns",
    subtitle: "30-days free return policy",
    Icon: RotateCcw,
    tint: "bg-rose-500/10",
    iconTint: "text-rose-600",
  },
];

export default function FeatureStrip() {
  return (
    <section className="w-full bg-background">
      <div className="w-full px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ title, subtitle, Icon, tint, iconTint }) => (
            <div
              key={title}
              className={`flex items-center gap-4 rounded-xl border border-border shadow-sm px-6 py-5 ${tint}`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/70 border border-border">
                <Icon className={`h-6 w-6 ${iconTint}`} />
              </div>

              <div>
                <p className="font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}