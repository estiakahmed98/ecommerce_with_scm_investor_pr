import {
  Truck,
  Clock,
  Shield,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShippingPolicyPage() {
  const shippingRates = [
    {
      area: "Dhaka City Corporation",
      minAmount: "৳500+",
      charge: "Free",
      time: "1–2 business days",
      note: "Express delivery available",
    },
    {
      area: "Dhaka District (Outside City)",
      minAmount: "৳500+",
      charge: "৳80",
      time: "2–3 business days",
      note: "Available in all areas",
    },
    {
      area: "Divisional Cities",
      minAmount: "৳500+",
      charge: "৳120",
      time: "3–4 business days",
      note: "Chattogram, Rajshahi, Khulna, etc.",
    },
    {
      area: "District Headquarters",
      minAmount: "৳500+",
      charge: "৳150",
      time: "4–5 business days",
      note: "All district headquarters",
    },
    {
      area: "Upazila / Rural Areas",
      minAmount: "৳500+",
      charge: "৳200",
      time: "5–7 business days",
      note: "Remote areas may take longer",
    },
  ];

  const expressDelivery = [
    {
      service: "Standard Delivery",
      areas: "All Bangladesh",
      time: "1–7 business days",
      charge: "Free / Fixed",
      note: "Standard service",
    },
    {
      service: "Express Delivery",
      areas: "Dhaka City Corporation",
      time: "6–12 hours",
      charge: "Extra ৳150",
      note: "Place order before 12 PM",
    },
    {
      service: "Priority Delivery",
      areas: "Divisional Cities",
      time: "24–48 hours",
      charge: "Extra ৳200",
      note: "Only available in major cities",
    },
  ];

  const restrictions = [
    {
      type: "Book Types",
      items: ["All Bengali books", "Educational books", "Religious books", "Literature"],
      allowed: true as const,
    },
    {
      type: "Special Editions",
      items: ["Rare books", "First edition", "Autographed copies"],
      allowed: true as const,
    },
    {
      type: "Restricted Items",
      items: ["Fake books", "Pirated copies", "Unauthorized publications"],
      allowed: false as const,
    },
    {
      type: "Large Orders",
      items: ["10+ books at once", "Box sets", "Encyclopedias"],
      allowed: "Conditional" as const,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-r from-primary to-primary/80">
        <div className="container mx-auto px-4 text-center">
          <div className="w-20 h-20 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Truck className="h-10 w-10 text-primary-foreground" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            Shipping Policy
          </h1>

          <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto">
            Complete delivery information for BOED E-Commerce
          </p>
        </div>
      </section>

      {/* Quick Overview */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6 bg-card rounded-2xl shadow-lg border border-border">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Truck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Free Delivery
              </h3>
              <p className="text-muted-foreground">
                Free delivery in Dhaka for orders ৳500+
              </p>
            </div>

            <div className="text-center p-6 bg-card rounded-2xl shadow-lg border border-border">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Fast Delivery
              </h3>
              <p className="text-muted-foreground">
                Dhaka in 1–2 days, other divisions in 3–7 business days
              </p>
            </div>

            <div className="text-center p-6 bg-card rounded-2xl shadow-lg border border-border">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Secure Packaging
              </h3>
              <p className="text-muted-foreground">
                Products are shipped with protective packaging for maximum safety
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Shipping Rates & Times */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Delivery Charges & Time
            </h2>
            <div className="w-24 h-1 bg-primary mx-auto mb-4"></div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Free delivery for orders ৳500+ (conditions apply by area)
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl shadow-lg border border-border bg-background">
            <table className="w-full">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">Area</th>
                  <th className="px-6 py-4 text-center font-semibold">
                    Minimum Order
                  </th>
                  <th className="px-6 py-4 text-center font-semibold">
                    Delivery Charge
                  </th>
                  <th className="px-6 py-4 text-center font-semibold">Time</th>
                  <th className="px-6 py-4 text-center font-semibold">Note</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {shippingRates.map((rate, index) => (
                  <tr
                    key={index}
                    className="hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-foreground">
                      {rate.area}
                    </td>
                    <td className="px-6 py-4 text-center text-foreground">
                      {rate.minAmount}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`font-semibold ${
                          rate.charge === "Free"
                            ? "text-green-600 dark:text-green-400"
                            : "text-foreground"
                        }`}
                      >
                        {rate.charge}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-foreground">
                      {rate.time}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      {rate.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Delivery Options */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Delivery Options
            </h2>
            <div className="w-24 h-1 bg-primary mx-auto mb-4"></div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {expressDelivery.map((service, index) => (
              <div
                key={index}
                className={`rounded-2xl p-6 border-2 ${
                  index === 0
                    ? "border-border bg-card"
                    : index === 1
                      ? "border-primary/40 bg-primary/5"
                      : "border-foreground/20 bg-accent/30"
                }`}
              >
                <div className="text-center mb-6">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                      index === 0
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    <Truck className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    {service.service}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-foreground font-medium">Area</span>
                    <span className="text-muted-foreground">{service.areas}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-foreground font-medium">Time</span>
                    <span className="text-foreground font-semibold">
                      {service.time}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-foreground font-medium">Charge</span>
                    <span
                      className={`font-bold ${
                        service.charge.toLowerCase().includes("free")
                          ? "text-green-600 dark:text-green-400"
                          : "text-primary"
                      }`}
                    >
                      {service.charge}
                    </span>
                  </div>
                  <div className="pt-2">
                    <p className="text-sm text-muted-foreground text-center">
                      {service.note}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* Important Notes */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-8 text-primary-foreground">
            <h2 className="text-2xl font-bold mb-6 text-center">
              Important Guidelines
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {[
                  {
                    title: "Verify Address",
                    desc: "Provide a complete and accurate shipping address before placing your order.",
                  },
                  {
                    title: "Contact Number",
                    desc: "Use a valid phone number so we can update delivery status if needed.",
                  },
                  {
                    title: "Packaging",
                    desc: "Items are packed securely (bubble wrap / protective layers) to prevent damage.",
                  },
                ].map((x) => (
                  <div key={x.title} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-300 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold mb-1">{x.title}</h4>
                      <p className="text-sm opacity-90">{x.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {[
                  {
                    title: "Tracking Updates",
                    desc: "Real-time updates via SMS and email (where applicable).",
                  },
                  {
                    title: "Order Hold",
                    desc: "We can hold an order in special cases—contact support for details.",
                  },
                  {
                    title: "Support",
                    desc: "Customer support is available to help you throughout the process.",
                  },
                ].map((x) => (
                  <div key={x.title} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-300 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold mb-1">{x.title}</h4>
                      <p className="text-sm opacity-90">{x.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Need more information?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Our shipping team is ready to answer your questions.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="px-8 py-3">
              <a href="tel:+88-01842781978">
                <Phone className="h-4 w-4 mr-2" />
                Call Us
              </a>
            </Button>

            <Button asChild variant="outline" className="px-8 py-3">
              <a href="mailto:islamidawainstitute@gmail.com">
                <Mail className="h-4 w-4 mr-2" />
                Email Us
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}