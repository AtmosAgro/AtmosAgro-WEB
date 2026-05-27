"use client";

import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { requestPasswordReset } from "@/services/password";
import { ApiError } from "@/lib/api-client";
import AuthLayout from "@/components/auth/AuthLayout";

const envelopeIcon = "/images/icon_reset_password.svg";
const arrowIcon = "/images/ic_arrow.svg";

const forgotSchema = z.object({
  email: z.string().email("Digite um e-mail válido."),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const { toast } = useToast();

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: (data) => {
      toast({
        title: "Se o e-mail estiver cadastrado",
        description: data.message,
      });
      form.reset();
    },
    onError: (error: unknown) => {
      let description = "Não foi possível enviar o link de redefinição.";
      if (error instanceof ApiError) {
        description = error.message;
      }
      toast({ variant: "destructive", title: "Falha ao enviar link", description });
    },
  });

  const onSubmit = (values: ForgotFormValues) => {
    mutation.mutate({ email: values.email });
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
      contentClassName="py-8"
      topAction={
        <Button asChild className="rounded-[25px] bg-auth-brand px-8 py-4 text-base font-normal hover:bg-auth-brand-hover">
          <Link href="/login">Entre na sua conta</Link>
        </Button>
      }
    >
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <img src={envelopeIcon} alt="Envelope seguro" style={{ width: 180, height: 180 }} />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-auth-ink">Esqueceu sua senha?</h1>
          <p className="text-base text-muted-foreground">
            Não se preocupe, redefina a sua senha seguindo as instruções.
          </p>
        </div>

        <Form {...form}>
          <form className="space-y-5 text-left" method="post" action="#" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-base font-medium text-auth-ink">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Entre com o seu e-mail cadastrado"
                      className="h-12 text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="h-12 w-full rounded-[10px] bg-auth-brand text-base font-normal hover:bg-auth-brand-hover"
            >
              {mutation.isPending ? "Enviando..." : "Redefinir senha"}
            </Button>
          </form>
        </Form>

        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-auth-ink">
          <Link href="/login" className="inline-flex items-center gap-2 font-semibold hover:text-primary">
            <img src={arrowIcon} alt="Voltar" className="h-6 w-6" />
            Voltar para o login
          </Link>
          <button
            type="button"
            onClick={() => form.handleSubmit(onSubmit)()}
            className="text-primary font-semibold hover:underline"
            disabled={mutation.isPending}
          >
            Reenviar link
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
