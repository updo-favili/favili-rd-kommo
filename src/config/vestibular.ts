// Nomes exibidos no teste real do RD; IDs conferidos na aba Faculdade Vestibular.
export const vestibularEvent = "vestibular-2027-1-inscricao";
export const vestibularFieldIds: Record<string, number> = {
  "Vestibular - Nº inscrição": 2018097,
  "Vestibular - Código de acesso": 2018099,
  "Vestibular - Forma de ingresso": 2018101,
  "Vestibular - Curso": 2018103,
  "Vestibular - Modalidade": 2018105,
  "Vestibular - Unidade": 2018107,
  "Vestibular - Turno": 2018109,
  "Vestibular - Dia da prova": 2018111,
  "Vestibular - Hora da prova": 2018113,
  "Vestibular - Link Minha inscrição": 2018115,
  cf_vestibular_faz_prova: 2018117,
  cf_vestibular_instituicao_de_origem: 2018119,
  cf_vestibular_curso_de_origem: 2018121,
  cf_vestibular_periodo_atual: 2018123,
  cf_vestibular_documento: 2018125,
  cf_vestibular_documento_situacao: 2018127,
  cf_vestibular_documento_motivo: 2018129,
  cf_vestibular_enem_ano: 2018131,
  cf_vestibular_enem_media: 2018133,
  cf_vestibular_enem_redacao: 2018135,
  cf_vestibular_link_do_painel: 2018137,
};

export const vestibularUpdateEvent = "vestibular-2027-1-atualizacao";
export function isVestibularEvent(event: string): boolean {
  return event === vestibularEvent || event === vestibularUpdateEvent;
}
