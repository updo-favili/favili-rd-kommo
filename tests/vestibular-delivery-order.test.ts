import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { handleRdWebhook } from "../src/app/api/webhooks/rd/route";
import { vestibularEvent, vestibularUpdateEvent, vestibularFieldIds } from "../src/config/vestibular";
import { KommoClient } from "../src/lib/kommo";
import type { KommoLead } from "../src/lib/kommo-types";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each([true,false])("inscrição chega mesmo com última conversão de atualização; atualização primeiro: %s",async(updateFirst)=>{
  vi.stubEnv("RD_WEBHOOK_SECRET","test-secret");vi.stubEnv("KOMMO_SYNC_ENABLED","true");
  vi.stubEnv("KOMMO_SUBDOMAIN","example");vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
  vi.spyOn(console,"info").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});
  vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794275,statusId:113385224});
  vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue(Object.entries(vestibularFieldIds).map(([name,id])=>({id,name,type:"text"})));
  vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
  vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
  let stored:KommoLead|undefined;
  vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockImplementation(async()=>stored);
  vi.spyOn(KommoClient.prototype,"findLeadByRegistration").mockImplementation(async()=>stored);
  vi.spyOn(KommoClient.prototype,"updateLead").mockResolvedValue(undefined);
  const patch=vi.spyOn(KommoClient.prototype,"updateLeadFields").mockResolvedValue(undefined);
  const create=vi.spyOn(KommoClient.prototype,"createLead").mockImplementation(async(input)=>{
    stored={id:20,name:input.name,pipeline_id:input.pipelineId,status_id:input.statusId,custom_fields_values:input.customFields,_embedded:{tags:input.tags.map(name=>({name}))}};
    return stored;
  });
  const send=async(route:string)=>handleRdWebhook(new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({leads:[{name:"Teste",email:"teste@example.com",last_conversion:{content:{identifier:vestibularUpdateEvent}},custom_fields:{"Vestibular - Nº inscrição":"0001","Vestibular - Código de acesso":"TESTE0","Vestibular - Hora da prova":"14:00"}}]})}),{route,secret:"test-secret"});
  if(updateFirst){expect((await send(vestibularUpdateEvent)).status).toBe(500);expect(create).not.toHaveBeenCalled();}
  expect(await (await send(vestibularEvent)).json()).toMatchObject({ok:true,status:"created"});
  expect(await (await send(vestibularUpdateEvent)).json()).toMatchObject({ok:true,status:"unchanged"});
  expect(await (await send(vestibularEvent)).json()).toMatchObject({ok:true,status:"updated"});
  expect(create).toHaveBeenCalledTimes(1);expect(patch).not.toHaveBeenCalled();
});
