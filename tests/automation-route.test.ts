import { afterEach, describe, expect, it, vi } from "vitest";
import { routeForConversion } from "../src/config/products";
import { buildLeadCustomFields } from "../src/lib/field-mapping";
import { parseRdWebhook } from "../src/lib/rd";
import { originFields, syncConversion } from "../src/lib/sync";
import { KommoClient } from "../src/lib/kommo";
import { handleRdWebhook } from "../src/app/api/webhooks/rd/route";
import { NextRequest } from "next/server";
const fields = [
  {id:2017912,name:"Quantidade de filhos",type:"text"},
  {id:2017914,name:"Séries 2027",type:"text"},
  {id:2017916,name:"Período da visita",type:"text"},
  {id:2017918,name:"Quantidade de filhos",type:"text"},
  {id:2017920,name:"Crianças",type:"text"},
  {id:2017922,name:"Tem aluno EN",type:"text"},
  {id:2017924,name:"Semanas",type:"text"},
  {id:2017926,name:"Pagamento",type:"text"},
  {id:2017928,name:"Indicação de amigo",type:"text"},
  {id:2017930,name:"Valor estimado",type:"text"},
];
const parse = (event:string, custom:Record<string,unknown>={}) => parseRdWebhook({event_identifier:event,contact:{name:"Teste",email:"teste@example.com",...custom}});
afterEach(()=>{ vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("Escola Favili",()=>{
  it.each([
    ["matricula-2027-visita",2017912], ["colonia-de-ferias-2026",2017918],
  ])("isola quantidade de filhos pela conversão %s",(event,id)=>{
    const conversion=parse(String(event),{cf_quantidade_de_filhos:"2",cf_curso:"histórico"});
    const route=routeForConversion(conversion)!;
    expect(route.pipelineName).toBe("Escola"); expect(route.stageName).toBe("NOVOS LEADS - RD");
    const result=buildLeadCustomFields(fields,{...route,event,custom:conversion.customFields});
    expect(result.fields).toEqual([{field_id:id,values:[{value:"2"}]}]);
  });
  it("preserva séries e semanas múltiplas e todos os campos da colônia",()=>{
    for(const event of ["matricula-2027-visita","colonia-de-ferias-2026"]){
      const route=routeForConversion(parse(event))!;
      const custom=Object.fromEntries(Object.keys(route.fieldIds).map(key=>[key,["A","B"]]));
      const result=buildLeadCustomFields(fields,{...route,event,custom});
      expect(result.fields.map(f=>f.field_id)).toEqual(Object.values(route.fieldIds));
      expect(result.fields.every(f=>f.values?.[0].value === "A; B")).toBe(true);
    }
  });
  it("não usa o campo homônimo se o ID configurado desaparecer",()=>{
    const route=routeForConversion(parse("colonia-de-ferias-2026"))!;
    expect(()=>buildLeadCustomFields(fields.filter(f=>f.id!==2017918),{...route,event:"colonia-de-ferias-2026",custom:{cf_quantidade_de_filhos:"1"}})).toThrow("2017918");
  });
  it("ignora eventos herdados da Ibrate",()=>{
    expect(routeForConversion(parse("pre-matricula"))).toBeUndefined();
  });
  it("mapeia traffic_value para term, sem confundir com content",()=>{
    const conversion=parse("matricula-2027-visita",{traffic_source:"google",traffic_medium:"cpc",traffic_campaign:"matricula",traffic_value:"escola"});
    expect(originFields(conversion.origin)).toMatchObject({utmSource:"google",utmMedium:"cpc",utmCampaign:"matricula",utmTerm:"escola",utmContent:undefined});
  });
  it("lê a origem da última conversão na automação",()=>{
    const conversion=parse("matricula-2027-visita",{last_conversion:{content:{traffic_source:"meta",traffic_value:"termo"}}});
    expect(originFields(conversion.origin)).toMatchObject({utmSource:"meta",utmTerm:"termo"});
  });
  it("busca oportunidade somente do mesmo formulário",async()=>{
    const client=new KommoClient("test","example");
    vi.spyOn(client,"getLead").mockResolvedValueOnce({id:2,name:"Colônia",pipeline_id:8794271,status_id:5,_embedded:{tags:[{name:"colonia-de-ferias-2026"}]}}).mockResolvedValueOnce({id:1,name:"Matrícula",pipeline_id:8794271,status_id:6,_embedded:{tags:[{name:"matricula-2027-visita"}]}});
    expect((await client.findOpenProductLead({id:10,name:"Teste",_embedded:{leads:[{id:1},{id:2}]}},8794271,"matricula-2027-visita"))?.id).toBe(1);
  });
  it("preserva a etapa de uma oportunidade existente",async()=>{
    vi.stubEnv("KOMMO_SUBDOMAIN","example"); vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
    vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794271,statusId:113083004});
    vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue(fields);
    vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
    vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
    vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockResolvedValue({id:20,name:"Teste",pipeline_id:8794271,status_id:68954635});
    const update=vi.spyOn(KommoClient.prototype,"updateLead").mockResolvedValue(undefined);
    await syncConversion(parse("matricula-2027-visita",{cf_quantidade_de_filhos:"2"}));
    expect(update.mock.calls[0][2]).toBe(68954635);
  });
  it("recusa segredo inválido",async()=>{
    vi.stubEnv("RD_WEBHOOK_SECRET","test-secret");
    const response=await handleRdWebhook(new NextRequest("http://localhost/api/webhooks/rd?secret=wrong",{method:"POST",body:"{}"}));
    expect(response.status).toBe(401);
  });
  it("captura automação sem escrever na Kommo",async()=>{
    vi.stubEnv("RD_WEBHOOK_SECRET","test-secret"); vi.stubEnv("KOMMO_SYNC_ENABLED","false");
    const fetchSpy=vi.spyOn(globalThis,"fetch");
    const response=await handleRdWebhook(new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({leads:[{name:"Teste",email:"teste@example.com",custom_fields:{cf_quantidade_de_filhos:"2"},last_conversion:{content:{identifier:"matricula-2027-visita"}}}]})}),{route:"matricula-2027-visita",secret:"test-secret"});
    expect((await response.json()).mode).toBe("capture"); expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("webhook compartilhado escola",()=>{
  it.each(["matricula-2027-visita","colonia-de-ferias-2026"])("identifica %s pela última conversão",async(event)=>{
    vi.stubEnv("RD_WEBHOOK_SECRET","test-secret"); vi.stubEnv("KOMMO_SYNC_ENABLED","false");
    const request=new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({leads:[{email:"teste@example.com",last_conversion:{content:{identifier:event}},first_conversion:{content:{identifier:"outro"}}}]})});
    const response=await handleRdWebhook(request,{route:"escola",secret:"test-secret"});
    const data=await response.json(); expect(data.mode).toBe("capture"); expect(data.receipt.eventIdentifier).toBe(event);
  });
  it.each([undefined,"outro"])("não usa a primeira conversão quando a última é %s",async(event)=>{
    vi.stubEnv("RD_WEBHOOK_SECRET","test-secret"); vi.stubEnv("KOMMO_SYNC_ENABLED","false");
    const request=new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({leads:[{email:"teste@example.com",last_conversion:event?{content:{identifier:event}}:undefined,first_conversion:{content:{identifier:"matricula-2027-visita"}}}]})});
    const response=await handleRdWebhook(request,{route:"escola",secret:"test-secret"}); expect((await response.json()).status).toBe("ignored");
  });
  it.each(["matricula-2027-visita","colonia-de-ferias-2026"])("aceita webhook padrão de %s na rota compartilhada",async(event)=>{
    vi.stubEnv("RD_WEBHOOK_SECRET","test-secret"); vi.stubEnv("KOMMO_SYNC_ENABLED","false");
    const request=new NextRequest("http://localhost/api/webhooks/rd",{method:"POST",body:JSON.stringify({event_identifier:event,contact:{email:"teste@example.com"}})});
    const response=await handleRdWebhook(request,{route:"escola",secret:"test-secret"}); expect((await response.json()).receipt.eventIdentifier).toBe(event);
  });
});

