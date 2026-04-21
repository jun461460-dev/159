import { GoogleGenAI, Type } from "@google/genai";
import { OCRResult, Variation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function recognizeMistake(base64Image: string): Promise<OCRResult> {
  const model = "gemini-3-flash-preview";
  
  // Detect mime type and extract raw base64 data
  const mimeMatch = base64Image.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const rawData = mimeMatch ? mimeMatch[2] : base64Image;

  const imagePart = {
    inlineData: {
      mimeType,
      data: rawData,
    },
  };
  
  const prompt = `你是一个专业的教育AI，请识别图片中的错题内容。
请提取：
1. 题目文本 (question)
2. 选项 (options，如果有)
3. 用户的错误答案 (userAnswer，如果有)
4. 标准答案 (standardAnswer，如果有)
5. 核心知识点 (knowledgePoint，例如"一元二次方程根的判别式")

请输出标准的JSON格式。`;

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          userAnswer: { type: Type.STRING },
          standardAnswer: { type: Type.STRING },
          knowledgePoint: { type: Type.STRING },
        },
        required: ["question", "knowledgePoint"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateVariations(question: string, knowledgePoint: string): Promise<Variation[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `
原题：${question}
核心知识点：${knowledgePoint}

请基于该知识点生成3道"举一反三"的相似题目。
要求：
1. 覆盖同一知识点的不同角度或变式。
2. 难度与原题相当。
3. 每道题附带正确答案。
4. 解析需侧重"易错点分析"（例如：本题常见错误是忘记讨论二次项系数为零的情况）。

请输出标准的JSON数组。`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING },
            answer: { type: Type.STRING },
            analysis: { type: Type.STRING },
          },
          required: ["question", "answer", "analysis"],
        },
      },
    },
  });

  const variations = JSON.parse(response.text);
  return variations.map((v: any, index: number) => ({
    ...v,
    id: v.id || `var-${Date.now()}-${index}`
  }));
}
