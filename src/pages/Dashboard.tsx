import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useState } from "react";
import { PixCheckoutModal } from "@/components/payments/PixCheckoutModal";
import {
  Users,
  Heart,
  DollarSign,
  MessageCircle,
  TrendingUp,
  Clock,
  Plus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const revenueData = [
  { name: "Nov", value: 0 },
  { name: "Dez", value: 9.9 },
  { name: "Jan", value: 24.9 },
  { name: "Fev", value: 39.8 },
];

const clientsData = [
  { name: "Nov", clientes: 0, leads: 0 },
  { name: "Dez", clientes: 1, leads: 2 },
  { name: "Jan", clientes: 3, leads: 5 },
  { name: "Fev", clientes: 7, leads: 12 },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Visão geral da sua Crush"
      actions={
        <Button className="gap-2 gradient-primary shadow-glow hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          Nova Persona
        </Button>
      }
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Stats Grid */}
        <motion.div
          variants={itemVariants}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            title="Clientes Ativos"
            value="7"
            icon={Users}
            variant="primary"
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="Leads"
            value="12"
            icon={Heart}
            variant="outline"
            subtitle="Aguardando conversão"
          />
          <StatCard
            title="Receita Total"
            value="R$ 39,80"
            icon={DollarSign}
            variant="success"
            trend={{ value: 8, isPositive: true }}
          />
          <StatCard
            title="Mensagens Enviadas"
            value="342"
            icon={MessageCircle}
            variant="accent"
            subtitle="Este mês"
          />
        </motion.div>

        {/* Charts */}
        <motion.div
          variants={itemVariants}
          className="grid gap-6 lg:grid-cols-2"
        >
          {/* Revenue Chart */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Receita por Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(243 75% 59%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(243 75% 59%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                      }}
                      formatter={(value) => [`R$ ${value}`, "Receita"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(243 75% 59%)"
                      strokeWidth={2}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Clients Chart */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-accent" />
                Crescimento de Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                      }}
                    />
                    <Bar
                      dataKey="clientes"
                      fill="hsl(222 47% 11%)"
                      radius={[4, 4, 0, 0]}
                      name="Clientes"
                    />
                    <Bar
                      dataKey="leads"
                      fill="hsl(243 75% 59%)"
                      radius={[4, 4, 0, 0]}
                      name="Leads"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-foreground" />
                  <span className="text-sm text-muted-foreground">Clientes</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-primary" />
                  <span className="text-sm text-muted-foreground">Leads</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Usage Stats */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-warning" />
                Minutos Consumidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-4xl font-bold text-foreground">187</p>
                  <p className="text-sm text-muted-foreground">minutos este mês</p>
                </div>
                <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "62%" }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                    className="h-full gradient-primary rounded-full"
                  />
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-foreground">300 min</p>
                  <p className="text-sm text-muted-foreground">disponíveis</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button className="gradient-primary shadow-glow" onClick={() => setAvulsoOpen(true)}>
                  Comprar mensagens avulsas (PIX)
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
      <PixCheckoutModal
        open={avulsoOpen}
        onOpenChange={setAvulsoOpen}
        title="Acesso avulso via PIX"
        request={{ type: "avulso", amount: 9.9 }}
      />
    </DashboardLayout>
  );
}
