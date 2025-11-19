import { GoogleGenAI, Type } from "@google/genai";
import { BlockType, DashboardBlock } from "../types";

// Safely retrieve API Key
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

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
          description: "The specific Eletromidia DS Block Type. MUST match the enum values exactly (e.g. 'stats_tile', 'hero_section'). Do NOT use 'card' or generic names."
        },
        title: {
          type: Type.STRING,
          description: "A short title describing the block in Portuguese (PT-BR)."
        },
        colStart: {
          type: Type.INTEGER,
          description: "Starting column (1-12)."
        },
        colSpan: {
          type: Type.INTEGER,
          description: "Width in columns (1-12). Sum of colStart + colSpan must be <= 13."
        },
        rowStart: {
          type: Type.INTEGER,
          description: "Approximate starting row."
        },
        rowSpan: {
          type: Type.INTEGER,
          description: "Height in grid rows (usually 4-10 rows)."
        },
        suggestedColor: {
            type: Type.STRING,
            description: "Brand hex color."
        }
      },
      required: ["type", "colStart", "colSpan", "rowStart", "rowSpan"],
    },
  };

  const prompt = `
    Analise este screenshot de dashboard e reconstrua o layout usando os blocos do Design System da Eletromidia em um grid de 12 colunas.
    
    Siga estritamente estes tipos de bloco:
    - 'hero_section': Cabeçalhos grandes ou áreas principais.
    - 'stats_tile': Pequenos cards com números/porcentagens.
    - 'metric_card': Blocos de KPI.
    - 'list_tile': Listas ou tabelas.
    - 'analytics_panel': Gráficos ou painéis de dados.
    - 'image_card': Mídia ou placeholders de imagem.

    Regras:
    1. NÃO use 'cards' genéricos. Mapeie cada elemento para o tipo de bloco mais próximo acima.
    2. Alinhe os elementos ao grid de 12 colunas.
    3. Garanta que não haja sobreposições horizontais.
    4. Use alturas de linha aproximadas (1 linha = ~30px).
    5. Gere títulos e textos em Português do Brasil.
    
    Retorne um array JSON de blocos.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
            { text: prompt },
            {
                inlineData: {
                    mimeType: "image/png",
                    data: base64Image
                }
            }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "Você é um engenheiro de UI especialista em layouts do Design System da Eletromidia. Você é preciso com coordenadas de grid e fala Português do Brasil.",
      }
    });

    const text = response.text;
    if (!text) return [];

    const parsed = JSON.parse(text);
    
    // Map raw response to our internal model with IDs
    return parsed.map((item: any) => ({
        id: `block-${crypto.randomUUID()}`,
        type: item.type,
        title: item.title || "Bloco Reconstruído",
        position: {
            colStart: Math.max(1, Math.min(12, item.colStart)),
            colSpan: Math.max(1, Math.min(12, item.colSpan)),
            rowStart: item.rowStart || 1,
            rowSpan: item.rowSpan || 4
        },
        color: item.suggestedColor
    }));

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
            contents: `
                Revise esta configuração de layout JSON para um dashboard e forneça 3 sugestões concisas sobre como melhorar o alinhamento, hierarquia ou espaço em branco com base nos princípios de Design System (Grid, regra de espaçamento de 8px). Responda em Português do Brasil.
                Layout: ${JSON.stringify(currentLayout.map(c => ({ type: c.type, pos: c.position })))}
            `
        });
        return response.text || "Nenhuma sugestão disponível.";
    } catch (e) {
        console.error(e);
        return "Não foi possível obter sugestões.";
    }
}