import { vestibularEvent } from "@/config/vestibular";
import { NextRequest, NextResponse } from "next/server";
import { conversionIdentifierFromContact, parseRdWebhook, sanitizedReceipt, unwrapRdAutomationPayload } from "@/lib/rd";
import { syncConversion } from "@/lib/sync";
import { KommoError, safeKommoErrorDetail } from "@/lib/kommo";
import { isSchoolEvent, isSupportedEvent } from "@/config/products";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  return handleRdWebhook(request);
}

export async function handleRdWebhook(
  request: NextRequest,
  pathCredentials?: { route: string; secret: string },
) {
  const configuredSecret = process.env.RD_WEBHOOK_SECRET;
  const suppliedSecret = pathCredentials?.secret || request.nextUrl.searchParams.get("secret") || request.headers.get("x-webhook-secret");
  if (!configuredSecret) {
    return NextResponse.json({ ok: false, error: "RD_WEBHOOK_SECRET não configurado." }, { status: 503 });
  }
  if (suppliedSecret !== configuredSecret) {
    return NextResponse.json({ ok: false, error: "Webhook não autorizado." }, { status: 401 });
  }

  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return NextResponse.json({ ok: true, mode: "validation" });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: true, mode: "validation" });
    }

    const record = body as Record<string, unknown>;
    const automationRoute = pathCredentials?.route || request.nextUrl.searchParams.get("route")?.trim();
    const isStandardWebhook = "event_identifier" in record && "contact" in record;

    if (automationRoute && automationRoute !== "escola" && !isSupportedEvent(automationRoute)) {
      return NextResponse.json({ ok: true, status: "ignored", reason: "Rota não configurada" });
    }
    if (isStandardWebhook && automationRoute && automationRoute !== "escola" && record.event_identifier !== automationRoute) {
      return NextResponse.json({ ok: true, status: "ignored", reason: "Conversão diferente da rota" });
    }
    if (!isStandardWebhook && automationRoute) {
      if (Array.isArray(record.leads) && record.leads.length !== 1) {
        return NextResponse.json({ ok: false, error: "Envie um contato por requisição." }, { status: 400 });
      }
      const contact = unwrapRdAutomationPayload(record);
      const detected = (automationRoute === "escola" || automationRoute === vestibularEvent)
        ? conversionIdentifierFromContact({ last_conversion: contact.last_conversion })
        : conversionIdentifierFromContact(contact);
      if (automationRoute === "escola" && (!detected || !isSchoolEvent(detected))) {
        return NextResponse.json({ ok: true, status: "ignored", reason: "Última conversão não pertence aos formulários da escola" });
      }
      if (automationRoute === vestibularEvent && !detected) {
        return NextResponse.json({ ok: true, status: "ignored", reason: "Última conversão sem identificador" });
      }
      if (automationRoute !== "escola" && detected && detected !== automationRoute) {
        return NextResponse.json({ ok: true, status: "ignored", reason: "Última conversão diferente da rota" });
      }
      body = { event_identifier: automationRoute === "escola" ? detected : automationRoute, contact };
    } else if (!isStandardWebhook) {
      return NextResponse.json({ ok: true, mode: "validation" });
    }

    const conversion = parseRdWebhook(body);
    if (!isSupportedEvent(conversion.eventIdentifier) || (automationRoute === "escola" && !isSchoolEvent(conversion.eventIdentifier))) {
      return NextResponse.json({ ok: true, status: "ignored", reason: "Evento não mapeado" });
    }
    const receipt = sanitizedReceipt(conversion);

    if (process.env.KOMMO_SYNC_ENABLED !== "true") {
      console.info("RD webhook capturado (modo seguro)", receipt);
      return NextResponse.json({ ok: true, mode: "capture", receipt });
    }

    const result = await syncConversion(conversion);
    console.info("RD webhook processado", JSON.stringify({ eventIdentifier: conversion.eventIdentifier, ...result }));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    const kommo = error instanceof KommoError
      ? {
          status: error.status,
          operation: error.operation,
          detail: safeKommoErrorDetail(error.detail),
          context: error.context,
        }
      : undefined;
    console.error("Falha ao processar webhook RD", JSON.stringify({ message, kommo }));
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
