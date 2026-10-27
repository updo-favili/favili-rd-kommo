import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { handleRdWebhook } from "../src/app/api/webhooks/rd/route";
import { vestibularEvent, vestibularUpdateEvent, vestibularFieldIds } from "../src/config/vestibular";
import { KommoClient } from "../src/lib/kommo";
import { syncConversion } from "../src/lib/sync";
import { parseRdWebhook } from "../src/lib/rd";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each(["automation","standard"])("recebe atualização via %s e distingue evento explícito de snapshot de automação",async(mode)=>{
  vi.stubEnv("RD_WEBHOOK_SECRET","test-secret");vi.stubEnv("KOMMO_SYNC_ENABLED","false");
  const contact={last_conversion:{content:{identifier:vestibularUpdateEvent}},"Vestibular - Nº inscrição":"0001"};
  const body=mode==="automation"?{leads:[contact]}:{event_identifier:vestibularUpdateEvent,contact};
  const request=()=>new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify(body)});
  const response=await handleRdWebhook(request(),{route:vestibularUpdateEvent,secret:"test-secret"});
  expect((await response.json()).mode).toBe("capture");
  for(const route of [vestibularEvent,"escola"]){
    const result=await (await handleRdWebhook(request(),{route,secret:"test-secret"})).json();
    if(mode==="automation" && route===vestibularEvent) expect(result).toMatchObject({mode:"capture",receipt:{eventIdentifier:vestibularEvent}});
    else expect(result.status).toBe("ignored");
  }
});
it.each(["found","missing","unchanged"])("atualização %s não cria registros nem redefine etapa ou tags",async(state)=>{
  vi.stubEnv("KOMMO_SUBDOMAIN","example");vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
  vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue(Object.entries(vestibularFieldIds).map(([name,id])=>({id,name,type:"text"})));
  const lookup=vi.spyOn(KommoClient.prototype,"findLeadByRegistration").mockResolvedValue(state==="missing"?undefined:{id:20,name:"Título manual",pipeline_id:999,status_id:142,closed_at:123,custom_fields_values:[{field_id:2018097,values:[{value:"0001"}]},{field_id:2018099,values:[{value:"MESMO"}]},{field_id:2018113,values:[{value:state==="unchanged"?"10:00":"18:00"}]}]});
  const patch=vi.spyOn(KommoClient.prototype,"updateLeadFields").mockResolvedValue(undefined);
  const create=vi.spyOn(KommoClient.prototype,"createLead");
  const createContact=vi.spyOn(KommoClient.prototype,"createContact");
  const update=vi.spyOn(KommoClient.prototype,"updateLead");
  const input=parseRdWebhook({event_identifier:vestibularUpdateEvent,contact:{"Vestibular - Nº inscrição":"0001","Vestibular - Hora da prova":"10:00"}});
  if(state==="missing") await expect(syncConversion(input)).rejects.toThrow("ainda não encontrada");
  else expect((await syncConversion(input)).status).toBe(state==="unchanged"?"unchanged":"updated");
  expect(lookup).toHaveBeenCalledWith(2018097,"0001");
  if(state==="found") expect(patch).toHaveBeenCalledWith(20,[{field_id:2018113,values:[{value:"10:00"}]}]);
  else expect(patch).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();expect(createContact).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
});
it("busca por inscrição exata, percorre páginas e aceita oportunidade encerrada",async()=>{
  const fetchSpy=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify({_embedded:{leads:[{id:1,custom_fields_values:[{field_id:2018097,values:[{value:"10001"}]}]}]},_links:{next:{href:"ignored"}}}))).mockResolvedValueOnce(new Response(JSON.stringify({_embedded:{leads:[{id:2,status_id:142,custom_fields_values:[{field_id:2018097,values:[{value:"0001"}]}]}]}})));
  const client=new KommoClient("fake","example");
  expect((await client.findLeadByRegistration(2018097,"0001"))?.id).toBe(2);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});
it("recusa correspondências ambíguas",async()=>{
  vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({_embedded:{leads:[1,2].map(id=>({id,custom_fields_values:[{field_id:2018097,values:[{value:"0001"}]}]}))}})));
  await expect(new KommoClient("fake","example").findLeadByRegistration(2018097,"0001")).rejects.toThrow("Mais de uma");
});
it("PATCH de atualização contém somente campos",async()=>{
  const fetchSpy=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(null,{status:204}));
  const fields=[{field_id:2018099,values:[{value:"NOVO"}]}];
  await new KommoClient("fake","example").updateLeadFields(20,fields);
  expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({custom_fields_values:fields});
});
