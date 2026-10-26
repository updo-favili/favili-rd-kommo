import { obsoleteManagedTags, routeForConversion } from "@/config/products";
import { buildLeadCustomFields } from "@/lib/field-mapping";
import { KommoClient } from "@/lib/kommo";
import type { ParsedRdConversion } from "@/lib/rd";

export async function syncConversion(conversion: ParsedRdConversion) {
  const route = routeForConversion(conversion);
  if (!route) return { status: "ignored" as const, reason: "Evento não mapeado" };
  if ("ignoredReason" in route) return { status: "ignored" as const, reason: route.ignoredReason };
  if (!route.updateOnly && !conversion.phone && !conversion.email) {
    throw new Error("Conversão sem telefone e sem e-mail; não é possível identificar o contato.");
  }

  const subdomain = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_LONG_LIVED_TOKEN;
  if (!subdomain || !token) throw new Error("KOMMO_SUBDOMAIN ou KOMMO_LONG_LIVED_TOKEN não configurado.");
  if (!route.stageName) throw new Error(`Etapa de entrada não configurada para o ${route.pipelineName}.`);

  const kommo = new KommoClient(token, subdomain);
  const [{ pipelineId, statusId }, leadFields] = await Promise.all([
    route.updateOnly ? Promise.resolve({ pipelineId: 0, statusId: 0 }) : kommo.resolvePipeline(route.pipelineName, route.stageName),
    kommo.getCustomFields("leads"),
  ]);

  const origin = readableOrigin(conversion.origin);
  const utms = originFields(conversion.origin);
  const idFromCustomFields = findCustomValue(conversion.customFields, ["id da conversao", "conversion id", "id conversao"]);
  const selectedCustomFields = selectCustomFields(conversion.customFields, route.customFieldNames);
  const mapped = buildLeadCustomFields(leadFields, {
    product: route.updateOnly ? undefined : route.product,
    source: route.updateOnly ? undefined : route.source,
    rdOrigin: route.updateOnly ? undefined : origin,
    event: route.updateOnly ? undefined : conversion.eventIdentifier,
    eventId: route.updateOnly ? undefined : idFromCustomFields,
    eventDate: route.updateOnly ? undefined : conversion.eventTimestamp,
    rdUuid: route.updateOnly ? undefined : conversion.rdContactUuid,
    ...(route.updateOnly ? {} : utms),
    custom: { ...route.derivedCustomFields, ...selectedCustomFields },
    clearCustomFields: route.clearCustomFields,
    fieldIds: route.fieldIds,
  });

  const course = route.courseFieldId
    ? String(mapped.fields.find((field) => field.field_id === route.courseFieldId)?.values?.[0]?.value ?? "").trim().replace(/\s+/g, " ")
    : "";
  const courseTag = course ? "CURSO: " + course.toLocaleUpperCase("pt-BR") : undefined;
  if (courseTag) route.tags.push(courseTag);
  const oldCourseTags = (tags?: Array<{ name: string }>) => courseTag
    ? (tags ?? []).filter((tag) => tag.name.startsWith("CURSO: ") && tag.name !== courseTag).map((tag) => tag.name)
    : [];

  for (const fieldId of route.requiredFieldIds ?? []) {
    const value = mapped.fields.find((field) => field.field_id === fieldId)?.values?.[0]?.value;
    if (!String(value ?? "").trim()) throw new Error("Campo obrigatório do vestibular ausente: " + fieldId);
  }
  const identity = route.identityFieldId ? {
    fieldId: route.identityFieldId,
    value: String(mapped.fields.find((field) => field.field_id === route.identityFieldId)?.values?.[0]?.value ?? ""),
  } : undefined;

  if (route.updateOnly) {
    if (!identity?.value) throw new Error("Número da inscrição ausente.");
    const existing = await kommo.findLeadByRegistration(identity.fieldId, identity.value);
    if (!existing) throw new Error("Inscrição ainda não encontrada na Kommo; nenhuma oportunidade foi criada.");
    const changed = mapped.fields.filter((field) => JSON.stringify(field.values) !== JSON.stringify(
      existing.custom_fields_values?.find((current) => current.field_id === field.field_id)?.values,
    ));
    const tagsToDelete = oldCourseTags(existing._embedded?.tags);
    const tagsToAdd = courseTag && !existing._embedded?.tags?.some((tag) => tag.name === courseTag) ? [courseTag] : [];
    const hasChanges = changed.length > 0 || tagsToAdd.length > 0 || tagsToDelete.length > 0;
    if (tagsToAdd.length || tagsToDelete.length) await kommo.updateLeadFields(existing.id, changed, { add: tagsToAdd, remove: tagsToDelete });
    else if (changed.length) await kommo.updateLeadFields(existing.id, changed);
    return { status: hasChanges ? "updated" as const : "unchanged" as const,
      leadId: existing.id, mappedFields: mapped.mappedFields, warnings: mapped.warnings };
  }

  let contact = await kommo.findContact(conversion.phone, conversion.email);
  if (contact) await kommo.updateContact(contact.id, conversion.name, conversion.phone, conversion.email);
  else contact = await kommo.createContact(conversion.name, conversion.phone, conversion.email);

  const company = conversion.company
    ? await kommo.findOrCreateCompany(conversion.company)
    : undefined;
  if (company) await kommo.ensureCompanyLink("contacts", contact.id, company.id);

  const existing = identity
    ? await kommo.findOpenProductLead(contact, pipelineId, route.tags[0], identity)
    : await kommo.findOpenProductLead(contact, pipelineId, route.tags[0]);
  if (existing) {
    await kommo.updateLead(
      existing.id,
      route.leadName || `${conversion.name} | ${route.product}`,
      existing.status_id,
      [...mapped.fields, ...mapped.fieldsToClear],
      route.tags,
      [...obsoleteManagedTags(route.tags), ...oldCourseTags(existing._embedded?.tags)],
    );
    if (company) await kommo.ensureCompanyLink("leads", existing.id, company.id);
    return {
      status: "updated" as const,
      contactId: contact.id,
      leadId: existing.id,
      companyId: company?.id,
      mappedFields: mapped.mappedFields,
      warnings: mapped.warnings,
    };
  }

  const lead = await kommo.createLead({
    name: route.leadName || `${route.product} | ${conversion.name}`,
    pipelineId,
    statusId,
    contactId: contact.id,
    companyId: company?.id,
    tags: route.tags,
    customFields: mapped.fields,
  });
  return {
    status: "created" as const,
    contactId: contact.id,
    leadId: lead.id,
    companyId: company?.id,
    mappedFields: mapped.mappedFields,
    warnings: mapped.warnings,
  };
}

