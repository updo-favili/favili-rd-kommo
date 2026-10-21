import type { ParsedRdConversion } from "@/lib/rd";

export type ProductRoute = {
  product: string; leadName: string; source: "Landing Page";
  pipelineName: string; stageName: string; tags: string[];
  fieldIds: Record<string, number>;
  derivedCustomFields?: Record<string, unknown>;
  clearCustomFields?: string[];
  customFieldNames: string[];
};
export type IgnoredRoute = { ignoredReason: string };
export const schoolForms = {
  "whatsapp-lp-colonia-escola": {
    product: "Colônia de Férias 2026",
    tag: "WHATSAPP COLÔNIA",
    interestTag: "COLÔNIA DE FÉRIAS 2026",
    fieldIds: {},
  },
  "whatsapp-lp-matricula-escola": {
    product: "Matrícula 2027",
    tag: "WHATSAPP MATRÍCULA",
    interestTag: "MATRÍCULA 2027",
    fieldIds: { cf_quando_voce_gostaria_de_visitar_a_escola: 2017916 },
  },
  "matricula-2027-visita": {
    product: "Matrícula 2027",
    tag: "MATRÍCULA 2027",
    fieldIds: { cf_quantidade_de_filhos: 2017912, cf_series_2027: 2017914, cf_periodo_da_visita: 2017916 },
  },
  "colonia-de-ferias-2026": {
    product: "Colônia de Férias 2026",
    tag: "COLÔNIA DE FÉRIAS 2026",
    fieldIds: { cf_quantidade_de_filhos: 2017918, cf_colonia_criancas: 2017920,
      cf_colonia_tem_aluno_en: 2017922, cf_colonia_semanas: 2017924,
      cf_colonia_pagamento: 2017926, cf_colonia_indicacao_amigo: 2017928,
      cf_colonia_valor_estimado: 2017930 },
  },
} as const;
export function isSchoolEvent(event: string): event is keyof typeof schoolForms {
  return Object.hasOwn(schoolForms, event);
}
export function obsoleteManagedTags(_activeTags: string[]): string[] {
  void _activeTags;
  return [];
}
export function routeForConversion(conversion: ParsedRdConversion): ProductRoute | undefined {
  if (!isSchoolEvent(conversion.eventIdentifier)) return undefined;
  const form = schoolForms[conversion.eventIdentifier];
  return {
    product: form.product,
    leadName: form.product,
    source: "Landing Page",
    pipelineName: "Escola", stageName: "NOVOS LEADS - RD",
    tags: "interestTag" in form ? [form.tag, form.interestTag] : [form.tag],
    fieldIds: form.fieldIds,
    customFieldNames: Object.keys(form.fieldIds),
  };
}
