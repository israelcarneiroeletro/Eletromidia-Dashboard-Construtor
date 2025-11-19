import { GoogleGenAI, Type } from "@google/genai";
import { BlockType, DashboardBlock } from "../types";

// Safely retrieve API Key
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to check if block A fully contains block B
const containsBlock = (parent: DashboardBlock, child: DashboardBlock): boolean => {
    const p = parent.position;
    const c = child.position;
    // Check if child is strictly inside parent boundaries
    return (
        c.colStart >= p.colStart &&
        c.colStart + c.colSpan <= p.colStart + p.colSpan &&
        c.rowStart >= p.rowStart &&
        c.rowStart + c.rowSpan <= p.rowStart + p.rowSpan
    );
};

export const reconstructLayoutFromImage = async (base64Image: string): Promise<DashboardBlock[]> => {
  if (!apiKey) {
    console.error("API Key is missing");
    throw new Error("Gemini API Key is missing");
  }

  const model = "gemini-3-pro-preview";

  // Define schema for structured output
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: Object.values(BlockType),
          description: "The block type. Use 'hero_section' for ANY container, colored section, or background area that groups other items."
        },
        title: { type: Type.STRING },
        colStart: { type: Type.INTEGER },
        colSpan: { type: Type.INTEGER },
        rowStart: { type: Type.INTEGER },
        rowSpan: { type: Type.INTEGER },
        suggestedColor: { type: Type.STRING }
      },
      required: ["type", "colStart", "colSpan", "rowStart", "rowSpan"],
    },
  };

  const prompt = `
    Analise este screenshot de dashboard e reconstrua o layout para o Design System da Eletromidia (Grid 12 colunas).
    
    CRITICAL - HIERARQUIA E NESTING (HERO SECTIONS):
    1. **Identificação de Containers:** Qualquer área de fundo colorido, card agrupador ou seção visualmente distinta DEVE ser um 'hero_section'.
    2. **Conteúdo Aninhado:** Elementos (gráficos, métricas, textos) que estão visualmente *dentro* dessa área colorida DEVEM ser blocos independentes.
    3. **Coordenadas:** As coordenadas (colStart, rowStart) dos elementos filhos DEVEM estar matematicamente dentro das coordenadas do 'hero_section' pai.
    4. **Padding:** O Hero Section deve ser largo o suficiente para conter os filhos com margem.

    Tipos de Bloco:
    - 'hero_section': Container Principal, Fundo Colorido, Área de Agrupamento.
    - 'stats_tile': KPI, Número em destaque.
    - 'metric_card': Card com ícone e valor.
    - 'list_tile': Listas de texto ou tabelas.
    - 'analytics_panel': Gráficos (Barras, Linhas, Pizza) e visualizações de dados.
    - 'image_card': Imagens, Mídia, Vídeo.

    Gere um JSON plano (flat array) com todos os blocos. O pós-processamento cuidará do aninhamento (parentBlockId) baseado na sobreposição espacial.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/png", data: base64Image } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "Você é um especialista em reconstrução de UI. Você prioriza a estrutura hierárquica de containers e elementos filhos.",
      }
    });

    const text = response.text;
    if (!text) return [];

    const parsed = JSON.parse(text);
    
    // 1. Map to DashboardBlock objects
    let blocks: DashboardBlock[] = parsed.map((item: any) => ({
        id: `block-${crypto.randomUUID()}`,
        type: item.type,
        title: item.title || "Bloco IA",
        position: {
            colStart: Math.max(1, Math.min(12, item.colStart)),
            colSpan: Math.max(1, Math.min(12, item.colSpan)),
            rowStart: item.rowStart || 1,
            rowSpan: item.rowSpan || 4
        },
        color: item.suggestedColor
    }));

    // 2. Post-processing: Detect Hierarchy
    // Sort by area descending (Largest blocks are potential parents)
    blocks.sort((a, b) => (b.position.colSpan * b.position.rowSpan) - (a.position.colSpan * a.position.rowSpan));

    // Use a secure iteration method to modify relationships
    const processedBlocks = [...blocks];

    for (let i = 0; i < processedBlocks.length; i++) {
        const parent = processedBlocks[i];
        
        // Heuristic: Parents must be reasonably large
        const isLargeEnough = parent.position.colSpan >= 3 && parent.position.rowSpan >= 3;
        const isHero = parent.type === BlockType.HERO;

        if (isLargeEnough || isHero) {
            for (let j = 0; j < processedBlocks.length; j++) {
                if (i === j) continue;
                const child = processedBlocks[j];
                
                // If child not yet assigned and contained in parent
                if (!child.parentBlockId && containsBlock(parent, child)) {
                    // Assign parent
                    child.parentBlockId = parent.id;
                    
                    // Force parent to be HERO if it caught children (auto-correction)
                    if (parent.type !== BlockType.HERO) {
                        parent.type = BlockType.HERO;
                        parent.heroProperties = { stackDirection: 'horizontal' };
                    } else if (!parent.heroProperties) {
                        parent.heroProperties = { stackDirection: 'horizontal' };
                    }
                }
            }
        }
    }

    return processedBlocks;

  } catch (error) {
    console.error("Error reconstructing layout:", error);
    throw error;
  }
};

export const getDesignSuggestions = async (currentLayout: DashboardBlock[]): Promise<string> => {
    if (!apiKey) return "Chave de API faltando.";
    const model = "gemini-2.5-flash-lite";
    try {
        const response = await ai.models.generateContent({
            model,
            contents: `Sugira melhorias de design para este layout JSON (Grid 12). Foco em alinhamento e consistência: ${JSON.stringify(currentLayout.map(c => ({ t: c.type, p: c.position })))}`
        });
        return response.text || "Sem sugestões.";
    } catch (e) { return "Erro ao obter sugestões."; }
}