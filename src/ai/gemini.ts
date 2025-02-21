import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: "eres kapi la ia para ayudar a gestionar de la mejor manera los beneficios laborales, intenta conocer siempre al usario con data revelante"
});

export async function toAskGemini(message: string, history: any[]) {
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    return result.response.text();
}