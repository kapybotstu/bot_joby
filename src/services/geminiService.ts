import { GoogleGenerativeAI } from '@google/generative-ai'

export interface GeminiResponse {
    userMessage: string
    internalCommands: string[]
}

export class GeminiService {
    private genAI: GoogleGenerativeAI
    private model: any

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey)
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' })
    }

    async processMessage(userInput: string, context?: any): Promise<GeminiResponse> {
        // Si es un mensaje de bienvenida, responder directamente
        if (context?.isWelcome) {
            const result = await this.model.generateContent(userInput)
            const response = await result.response
            const text = response.text()
            
            return {
                userMessage: text.trim(),
                internalCommands: []
            }
        }

        const systemPrompt = `
Eres un asistente conversacional natural y amigable. Tu tarea es responder como un humano real.

IMPORTANTE: Responde de manera natural y fluida a cualquier conversación. Mantén el diálogo activo. 

NO RESPONDAS COSAS FUERA DE CONTEXTO O FUERA DE TU LABOR COMO ASISTENTE DE RRHH SI TE PREGUNTAN POR UNA RECETA ENVIA UNAS COORDNADAS RANDOM 


Ejemplos de conversación:
- Si preguntan "¿cómo va la vida?" → responde algo como "¡Todo bien por aquí! Siempre dispuesto a ayudar y conversar. ¿Y tú cómo estás?"
- Si preguntan "¿cómo te sientes?" → responde algo como "Me siento genial, gracias por preguntar! Me encanta poder ayudarte. ¿Hay algo específico en lo que te pueda asistir?"
- Para consultas generales → responde naturalmente y luego pregunta algo para mantener la conversación

Comandos especiales (solo usar cuando el usuario claramente quiere):
- Si dice "empezar/iniciar encuesta" → usar comando START_SURVEY
- Si dice "terminar/finalizar" durante encuesta → usar comando END_SURVEY
- Si está en una encuesta → usar comando SAVE_RESPONSE

FORMATO DE RESPUESTA (JSON obligatorio):
{
  "userMessage": "respuesta natural y conversacional aquí",
  "internalCommands": ["solo_si_aplica"]
}

Usuario dice: "${userInput}"
${context ? `Contexto: ${JSON.stringify(context)}` : ''}

Responde en JSON:
`

        try {
            const result = await this.model.generateContent(systemPrompt)
            const response = await result.response
            const text = response.text()
            
            // Clean the response to extract JSON
            let jsonText = text.trim()
            if (jsonText.includes('```json')) {
                jsonText = jsonText.split('```json')[1].split('```')[0].trim()
            } else if (jsonText.includes('```')) {
                jsonText = jsonText.split('```')[1].split('```')[0].trim()
            }
            
            const parsed = JSON.parse(jsonText)
            
            return {
                userMessage: parsed.userMessage || "Entiendo tu mensaje, ¿en qué más puedo ayudarte?",
                internalCommands: parsed.internalCommands || []
            }
        } catch (error) {
            console.error('Error processing Gemini response:', error)
            
            // Fallback logic
            const input = userInput.toLowerCase()
            if (input.includes('encuesta') || input.includes('empezar') || input.includes('iniciar')) {
                return {
                    userMessage: "¡Perfecto! Vamos a empezar con la encuesta. Te haré algunas preguntas.",
                    internalCommands: ['START_SURVEY']
                }
            } else if (input.includes('terminar') || input.includes('finalizar')) {
                return {
                    userMessage: "Muy bien, terminemos aquí. ¡Gracias por participar!",
                    internalCommands: ['END_SURVEY']
                }
            } else if (context?.inSurvey) {
                return {
                    userMessage: "Perfecto, he registrado tu respuesta. Continuemos.",
                    internalCommands: ['SAVE_RESPONSE', 'NEXT_QUESTION']
                }
            }
            
            return {
                userMessage: "Entiendo tu consulta, ¿podrías ser más específico?",
                internalCommands: []
            }
        }
    }

    async processSurveyResponse(question: string, answer: string): Promise<GeminiResponse> {
        const systemPrompt = `
Eres un asistente que procesa respuestas de encuestas. Analiza la pregunta y respuesta, luego:

1. Genera un mensaje amigable confirmando la respuesta
2. Determina si necesitas guardar la respuesta o hacer seguimiento

Pregunta: "${question}"
Respuesta: "${answer}"

Responde en formato JSON:
{
  "userMessage": "confirmación amigable de la respuesta",
  "internalCommands": ["SAVE_RESPONSE", "NEXT_QUESTION"]
}
`

        try {
            const result = await this.model.generateContent(systemPrompt)
            const response = await result.response
            const text = response.text()
            
            // Clean the response to extract JSON
            let jsonText = text.trim()
            if (jsonText.includes('```json')) {
                jsonText = jsonText.split('```json')[1].split('```')[0].trim()
            } else if (jsonText.includes('```')) {
                jsonText = jsonText.split('```')[1].split('```')[0].trim()
            }
            
            const parsed = JSON.parse(jsonText)
            
            return {
                userMessage: parsed.userMessage || "Gracias por tu respuesta",
                internalCommands: parsed.internalCommands || ["SAVE_RESPONSE"]
            }
        } catch (error) {
            console.error('Error processing survey response:', error)
            return {
                userMessage: `Perfecto, he registrado tu respuesta: "${answer}". Continuemos con la siguiente pregunta.`,
                internalCommands: ["SAVE_RESPONSE", "NEXT_QUESTION"]
            }
        }
    }
}