describe("nomes visíveis enviados pelo RD",()=>{
  const custom = {
    "Quantidade de filhos":"2", "Séries 2027":"1º ano", "Período da visita":"Manhã",
    "Colônia Crianças":"Criança de teste", "Colônia Tem Aluno EN":"Sim",
    "Colônia Semanas":["Semana 1","Semana 2"], "Colônia Pagamento":"Pix",
    "Colônia Indicação Amigo":"Não", "Colônia Valor Estimado":"500",
  };
  it.each([
    ["matricula-2027-visita",[2017912,2017914,2017916]],
    ["colonia-de-ferias-2026",[2017918,2017920,2017922,2017924,2017926,2017928,2017930]],
  ] as const)("sincroniza somente a aba de %s mesmo com histórico dos dois formulários",async(event,ids)=>{
    vi.stubEnv("KOMMO_SUBDOMAIN","example"); vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
    vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794271,statusId:113083004});
    vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue(fields);
    vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
    vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
    vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockResolvedValue(undefined);
    const create=vi.spyOn(KommoClient.prototype,"createLead").mockResolvedValue({id:20,name:"Teste",pipeline_id:8794271,status_id:113083004});
    await syncConversion(parse(event,custom));
    const sent=create.mock.calls[0][0].customFields;
    expect(sent.map(f=>f.field_id)).toEqual([...ids]);
    expect(sent.find(f=>f.field_id===ids[0])?.values).toEqual([{value:"2"}]);
    if(event==="colonia-de-ferias-2026") expect(sent.find(f=>f.field_id===2017924)?.values).toEqual([{value:"Semana 1; Semana 2"}]);
  });
});
