import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useState } from "react";
import { PixCheckoutModal } from "@/components/payments/PixCheckoutModal";
import { Plus, Edit2, Trash2, Clock, DollarSign, Check } from "lucide-react";
import { PLANOS_ASSINATURA } from "@/domain/planos";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export default function Planos() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const plans = PLANOS_ASSINATURA.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    minutes: p.minutes,
    pricePerMinute: p.pricePerMinute,
    isActive: p.isActive,
    isPopular: p.isPopular,
    features: p.featuresPaginaPlanos,
  }));

  const handleAssinar = (planId: string) => {
    setSelectedPlanId(planId);
    setCheckoutOpen(true);
  };

  return (
    <DashboardLayout
      title="Planos"
      subtitle="Gerencie os planos de assinatura"
      actions={
        <Button className="gap-2 gradient-primary shadow-glow hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          Novo Plano
        </Button>
      }
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {plans.map((plan) => (
          <motion.div key={plan.id} variants={cardVariants}>
            <Card
              className={`relative overflow-hidden shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${
                plan.isPopular ? "ring-2 ring-primary" : ""
              }`}
            >
              {/* Popular Badge */}
              {plan.isPopular && (
                <div className="absolute -right-8 top-4 rotate-45 gradient-primary px-10 py-1 text-xs font-semibold text-primary-foreground shadow-md">
                  Popular
                </div>
              )}

              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <Badge
                      variant={plan.isActive ? "default" : "secondary"}
                      className={plan.isActive ? "mt-2 gradient-accent" : "mt-2"}
                    >
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Price */}
                <div className="text-center py-4">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="text-5xl font-bold text-foreground">
                      {plan.price.toFixed(2).split(".")[0]}
                    </span>
                    <span className="text-lg text-muted-foreground">
                      ,{plan.price.toFixed(2).split(".")[1]}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-border">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Minutos</p>
                      <p className="font-semibold text-foreground">
                        {plan.minutes} min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-success" />
                    <div>
                      <p className="text-xs text-muted-foreground">Valor/Min</p>
                      <p className="font-semibold text-foreground">
                        R$ {plan.pricePerMinute.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <div className="rounded-full bg-success/10 p-1">
                        <Check className="h-3 w-3 text-success" />
                      </div>
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={"default"}
                    className="w-full gradient-primary shadow-glow"
                    onClick={() => handleAssinar(plan.id)}
                  >
                    Assinar via PIX
                  </Button>
                  <Button
                    variant={plan.isActive ? "outline" : "default"}
                    className="w-full"
                  >
                    {plan.isActive ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
      <PixCheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        title="Assinar plano via PIX"
        request={{ type: "assinatura", planId: selectedPlanId ?? undefined }}
      />
    </DashboardLayout>
  );
}
