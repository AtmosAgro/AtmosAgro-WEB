"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api-client";
import { registerUser } from "@/services/auth";
import AuthLayout from "@/components/auth/AuthLayout";
import PasswordField from "@/components/auth/PasswordField";

const registerSchema = z
  .object({
    nome: z.string().min(3, "Informe pelo menos 3 caracteres."),
    email: z.string().email("Informe um e-mail válido."),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirme a senha."),
    acceptTerms: z
      .boolean()
      .refine((value) => value === true, { message: "Você precisa aceitar os termos." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas precisam coincidir.",
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      nome: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const registerMutation = useMutation({
    mutationFn: (values: RegisterFormValues) =>
      registerUser({ nome: values.nome, email: values.email, password: values.password }),
    onSuccess: (data) => {
      if (data.requiresEmailConfirmation) {
        toast({
          title: "Confirme seu e-mail",
          description: "Enviamos um link de confirmação. Verifique sua caixa de entrada.",
        });
      } else {
        toast({
          title: "Conta criada com sucesso",
          description: "Faça login com seu e-mail e senha para continuar.",
        });
      }
      router.push("/login");
    },
    onError: (error: unknown) => {
      let description = "Não foi possível criar a conta.";

      if (error instanceof ApiError) {
        if (error.status === 409) {
          description = "Este e-mail já está cadastrado.";
          form.setError("email", { message: description });
        } else {
          description = error.message;
        }
      }

      toast({
        variant: "destructive",
        title: "Não foi possível criar a conta",
        description,
      });
    },
  });

  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(values);
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
          <Link href="/login">Entre na sua conta</Link>
        </Button>
      }
    >
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-auth-ink">
            Bem-vindo ao Atmos
            <span className="text-auth-brand">Agro</span>!
          </h1>
          <p className="text-base text-muted-foreground">Crie sua conta e explore inúmeros benefícios</p>
        </div>

        <Form {...form}>
          <form className="space-y-5" method="post" action="#" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-base font-medium text-auth-ink">Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite o seu nome completo" className="h-12 text-base" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
              placeholder="Escolha uma senha"
              autoComplete="new-password"
            />

            <PasswordField
              control={form.control}
              name="confirmPassword"
              label="Confirmar senha"
              placeholder="Confirme a senha escolhida"
              autoComplete="new-password"
            />

            <FormField
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <div className="flex items-start gap-3 text-sm text-auth-ink">
                    <FormControl>
                      <Checkbox
                        id="terms"
                        className="mt-1 border-muted-foreground"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    </FormControl>
                    <label htmlFor="terms" className="leading-relaxed">
                      Eu aceito os {" "}
                      <a href="#" className="font-semibold text-primary hover:underline">
                        termos e condições
                      </a>
                    </label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="h-12 w-full rounded-[10px] bg-auth-brand text-base font-normal hover:bg-auth-brand-hover"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
                </>
              ) : (
                "Criar conta"
              )}
            </Button>
          </form>
        </Form>

        <div className="flex items-center gap-4 text-sm text-muted-foreground max-w-md py-4">
             <div className="flex-1 h-px bg-auth-separator"></div>
             <span>Ou continue com</span>
             <div className="flex-1 h-px bg-auth-separator"></div>
        </div>

        {/* Removed social buttons block here if it was redundant or add it back if needed. 
            Legacy had no social buttons in register? 
            Wait, I'll check legacy code again. 
            Legacy Register.tsx didn't have social buttons. Login did. 
            I'll stick to legacy Register.tsx structure. 
        */}

        <p className="text-center text-sm text-auth-ink">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Entre aqui
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
