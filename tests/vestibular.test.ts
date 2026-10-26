import { afterEach, expect, it, vi } from "vitest";
import { vestibularEvent, vestibularFieldIds } from "../src/config/vestibular";
import { buildLeadCustomFields } from "../src/lib/field-mapping";
it("mapeia os dez campos do vestibular por ID preservando código, número, data e hora como texto",()=>{
  const values=["00001234","TESTE0","Vestibular","Psicologia","Presencial","Limoeiro do Norte","Noite","21/11/2026","18:00","https://example.com/minha-inscricao"];
  const entries=Object.entries(vestibularFieldIds);
  const fields=entries.map(([name,id])=>({id,name:name.replace("Vestibular - ",""),type:"text"}));
  fields.unshift({id:99,name:"Curso",type:"text"});
  const result=buildLeadCustomFields(fields,{product:"Vestibular 2027.1",source:"Landing Page",event:vestibularEvent,fieldIds:vestibularFieldIds,custom:Object.fromEntries(entries.map(([name],i)=>[name,values[i]]))});
  expect(result.fields).toEqual(entries.map(([,id],i)=>({field_id:id,values:[{value:values[i]}]})));
  expect(JSON.stringify(result.warnings)).not.toContain("TESTE0");
});

import { NextRequest } from "next/server";
import { handleRdWebhook } from "../src/app/api/webhooks/rd/route";
import { KommoClient } from "../src/lib/kommo";
import { syncConversion } from "../src/lib/sync";
import { parseRdWebhook } from "../src/lib/rd";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each(["automation","standard"])("recebe inscrição via %s e isola a rota escola",async(mode)=>{
  vi.stubEnv("RD_WEBHOOK_SECRET","test-secret");vi.stubEnv("KOMMO_SYNC_ENABLED","false");
  const contact={email:"teste@example.com",last_conversion:{content:{identifier:vestibularEvent}}};
  const body=mode==="automation" ? {leads:[contact]} : {event_identifier:vestibularEvent,contact};
  const request=()=>new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify(body)});
  const response=await handleRdWebhook(request(),{route:vestibularEvent,secret:"test-secret"});
  expect(await response.json()).toMatchObject({mode:"capture",receipt:{eventIdentifier:vestibularEvent}});
  const school=await handleRdWebhook(request(),{route:"escola",secret:"test-secret"});
  expect((await school.json()).status).toBe("ignored");
});
it("não usa inscrição anterior quando última conversão não está identificada",async()=>{
  vi.stubEnv("RD_WEBHOOK_SECRET","test-secret");vi.stubEnv("KOMMO_SYNC_ENABLED","false");
  const request=new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({leads:[{email:"teste@example.com",first_conversion:{content:{identifier:vestibularEvent}}}]})});
  expect((await (await handleRdWebhook(request,{route:vestibularEvent,secret:"test-secret"})).json()).status).toBe("ignored");
});
it("escolhe somente a oportunidade da mesma inscrição",async()=>{
  const client=new KommoClient("fake","example");
  vi.spyOn(client,"getLead").mockResolvedValueOnce({id:2,name:"Vestibular",pipeline_id:8794275,status_id:113385224,_embedded:{tags:[{name:"VESTIBULAR 2027.1"}]},custom_fields_values:[{field_id:2018097,values:[{value:"0002"}]}]}).mockResolvedValueOnce({id:1,name:"Vestibular",pipeline_id:8794275,status_id:113385224,_embedded:{tags:[{name:"VESTIBULAR 2027.1"}]},custom_fields_values:[{field_id:2018097,values:[{value:"0001"}]}]});
  expect((await client.findOpenProductLead({id:10,name:"Teste",_embedded:{leads:[{id:1},{id:2}]}},8794275,"VESTIBULAR 2027.1",{fieldId:2018097,value:"0001"}))?.id).toBe(1);
});
it.each([true,false])("envia código junto com a criação; código preenchido: %s",async(hasCode)=>{
  vi.stubEnv("KOMMO_SUBDOMAIN","example");vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
  const pipeline=vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794275,statusId:113385224});
  vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue(Object.entries(vestibularFieldIds).map(([name,id])=>({id,name,type:"text"})));
  const contact=vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
  vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
  const find=vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockResolvedValue(undefined);
  const create=vi.spyOn(KommoClient.prototype,"createLead").mockResolvedValue({id:20,name:"Vestibular",pipeline_id:8794275,status_id:113385224});
  const conversion=parseRdWebhook({event_identifier:vestibularEvent,contact:{email:"teste@example.com","Vestibular - Nº inscrição":"0001",...(hasCode?{"Vestibular - Código de acesso":"TESTE0"}:{})}});
  if(!hasCode){await expect(syncConversion(conversion)).rejects.toThrow("Campo obrigatório");expect(contact).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();return;}
  await syncConversion(conversion);
  expect(pipeline).toHaveBeenCalledWith("Faculdade","VESTIBULAR 2027.1");
  expect(find).toHaveBeenCalledWith(expect.anything(),8794275,"VESTIBULAR 2027.1",{fieldId:2018097,value:"0001"});
  expect(create.mock.calls[0][0]).toMatchObject({name:"Vestibular 2027.1",statusId:113385224,tags:["VESTIBULAR 2027.1"],customFields:expect.arrayContaining([{field_id:2018099,values:[{value:"TESTE0"}]}])});
});
