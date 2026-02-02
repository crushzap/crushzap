import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { adminLogin } from "@/services/admin";
import { useNavigate } from "react-router-dom";

type LoginValues = { email: string; password: string };

export default function Entrar() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const form = useForm<LoginValues>({
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: ({ email, password }: LoginValues) => adminLogin(email, password),
    onSuccess: () => {
      toast({ title: "Login realizado" });
      navigate("/dashboard", { replace: true });
    },
    onError: (err: any) => {
      const msg = typeof err?.message === "string" ? err.message : "Falha no login";
      toast({ title: msg });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="contratos@ivanogueira.com.br" {...form.register("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" {...form.register("password")} />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>Entrar</Button>
        </form>
      </Card>
    </div>
  );
}
