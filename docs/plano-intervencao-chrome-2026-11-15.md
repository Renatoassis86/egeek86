# Plano de intervenção: quedas do Chrome e dos loops (2026-11-15)

Pedido do dono: entender o motivo de tanta queda do Chrome e traçar um plano de intervenção.

## 1. O que medimos (24 h, por `collector_runs`)
| Loop (job do servidor) | Lacunas > 15 min | Tempo fora | Maiores quedas |
|---|---|---|---|
| `cupons-batimento` (`__cup`) | 19 | 703 min | 14/11 15:54-18:06 (132 min); 15/11 07:48-11:41 (233 min) |
| `amazon-assistida` (`__amza`) | 9 | 759 min | 14/11 15:48-18:07 (139 min); 15/11 07:48-11:42 (234 min) |
| `ml-links-assistida` (`__mll`) | 6 | 632 min | 14/11 16:00-19:56 (236 min); 15/11 07:48-11:42 (234 min) |

Observações: as lacunas de ~18-20 min do batimento e as de ~58 min da `amazon-assistida` (de 2 em 2 h) são em boa parte cadência normal do loop, não queda. As quedas reais são as de 2 a 4 horas. Hoje, depois de reconectar a extensão, as abas foram **recriadas 3 vezes em 1 h** (12:19, 12:38 e 12:40 UTC) e os loops morreram junto a cada vez.

## 2. Causas (em ordem de peso) e evidências
| # | Causa | Evidência | Efeito |
|---|---|---|---|
| C1 | **Memória esgotada por processos órfãos**: 563 processos `node` de `next build` (pais mortos), de 19 h a 3,6 dias de idade, ocupando ~2,4 GB. Memória física livre chegou a ~0,5 GB e o commit a 94% | PowerShell: `Win32_Process`, pais mortos; após encerrar: RAM livre 520 -> 1.619 MB e commit 94% -> 50% | Windows comprime e o Chrome descarta abas em segundo plano; abas congelam (CDP `Runtime.evaluate` sem resposta) |
| C2 | **Economia de memória do Chrome ligada** (`high_efficiency_mode.state = 2`, sem lista de sites sempre ativos no Profile 3) | `Local State` e `Preferences` do perfil | Chrome descarta e recarrega abas inativas; ao recarregar, o loop injetado some. É a explicação dos IDs de aba mudando |
| C3 | **Rede**: o Wi-Fi caiu junto com uma troca de fonte de energia (eventos Kernel-Power 105 às 05:06 e 05:09 BRT) e só reconectou às 08:29 BRT (WLAN 11004/8003 -> 8001), ~3 h 20 min sem internet | Event Log do Windows | Todos os loops pararam (sem rede); dois agentes morreram com `ENOTFOUND` |
| C4 | **Fragilidade estrutural dos loops**: a configuração (token) vive só na página; qualquer recarga, descarte ou travamento mata o loop e só eu consigo reinjetar | Comportamento observado hoje | Cada queda vira horas se eu ou o dono não agirmos |
| C5 | Falta de **alarme e cura automática**: antes de hoje não havia alerta; agora existe alerta de coleta parada, mas nada reinjeta sozinho | `COLLECTOR_ALERTS` ligado hoje | Tempo para perceber e corrigir |
| C6 | Possível peso dos próprios loops (varredura de ~60 páginas em iframes do `__promo`, página pesada do linkbuilder do ML) | Hipótese, não medida | Pode agravar C1 e C2; medir depois de C1/C2 |
| C7 | Sessão do Claude Code competindo pela ponte do Chrome (duas sessões; ponte do Claude Desktop) | Corrigido hoje (registro da ponte do Desktop renomeado, segunda sessão encerrada) | Extensão desconectada por horas |

## 3. Plano de intervenção
### Fase 0: hoje (estancar)
1. **Feito:** encerrar os 560 `next build` órfãos (RAM livre +1,1 GB; commit 94% -> 50%).
2. **Dono (1 min):** em `chrome://settings/performance`, "Sempre manter estes sites ativos": `mercadolivre.com.br`, `amazon.com.br`, `shopee.com.br` (ou desligar a Economia de memória). Deixar a janela do Chrome aberta, sem minimizar.
3. **Dono/eu (com aval):** desligar a economia de energia do adaptador Wi-Fi ("permitir que o computador desligue este dispositivo para economizar energia" = desmarcado), manter o notebook na tomada e com reconexão automática.
4. **Eu:** script `scripts/limpar-processos-orfaos.ps1` (somente processos `next build` e `tsx` com pai morto e mais de 60 min) e regra para os agentes: nunca deixar build em segundo plano sem encerrar os filhos.

### Fase 1: esta semana (tirar o ponto único de falha)
5. **Perfil dedicado "Loops"** no Chrome, só com as 3 abas (ML, Amazon, Shopee), Economia de memória desligada, sem outras abas e sem minimizar.
6. **Auto-injeção persistente** (extensão local descompactada, content script que, em cada carregamento das 3 páginas, injeta a configuração e carrega `/loops/*.js` de egeek86.com): recarga ou descarte da aba deixa de matar o loop. O token fica na extensão local, nunca no repositório. Exige o dono ativar o modo desenvolvedor em `chrome://extensions` uma vez.
7. **Dead-man no servidor** (já existe `collector-health`): alerta no Telegram quando `cupons-batimento`, `amazon-assistida` ou `ml-links-assistida` passar de 20 min sem gravar, com a ação sugerida.
8. **Vigia leve:** o vigia passa a checar por servidor primeiro e só mexe nas abas quando o servidor indicar queda (menos chamadas ao Chrome, menos aberturas de aba).

### Fase 2: medir e travar
9. **Meta:** zero lacunas de loop > 20 min por 7 dias seguidos (exceto quedas de internet do provedor) e no máximo 1 reinjeção manual por dia. Medir pela consulta de lacunas desta análise (guardada em `scripts/medir-lacunas-loops.ts`).
10. Medir o peso por aba (memória do renderer) após C1 e C2; se `__promo` ou o linkbuilder continuarem pesados, reduzir lote e pausa.

## 4. Riscos e reversão
- Encerrar processos: só órfãos com pai morto; reversível (nenhum dado).
- Perfil dedicado e extensão: reversíveis (remover a extensão e voltar ao perfil atual).
- Energia do Wi-Fi: reversível (marcar de volta).
