import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Search, Download, Phone, User, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listClients } from "@/services/clients";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

type FilterType = "todos" | "leads" | "clientes";

export default function Clientes() {
  const [filter, setFilter] = useState<FilterType>("todos");
  const [search, setSearch] = useState("");

  const { data: clients = [], isLoading, isError } = useQuery({
    queryKey: ["clients", filter, search],
    queryFn: () => listClients(search, filter === "leads" ? "lead" : filter === "clientes" ? "cliente" : "todos"),
  });

  return (
    <DashboardLayout
      title="Clientes"
      subtitle="Gerencie seus clientes e leads"
      actions={
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(["todos", "leads", "clientes"] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? "gradient-primary" : ""}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Client List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-destructive">
            Erro ao carregar clientes. Tente novamente.
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {clients.map((client) => (
              <motion.div key={client.id} variants={itemVariants}>
                <Card className="shadow-card hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                          <AvatarImage src={client.avatar} alt={client.name} />
                          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20">
                            <User className="h-6 w-6 text-primary" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-medium text-foreground">
                            {client.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{client.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            Minutos restantes
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground">
                              {client.minutesRemaining} min
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant={
                            client.type === "cliente" ? "default" : "secondary"
                          }
                          className={
                            client.type === "cliente"
                              ? "gradient-accent"
                              : ""
                          }
                        >
                          {client.type === "cliente" ? "Cliente" : "Lead"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {clients.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Nenhum cliente encontrado.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
