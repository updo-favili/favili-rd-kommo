import { afterEach, expect, it, vi } from "vitest";
import { vestibularEvent, vestibularUpdateEvent, vestibularFieldIds } from "../src/config/vestibular";
import { parseRdWebhook } from "../src/lib/rd";
import { syncConversion } from "../src/lib/sync";
import { KommoClient } from "../src/lib/kommo";
const newFields = [
  ["cf_vestibular_faz_prova","Vestibular Faz prova",2018117,false],
  ["cf_vestibular_instituicao_de_origem","Vestibular Instituição de origem",2018119,"Instituição teste"],
  ["cf_vestibular_curso_de_origem","Vestibular Curso de origem",2018121,"Curso antigo"],
  ["cf_vestibular_periodo_atual","Vestibular Período atual",2018123,"3º período"],
  ["cf_vestibular_documento","Vestibular Documento",2018125,"Boletim de desempenho do Enem"],
  ["cf_vestibular_documento_situacao","Vestibular Documento situação",2018127,"Em análise"],
  ["cf_vestibular_documento_motivo","Vestibular Documento motivo",2018129,"Aguardando conferência"],
  ["cf_vestibular_enem_ano","Vestibular ENEM ano",2018131,"2025"],
  ["cf_vestibular_enem_media","Vestibular ENEM média",2018133,"650,5"],
  ["cf_vestibular_enem_redacao","Vestibular ENEM redação",2018135,0],
  ["cf_vestibular_link_do_painel","Vestibular - Link do painel",2018137,"https://materiais.favili.com.br/vestibular/painel?inscricao=0001"],
] as const;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
function setup() {
  vi.stubEnv("KOMMO_SUBDOMAIN","example");vi.stubEnv("KOMMO_LONG_LIVED_TOKEN","fake");
  vi.spyOn(KommoClient.prototype,"resolvePipeline").mockResolvedValue({pipelineId:8794275,statusId:113385224});
  vi.spyOn(KommoClient.prototype,"getCustomFields").mockResolvedValue(Object.entries(vestibularFieldIds).map(([name,id])=>({id,name,type:id===2018137?"url":"text"})));
  vi.spyOn(KommoClient.prototype,"findContact").mockResolvedValue({id:10,name:"Teste"});
  vi.spyOn(KommoClient.prototype,"updateContact").mockResolvedValue(undefined);
  vi.spyOn(KommoClient.prototype,"findOpenProductLead").mockResolvedValue(undefined);
  const lookup=vi.spyOn(KommoClient.prototype,"findLeadByRegistration").mockResolvedValue({id:20,name:"Título manual",pipeline_id:8794275,status_id:42,_embedded:{tags:[{name:"CURSO: DIREITO"},{name:"ATENDIDO"},{name:"VESTIBULAR 2027.1"}]}});
  const create=vi.spyOn(KommoClient.prototype,"createLead").mockResolvedValue({id:20,name:"Vestibular",pipeline_id:8794275,status_id:113385224});
  const patch=vi.spyOn(KommoClient.prototype,"updateLeadFields").mockResolvedValue(undefined);
  return {create,patch,lookup};
}
it.each([ [vestibularEvent,"key"], [vestibularEvent,"label"], [vestibularUpdateEvent,"key"], [vestibularUpdateEvent,"label"] ])("sincroniza campos e tag do curso desejado em %s no formato %s",async(event,format)=>{
  const {create,patch}=setup();
  const custom=Object.fromEntries(newFields.map(([key,label,,value])=>[format==="key"?key:label,value]));
  await syncConversion(parseRdWebhook({event_identifier:event,contact:{email:"teste@example.com","Vestibular - Nº inscrição":"0001","Vestibular - Código de acesso":"TESTE0",[format==="key"?"cf_vestibular_curso":"Vestibular - Curso"]:"  psicologia  ",...custom}}));
  const sent=event===vestibularEvent?create.mock.calls[0][0].customFields:patch.mock.calls[0][1];
  for(const [,,id,value] of newFields) expect(sent).toContainEqual({field_id:id,values:[{value:String(value)}]});
  if(event===vestibularEvent) expect(create.mock.calls[0][0].tags).toEqual(["VESTIBULAR 2027.1","CURSO: PSICOLOGIA"]);
  else {expect(create).not.toHaveBeenCalled();expect(patch.mock.calls[0][2]).toEqual({add:["CURSO: PSICOLOGIA"],remove:["CURSO: DIREITO"]});}
});
it("sem curso desejado não altera tags de curso",async()=>{
  const {patch}=setup();
  await syncConversion(parseRdWebhook({event_identifier:vestibularUpdateEvent,contact:{"Vestibular - Nº inscrição":"0001",cf_vestibular_curso_de_origem:"Direito"}}));
  expect(patch.mock.calls[0][2]).toBeUndefined();
});
it("repetição com os mesmos campos e tags não grava novamente",async()=>{
  const {patch,lookup}=setup();
  lookup.mockResolvedValue({id:20,name:"Teste",pipeline_id:8794275,status_id:42,_embedded:{tags:[{name:"CURSO: PSICOLOGIA"}]},custom_fields_values:[{field_id:2018097,values:[{value:"0001"}]},{field_id:2018103,values:[{value:"Psicologia"}]}]});
  const result=await syncConversion(parseRdWebhook({event_identifier:vestibularUpdateEvent,contact:{"Vestibular - Nº inscrição":"0001","Vestibular - Curso":"Psicologia"}}));
  expect(result.status).toBe("unchanged");expect(patch).not.toHaveBeenCalled();
});
it("PATCH com tags preserva etapa, responsável e título ao omiti-los",async()=>{
  const fetchSpy=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(null,{status:204}));
  await new KommoClient("fake","example").updateLeadFields(20,[],{add:["CURSO: PSICOLOGIA"],remove:["CURSO: DIREITO"]});
  expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({_embedded:{tags_to_add:[{name:"CURSO: PSICOLOGIA"}],tags_to_delete:[{name:"CURSO: DIREITO"}]}});
});