function selectCustomFields(fields: Record<string, unknown>, names?: string[]): Record<string, unknown> {
  if (!names) return fields;
  const allowed = new Set(names.map(normalizeCustomFieldName));
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => allowed.has(normalizeCustomFieldName(key))),
  );
}

function normalizeCustomFieldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^cf_/, "")
    .replace(/_/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function readableOrigin(origin: unknown): string | undefined {
  if (!origin) return undefined;
  if (typeof origin === "string") return origin;
  if (typeof origin === "object") {
    const values = Object.entries(origin as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => `${key}: ${String(value)}`);
    return values.join(" | ") || undefined;
  }
  return String(origin);
}

export function originFields(origin: unknown) {
  if (!origin || typeof origin !== "object") return {};
  const data = origin as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((key) => data[key]).find((value) => value !== undefined && value !== null && value !== "");
  return {
    utmSource: pick("traffic_source", "utm_source", "source"),
    utmMedium: pick("traffic_medium", "utm_medium", "medium"),
    utmCampaign: pick("traffic_campaign", "utm_campaign", "campaign"),
    utmContent: pick("utm_content", "content"),
    utmTerm: pick("traffic_value", "utm_term", "term", "value"),
  };
}

function findCustomValue(fields: Record<string, unknown>, aliases: string[]): unknown {
  for (const [key, value] of Object.entries(fields)) {
    const normalized = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^cf_/, "").replace(/_/g, " ").toLowerCase();
    if (aliases.some((alias) => normalized.includes(alias))) return value;
  }
  return undefined;
}
