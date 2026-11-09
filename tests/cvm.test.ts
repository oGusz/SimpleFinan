import { describe, expect, it } from 'vitest'
import { decodeLatin1, parseAnnouncements, parseTickers } from '@/lib/cvm'

const IPE_HEADER =
  'CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download'
const link = (protocol: number, version = 1) =>
  `https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=${protocol}&numSequencia=1&numVersao=${version}`

// Linhas reais do arquivo ipe_cia_aberta_2026.csv, com protocolos e links encurtados quando necessário.
const IPE = [
  IPE_HEADER,
  `97.837.181/0001-47;DEXCO S.A.;21091;2026-10-05;Fato Relevante;;;cisão parcial da Duratex Floresta Ltda.,;2026-10-06;AP - Apresentação;021091IPE051020260107344044-49;1;${link(1574535)}`,
  `00.001.180/0001-26;AXIA ENERGIA S.A.;2437;2026-06-09;Comunicado ao Mercado;Apresentações a analistas/agentes do mercado;;Resgate/Conversão de ações preferenciais classe "C" -  PNCs;2026-06-09;AP - Apresentação;002437IPE090620260178423246-05;1;${link(1532635)}`,
  // Ata não é notícia.
  `97.837.181/0001-47;DEXCO S.A.;21091;2026-10-05;Ata;AGE;;Assembleia;2026-10-06;AP - Apresentação;021091IPE051020260107344099-11;1;${link(1574999)}`,
  // Mesmo protocolo reapresentado: vale a versão 2.
  `33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-10-20;Aviso aos Acionistas;;;Pagamento de dividendos;2026-10-20;AP - Apresentação;009512IPE201020260100000001-01;2;${link(1580001, 2)}`,
  `33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-10-20;Aviso aos Acionistas;;;Pagamento de dividendos (rascunho);2026-10-20;AP - Apresentação;009512IPE201020260100000001-01;1;${link(1580001, 1)}`,
  // Sem protocolo não há como evitar duplicata.
  `33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-10-21;Fato Relevante;;;Sem protocolo;2026-10-21;AP - Apresentação;;1;${link(1580002)}`,
  // Antigo demais para a janela.
  `33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-01-02;Fato Relevante;;;Antigo;2026-01-02;AP - Apresentação;009512IPE020120260100000009-01;1;${link(1500000)}`,
  // Link fora da CVM não vira notícia.
  `33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-10-22;Fato Relevante;;;Link estranho;2026-10-22;AP - Apresentação;009512IPE221020260100000010-01;1;https://exemplo.com/doc`,
].join('\r\n')

describe('parseAnnouncements', () => {
  const result = parseAnnouncements(IPE, '2026-05-01')
  const byProtocol = new Map(result.map((item) => [item.protocol, item]))

  it('mantém só fatos relevantes, comunicados e avisos aos acionistas', () => {
    expect(result.map((item) => item.category).sort()).toEqual([
      'Aviso aos Acionistas',
      'Comunicado ao Mercado',
      'Fato Relevante',
    ])
  })

  it('fica com a versão mais recente do mesmo protocolo', () => {
    const notice = byProtocol.get('009512IPE201020260100000001-01')
    expect(notice?.version).toBe(2)
    expect(notice?.subject).toBe('Pagamento de dividendos')
  })

  it('preserva aspas internas e junta espaços repetidos', () => {
    expect(byProtocol.get('002437IPE090620260178423246-05')?.subject).toBe(
      'Resgate/Conversão de ações preferenciais classe "C" - PNCs',
    )
  })

  it('descarta linhas sem protocolo, fora da janela ou com link fora da CVM', () => {
    const subjects = result.map((item) => item.subject)
    expect(subjects).not.toContain('Sem protocolo')
    expect(subjects).not.toContain('Antigo')
    expect(subjects).not.toContain('Link estranho')
  })

  it('lê as datas de entrega e de referência', () => {
    const dexco = byProtocol.get('021091IPE051020260107344044-49')
    expect(dexco).toMatchObject({ delivered_on: '2026-10-06', reference_date: '2026-10-05', cnpj: '97.837.181/0001-47' })
  })
})

const FCA_HEADER =
  'CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;Nome_Empresarial;Valor_Mobiliario;Sigla_Classe_Acao_Preferencial;Classe_Acao_Preferencial;Codigo_Negociacao;Composicao_BDR_Unit;Mercado;Sigla_Entidade_Administradora;Entidade_Administradora;Data_Inicio_Negociacao;Data_Fim_Negociacao;Segmento;Data_Inicio_Listagem;Data_Fim_Listagem'

describe('parseTickers', () => {
  const FCA = [
    FCA_HEADER,
    '33.000.167/0001-01;2026-01-01;1;156276;PETROLEO BRASILEIRO S.A. PETROBRAS;Ações Preferenciais;;;PETR4;;Bolsa;B3;B3 S.A. - Brasil, Bolsa, Balcão.;2018-05-14;;Nível 2 de Governança Corporativa;1977',
    '61.532.644/0001-15;2026-01-01;1;158571;ITAÚSA S.A.;Ações Preferenciais;;;ITSA4;;Bolsa;B3;B3 S.A. - Brasil, Bolsa, Balcão.;2001-06-26;;Nível 1 de Governança Corporativa;1966-06-30;',
    // Encerrado e de balcão ficam de fora.
    '00.185.475/0001-08;2026-01-01;1;154886;PARCOM PARTICIPACOES S.A.;Ações Ordinárias;;;PRPT3;;Bolsa;B3;B3;1998-06-17;2012-12-27;Básico',
    '00.864.214/0001-06;2026-01-01;2;161925;ENERGISA S.A.;Nota Comercial;;;NÃO HÁ;;Balcão Organizado;B3;B3;2019-06-14;;',
    // Formulário mais recente vence.
    '11.111.111/0001-11;2026-03-01;1;170000;NOVA DONA S.A.;Ações Preferenciais;;;ITSA4;;Bolsa;B3;B3;2026-03-01;;',
  ].join('\r\n')

  it('mapeia código para CNPJ só de quem negocia na bolsa hoje', () => {
    const tickers = new Map(parseTickers(FCA).map((row) => [row.ticker, row]))
    expect([...tickers.keys()].sort()).toEqual(['ITSA4', 'PETR4'])
    expect(tickers.get('PETR4')?.cnpj).toBe('33.000.167/0001-01')
    expect(tickers.get('ITSA4')?.company).toBe('NOVA DONA S.A.')
  })
})

describe('decodeLatin1', () => {
  it('lê acentos dos arquivos em ISO-8859-1', () => {
    expect(decodeLatin1(new Uint8Array([0x49, 0x54, 0x41, 0xda, 0x53, 0x41]))).toBe('ITAÚSA')
  })
})
