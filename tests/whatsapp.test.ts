import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { handleRdWebhook } from "../src/app/api/webhooks/rd/route";
import { routeForConversion } from "../src/config/products";
import { parseRdWebhook } from "../src/lib/rd";
import { syncConversion } from "../src/lib/sync";
import { KommoClient } from "../src/lib/kommo";
const cases = [["whatsapp-lp-matricula-escola", "WHATSAPP MATRÍCULA", "Matrícula 2027"], ["whatsapp-lp-colonia-escola", "WHATSAPP COLÔNIA", "Colônia de Férias 2026"]] as const;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each(cases)("roteia %s com tag própria sem campos históricos",(event,tag,title)=>{
  const conversion=parseRdWebhook({event_identifier:event,contact:{email:"teste@example.com",cf_quantidade_de_filhos:"2",cf_series_2027:"histórico"}});
  expect(routeForConversion(conversion)).toMatchObject({pipelineName:"Escola",stageName:"NOVOS LEADS - RD",tags:[tag,title.toUpperCase()],leadName:title,customFieldNames:event === "whatsapp-lp-matricula-escola" ? ["cf_quando_voce_gostaria_de_visitar_a_escola"] : []});
});
it.each(cases)("aceita %s pelo webhook único",async(event)=>{
  vi.stubEnv("RD_WEBHOOK_SECRET","test-secret");vi.stubEnv("KOMMO_SYNC_ENABLED","false");
  const request=new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({leads:[{email:"teste@example.com",last_conversion:{content:{identifier:event}}}]})});
  const response=await handleRdWebhook(request,{route:"escola",secret:"test-secret"});
  expect(await response.json()).toMatchObject({mode:"capture",receipt:{eventIdentifier:event}});
});
it.each(cases)("reenvio de %s atualiza sua oportunidade preservando etapa e ignorando histórico",async(event,tag,title)=>{
  vi.stubEnv("KOMMO_SUBDOMAIN","example");vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
  vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794271,statusId:113083004});
  vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue([{id:2017912,name:"Quantidade de filhos",type:"text"}]);
  vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
  vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
  const find=vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockResolvedValue({id:20,name:"Teste",pipeline_id:8794271,status_id:68954635});
  const update=vi.spyOn(KommoClient.prototype,"updateLead").mockResolvedValue(undefined);
  const create=vi.spyOn(KommoClient.prototype,"createLead");
  await syncConversion(parseRdWebhook({event_identifier:event,contact:{name:"Teste",email:"teste@example.com","Quantidade de filhos":"2","Colônia Semanas":"histórico"}}));
  expect(find).toHaveBeenCalledWith(expect.anything(),8794271,tag);
  expect(update).toHaveBeenCalledWith(20,title,68954635,[],[tag,title.toUpperCase()],[]);
  expect(create).not.toHaveBeenCalled();
});

it("não confunde formulário com WhatsApp ao compartilhar tag de interesse",async()=>{
  const client=new KommoClient("fake","example");
  vi.spyOn(client,"getLead").mockResolvedValueOnce({id:2,name:"Matrícula",pipeline_id:8794271,status_id:5,_embedded:{tags:[{name:"WHATSAPP MATRÍCULA"},{name:"MATRÍCULA 2027"}]}}).mockResolvedValueOnce({id:1,name:"Matrícula",pipeline_id:8794271,status_id:5,_embedded:{tags:[{name:"MATRÍCULA 2027"}]}});
  expect((await client.findOpenProductLead({id:10,name:"Teste",_embedded:{leads:[{id:1},{id:2}]}},8794271,"MATRÍCULA 2027"))?.id).toBe(1);
});

it.each(["cf_quando_voce_gostaria_de_visitar_a_escola", "Quando você gostaria de visitar a escola?"])("envia texto livre de %s somente no WhatsApp de matrícula",async(key)=>{
  vi.stubEnv("KOMMO_SUBDOMAIN","example");vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
  vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794271,statusId:113083004});
  vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue([{id:2017916,name:"Período da visita",type:"text"}]);
  vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
  vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
  vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockResolvedValue({id:20,name:"Teste",pipeline_id:8794271,status_id:68954635});
  const update=vi.spyOn(KommoClient.prototype,"updateLead").mockResolvedValue(undefined);
  for(const event of ["whatsapp-lp-matricula-escola","whatsapp-lp-colonia-escola"]){
    await syncConversion(parseRdWebhook({event_identifier:event,contact:{email:"teste@example.com",[key]:"Segunda-feira às 10h",cf_periodo_da_visita:"Tarde"}}));
    expect(update.mock.lastCall?.[3]).toEqual(event === "whatsapp-lp-matricula-escola" ? [{field_id:2017916,values:[{value:"Segunda-feira às 10h"}]}] : []);
  }
});
