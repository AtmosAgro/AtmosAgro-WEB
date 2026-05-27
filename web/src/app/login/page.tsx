"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { loginUser } from "@/services/auth";
import { saveAuthSession, setSessionCookie } from "@/lib/auth-session";
import { ApiError } from "@/lib/api-client";
import AuthLayout from "@/components/auth/AuthLayout";
import PasswordField from "@/components/auth/PasswordField";

// Using standard img tags for social icons to avoid 'StaticImageData' type issues for now, can optimize later.
const socialProviders = [
  { label: "Facebook", icon: "/images/ic_facebook.svg" },
  { label: "Apple", icon: "/images/ic_apple.svg" },
  { label: "Google", icon: "/images/ic_google.svg" },
];

const loginSchema = z.object({
  email: z.string().email("Digite um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
  remember: z.boolean().default(true),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: true,
    },
  });

  const loginMutation = useMutation({
    mutationFn: (values: LoginFormValues) => loginUser({ email: values.email, password: values.password }),
    onSuccess: (data, variables) => {
      // if (!data.tokens) {
      //   toast({
      //     variant: "destructive",
      //     title: "Sessão não disponível",
      //     description: "Confirme seu e-mail antes de acessar a plataforma.",
      //   });
      //   return;
      // }

      saveAuthSession(data.user, variables.remember);
      setSessionCookie(variables.remember);
      toast({ title: "Bem-vindo de volta", description: `Olá, ${data.user.nome.split(" ")[0]}!` });
      router.push("/dashboard");
    },
    onError: (error: unknown, variables) => {
      if (error instanceof ApiError) {
        const body = (typeof error.body === "object" && error.body !== null ? error.body : undefined) as
          | { code?: string; message?: string }
          | undefined;

        const messageText = body?.message ?? error.message ?? "";
        const isPendingConfirmation =
          body?.code === "email_not_confirmed" || /confirm/i.test(messageText) || /confirm/i.test(error.message ?? "");

        if (isPendingConfirmation) {
          toast({
            variant: "destructive",
            title: "Confirme seu e-mail",
            description:
              "Finalize a confirmação enviada para o seu e-mail antes de entrar. Verifique sua caixa de entrada ou solicite um novo link.",
          });
          return;
        }

        if (error.status === 401) {
          const description = "E-mail não encontrado ou senha incorreta.";
          form.setError("email", { message: "Confira se o e-mail está correto." });
          form.setError("password", { message: "Confira se a senha está correta." });
          toast({ variant: "destructive", title: "Não foi possível fazer login", description });
          if (!variables?.password) {
            form.setFocus("password");
          }
          return;
        }

        toast({
          variant: "destructive",
          title: "Não foi possível fazer login",
          description: error.message,
        });
        return;
      }

      // toast({ variant: "destructive", title: "Não foi possível fazer login", description: "Tente novamente em instantes." });

      if (!variables?.password) {
        form.setFocus("password");
      }
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  return (
    <AuthLayout
      heroTitle="Monitore a saúde da sua cana direto do espaço"
      heroDescription={
        <>
          Imagens de satélite, índices de estresse e alertas inteligentes — tudo para manter seu canavial produtivo, do
          plantio à colheita.
        </>
      }
      heroImageAlt="Campos agrícolas monitorados por satélite"
      topAction={
        <Button asChild className="rounded-[25px] bg-auth-brand px-8 py-4 text-base font-normal hover:bg-auth-brand-hover">
          <Link href="/registrar">Crie sua conta</Link>
        </Button>
      }
    >
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-auth-ink">
            Bem vindo ao Atmos
            <span className="text-auth-brand">Agro</span>!
          </h1>
          <p className="text-base text-muted-foreground">Entre na sua conta</p>
        </div>

        <Form {...form}>
          <form className="space-y-5" method="post" action="#" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-base font-medium text-auth-ink">Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Entre com seu e-mail" className="h-12 text-base" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PasswordField
              control={form.control}
              name="password"
              label="Senha"
              placeholder="Entre com sua senha"
              autoComplete="current-password"
            />

            <FormField
              control={form.control}
              name="remember"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <div className="flex flex-col gap-3 text-sm text-auth-ink sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 font-medium">
                      <FormControl>
                        <Checkbox
                          id="remember"
                          className="border-muted-foreground"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <span>Lembrar da conta</span>
                    </label>
                    <Link href="/recuperar" className="font-semibold text-primary hover:underline">
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="h-12 w-full rounded-[10px] bg-auth-brand text-base font-normal hover:bg-auth-brand-hover"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </Form>

        <div className="space-y-6">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Separator className="flex-1 bg-auth-separator" />
            <span className="font-medium text-auth-muted">Ou entre com</span>
            <Separator className="flex-1 bg-auth-separator" />
          </div>

          <div className="flex justify-center gap-10">
            {socialProviders.map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                className="p-0 transition focus-visible:outline-none"
                aria-label={`Entrar com ${label}`}
              >
                <img src={icon} alt={label} className="h-[42px] w-[42px]" draggable={false} />
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-sm text-auth-ink">
          Não tem uma conta?{" "}
          <Link href="/registrar" className="font-semibold text-primary hover:underline">
            Registre-se
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
