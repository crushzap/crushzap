# Planejamento de Evolução da Geração NSFW com ComfyUI e Modal

Este plano detalha a implementação das melhorias sugeridas no arquivo de análise, visando resolver inconsistências anatômicas e elevar a qualidade das imagens NSFW (poses explícitas e close-ups) mantendo a fidelidade da persona.

## 1. Análise e Objetivo
*   **Problema Atual:** Dependência excessiva de prompts textuais gera alucinações (anatomia incorreta, "cabeça de exorcista") e inconsistência em poses complexas.
*   **Solução Proposta:** Implementar **ControlNet OpenPose** com esqueletos de referência fixos para ditar a pose, mantendo o **IPAdapter** para a identidade da persona. Adicionar fluxos de **Inpainting** para detalhes genitais.
*   **Meta:** Transformar o sistema para operar com "Transferência de Pose" e "Refinamento Localizado" em vez de geração puramente estocástica.

## 2. Fase 1: Upgrade da Infraestrutura Modal (`app.py`)
Precisamos atualizar o ambiente do Modal para suportar os novos nós e modelos necessários.

### 2.1. Novas Dependências (Custom Nodes)
Adicionar instalação dos seguintes nós no `app.py`:
*   **`comfyui_controlnet_aux`**: Para pré-processadores avançados (DWPose) que extraem esqueletos de imagens se necessário.
*   **`ComfyUI-Impact-Pack`**: Para **FaceDetailer** e **HandDetailer** (essencial para corrigir rostos e mãos automaticamente).
*   **`ComfyUI-Inpaint-Nodes`** (opcional, mas recomendado): Para facilitar operações de máscara.

### 2.2. Novos Modelos (Checkpoints e ControlNets)
Configurar o download automático no `app.py` para:
*   **ControlNet OpenPose (SDXL)**: `OpenPoseXL2.safetensors` (ou similar compatível com Juggernaut XL).
*   **ControlNet Tile/Depth** (Opcional): Para upscaling e detalhes finos.
*   **Modelos de Detecção (Ultralytics)**: Para o Face/Hand/Person Detailer (ex: `face_yolo8n.pt`, `hand_yolo8n.pt`).
*   **LoRAs Específicos**: Baixar LoRAs de "detalhes anatômicos" sugeridos (ex: pussy detailer, wet skin) para uso sob demanda.

## 3. Fase 2: Engenharia de Workflows (JSON)
Criaremos variantes modulares dos workflows atuais para atender a cenários específicos.

### 3.1. Workflow A: Pose Controlada (`workflow_pose.json`)
*   **Entradas:** Imagem de Referência da Persona (IPAdapter) + **Imagem de Skeleton OpenPose** (ControlNet).
*   **Lógica:**
    1.  Carrega o skeleton da pose desejada (ex: "doggy_style_skeleton.png").
    2.  Aplica ControlNet OpenPose com strength ~0.8-1.0.
    3.  Aplica IPAdapter com a face da persona.
    4.  Gera a imagem garantindo a estrutura óssea correta.
*   **Uso:** Poses de corpo inteiro ou médio (de quatro, sentada, em pé).

### 3.2. Workflow B: Close-up & Inpainting (`workflow_inpainting.json`)
*   **Entradas:** Imagem Base (gerada ou referência) + Máscara (ou prompt de região).
*   **Lógica:**
    1.  Foca apenas na área genital ou rosto.
    2.  Usa VAE Encode for Inpaint com denoise controlado (0.4-0.6).
    3.  Aplica prompts de alta textura ("wet", "detailed skin").
*   **Uso:** Detalhes explícitos ("close das partes") mantendo a coerência com o corpo.

## 4. Fase 3: Gestão de Ativos (Library de Poses)
Precisamos de um repositório organizado de poses de referência.

*   **Ação:** Criar uma estrutura de pastas no projeto (ex: `assets/poses/`) ou um bucket S3/R2.
*   **Conteúdo:** Baixar e curar os packs sugeridos (Civitai OpenPose Pack 525 poses).
*   **Organização:**
    *   `/poses/doggy/`
    *   `/poses/missionary/`
    *   `/poses/oral/`
*   **Metadados:** Mapear cada pose com tags para facilitar a busca pelo "Roteador".

## 5. Fase 4: Integração Backend (Node.js)
Atualizar a lógica do `image-generator.mjs` e `modal-client.mjs`.

### 5.1. Roteamento Inteligente
*   Implementar lógica que decide o workflow baseada no prompt ou seleção do usuário:
    *   Se detectar palavras-chave de pose (ex: "de quatro"), seleciona `workflow_pose.json` e sorteia um skeleton da pasta `/poses/doggy/`.
    *   Se for close-up, seleciona `workflow_inpainting.json`.

### 5.2. Envio de Parâmetros Extras
*   Atualizar o payload enviado ao Modal para incluir:
    *   `pose_image`: Base64 ou URL do skeleton escolhido.
    *   `mask_image`: Para casos de inpainting.
    *   `controlnet_strength`: Permitir ajuste fino via código.

## 6. Próximos Passos (Execução)
1.  **Backup**: Garantir que o `app.py` atual esteja salvo.
2.  **Infra**: Editar `app.py` para incluir os novos nós e modelos (sem deploy ainda).
3.  **Assets**: Baixar um pack de poses de teste (ex: 5-10 poses essenciais).
4.  **Workflow**: Criar o `workflow_pose.json` localmente no ComfyUI para testar a integração IPAdapter + ControlNet e exportar o JSON.
5.  **Integração**: Conectar o novo JSON ao `app.py` e testar via script isolado.
