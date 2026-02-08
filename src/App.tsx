import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Seo } from "@/components/Seo";
import { MetaPixelBootstrap } from "@/analytics/MetaPixelBootstrap";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";

const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Personas = lazy(() => import("./pages/Personas"));
const Planos = lazy(() => import("./pages/Planos"));
const Clientes = lazy(() => import("./pages/Clientes"));
const ConfiguracaoPersona = lazy(() => import("./pages/ConfiguracaoPersona"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Conversas = lazy(() => import("./pages/Conversas"));
const Assinaturas = lazy(() => import("./pages/Assinaturas"));
const Whatsapp = lazy(() => import("./pages/Whatsapp"));
const Entrar = lazy(() => import("./pages/Entrar"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <MetaPixelBootstrap />
        <Seo />
        <Suspense fallback={<div className="p-8">Carregando...</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/entrar" element={<Entrar />} />
            <Route element={<RequireAdmin />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/personas" element={<Personas />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/configuracao-persona" element={<ConfiguracaoPersona />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/conversas" element={<Conversas />} />
              <Route path="/assinaturas" element={<Assinaturas />} />
                <Route path="/whatsapp" element={<Whatsapp />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

function RequireAdmin() {
  const token = typeof window !== "undefined" ? localStorage.getItem("cz_admin_token") : null;
  return token ? <Outlet /> : <Navigate to="/entrar" replace />;
}
